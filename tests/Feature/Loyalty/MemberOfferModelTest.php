<?php

namespace Tests\Feature\Loyalty;

use App\Models\MemberOffer;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the MemberOffer model contract — the per-member offer
 * claim/usage tracking row.
 *
 * Why this matters:
 *
 *   MemberOffer is the linking row between a LoyaltyMember and
 *   a SpecialOffer (the master offer catalog). Tracks:
 *     - When the member claimed the offer
 *     - When they used it (redeemed)
 *     - When it expires (per-claim expiry vs the offer's master
 *       expiry — admins can grant longer windows to VIPs)
 *     - Whether it was AI-generated (Phase 5+ Member AI Insights
 *       generates personalised offers via OpenAiService::personalizeOffer)
 *
 * Interesting architectural lock:
 *
 *   MemberOffer does NOT use BelongsToOrganization. The model
 *   scopes via `member_id` — to find an org's offers you JOIN
 *   through loyalty_members. The tenant safety is provided by
 *   that join + the LoyaltyMember's TenantScope.
 *
 *   This is a deliberate design choice (per CLAUDE.md's
 *   loyalty/member ownership model). A regression that ADDED
 *   BelongsToOrganization would silently re-architect the
 *   ownership chain — should surface here as a test failure.
 *
 * Contract:
 *
 *   - ai_generated bool cast (AI Insights personalisation tracking)
 *   - claimed_at + used_at + expires_at all Carbon
 *   - member relationship BelongsTo LoyaltyMember (FK 'member_id')
 *   - offer relationship BelongsTo SpecialOffer (FK 'offer_id')
 *   - NO BelongsToOrganization trait — locked architectural
 *     decision
 */
class MemberOfferModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;
    private int $memberId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();

        if (!Schema::hasTable('member_offers')) {
            Schema::create('member_offers', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('member_id');
                $t->unsignedBigInteger('offer_id')->nullable();
                $t->boolean('ai_generated')->default(false);
                $t->text('ai_reason')->nullable();
                $t->timestamp('claimed_at')->nullable();
                $t->timestamp('used_at')->nullable();
                $t->timestamp('expires_at')->nullable();
                $t->string('status', 32)->nullable();
                $t->timestamps();
                $t->index('member_id');
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        $tier = LoyaltyTierFactory::new()->bronze()->create();
        $member = LoyaltyMemberFactory::new()->inTier($tier->id)->create();
        $this->memberId = $member->id;
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function memberOffer(array $attrs = []): MemberOffer
    {
        return MemberOffer::create(array_merge([
            'member_id' => $this->memberId,
            'offer_id'  => 1,
            'status'    => 'claimed',
        ], $attrs));
    }

    /* ─── Architectural invariant: NO BelongsToOrganization ─── */

    public function test_model_does_NOT_use_belongs_to_organization_trait(): void
    {
        // CRITICAL architectural decision: MemberOffer scopes via
        // member_id, NOT organization_id. A regression that ADDED
        // BelongsToOrganization would silently re-architect the
        // ownership chain — should surface here.
        $traits = class_uses_recursive(MemberOffer::class);

        $this->assertArrayNotHasKey(
            \App\Traits\BelongsToOrganization::class,
            $traits,
            'CRITICAL: MemberOffer MUST NOT use BelongsToOrganization. '
            . 'It scopes via member_id (LoyaltyMember owns the tenant link).',
        );
    }

    /* ─── ai_generated boolean cast ─── */

    public function test_ai_generated_casts_to_boolean(): void
    {
        // Tracks whether OpenAiService::personalizeOffer generated
        // this offer for the member. The SPA shows a "✨ AI"
        // badge based on this — 0/1 vs true/false matters for the
        // badge render.
        $ai = $this->memberOffer(['ai_generated' => true]);
        $human = $this->memberOffer(['ai_generated' => false]);

        $this->assertTrue($ai->ai_generated);
        $this->assertFalse($human->ai_generated);
        $this->assertIsBool($ai->ai_generated);
    }

    public function test_ai_reason_persists_intact(): void
    {
        // Drives the SPA's "Why AI gave you this" tooltip on the
        // member's offer card.
        $offer = $this->memberOffer([
            'ai_generated' => true,
            'ai_reason'    => 'Member showed interest in spa services in last 3 visits',
        ]);

        $this->assertSame(
            'Member showed interest in spa services in last 3 visits',
            $offer->fresh()->ai_reason,
        );
    }

    /* ─── Datetime casts (3) ─── */

    public function test_claimed_at_casts_to_carbon(): void
    {
        // The lifecycle: claimed → used (or expired).
        $offer = $this->memberOffer(['claimed_at' => now()->subDay()]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $offer->claimed_at);
    }

    public function test_used_at_casts_to_carbon(): void
    {
        // Used = redeemed. Drives the offer-redemption KPI on
        // /analytics.
        $offer = $this->memberOffer(['used_at' => now()->subHour()]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $offer->used_at);
    }

    public function test_expires_at_casts_to_carbon(): void
    {
        // Per-claim expiry — admin can grant longer windows to
        // VIPs. The expiry cron compares with ->isPast().
        $offer = $this->memberOffer(['expires_at' => now()->addDays(30)]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $offer->expires_at);
    }

    public function test_lifecycle_timestamps_independent(): void
    {
        // Lock that all three can be set independently — a
        // claimed-but-not-used offer is the canonical SPA card
        // state; a used offer might still have expires_at in the
        // past or future.
        $offer = $this->memberOffer([
            'claimed_at' => now()->subDays(5),
            'used_at'    => null,
            'expires_at' => now()->addDays(25),
        ]);

        $this->assertNotNull($offer->claimed_at);
        $this->assertNull($offer->used_at);
        $this->assertNotNull($offer->expires_at);
    }

    /* ─── Relationships ─── */

    public function test_member_relationship_uses_member_id_foreign_key(): void
    {
        // FK is 'member_id' — the load-bearing key for the
        // model's tenant routing (since there's no
        // BelongsToOrganization).
        $offer = $this->memberOffer();
        $rel = $offer->member();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('member_id', $rel->getForeignKeyName(),
            'member FK MUST be member_id (NOT loyalty_member_id).');
    }

    public function test_offer_relationship_uses_offer_id_foreign_key(): void
    {
        // FK is 'offer_id', NOT the conventional
        // 'special_offer_id'. SpecialOffer is the master catalog
        // row; MemberOffer is the per-member linking row.
        $offer = $this->memberOffer();
        $rel = $offer->offer();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('offer_id', $rel->getForeignKeyName(),
            'offer FK MUST be offer_id (NOT special_offer_id).');
    }

    /* ─── Status persists ─── */

    public function test_status_values_persist_intact(): void
    {
        // Canonical status values: 'claimed' (member added but
        // hasn't used) / 'used' (redeemed) / 'expired' (auto-
        // expired by cron). Lock the strings.
        foreach (['claimed', 'used', 'expired'] as $status) {
            $offer = $this->memberOffer(['status' => $status]);
            $this->assertSame($status, $offer->fresh()->status);
        }
    }

    /* ─── No-org-trait implication: rows scope via member_id ─── */

    public function test_member_offer_rows_NOT_filtered_by_tenant_scope_directly(): void
    {
        // Because MemberOffer doesn't use BelongsToOrganization,
        // a raw MemberOffer::all() query sees rows from ALL
        // members across ALL tenants. Tenant safety must come
        // from JOINing through LoyaltyMember. Lock this so a
        // future contributor doesn't accidentally call
        // MemberOffer::all() expecting tenant isolation.
        $orgB = OrganizationFactory::new()->create();
        \DB::table('loyalty_members')->insert([
            'organization_id' => $orgB->id,
            'tier_id'         => null,
            'member_number'   => 'MN-orgB-test',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        $otherMemberId = \DB::table('loyalty_members')
            ->where('member_number', 'MN-orgB-test')
            ->value('id');

        $this->memberOffer(); // org A member
        \DB::table('member_offers')->insert([
            'member_id'    => $otherMemberId,
            'offer_id'     => 1,
            'status'       => 'claimed',
            'ai_generated' => false,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        // Raw count: 2. No TenantScope means both surface.
        $rawCount = MemberOffer::count();
        $this->assertSame(2, $rawCount,
            'CRITICAL: MemberOffer::count() sees all rows across tenants — '
            . 'callers MUST join through LoyaltyMember for tenant safety.');
    }
}
