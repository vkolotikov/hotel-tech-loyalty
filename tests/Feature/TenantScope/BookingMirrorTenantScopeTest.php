<?php

namespace Tests\Feature\TenantScope;

use App\Models\BookingMirror;
use App\Scopes\TenantScope;
use Database\Factories\BookingMirrorFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Cross-tenant boundary test on the BookingMirror model.
 *
 * Sister test to GuestTenantScopeTest. Locks the same 6 invariants
 * for the booking-side model. Why BookingMirror specifically:
 *
 *   - It holds the only LIVE record of a charged Stripe PaymentIntent
 *     for an org. A cross-tenant leak here would expose customer
 *     refund flows, payment_intent_ids that the other tenant could
 *     query Stripe with, and guest contact info.
 *   - The orphan-recovery path in confirm() looks up mirrors by
 *     stripe_payment_intent_id alone — the test on
 *     BookingEngineServiceConfirmTest covers that handler at the
 *     entry point, but the underlying global-scope contract is what
 *     makes that path safe. This file locks the contract.
 *   - It has more state-carrying columns than Guest (payment_status,
 *     refunded_amount, booking_group_id) so failures here surface
 *     more loudly than identity-only models.
 *
 * Six invariants enforced (same set as GuestTenantScopeTest):
 *
 *   1. No org context bound → 0 rows (fail-closed contract)
 *   2. Context = org A → only org A's mirrors visible
 *   3. Context = org B → only org B's mirrors visible
 *   4. Cross-tenant find($id) returns null (no by-id leak)
 *   5. withoutGlobalScope(TenantScope) escape hatch sees everything
 *   6. Auto-fill of organization_id on BookingMirror::create() (writer)
 *
 * Schema provisioned by setUpBookingRefundSchema (booking_mirror is
 * the singular table name — see CLAUDE.md gotcha).
 */
class BookingMirrorTenantScopeTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    public function test_no_context_bound_yields_zero_rows_fail_closed(): void
    {
        // The canonical fail-closed contract: without a bound tenant
        // context, BookingMirror::all() returns nothing. Without this,
        // a console command / queue job that forgets to bind the
        // org context could read every customer's booking data.
        $orgA = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $orgA->id);
        BookingMirrorFactory::new()->count(3)->create();
        app()->forgetInstance('current_organization_id');

        $rows = BookingMirror::all();

        $this->assertCount(0, $rows,
            'Without bound tenant context, BookingMirror::all() MUST return 0 rows.');
    }

    public function test_org_a_context_returns_only_org_a_mirrors(): void
    {
        // Seed orgs A + B. Bind A. Verify the global scope filters to
        // A only.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        app()->instance('current_organization_id', $orgA->id);
        BookingMirrorFactory::new()->count(2)->create();

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB->id);
        BookingMirrorFactory::new()->count(5)->create();

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgA->id);

        $rows = BookingMirror::all();

        $this->assertCount(2, $rows,
            'Org A context must return only org A mirrors (2 seeded).');
        foreach ($rows as $r) {
            $this->assertSame($orgA->id, (int) $r->organization_id);
        }
    }

    public function test_org_b_context_returns_only_org_b_mirrors(): void
    {
        // Symmetric to the above — flip the context and verify the
        // filter flips with it.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        app()->instance('current_organization_id', $orgA->id);
        BookingMirrorFactory::new()->count(2)->create();

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB->id);
        BookingMirrorFactory::new()->count(5)->create();

        // Stay on org B for the assertion.
        $rows = BookingMirror::all();

        $this->assertCount(5, $rows,
            'Org B context must return only org B mirrors (5 seeded).');
        foreach ($rows as $r) {
            $this->assertSame($orgB->id, (int) $r->organization_id);
        }
    }

    public function test_cross_tenant_find_by_id_returns_null(): void
    {
        // Critical: even when the caller has a specific BookingMirror
        // id (perhaps leaked via a stripe metadata lookup or an audit
        // log), BookingMirror::find($id) under a different tenant
        // context MUST return null. Without this, payment IDs / refund
        // workflows could be cross-tenant-accessed via known PKs.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        app()->instance('current_organization_id', $orgA->id);
        $orgAMirror = BookingMirrorFactory::new()->create([
            'stripe_payment_intent_id' => 'pi_test_secret_orgA_data',
        ]);

        // Switch context to org B and try to lookup org A's mirror id.
        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB->id);

        $found = BookingMirror::find($orgAMirror->id);

        $this->assertNull($found,
            'find($id) on a row owned by a different tenant MUST return null.');
    }

    public function test_withoutGlobalScope_escape_hatch_sees_everything(): void
    {
        // The documented escape hatch for cross-tenant admin / cron
        // queries. Same pattern the orphan-recovery webhook handler
        // uses (BookingPublicController::stripeWebhook orphan path)
        // — needs to look up mirrors cross-tenant by PI to resolve
        // the org. If withoutGlobalScope() silently filters too,
        // that handler can never find the mirror.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        app()->instance('current_organization_id', $orgA->id);
        BookingMirrorFactory::new()->count(2)->create();
        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB->id);
        BookingMirrorFactory::new()->count(5)->create();

        // Now query without any scope from inside org B's context —
        // must return ALL 7 rows across both tenants.
        $all = BookingMirror::withoutGlobalScope(TenantScope::class)->get();

        $this->assertCount(7, $all,
            'withoutGlobalScope(TenantScope) must return every row across tenants.');
    }

    public function test_create_auto_fills_organization_id_from_bound_context(): void
    {
        // The writer-side invariant: BelongsToOrganization's
        // `creating` hook auto-fills organization_id from the bound
        // context. Without this, every new mirror would need explicit
        // organization_id at the call site — and the moment one is
        // forgotten, the row inserts with NULL and gets lost from
        // every TenantScope query (effectively a silent data leak
        // into limbo, hidden from both the writing tenant + every
        // other tenant).
        $orgA = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $orgA->id);

        $row = BookingMirrorFactory::new()->create();

        $this->assertSame($orgA->id, (int) $row->organization_id,
            'organization_id must be auto-filled from the bound tenant context on create.');
    }
}
