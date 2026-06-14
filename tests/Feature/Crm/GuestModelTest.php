<?php

namespace Tests\Feature\Crm;

use App\Models\Guest;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the Guest model contract — the CRM v2 enriched customer
 * row + PII masking (passport_no / id_number).
 *
 * Surfaces locked:
 *
 *   1. PII protection — the load-bearing piece:
 *      - $hidden EXCLUDES raw passport_no + id_number from
 *        toArray() / toJson() (CRITICAL — a raw API response
 *        with passport_no breaches GDPR + ID-doc-handling
 *        regulations)
 *      - $appends INCLUDES passport_masked + id_number_masked
 *        so SPA can still display a "last 4" for visual
 *        verification
 *      - getPassportMaskedAttribute: '*' chars + last 4 digits
 *        (or full mask when <=4 chars)
 *
 *   2. CRM v2 enriched fields:
 *      - lifecycle_status (lead/customer/repeat)
 *      - importance (vip/important/normal)
 *      - lead_source, owner_name (sales attribution)
 *
 *   3. Counter casts (decimal:2):
 *      - total_revenue
 *      - avg_daily_rate
 *
 *   4. Date casts: date_of_birth, first_stay_date, last_stay_date
 *
 *   5. Consent fields: email_consent + marketing_consent (bool),
 *      consent_updated_at (datetime)
 *
 *   6. custom_data array cast (CRM Phase 7 admin-defined fields)
 *
 *   7. Relationships: member BelongsTo (FK member_id), inquiries
 *      HasMany, reservations HasMany
 *
 *   8. BelongsToOrganization auto-fill + tenant isolation
 */
class GuestModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        // The minimal guests table is narrow; add the PII +
        // counter + consent columns this test exercises.
        foreach ([
            'passport_no'        => 'string',
            'id_number'          => 'string',
            'date_of_birth'      => 'date',
            'first_stay_date'    => 'date',
            'last_stay_date'     => 'date',
            'last_activity_at'   => 'timestamp',
            'email_consent'      => 'boolean',
            'marketing_consent'  => 'boolean',
            'consent_updated_at' => 'timestamp',
            'total_revenue'      => 'decimal',
            'avg_daily_rate'     => 'decimal',
        ] as $col => $type) {
            if (!Schema::hasColumn('guests', $col)) {
                Schema::table('guests', function ($t) use ($col, $type) {
                    $colDef = match ($type) {
                        'string'    => $t->string($col),
                        'date'      => $t->date($col),
                        'timestamp' => $t->timestamp($col),
                        'boolean'   => $t->boolean($col)->default(false),
                        'decimal'   => $t->decimal($col, 12, 2)->default(0),
                    };
                    if (!in_array($type, ['boolean', 'decimal'], true)) $colDef->nullable();
                });
            }
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

    private function guest(array $attrs = []): Guest
    {
        return Guest::create(array_merge([
            'organization_id' => $this->orgId,
            'full_name'       => 'Test Guest',
            'email'           => 'guest@example.com',
        ], $attrs));
    }

    /* ─── 1. PII masking — the load-bearing contract ─── */

    public function test_passport_no_is_hidden_from_json_serialisation(): void
    {
        // CRITICAL: a raw API response with passport_no breaches
        // GDPR + ID-doc handling regulations. Lock $hidden.
        $guest = $this->guest(['passport_no' => 'AB1234567']);
        $json = $guest->toJson();
        $decoded = json_decode($json, true);

        $this->assertArrayNotHasKey('passport_no', $decoded,
            'CRITICAL: passport_no MUST NOT appear in toJson() output.');
    }

    public function test_id_number_is_hidden_from_json_serialisation(): void
    {
        $guest = $this->guest(['id_number' => '12345678901']);
        $decoded = json_decode($guest->toJson(), true);

        $this->assertArrayNotHasKey('id_number', $decoded,
            'CRITICAL: id_number MUST NOT appear in toJson() output.');
    }

    public function test_passport_masked_appears_in_json_via_appends(): void
    {
        // SPA needs the "last 4" for visual verification — the
        // masked accessor surfaces via $appends.
        $guest = $this->guest(['passport_no' => 'AB1234567']);
        $decoded = json_decode($guest->toJson(), true);

        $this->assertArrayHasKey('passport_masked', $decoded,
            'passport_masked MUST surface in JSON via $appends.');
        $this->assertSame('*****4567', $decoded['passport_masked']);
    }

    public function test_id_number_masked_appears_in_json_via_appends(): void
    {
        $guest = $this->guest(['id_number' => '12345678901']);
        $decoded = json_decode($guest->toJson(), true);

        $this->assertArrayHasKey('id_number_masked', $decoded);
        $this->assertSame('*******8901', $decoded['id_number_masked']);
    }

    public function test_passport_masked_returns_full_mask_for_short_values(): void
    {
        // Defensive: a 4-char passport (or a typo) MUST be fully
        // masked — exposing the last 4 of a 4-char string would
        // leak the entire value.
        $guest = $this->guest(['passport_no' => 'AB12']);

        $this->assertSame('****', $guest->passport_masked,
            'Passport <=4 chars MUST be fully masked.');
    }

    public function test_passport_masked_returns_null_when_no_passport_set(): void
    {
        $guest = $this->guest(['passport_no' => null]);

        $this->assertNull($guest->passport_masked);
    }

    public function test_id_number_masked_returns_null_when_no_id_set(): void
    {
        $guest = $this->guest(['id_number' => null]);

        $this->assertNull($guest->id_number_masked);
    }

    /* ─── 2. CRM v2 enriched fields persist intact ─── */

    public function test_lifecycle_status_and_importance_persist_intact(): void
    {
        // Lock the canonical values used across the SPA.
        $guest = $this->guest([
            'lifecycle_status' => 'customer',
            'importance'       => 'vip',
            'lead_source'      => 'website_form',
            'owner_name'       => 'Jane Sales',
        ]);

        $fresh = $guest->fresh();
        $this->assertSame('customer',     $fresh->lifecycle_status);
        $this->assertSame('vip',          $fresh->importance);
        $this->assertSame('website_form', $fresh->lead_source);
        $this->assertSame('Jane Sales',   $fresh->owner_name);
    }

    /* ─── 3. Counter casts (money-safe decimal:2) ─── */

    public function test_total_revenue_casts_to_decimal_2_string(): void
    {
        // CRITICAL: money-safe BCMath cast. A float cast would
        // surface 1999.99 as 1999.989999... silently.
        $guest = $this->guest(['total_revenue' => 1999.99]);

        $this->assertSame('1999.99', $guest->fresh()->total_revenue);
    }

    public function test_avg_daily_rate_casts_to_decimal_2_string(): void
    {
        $guest = $this->guest(['avg_daily_rate' => 250.75]);

        $this->assertSame('250.75', $guest->fresh()->avg_daily_rate);
    }

    /* ─── 4. Date casts ─── */

    public function test_date_of_birth_and_stay_dates_cast_to_carbon(): void
    {
        $guest = $this->guest([
            'date_of_birth'   => '1985-06-15',
            'first_stay_date' => '2024-01-10',
            'last_stay_date'  => '2026-05-20',
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $guest->date_of_birth);
        $this->assertInstanceOf(\Carbon\Carbon::class, $guest->first_stay_date);
        $this->assertInstanceOf(\Carbon\Carbon::class, $guest->last_stay_date);

        $this->assertSame('1985-06-15', $guest->date_of_birth->toDateString());
        $this->assertSame('2026-05-20', $guest->last_stay_date->toDateString());
    }

    /* ─── 5. Consent fields ─── */

    public function test_email_and_marketing_consent_cast_to_boolean(): void
    {
        // GDPR-relevant: a regression that surfaced 0 as truthy
        // in PHP would send marketing email to opted-out guests.
        $opted = $this->guest([
            'email_consent'     => true,
            'marketing_consent' => true,
        ]);
        $denied = $this->guest([
            'email_consent'     => false,
            'marketing_consent' => false,
        ]);

        $this->assertTrue($opted->email_consent);
        $this->assertTrue($opted->marketing_consent);
        $this->assertFalse($denied->email_consent);
        $this->assertFalse($denied->marketing_consent);
    }

    public function test_consent_updated_at_casts_to_carbon(): void
    {
        // Audit-trail for GDPR: when consent flipped. Needs Carbon
        // for date math (e.g. retention sweeps).
        $guest = $this->guest(['consent_updated_at' => now()]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $guest->consent_updated_at);
    }

    /* ─── 6. custom_data array cast (CRM Phase 7) ─── */

    public function test_custom_data_round_trips_through_array_cast(): void
    {
        $custom = [
            'dietary'    => ['vegan', 'gluten-free'],
            'allergies'  => 'shellfish',
            'birthday_month' => 6,
        ];

        $guest = $this->guest(['custom_data' => $custom]);

        $this->assertSame($custom, $guest->fresh()->custom_data);
    }

    /* ─── 7. Relationships + FKs ─── */

    public function test_member_relationship_uses_member_id_foreign_key(): void
    {
        $guest = $this->guest();
        $rel = $guest->member();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('member_id', $rel->getForeignKeyName(),
            'guest.member FK MUST be member_id (links Guest → LoyaltyMember).');
    }

    public function test_inquiries_is_has_many_relation(): void
    {
        $guest = $this->guest();
        $rel = $guest->inquiries();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $rel,
        );
    }

    public function test_reservations_is_has_many_relation(): void
    {
        $guest = $this->guest();
        $rel = $guest->reservations();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $rel,
        );
    }

    /* ─── 8. BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $guest = $this->guest();

        $this->assertSame($this->orgId, (int) $guest->organization_id);
    }

    public function test_tenant_scope_isolates_guests_cross_org(): void
    {
        // CRITICAL: guest data is private to the tenant. A cross-
        // leak would expose email + phone + PII across orgs.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('guests')->insert([
            'organization_id' => $orgA,
            'full_name'       => 'Org A guest',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('guests')->insert([
            'organization_id' => $orgB,
            'full_name'       => 'Org B guest',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aGuests = Guest::all();
        $this->assertCount(1, $aGuests);
        $this->assertSame('Org A guest', $aGuests->first()->full_name);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bGuests = Guest::all();
        $this->assertCount(1, $bGuests);
        $this->assertSame('Org B guest', $bGuests->first()->full_name);
    }
}
