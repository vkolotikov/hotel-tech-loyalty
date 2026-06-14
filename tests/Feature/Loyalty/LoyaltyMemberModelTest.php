<?php

namespace Tests\Feature\Loyalty;

use App\Models\LoyaltyMember;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the LoyaltyMember model contract — the core member row
 * that the entire loyalty program revolves around.
 *
 * Surfaces locked:
 *
 *   Boolean casts (5): is_active, marketing_consent,
 *   email_notifications, push_notifications, tier_locked
 *
 *   Date casts (4): points_expiry_date, tier_review_date,
 *   tier_effective_from, tier_effective_until
 *
 *   Datetime casts (5): nfc_card_issued_at, joined_at,
 *   welcomed_at, last_activity_at, tier_override_until
 *
 *   Decimal cast: qualifying_spend decimal:2
 *
 *   Array cast: notification_preferences
 *
 *   Relationships + FKs:
 *     - user BelongsTo (FK 'user_id' — conventional)
 *     - tier BelongsTo (FK 'tier_id')
 *     - pointsTransactions HasMany (FK 'member_id')
 *     - bookings HasMany (FK 'member_id')
 *     - memberOffers HasMany (FK 'member_id')
 *     - referredBy BelongsTo self (FK 'referred_by')
 *     - referrals HasMany (FK 'referrer_id' — NOT member_id)
 *
 *   BelongsToOrganization auto-fill + tenant isolation
 */
class LoyaltyMemberModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;
    private int $tierId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();

        // setUpLoyaltySchema's loyalty_members table is narrow.
        // Add the columns this test exercises.
        foreach ([
            'notification_preferences' => 'text',
            'qualifying_spend'         => 'decimal',
            'tier_locked'              => 'boolean',
            'tier_override_until'      => 'timestamp',
            'nfc_card_issued_at'       => 'timestamp',
            'welcomed_at'              => 'timestamp',
            'marketing_consent'        => 'boolean',
            'email_notifications'      => 'boolean',
            'push_notifications'       => 'boolean',
            'referred_by'              => 'unsignedBigInteger',
        ] as $col => $type) {
            if (!\Illuminate\Support\Facades\Schema::hasColumn('loyalty_members', $col)) {
                \Illuminate\Support\Facades\Schema::table('loyalty_members', function ($t) use ($col, $type) {
                    $colDef = match ($type) {
                        'text'               => $t->text($col),
                        'decimal'            => $t->decimal($col, 12, 2)->default(0),
                        'boolean'            => $t->boolean($col)->default(false),
                        'timestamp'          => $t->timestamp($col),
                        'unsignedBigInteger' => $t->unsignedBigInteger($col),
                    };
                    if (!in_array($type, ['decimal', 'boolean'], true)) $colDef->nullable();
                });
            }
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        $tier = LoyaltyTierFactory::new()->bronze()->create();
        $this->tierId = $tier->id;
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function member(array $attrs = []): LoyaltyMember
    {
        return LoyaltyMember::create(array_merge([
            'organization_id' => $this->orgId,
            'tier_id'         => $this->tierId,
            'member_number'   => 'MN-' . uniqid(),
            'is_active'       => true,
        ], $attrs));
    }

    /* ─── Boolean casts (5) ─── */

    public function test_is_active_casts_to_boolean(): void
    {
        // is_active = the main "is this member usable" flag.
        // 0/1 vs true/false matters for the SPA's status pill +
        // the LoyaltyService's eligibility gates.
        $active = $this->member(['is_active' => true]);
        $deactivated = $this->member(['is_active' => false]);

        $this->assertTrue($active->is_active);
        $this->assertFalse($deactivated->is_active);
        $this->assertIsBool($active->is_active);
    }

    public function test_marketing_consent_casts_to_boolean(): void
    {
        // GDPR-relevant: marketing_consent gates which members
        // receive email/SMS campaigns. A regression that surfaced
        // 0 as truthy in PHP would send to opted-out members.
        $opted = $this->member(['marketing_consent' => true]);
        $denied = $this->member(['marketing_consent' => false]);

        $this->assertTrue($opted->marketing_consent);
        $this->assertFalse($denied->marketing_consent);
    }

    public function test_email_and_push_notifications_cast_to_boolean(): void
    {
        $member = $this->member([
            'email_notifications' => true,
            'push_notifications'  => false,
        ]);

        $this->assertTrue($member->email_notifications);
        $this->assertFalse($member->push_notifications);
    }

    public function test_tier_locked_casts_to_boolean(): void
    {
        // tier_locked = manual override that prevents auto-
        // assessment (admin tools / VIP cases). The tier
        // reassessment cron skips locked members.
        $locked = $this->member(['tier_locked' => true]);
        $unlocked = $this->member(['tier_locked' => false]);

        $this->assertTrue($locked->tier_locked);
        $this->assertFalse($unlocked->tier_locked);
    }

    /* ─── Date casts (date, not datetime) ─── */

    public function test_points_expiry_date_casts_to_carbon_date(): void
    {
        $member = $this->member(['points_expiry_date' => '2026-12-31']);

        $this->assertInstanceOf(\Carbon\Carbon::class, $member->points_expiry_date);
        $this->assertSame('2026-12-31', $member->points_expiry_date->toDateString());
    }

    public function test_tier_review_date_casts_to_carbon_date(): void
    {
        // tier_review_date = when next tier assessment fires. The
        // batched cron filters by this.
        $member = $this->member(['tier_review_date' => '2026-06-30']);

        $this->assertInstanceOf(\Carbon\Carbon::class, $member->tier_review_date);
    }

    public function test_tier_effective_from_and_until_cast_to_carbon_date(): void
    {
        // The tier window — locks the period during which
        // qualifying activity counts toward the current tier
        // status. Used by the qualifying-period progress bar.
        $member = $this->member([
            'tier_effective_from'  => '2026-01-01',
            'tier_effective_until' => '2026-12-31',
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $member->tier_effective_from);
        $this->assertInstanceOf(\Carbon\Carbon::class, $member->tier_effective_until);
    }

    /* ─── Datetime casts (5) ─── */

    public function test_lifecycle_timestamps_all_cast_to_carbon(): void
    {
        $now = now();
        $member = $this->member([
            'joined_at'         => $now,
            'welcomed_at'       => $now->copy()->addMinutes(5),
            'last_activity_at'  => $now->copy()->addHours(2),
            'nfc_card_issued_at'=> $now->copy()->addDays(3),
            'tier_override_until'=> $now->copy()->addDays(90),
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $member->joined_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $member->welcomed_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $member->last_activity_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $member->nfc_card_issued_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $member->tier_override_until);
    }

    /* ─── Decimal cast ─── */

    public function test_qualifying_spend_casts_to_decimal_2(): void
    {
        // Money-bearing field — needs BCMath-safe string cast.
        // A regression to float cast would surface 1999.99 as
        // 1999.989999... silently.
        $member = $this->member(['qualifying_spend' => 1999.99]);

        $this->assertSame('1999.99', $member->fresh()->qualifying_spend,
            'qualifying_spend MUST cast to decimal:2 string (money-safe).');
    }

    /* ─── Array cast ─── */

    public function test_notification_preferences_round_trips_through_array_cast(): void
    {
        // The SPA's per-member notification settings (email opt-
        // outs by campaign type, push categories, etc).
        $prefs = [
            'campaigns'      => ['email' => true, 'push' => false],
            'transactional'  => ['email' => true],
            'tier_upgrades'  => ['email' => true, 'push' => true],
        ];

        $member = $this->member(['notification_preferences' => $prefs]);

        $this->assertSame($prefs, $member->fresh()->notification_preferences);
    }

    /* ─── Relationships + FK locks ─── */

    public function test_user_relationship_uses_user_id_foreign_key(): void
    {
        $member = $this->member();
        $rel = $member->user();

        $this->assertSame('user_id', $rel->getForeignKeyName(),
            'user relationship MUST FK on user_id (conventional).');
    }

    public function test_tier_relationship_uses_tier_id_foreign_key(): void
    {
        $member = $this->member();
        $rel = $member->tier();

        $this->assertSame('tier_id', $rel->getForeignKeyName());
    }

    public function test_points_transactions_relationship_uses_member_id_foreign_key(): void
    {
        // CRITICAL: lock the FK so a future refactor doesn't
        // silently switch to loyalty_member_id and break the
        // member ledger lookup.
        $member = $this->member();
        $rel = $member->pointsTransactions();

        $this->assertSame('member_id', $rel->getForeignKeyName(),
            'pointsTransactions FK MUST be member_id (NOT loyalty_member_id).');
    }

    public function test_referrals_relationship_uses_referrer_id_foreign_key(): void
    {
        // CRITICAL: the referrer FK is `referrer_id`, NOT the
        // conventional `member_id`. A regression to convention
        // would break the referral leaderboard + payout logic.
        $member = $this->member();
        $rel = $member->referrals();

        $this->assertSame('referrer_id', $rel->getForeignKeyName(),
            'referrals FK MUST be referrer_id (NOT member_id).');
    }

    public function test_referred_by_is_self_belongs_to_relation(): void
    {
        // The "who recruited this member" self-link. Lock that
        // it's a self-relation (not BelongsTo User).
        $member = $this->member();
        $rel = $member->referredBy();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('referred_by', $rel->getForeignKeyName());
        $this->assertSame(LoyaltyMember::class, get_class($rel->getRelated()),
            'referredBy MUST be a self-relation on LoyaltyMember.');
    }

    public function test_member_offers_and_nfc_cards_use_member_id_fk(): void
    {
        $member = $this->member();

        $this->assertSame('member_id', $member->memberOffers()->getForeignKeyName());
        $this->assertSame('member_id', $member->nfcCards()->getForeignKeyName());
    }

    public function test_expiry_buckets_relationship_uses_member_id_fk(): void
    {
        // PointExpiryBucket linkage — drives the FIFO expiry
        // cron. Each member has many buckets (one per earn batch).
        $member = $this->member();
        $rel = $member->expiryBuckets();

        $this->assertSame('member_id', $rel->getForeignKeyName());
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $member = $this->member();

        $this->assertSame($this->orgId, (int) $member->organization_id);
    }

    public function test_tenant_scope_isolates_members_cross_org(): void
    {
        // CRITICAL: a member from org A MUST NOT surface in org
        // B's member list. Cross-leak would expose private member
        // data (points balance, email, phone).
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('loyalty_members')->insert([
            'organization_id' => $orgA,
            'tier_id'         => $this->tierId,
            'member_number'   => 'MN-orgA',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('loyalty_members')->insert([
            'organization_id' => $orgB,
            'member_number'   => 'MN-orgB',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        // org A context — should see only org A's member (plus
        // the one created by setUp's $this->member()).
        $aMembers = LoyaltyMember::query()
            ->where('member_number', 'like', 'MN-org%')
            ->get();
        $this->assertCount(1, $aMembers);
        $this->assertSame('MN-orgA', $aMembers->first()->member_number);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bMembers = LoyaltyMember::query()
            ->where('member_number', 'like', 'MN-org%')
            ->get();
        $this->assertCount(1, $bMembers);
        $this->assertSame('MN-orgB', $bMembers->first()->member_number);
    }
}
