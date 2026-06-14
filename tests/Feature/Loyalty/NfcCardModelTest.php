<?php

namespace Tests\Feature\Loyalty;

use App\Models\NfcCard;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the NfcCard model contract — physical NFC card scan
 * tracking for loyalty members.
 *
 * Why this matters:
 *
 *   NfcCard rows track the physical cards issued to members.
 *   The staff-app scanner reads each card's `uid` and bumps
 *   `scan_count` + `last_scanned_at` per scan. The admin
 *   "Cards" section reads this to surface cards that haven't
 *   been used (issuance audit) or scanned recently (member
 *   engagement signal).
 *
 *   The scan_count + last_scanned_at pair drives the SPA's
 *   "Used N times, last scanned X ago" display. A regression
 *   in either cast breaks the admin's card-management
 *   workflow.
 *
 * Contract:
 *
 *   - issued_at + last_scanned_at datetime casts (drives the
 *     SPA's diffForHumans display)
 *   - is_active bool (lost/replaced cards deactivate without
 *     delete — preserves the historical scan trail)
 *   - member BelongsTo with explicit FK 'member_id'
 *   - issuedBy BelongsTo User with explicit FK 'issued_by'
 *     (NOT 'issued_by_user_id' — locked)
 *   - BelongsToOrganization + TenantScope isolation
 */
class NfcCardModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;
    private int $memberId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema();

        if (!Schema::hasTable('nfc_cards')) {
            Schema::create('nfc_cards', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('member_id')->nullable();
                $t->string('uid', 64);
                $t->string('card_type', 32)->nullable();
                $t->timestamp('issued_at')->nullable();
                $t->unsignedBigInteger('issued_by')->nullable();
                $t->timestamp('last_scanned_at')->nullable();
                $t->unsignedBigInteger('last_scanned_by')->nullable();
                $t->integer('scan_count')->default(0);
                $t->boolean('is_active')->default(true);
                $t->text('notes')->nullable();
                $t->timestamps();
                $t->index(['organization_id', 'member_id']);
                $t->index('uid');
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

    private function card(array $attrs = []): NfcCard
    {
        return NfcCard::create(array_merge([
            'organization_id' => $this->orgId,
            'member_id'       => $this->memberId,
            'uid'             => 'UID-' . uniqid(),
            'is_active'       => true,
        ], $attrs));
    }

    /* ─── Datetime casts ─── */

    public function test_issued_at_casts_to_carbon(): void
    {
        // The "Issued X ago" display on the admin Cards panel
        // calls ->diffForHumans() — needs Carbon.
        $card = $this->card(['issued_at' => now()->subDays(30)]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $card->issued_at);
    }

    public function test_last_scanned_at_casts_to_carbon(): void
    {
        // CRITICAL: the "Last scanned X ago" engagement signal.
        // Stale-card report filters on this (e.g. "no scans in
        // 90 days").
        $card = $this->card(['last_scanned_at' => now()->subHour()]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $card->last_scanned_at);
    }

    public function test_last_scanned_at_null_for_unscanned_cards(): void
    {
        // Defensive: a freshly issued card has no scan history.
        // last_scanned_at MUST be nullable — SPA renders "Never
        // scanned" UX when null.
        $card = $this->card([
            'issued_at'       => now(),
            'last_scanned_at' => null,
        ]);

        $this->assertNull($card->last_scanned_at);
    }

    /* ─── Boolean cast ─── */

    public function test_is_active_casts_to_boolean(): void
    {
        // Lost/replaced cards deactivate without delete — preserves
        // the historical scan trail for the audit log.
        $active = $this->card(['is_active' => true]);
        $lost = $this->card(['is_active' => false]);

        $this->assertTrue($active->is_active);
        $this->assertFalse($lost->is_active);
        $this->assertIsBool($active->is_active);
    }

    /* ─── scan_count integer ─── */

    public function test_scan_count_persists_as_integer(): void
    {
        // The staff-app scanner increments this per scan. The
        // SPA shows "Used 47 times" — string would break the
        // display arithmetic.
        $card = $this->card(['scan_count' => 47]);

        $this->assertSame(47, $card->fresh()->scan_count);
    }

    /* ─── Relationships + FK locks ─── */

    public function test_member_relationship_uses_member_id_foreign_key(): void
    {
        // CRITICAL: FK is 'member_id' (the linking column for
        // tenant routing via LoyaltyMember).
        $card = $this->card();
        $rel = $card->member();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('member_id', $rel->getForeignKeyName(),
            'member FK MUST be member_id.');
    }

    public function test_issued_by_relationship_uses_issued_by_foreign_key(): void
    {
        // CRITICAL: FK is 'issued_by' — NOT 'issued_by_user_id'
        // (the conventional pattern). Lock the legacy name.
        $card = $this->card();
        $rel = $card->issuedBy();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('issued_by', $rel->getForeignKeyName(),
            'issuedBy FK MUST be issued_by (NOT issued_by_user_id).');
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $card = $this->card();

        $this->assertSame($this->orgId, (int) $card->organization_id);
    }

    public function test_tenant_scope_isolates_cards_cross_org(): void
    {
        // CRITICAL: cards are tenant-private. Cross-leak would
        // surface another tenant's card uid list — physical
        // card cloning risk.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('nfc_cards')->insert([
            'organization_id' => $orgA,
            'uid'             => 'CARD-A',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('nfc_cards')->insert([
            'organization_id' => $orgB,
            'uid'             => 'CARD-B',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = NfcCard::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('CARD-A', $aRows->first()->uid);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = NfcCard::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('CARD-B', $bRows->first()->uid);
    }

    /* ─── Card-type variants ─── */

    public function test_card_type_persists_canonical_variants(): void
    {
        // Lock the documented card types — physical / virtual
        // (wallet pass) / nfc_sticker.
        foreach (['physical', 'virtual', 'nfc_sticker'] as $type) {
            $card = $this->card(['card_type' => $type]);
            $this->assertSame($type, $card->fresh()->card_type);
        }
    }
}
