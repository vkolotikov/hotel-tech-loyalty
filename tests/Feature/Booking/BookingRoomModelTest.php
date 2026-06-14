<?php

namespace Tests\Feature\Booking;

use App\Models\BookingExtra;
use App\Models\BookingRoom;
use Database\Factories\BookingRoomFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the BookingRoom model contract — the booking widget's
 * room catalog row.
 *
 * Why this matters:
 *
 *   BookingRoom is the source of truth for the public booking
 *   widget's room cards. AvailabilityService::check (covered
 *   broadly across Tiers J/L) reads pms_id + base_price +
 *   inventory_count + max_guests from these rows. A regression
 *   in any cast surfaces wrong-type values in the customer-
 *   facing widget.
 *
 *   The 4 array casts (gallery + amenities + tags + meta) carry
 *   the visual presentation data the widget renders — broken
 *   array decoding = broken cards on the customer's site.
 *
 *   extras() is the BookingExtra lookup helper used by quote()
 *   to figure out which add-ons apply to this room.
 *
 * Contract:
 *
 *   - 4 array casts: gallery, amenities, tags, meta
 *   - base_price decimal:2 (BCMath-safe — widget price math)
 *   - inventory_count integer (oversell-prevention guard reads
 *     this — see Tier L3 AvailabilityServiceCalendarPricesTest
 *     for the inventory invariant)
 *   - is_active boolean
 *   - extras() returns active BookingExtras ordered by
 *     sort_order — scoped to this room's org
 *   - BelongsToOrganization + BelongsToBrand + tenant isolation
 */
class BookingRoomModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        // setUpAvailabilitySchema brings booking_rooms + brands.
        $this->setUpAvailabilitySchema();

        // booking_extras for the extras() lookup test.
        if (!Schema::hasTable('booking_extras')) {
            Schema::create('booking_extras', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->string('slug')->nullable();
                $t->decimal('price', 12, 2)->default(0);
                $t->string('billing_unit', 32)->nullable();
                $t->integer('sort_order')->default(0);
                $t->boolean('is_active')->default(true);
                $t->integer('lead_time_hours')->nullable();
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
        foreach (['current_organization_id', 'current_brand_id'] as $bind) {
            if (app()->bound($bind)) {
                app()->forgetInstance($bind);
            }
        }
        parent::tearDown();
    }

    /* ─── 4 array casts ─── */

    public function test_gallery_round_trips_through_array_cast(): void
    {
        // Drives the widget's image carousel on each room card.
        $gallery = [
            'https://example.com/hero.jpg',
            'https://example.com/bed.jpg',
            'https://example.com/bath.jpg',
        ];

        $room = BookingRoomFactory::new()->create(['gallery' => $gallery]);

        $this->assertSame($gallery, $room->fresh()->gallery);
    }

    public function test_amenities_round_trips_through_array_cast(): void
    {
        // Each amenity becomes a chip on the room card.
        $amenities = ['Free WiFi', 'Sea view', 'Air conditioning', 'Mini bar'];

        $room = BookingRoomFactory::new()->create(['amenities' => $amenities]);

        $this->assertSame($amenities, $room->fresh()->amenities);
    }

    public function test_tags_round_trips_through_array_cast(): void
    {
        // Tags drive search filters (Family-friendly, Romantic, etc).
        $tags = ['family-friendly', 'sea-view', 'penthouse'];

        $room = BookingRoomFactory::new()->create(['tags' => $tags]);

        $this->assertSame($tags, $room->fresh()->tags);
    }

    public function test_meta_round_trips_through_array_cast(): void
    {
        // meta is the catch-all jsonb for PMS-specific extras
        // (smoking allowed, accessibility, etc) that don't fit
        // the documented fields.
        $meta = [
            'accessibility' => ['wheelchair_accessible', 'roll_in_shower'],
            'smoking'       => false,
            'pms_extra_data'=> ['smoobu_unit_type' => 'apartment'],
        ];

        $room = BookingRoomFactory::new()->create(['meta' => $meta]);

        $this->assertSame($meta, $room->fresh()->meta);
    }

    /* ─── base_price decimal cast ─── */

    public function test_base_price_casts_to_decimal_2_string(): void
    {
        // CRITICAL: BCMath-safe money math. Widget shows the
        // base_price + AvailabilityService::check uses it as the
        // 3rd-tier fallback when Smoobu rates are absent. A
        // float cast would carry precision error across the
        // confirm flow.
        $room = BookingRoomFactory::new()->create(['base_price' => 199.99]);

        $this->assertSame('199.99', $room->fresh()->base_price);
    }

    /* ─── inventory_count integer cast ─── */

    public function test_inventory_count_casts_to_integer(): void
    {
        // CRITICAL: oversell-prevention guard. AvailabilityService::
        // calendarPrices reads this to check whether the room
        // has remaining inventory before falling back to base
        // price (the Tier L3 lock). A string cast would crash
        // the comparison arithmetic.
        $room = BookingRoomFactory::new()->create(['inventory_count' => '5']);

        $this->assertSame(5, $room->inventory_count);
        $this->assertIsInt($room->inventory_count);
    }

    public function test_inventory_count_default_is_1(): void
    {
        // Default 1 per the factory + schema. Lock the
        // documented baseline — a single-inventory room.
        $room = BookingRoomFactory::new()->create();

        $this->assertSame(1, $room->fresh()->inventory_count,
            'Default inventory_count MUST be 1 (single-unit baseline).');
    }

    /* ─── is_active boolean ─── */

    public function test_is_active_casts_to_boolean(): void
    {
        $active = BookingRoomFactory::new()->create(['is_active' => true]);
        $hidden = BookingRoomFactory::new()->create(['is_active' => false]);

        $this->assertTrue($active->is_active);
        $this->assertFalse($hidden->is_active);
        $this->assertIsBool($active->is_active);
    }

    /* ─── extras() helper ─── */

    public function test_extras_returns_active_org_scoped_extras(): void
    {
        // extras() returns ALL active BookingExtras for the room's
        // org (the widget shows the full extras list on every
        // room's "extras" step — they're not per-room scoped
        // today, just per-org).
        $room = BookingRoomFactory::new()->create();

        BookingExtra::create([
            'organization_id' => $this->orgId,
            'name'            => 'Breakfast',
            'price'           => 25.00,
            'is_active'       => true,
            'sort_order'      => 1,
        ]);
        BookingExtra::create([
            'organization_id' => $this->orgId,
            'name'            => 'Parking',
            'price'           => 15.00,
            'is_active'       => true,
            'sort_order'      => 2,
        ]);

        $extras = $room->extras();

        $this->assertCount(2, $extras);
    }

    public function test_extras_excludes_inactive_extras(): void
    {
        // Soft-deactivated extras MUST NOT surface in the widget.
        $room = BookingRoomFactory::new()->create();

        BookingExtra::create([
            'organization_id' => $this->orgId,
            'name'            => 'Live extra',
            'price'           => 10.00,
            'is_active'       => true,
            'sort_order'      => 1,
        ]);
        BookingExtra::create([
            'organization_id' => $this->orgId,
            'name'            => 'Disabled extra',
            'price'           => 10.00,
            'is_active'       => false,
            'sort_order'      => 2,
        ]);

        $extras = $room->extras();
        $names = $extras->pluck('name')->values()->toArray();

        $this->assertSame(['Live extra'], $names,
            'extras() MUST exclude is_active=false rows.');
    }

    public function test_extras_returns_in_sort_order_ascending(): void
    {
        // The widget renders extras in a documented order — drag-
        // reorderable by admin. extras() MUST honor sort_order.
        $room = BookingRoomFactory::new()->create();

        BookingExtra::create([
            'organization_id' => $this->orgId,
            'name'            => 'Third',
            'price'           => 10.00,
            'is_active'       => true,
            'sort_order'      => 30,
        ]);
        BookingExtra::create([
            'organization_id' => $this->orgId,
            'name'            => 'First',
            'price'           => 10.00,
            'is_active'       => true,
            'sort_order'      => 10,
        ]);
        BookingExtra::create([
            'organization_id' => $this->orgId,
            'name'            => 'Second',
            'price'           => 10.00,
            'is_active'       => true,
            'sort_order'      => 20,
        ]);

        $names = $room->extras()->pluck('name')->values()->toArray();

        $this->assertSame(['First', 'Second', 'Third'], $names,
            'extras() MUST surface in sort_order ascending.');
    }

    public function test_extras_scoped_to_room_organization(): void
    {
        // Extras from other orgs MUST NOT surface in this room's
        // list (the extras() method explicitly filters by
        // organization_id matching the room's).
        $room = BookingRoomFactory::new()->create();

        BookingExtra::create([
            'organization_id' => $this->orgId,
            'name'            => 'My org extra',
            'price'           => 10.00,
            'is_active'       => true,
            'sort_order'      => 1,
        ]);

        $otherOrg = OrganizationFactory::new()->create()->id;
        \DB::table('booking_extras')->insert([
            'organization_id' => $otherOrg,
            'name'            => 'Other org extra',
            'price'           => 10.00,
            'is_active'       => true,
            'sort_order'      => 1,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $names = $room->extras()->pluck('name')->values()->toArray();

        $this->assertSame(['My org extra'], $names,
            'extras() MUST scope to room\'s organization (not surface other orgs\').');
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $room = BookingRoomFactory::new()->create();

        $this->assertSame($this->orgId, (int) $room->organization_id);
    }

    public function test_tenant_scope_isolates_rooms_cross_org(): void
    {
        // CRITICAL: room catalog is tenant-private. Cross-leak
        // exposes competitor pricing + room inventory.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        BookingRoomFactory::new()->create(['name' => 'Org A room']);
        \DB::table('booking_rooms')->insert([
            'organization_id' => $orgB,
            'name'            => 'Org B room',
            'base_price'      => 100.00,
            'inventory_count' => 1,
            'currency'        => 'EUR',
            'is_active'       => true,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = BookingRoom::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('Org A room', $aRows->first()->name);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = BookingRoom::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('Org B room', $bRows->first()->name);
    }
}
