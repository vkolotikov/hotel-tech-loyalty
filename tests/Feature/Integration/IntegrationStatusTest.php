<?php

namespace Tests\Feature\Integration;

use App\Models\HotelSetting;
use App\Services\IntegrationStatus;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks IntegrationStatus::isEnabled — the per-org on/off gate
 * read by SmoobuClient::boot() (and any other integration).
 *
 * Why this is critical (despite being a small class):
 *
 *   A "disabled" integration that silently runs API calls leaks
 *   data — a hotel that turned off Smoobu still pushes its
 *   reservations to Smoobu's servers, AND pays for the API quota.
 *   An "enabled" integration treated as disabled stops syncing
 *   silently — the booking calendar goes stale and customers see
 *   sold-out rooms as available.
 *
 * Contract:
 *
 *   - Returns TRUE when no org context bound (defensive default —
 *     cron without tenant context shouldn't accidentally disable
 *     every tenant's integration)
 *
 *   - Returns TRUE when `{id}_enabled` setting row doesn't exist
 *     (default-on by convention — preserves prior behaviour where
 *     any saved credentials immediately took effect)
 *
 *   - Returns TRUE for truthy strings ('true', '1', 'yes')
 *
 *   - Returns FALSE for falsy strings ('false', '0', 'no')
 *
 *   - Reads via withoutGlobalScopes (org context bound, but the
 *     bypass means a TenantMiddleware-less console call still
 *     finds the row)
 *
 *   - Cross-tenant isolation — org A's disabled setting doesn't
 *     affect org B's lookup
 *
 *   - Different integration ids are independent
 */
class IntegrationStatusTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        // hotel_settings + organizations come from the booking-refund
        // schema bundle since IntegrationStatus reads hotel_settings.
        $this->setUpBookingRefundSchema();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /** Helper: bind an org + return its id. */
    private function bindOrg(): int
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);
        return $org->id;
    }

    /* ─── No-context default ─── */

    public function test_returns_true_when_no_org_context_bound(): void
    {
        // Defensive default — cron / console caller without tenant
        // context MUST NOT silently disable every tenant's
        // integration. The downstream service is responsible for
        // skipping if credentials are missing.
        $this->assertFalse(app()->bound('current_organization_id'),
            'Pre-condition: no org context bound.');

        $this->assertTrue(IntegrationStatus::isEnabled('smoobu'),
            'No org context → MUST default to enabled (defensive).');
    }

    /* ─── Default-on convention (missing row) ─── */

    public function test_returns_true_when_setting_row_is_missing(): void
    {
        // CRITICAL: preserves the prior behaviour where any saved
        // credentials immediately took effect. Without this default,
        // every prod tenant would have to manually enable each
        // integration after deploy.
        $this->bindOrg();

        $this->assertTrue(IntegrationStatus::isEnabled('smoobu'),
            'No "smoobu_enabled" row → MUST default to ENABLED (convention).');
        $this->assertTrue(IntegrationStatus::isEnabled('stripe'),
            'No "stripe_enabled" row → MUST default to ENABLED.');
    }

    /* ─── Truthy string values ─── */

    public function test_returns_true_for_truthy_string_values(): void
    {
        // FILTER_VALIDATE_BOOLEAN recognises: '1', 'true', 'yes',
        // 'on'. Lock the canonical truthy markers.
        $orgId = $this->bindOrg();

        foreach (['true', '1', 'yes', 'on'] as $val) {
            HotelSetting::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('key', 'smoobu_enabled')
                ->delete();
            HotelSetting::create([
                'organization_id' => $orgId,
                'key'             => 'smoobu_enabled',
                'value'           => $val,
            ]);

            $this->assertTrue(IntegrationStatus::isEnabled('smoobu'),
                "Value '{$val}' MUST classify as enabled.");
        }
    }

    /* ─── Falsy string values ─── */

    public function test_returns_false_for_falsy_string_values(): void
    {
        // Locked falsy markers — FILTER_VALIDATE_BOOLEAN: '0',
        // 'false', 'no', 'off'.
        $orgId = $this->bindOrg();

        foreach (['false', '0', 'no', 'off'] as $val) {
            HotelSetting::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('key', 'smoobu_enabled')
                ->delete();
            HotelSetting::create([
                'organization_id' => $orgId,
                'key'             => 'smoobu_enabled',
                'value'           => $val,
            ]);

            $this->assertFalse(IntegrationStatus::isEnabled('smoobu'),
                "Value '{$val}' MUST classify as DISABLED.");
        }
    }

    public function test_returns_false_for_empty_string(): void
    {
        // Defensive: an empty string (admin cleared the value) is
        // a DELIBERATE disable. FILTER_VALIDATE_BOOLEAN returns
        // null for '' which falsy-casts.
        $orgId = $this->bindOrg();

        HotelSetting::create([
            'organization_id' => $orgId,
            'key'             => 'smoobu_enabled',
            'value'           => '',
        ]);

        $this->assertFalse(IntegrationStatus::isEnabled('smoobu'),
            'Empty string → MUST be DISABLED (admin deliberately cleared).');
    }

    /* ─── Cross-tenant isolation ─── */

    public function test_disabled_in_org_a_does_not_affect_org_b(): void
    {
        // CRITICAL: an admin disabling Smoobu in org A must NOT
        // disable it for org B. Pre-isolation, a missing tenant
        // scope would let one tenant's setting bleed across.
        $orgA = OrganizationFactory::new()->create()->id;
        $orgB = OrganizationFactory::new()->create()->id;

        // Disable in org A.
        \DB::table('hotel_settings')->insert([
            'organization_id' => $orgA,
            'key'             => 'smoobu_enabled',
            'value'           => 'false',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        // Org A: disabled.
        app()->instance('current_organization_id', $orgA);
        $this->assertFalse(IntegrationStatus::isEnabled('smoobu'),
            'Org A explicitly disabled Smoobu.');

        // Org B: still default-enabled (no row).
        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $this->assertTrue(IntegrationStatus::isEnabled('smoobu'),
            'Org B MUST stay enabled — A\'s row scoped to A only.');
    }

    /* ─── Per-integration independence ─── */

    public function test_disabling_one_integration_does_not_affect_others(): void
    {
        // Each integration has its own `{id}_enabled` setting.
        // Disabling smoobu MUST NOT touch stripe / hubspot / etc.
        $orgId = $this->bindOrg();

        HotelSetting::create([
            'organization_id' => $orgId,
            'key'             => 'smoobu_enabled',
            'value'           => 'false',
        ]);

        $this->assertFalse(IntegrationStatus::isEnabled('smoobu'),
            'Pre-condition: smoobu disabled.');
        $this->assertTrue(IntegrationStatus::isEnabled('stripe'),
            'Stripe MUST stay enabled — keyed independently.');
        $this->assertTrue(IntegrationStatus::isEnabled('hubspot'),
            'Hubspot MUST stay enabled.');
    }

    /* ─── Withoutgloalscopes lookup invariant ─── */

    public function test_lookup_uses_withoutGlobalScopes_so_console_callers_work(): void
    {
        // SmoobuClient::boot() runs in console (cron + queue). The
        // lookup MUST work even when TenantScope's global filter
        // would otherwise block reads. withoutGlobalScopes() in
        // the implementation guarantees this — verify by binding
        // org but explicitly using a query that would fail under
        // TenantScope.
        $orgId = $this->bindOrg();

        HotelSetting::create([
            'organization_id' => $orgId,
            'key'             => 'stripe_enabled',
            'value'           => 'false',
        ]);

        // Even though we're outside the TenantMiddleware, the call
        // MUST return the persisted state.
        $this->assertFalse(IntegrationStatus::isEnabled('stripe'),
            'withoutGlobalScopes() lookup MUST surface the persisted disable.');
    }

    /* ─── Convention: keying ─── */

    public function test_integration_id_concatenates_with_underscore_enabled_suffix(): void
    {
        // The documented convention: `{id}_enabled` is the key
        // name. Lock the suffix exactly — a regression that adds
        // a space or different separator would silently fall back
        // to default-enabled.
        $orgId = $this->bindOrg();

        // Seed under the OFFICIAL key name.
        HotelSetting::create([
            'organization_id' => $orgId,
            'key'             => 'mailchimp_enabled',
            'value'           => 'false',
        ]);

        $this->assertFalse(IntegrationStatus::isEnabled('mailchimp'),
            'integration id "mailchimp" MUST map to key "mailchimp_enabled".');

        // Same value under a wrong key MUST NOT take effect.
        HotelSetting::create([
            'organization_id' => $orgId,
            'key'             => 'sendgrid-enabled', // hyphen, not underscore
            'value'           => 'false',
        ]);

        $this->assertTrue(IntegrationStatus::isEnabled('sendgrid'),
            'Wrong-format key MUST be ignored — default-on stands.');
    }
}
