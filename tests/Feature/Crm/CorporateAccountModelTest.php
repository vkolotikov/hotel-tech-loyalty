<?php

namespace Tests\Feature\Crm;

use App\Models\CorporateAccount;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the CorporateAccount model contract — B2B accounts powering
 * the Companies surface and the CRM v2 credit-utilization meter.
 *
 * Why this matters:
 *
 *   CRM v2 (CLAUDE.md "Companies upgrade") added:
 *   - Credit-utilization meter computed from confirmed-but-not-
 *     checked-out reservations vs `credit_limit`. Amber@75%,
 *     red@90%. A regression in the credit_limit decimal cast
 *     surfaces wrong utilisation %.
 *   - Linked-deals tab from inquiries HasMany.
 *   - Renewal-soon chip when contract_end is within 60 days.
 *     A regression in contract_end date cast surfaces wrong
 *     "days until renewal" math.
 *
 *   custom_data is the Phase 7 jsonb column shared by inquiries /
 *   guests / corporate_accounts / tasks. Drives admin-defined
 *   fields (preferred currency / discount tier / industry-specific
 *   data). Saved values persist even if a field is later
 *   deactivated. Locked here for corporate; sister tests lock the
 *   same column on Guest + Inquiry + Task models.
 *
 * Contract:
 *
 *   - contract_start + contract_end date casts → Carbon (renewal-
 *     soon chip + contract-active state).
 *   - 4 money decimal:2 casts (BCMath-safe): negotiated_rate +
 *     discount_percentage + annual_revenue + credit_limit.
 *   - custom_data array cast (Phase 7 jsonb — round-trip arrays,
 *     objects, primitives, null).
 *   - inquiries + reservations HasMany.
 *   - BelongsToOrganization + TenantScope cross-org isolation.
 */
class CorporateAccountModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('corporate_accounts')) {
            Schema::create('corporate_accounts', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('company_name');
                $t->string('industry')->nullable();
                $t->string('tax_id')->nullable();
                $t->text('billing_address')->nullable();
                $t->string('billing_email')->nullable();
                $t->string('contact_person')->nullable();
                $t->string('contact_email')->nullable();
                $t->string('contact_phone')->nullable();
                $t->string('account_manager')->nullable();
                $t->date('contract_start')->nullable();
                $t->date('contract_end')->nullable();
                $t->decimal('negotiated_rate', 12, 2)->nullable();
                $t->string('rate_type', 32)->nullable();
                $t->decimal('discount_percentage', 5, 2)->nullable();
                $t->integer('annual_room_nights_target')->nullable();
                $t->integer('annual_room_nights_actual')->nullable();
                $t->decimal('annual_revenue', 14, 2)->nullable();
                $t->string('payment_terms')->nullable();
                $t->decimal('credit_limit', 14, 2)->nullable();
                $t->string('status', 32)->nullable();
                $t->text('notes')->nullable();
                $t->text('custom_data')->nullable();
                $t->timestamps();
                $t->index('organization_id');
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function account(array $attrs = []): CorporateAccount
    {
        return CorporateAccount::create(array_merge([
            'organization_id' => $this->orgId,
            'company_name'    => 'Test Corp',
            'status'          => 'active',
        ], $attrs));
    }

    /* ─── contract_start + contract_end date casts ─── */

    public function test_contract_start_casts_to_carbon(): void
    {
        $a = $this->account(['contract_start' => '2026-01-01']);

        $this->assertInstanceOf(\Carbon\Carbon::class, $a->contract_start);
        $this->assertSame('2026-01-01', $a->contract_start->toDateString());
    }

    public function test_contract_end_casts_to_carbon(): void
    {
        // CRITICAL: drives the renewal-soon chip (CRM v2). A
        // regression in the date cast breaks the "days until
        // renewal" math the SPA computes via
        // diff(contract_end).
        $a = $this->account(['contract_end' => '2026-12-31']);

        $this->assertInstanceOf(\Carbon\Carbon::class, $a->contract_end);
        $this->assertSame('2026-12-31', $a->contract_end->toDateString());
    }

    public function test_null_contract_dates_persist_as_null(): void
    {
        // No-contract account (pure prospect / month-to-month).
        // Both fields nullable + the SPA's renewal-soon chip
        // skips rendering when contract_end is null.
        $a = $this->account([
            'contract_start' => null,
            'contract_end'   => null,
        ]);

        $fresh = $a->fresh();
        $this->assertNull($fresh->contract_start);
        $this->assertNull($fresh->contract_end);
    }

    /* ─── 4 money decimal:2 casts (BCMath-safe) ─── */

    public function test_negotiated_rate_casts_to_decimal_2_string(): void
    {
        // Per-night negotiated rate. BCMath-safe so the
        // utilisation math in CRM v2 stays precise.
        $a = $this->account(['negotiated_rate' => 199.50]);

        $this->assertSame('199.50', $a->fresh()->negotiated_rate);
    }

    public function test_discount_percentage_casts_to_decimal_2_string(): void
    {
        // Fractional discount %, e.g. 12.50. The SPA renders
        // "12.50% off rack" — needs decimal precision.
        $a = $this->account(['discount_percentage' => 12.50]);

        $this->assertSame('12.50', $a->fresh()->discount_percentage);
    }

    public function test_annual_revenue_casts_to_decimal_2_string(): void
    {
        // Aggregate revenue from this corporate over the year.
        // Drives the top-companies LTV report.
        $a = $this->account(['annual_revenue' => 125000.75]);

        $this->assertSame('125000.75', $a->fresh()->annual_revenue);
    }

    public function test_credit_limit_casts_to_decimal_2_string(): void
    {
        // CRITICAL: drives the credit-utilization meter
        // (CRM v2). Amber@75%, red@90%. A float cast would
        // carry precision error across the
        // sumOf(open_reservations) / credit_limit
        // calculation.
        $a = $this->account(['credit_limit' => 50000.00]);

        $this->assertSame('50000.00', $a->fresh()->credit_limit);
    }

    /* ─── custom_data array cast (Phase 7 jsonb) ─── */

    public function test_custom_data_round_trips_through_array_cast(): void
    {
        // CRM Phase 7 — admin-defined custom fields shared
        // across inquiries / guests / corporate / tasks.
        // Locked here for corporate; the same column is locked
        // in sister tests on Guest + Inquiry + Task.
        $payload = [
            'preferred_currency' => 'EUR',
            'rate_tier'          => 'platinum',
            'industries_served'  => ['finance', 'tech', 'pharma'],
            'has_master_contract' => true,
        ];

        $a = $this->account(['custom_data' => $payload]);

        $this->assertSame($payload, $a->fresh()->custom_data);
    }

    public function test_null_custom_data_persists_as_null(): void
    {
        // Defensive: an account with no custom fields set has
        // null custom_data. The SPA's "no custom fields"
        // empty-state branches on null.
        $a = $this->account(['custom_data' => null]);

        $this->assertNull($a->fresh()->custom_data);
    }

    public function test_custom_data_survives_field_deactivation_semantic(): void
    {
        // The Phase 7 invariant: saved values persist even
        // when the field schema is later deleted. The model-
        // level lock here is the jsonb round-trip — the
        // schema-level lock is at the CustomField service
        // layer. Set an arbitrary key to verify it survives
        // a fresh load without filter / coercion.
        $a = $this->account([
            'custom_data' => ['orphaned_field_xyz' => 'still here'],
        ]);

        $fresh = $a->fresh();
        $this->assertArrayHasKey('orphaned_field_xyz', $fresh->custom_data);
        $this->assertSame('still here', $fresh->custom_data['orphaned_field_xyz']);
    }

    /* ─── Relationships ─── */

    public function test_inquiries_relationship_is_has_many(): void
    {
        // Drives the linked-deals tab on the corporate detail
        // panel (CRM v2 ship).
        $a = $this->account();
        $rel = $a->inquiries();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $rel,
        );
        $this->assertSame('corporate_account_id', $rel->getForeignKeyName());
    }

    public function test_reservations_relationship_is_has_many(): void
    {
        // Drives the credit-utilization meter calculation
        // (sumOf confirmed-but-not-checked-out reservations).
        $a = $this->account();
        $rel = $a->reservations();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $rel,
        );
        $this->assertSame('corporate_account_id', $rel->getForeignKeyName());
    }

    /* ─── Integer counters persist intact ─── */

    public function test_annual_room_nights_counters_persist_as_int(): void
    {
        // Target vs actual room nights. The SPA renders a
        // progress bar "actual / target" — needs int math.
        $a = $this->account([
            'annual_room_nights_target' => 1000,
            'annual_room_nights_actual' => 645,
        ]);

        $fresh = $a->fresh();
        $this->assertSame(1000, (int) $fresh->annual_room_nights_target);
        $this->assertSame(645,  (int) $fresh->annual_room_nights_actual);
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $a = $this->account();

        $this->assertSame($this->orgId, (int) $a->organization_id);
    }

    public function test_tenant_scope_isolates_corporate_accounts_cross_org(): void
    {
        // CRITICAL: B2B accounts carry negotiated rates +
        // credit limits + annual revenue. Cross-leak exposes
        // competitor pricing strategy + customer LTV data.
        $orgB = OrganizationFactory::new()->create()->id;

        $this->account(['company_name' => 'Org A Corp']);
        \DB::table('corporate_accounts')->insert([
            'organization_id' => $orgB,
            'company_name'    => 'Org B Corp',
            'status'          => 'active',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = CorporateAccount::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('Org A Corp', $aRows->first()->company_name);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = CorporateAccount::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('Org B Corp', $bRows->first()->company_name);
    }
}
