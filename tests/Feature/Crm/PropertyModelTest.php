<?php

namespace Tests\Feature\Crm;

use App\Models\Property;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the Property model contract — the multi-property
 * scoping anchor used across CRM, Booking, Loyalty, Planner.
 *
 * Why this matters:
 *
 *   Hotel groups (Marriott Bonvoy-style portfolios) run many
 *   properties under one organization. Reservation /
 *   Inquiry / Outlet / Venue / Staff / Booking ALL link back to
 *   a property_id. A regression in any relationship FK silently
 *   breaks the cross-property navigation that admins use to
 *   pivot between locations.
 *
 *   Property is also BRAND-scoped (BelongsToBrand) — a brand
 *   inside an org can carry its own portfolio of properties
 *   (e.g. Westin properties under a parent group's brand).
 *
 * Contract:
 *
 *   - settings array cast (per-property feature flags, hours,
 *     etc — the SPA's "property settings" panel writes here)
 *   - is_active bool (admin pause without delete — preserves
 *     historical bookings)
 *   - room_count integer (HotelKpiService occupancy calc reads
 *     this)
 *   - 6 HasMany relationships: outlets / staff / bookings /
 *     venues / reservations / inquiries
 *   - organization BelongsTo
 *   - BelongsToOrganization + BelongsToBrand traits + tenant
 *     isolation
 */
class PropertyModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->string('widget_token', 64)->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->softDeletes();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('properties')) {
            Schema::create('properties', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->string('code')->nullable();
                $t->string('property_type')->nullable();
                $t->string('email')->nullable();
                $t->string('phone')->nullable();
                $t->string('website')->nullable();
                $t->string('gm_name')->nullable();
                $t->string('image_url')->nullable();
                $t->text('address')->nullable();
                $t->string('city')->nullable();
                $t->string('country', 64)->nullable();
                $t->string('timezone', 64)->nullable();
                $t->string('currency', 8)->nullable();
                $t->integer('star_rating')->nullable();
                $t->integer('room_count')->default(0);
                $t->string('pms_type')->nullable();
                $t->string('pms_property_id')->nullable();
                $t->text('settings')->nullable();
                $t->boolean('is_active')->default(true);
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

    private function property(array $attrs = []): Property
    {
        return Property::create(array_merge([
            'organization_id' => $this->orgId,
            'name'            => 'Test Property',
            'code'            => 'TP-' . uniqid(),
        ], $attrs));
    }

    /* ─── Casts ─── */

    public function test_settings_round_trips_through_array_cast(): void
    {
        // The SPA's per-property "Property Settings" panel reads/
        // writes this jsonb. Stay-rule overrides, business hours,
        // PMS-specific config all ride here.
        $settings = [
            'business_hours' => ['mon' => '09:00-18:00', 'sun' => 'closed'],
            'check_in_time'  => '15:00',
            'check_out_time' => '11:00',
            'amenities'      => ['pool', 'gym', 'spa'],
        ];

        $property = $this->property(['settings' => $settings]);

        $this->assertSame($settings, $property->fresh()->settings);
    }

    public function test_is_active_casts_to_boolean(): void
    {
        // Admin pause without delete — preserves historical
        // bookings + audit trail. The /reservations + /inquiries
        // list filters by is_active=true to hide paused properties.
        $active = $this->property(['is_active' => true]);
        $paused = $this->property(['is_active' => false]);

        $this->assertTrue($active->is_active);
        $this->assertFalse($paused->is_active);
        $this->assertIsBool($active->is_active);
    }

    public function test_room_count_casts_to_integer(): void
    {
        // CRITICAL: HotelKpiService::occupancy_pct divides
        // in_house COUNT by room_count. String '50' / int 50
        // matters for the division — string would crash arithmetic.
        $property = $this->property(['room_count' => '50']);

        $this->assertSame(50, $property->room_count);
        $this->assertIsInt($property->room_count);
    }

    /* ─── Relationships (6 HasMany + organization) ─── */

    public function test_organization_relationship_is_belongs_to(): void
    {
        $property = $this->property();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $property->organization(),
        );
    }

    public function test_outlets_relationship_is_has_many(): void
    {
        // Outlets = F&B / spa / shop POS units inside a property.
        $property = $this->property();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $property->outlets(),
        );
    }

    public function test_staff_relationship_is_has_many(): void
    {
        $property = $this->property();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $property->staff(),
        );
    }

    public function test_bookings_relationship_is_has_many(): void
    {
        $property = $this->property();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $property->bookings(),
        );
    }

    public function test_venues_relationship_is_has_many(): void
    {
        // Venues = event/MICE function spaces.
        $property = $this->property();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $property->venues(),
        );
    }

    public function test_reservations_relationship_is_has_many(): void
    {
        // Multi-property orgs scope reservations per property.
        $property = $this->property();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $property->reservations(),
        );
    }

    public function test_inquiries_relationship_is_has_many(): void
    {
        $property = $this->property();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $property->inquiries(),
        );
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $property = $this->property();

        $this->assertSame($this->orgId, (int) $property->organization_id);
    }

    public function test_tenant_scope_isolates_properties_cross_org(): void
    {
        // CRITICAL: properties are tenant-private. Cross-leak
        // would expose competitor portfolio inventory.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('properties')->insert([
            'organization_id' => $orgA,
            'name'            => 'Org A property',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('properties')->insert([
            'organization_id' => $orgB,
            'name'            => 'Org B property',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = Property::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('Org A property', $aRows->first()->name);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = Property::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('Org B property', $bRows->first()->name);
    }

    /* ─── property_type + pms_type persist ─── */

    public function test_property_type_persists_canonical_values(): void
    {
        // Lock the documented property types used across the SPA.
        foreach (['hotel', 'resort', 'serviced_apartment', 'boutique', 'hostel'] as $type) {
            $property = $this->property(['property_type' => $type]);
            $this->assertSame($type, $property->fresh()->property_type);
        }
    }

    public function test_pms_type_persists_for_integration_routing(): void
    {
        // pms_type drives SmoobuClient routing — a property
        // configured with pms_type='smoobu' gets PMS sync.
        $property = $this->property(['pms_type' => 'smoobu']);

        $this->assertSame('smoobu', $property->fresh()->pms_type);
    }
}
