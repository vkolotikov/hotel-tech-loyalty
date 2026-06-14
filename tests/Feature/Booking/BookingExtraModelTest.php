<?php

namespace Tests\Feature\Booking;

use App\Models\BookingExtra;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the BookingExtra model contract — sister to BookingRoom
 * (EE3). The booking widget's extras-step catalog row.
 *
 * Why this matters:
 *
 *   BookingExtra rows render as cards on the widget's "Add extras"
 *   step (parking / breakfast / late checkout / spa credits, …).
 *   BookingEngineService::quote() reads sort_order + is_active +
 *   lead_time_hours to figure out which add-ons apply to the
 *   guest's selected dates.
 *
 *   lead_time_hours (shipped 2026-04 — see CLAUDE.md "Per-extra
 *   lead_time_hours") drives the prep-time filter: an extra
 *   requiring 24h prep can't be added to a same-day checkin. The
 *   server validates this on both quote() and confirm() so the
 *   widget can't be bypassed.
 *
 * Contract:
 *
 *   - is_active boolean cast (BookingRoom::extras() filter)
 *   - price decimal:2 (BCMath-safe — added to room total in
 *     BookingEngineService::quote())
 *   - lead_time_hours integer cast (null = no lead time required)
 *   - sort_order integer (drives widget display order)
 *   - BelongsToOrganization + BelongsToBrand traits
 *   - brand_id NULL = org-wide extra (BelongsToBrand soft scope
 *     respects this — applies to all brands)
 *   - TenantScope cross-org isolation
 */
class BookingExtraModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        // setUpAvailabilitySchema brings brands + booking_rooms;
        // booking_extras is local to this test file.
        $this->setUpAvailabilitySchema();

        if (!Schema::hasTable('booking_extras')) {
            Schema::create('booking_extras', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->text('description')->nullable();
                $t->decimal('price', 12, 2)->default(0);
                $t->string('price_type', 32)->nullable();
                $t->integer('lead_time_hours')->nullable();
                $t->string('currency', 8)->default('EUR');
                $t->string('image')->nullable();
                $t->string('icon')->nullable();
                $t->string('category')->nullable();
                $t->integer('sort_order')->default(0);
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
        foreach (['current_organization_id', 'current_brand_id'] as $bind) {
            if (app()->bound($bind)) {
                app()->forgetInstance($bind);
            }
        }
        parent::tearDown();
    }

    private function extra(array $attrs = []): BookingExtra
    {
        return BookingExtra::create(array_merge([
            'organization_id' => $this->orgId,
            'name'            => 'Breakfast',
            'price'           => 25.00,
            'is_active'       => true,
            'sort_order'      => 0,
        ], $attrs));
    }

    /* ─── is_active boolean ─── */

    public function test_is_active_casts_to_boolean(): void
    {
        $active   = $this->extra(['is_active' => true]);
        $disabled = $this->extra(['is_active' => false]);

        $this->assertTrue($active->is_active);
        $this->assertFalse($disabled->is_active);
        $this->assertIsBool($active->is_active);
    }

    public function test_is_active_default_is_true(): void
    {
        // Default true per schema. Lock so a future migration
        // can't silently flip new extras to hidden.
        $extra = BookingExtra::create([
            'organization_id' => $this->orgId,
            'name'            => 'Default-state extra',
            'price'           => 10.00,
        ]);

        $this->assertTrue($extra->fresh()->is_active,
            'Default is_active MUST be true (so admin-added extras surface immediately).');
    }

    /* ─── price decimal cast ─── */

    public function test_price_casts_to_decimal_2_string(): void
    {
        // CRITICAL: BCMath-safe money math. quote() adds extras
        // price to room subtotal; a float cast would carry
        // precision error through confirm + Stripe.
        $extra = $this->extra(['price' => 39.99]);

        $this->assertSame('39.99', $extra->fresh()->price);
    }

    public function test_price_zero_persists_as_decimal_string(): void
    {
        // Free extras (complimentary water, included welcome
        // drink) — price = 0 must still round-trip as decimal:2
        // string, NOT integer 0.
        $extra = $this->extra(['price' => 0]);

        $this->assertSame('0.00', $extra->fresh()->price);
    }

    /* ─── lead_time_hours integer cast ─── */

    public function test_lead_time_hours_casts_to_integer(): void
    {
        // CRITICAL: the 2026-04 ship. BookingEngineService::quote()
        // does an int comparison against this. A string cast
        // breaks the "(stay starts in 18h) - (extra needs 24h) <
        // 0" check.
        $extra = $this->extra(['lead_time_hours' => '24']);

        $this->assertSame(24, $extra->lead_time_hours);
        $this->assertIsInt($extra->lead_time_hours);
    }

    public function test_null_lead_time_hours_persists_as_null(): void
    {
        // null = no lead-time requirement (most extras: late
        // checkout, room upgrade, etc). The quote() filter
        // branches on null/not-null — string-coerced "null" would
        // false-positive as "0 hours required".
        $extra = $this->extra(['lead_time_hours' => null]);

        $this->assertNull($extra->fresh()->lead_time_hours);
    }

    public function test_lead_time_hours_24_persists_correctly(): void
    {
        // The canonical case: spa booking / champagne welcome —
        // 24h prep window. Drives the widget's "can't add this
        // for tomorrow checkin" branch.
        $extra = $this->extra(['lead_time_hours' => 24]);

        $this->assertSame(24, $extra->fresh()->lead_time_hours);
    }

    /* ─── sort_order integer ─── */

    public function test_sort_order_persists_as_int(): void
    {
        // Drives widget display order. BookingRoom::extras()
        // orderBy('sort_order') (locked in EE3) depends on int
        // comparison, not string.
        $extra = $this->extra(['sort_order' => 50]);

        $this->assertSame(50, (int) $extra->fresh()->sort_order);
    }

    public function test_sort_order_default_is_zero(): void
    {
        // Default 0 per schema. New admin-added extras with no
        // explicit position go to the top of the list (tie-break
        // by id).
        $extra = BookingExtra::create([
            'organization_id' => $this->orgId,
            'name'            => 'Default-position extra',
            'price'           => 10.00,
            'is_active'       => true,
        ]);

        $this->assertSame(0, (int) $extra->fresh()->sort_order);
    }

    /* ─── price_type + category persist intact ─── */

    public function test_price_type_values_persist_intact(): void
    {
        // price_type is the billing-unit hint ('per_stay' /
        // 'per_night' / 'per_person' / 'per_person_per_night').
        // Widget reads this to compute the displayed total.
        foreach (['per_stay', 'per_night', 'per_person', 'per_person_per_night'] as $type) {
            $extra = $this->extra(['name' => "T-{$type}", 'price_type' => $type]);
            $this->assertSame($type, $extra->fresh()->price_type);
        }
    }

    public function test_category_values_persist_intact(): void
    {
        // category drives the widget's grouped layout (Food &
        // Drink / Comfort / Experience).
        foreach (['food', 'comfort', 'experience', 'transport'] as $cat) {
            $extra = $this->extra(['name' => "C-{$cat}", 'category' => $cat]);
            $this->assertSame($cat, $extra->fresh()->category);
        }
    }

    /* ─── brand_id semantics ─── */

    public function test_explicit_brand_id_is_preserved_on_create(): void
    {
        // The BelongsToBrand trait auto-fills brand_id from the
        // org's default brand when none is set (defense-in-depth
        // for "All brands" admin mode). An EXPLICIT brand_id
        // passed by the caller MUST win over the auto-fill — the
        // first short-circuit in the trait. Lock this so
        // brand-targeted extras (Westin-only champagne package)
        // can't get silently re-attributed to the default brand.
        $branded = $this->extra(['brand_id' => 100, 'name' => 'Brand 100 extra']);

        $this->assertSame(100, (int) $branded->brand_id,
            'Explicit brand_id MUST be preserved (caller intent wins over default-brand auto-fill).');
    }

    public function test_brand_id_null_extras_visible_when_brand_context_unbound(): void
    {
        // BelongsToBrand is "softer" than TenantScope (no-ops
        // when no brand context bound). Lock that this lets
        // org-wide extras surface normally when admin hasn't
        // picked a brand in the SPA switcher.
        $this->extra(['brand_id' => null, 'name' => 'Org-wide']);
        $this->extra(['brand_id' => 100,  'name' => 'Brand 100']);

        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }

        $rows = BookingExtra::all();
        $this->assertGreaterThanOrEqual(2, $rows->count(),
            'Unbound brand context MUST surface both org-wide and brand-targeted extras.');
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $extra = $this->extra();

        $this->assertSame($this->orgId, (int) $extra->organization_id);
    }

    public function test_tenant_scope_isolates_extras_cross_org(): void
    {
        // CRITICAL: extras catalog is tenant-private. Cross-leak
        // would expose competitor pricing + add-on menu.
        $orgB = OrganizationFactory::new()->create()->id;

        $this->extra(['name' => 'Org A extra']);
        \DB::table('booking_extras')->insert([
            'organization_id' => $orgB,
            'name'            => 'Org B extra',
            'price'           => 50.00,
            'is_active'       => true,
            'sort_order'      => 0,
            'currency'        => 'EUR',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $aRows = BookingExtra::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('Org A extra', $aRows->first()->name);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = BookingExtra::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('Org B extra', $bRows->first()->name);
    }
}
