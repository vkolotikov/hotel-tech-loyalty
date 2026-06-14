<?php

namespace Tests\Feature\Booking;

use App\Services\AvailabilityService;
use App\Services\SmoobuClient;
use Database\Factories\BookingMirrorFactory;
use Database\Factories\BookingRoomFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks AvailabilityService::check()'s 3-tier acceptance contract.
 *
 * The contract — repeated here for posterity because the 2026-05-31
 * Forrest Glamp arc traced a lost booking back to this exact
 * symmetry, and CLAUDE.md flags it as load-bearing:
 *
 *   Tier A (preferred): per-day data from SmoobuClient::getDailyRates.
 *     Every requested night must have available=true AND price>0.
 *     Min-stay is the max over the per-night min_stay values.
 *
 *   Tier B (aggregate fallback): when per-day is missing for a unit,
 *     consult SmoobuClient::getRates aggregate. If the unit reports
 *     available=true AND price>0, accept at the aggregate price.
 *
 *   Tier C (DB base_price): when neither Smoobu source has data,
 *     fall back to the room's local base_price * night count. Without
 *     this fallback, rooms outside Smoobu's published rate window
 *     (manual rooms, PMS-less setups, far-future dates) would be
 *     silently hidden. confirm()'s live-recheck uses the same 3-tier
 *     pattern — drift between availability and confirm is what cost
 *     the Forrest Glamp booking.
 *
 * Plus the orthogonal filters:
 *   - guest count > max_guests → unit dropped
 *   - inventory_count exhausted by overlapping bookings → unit dropped
 *
 * Output is sorted cheapest-first. Caches the result for 60s.
 *
 * CRITICAL constraint honored: no real Smoobu call. SmoobuClient is
 * Mockery-mocked with per-test expectations on getDailyRates +
 * getRates — every code path that would reach the live API is
 * intercepted at the mock boundary.
 */
class AvailabilityServiceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private $smoobu;
    private AvailabilityService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAvailabilitySchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $this->smoobu  = Mockery::mock(SmoobuClient::class);
        $this->service = new AvailabilityService($this->smoobu);

        // Each test cleans its own cache key — but also flush at setUp
        // to defend against test-order leakage if Cache::put for an
        // earlier-test combination overlaps.
        Cache::flush();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    public function test_tier_a_per_day_data_with_all_nights_available_yields_summed_price(): void
    {
        // Canonical happy path: per-day for the unit covers every
        // requested night with available=true + price>0. The unit
        // surfaces with total_price = sum-of-nights.
        $room = BookingRoomFactory::new()->create([
            'pms_id'     => '1001',
            'name'       => 'Forest Cabin',
            'max_guests' => 4,
            'base_price' => 50,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andReturn([
                '1001' => [
                    '2026-07-01' => ['available' => true, 'price' => 100, 'min_stay' => 1],
                    '2026-07-02' => ['available' => true, 'price' => 110, 'min_stay' => 1],
                    '2026-07-03' => ['available' => true, 'price' => 120, 'min_stay' => 1],
                ],
            ]);
        $this->smoobu->shouldReceive('getRates')->once()->andReturn(['data' => []]);

        $result = $this->service->check('2026-07-01', '2026-07-04', 2, 0);

        $this->assertCount(1, $result['available']);
        $this->assertSame('1001', $result['available'][0]['id']);
        $this->assertSame(330.00, $result['available'][0]['total_price'],
            'Tier A total_price must equal the sum of per-night prices.');
        $this->assertSame(110.00, $result['available'][0]['price_per_night'],
            'price_per_night must be total / night count.');
    }

    public function test_tier_a_min_stay_uses_max_across_nights(): void
    {
        // Per-day min_stay varies across nights — the unit's resulting
        // min_stay must be the MAX so the booking can satisfy every
        // night's requirement. A 2-night booking against a unit
        // where night 2 requires min_stay=3 would oversell otherwise.
        BookingRoomFactory::new()->create([
            'pms_id' => '1002', 'name' => 'Beach Suite',
            'max_guests' => 4, 'base_price' => 50,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andReturn([
                '1002' => [
                    '2026-07-01' => ['available' => true, 'price' => 100, 'min_stay' => 1],
                    '2026-07-02' => ['available' => true, 'price' => 100, 'min_stay' => 3],
                    '2026-07-03' => ['available' => true, 'price' => 100, 'min_stay' => 1],
                ],
            ]);
        $this->smoobu->shouldReceive('getRates')->once()->andReturn(['data' => []]);

        // 3-night booking, min_stay=3 → satisfied → unit surfaces.
        $result = $this->service->check('2026-07-01', '2026-07-04', 2, 0);

        $this->assertCount(1, $result['available']);
        $this->assertSame(3, $result['available'][0]['min_stay'],
            'min_stay must propagate as the MAX across nights.');
    }

    public function test_tier_a_one_unavailable_night_drops_the_unit(): void
    {
        // Strictness on the per-night gate: ONE unavailable night
        // disqualifies the whole stay. Pre-fix this had been
        // "majority available" or "any available" in earlier
        // iterations — both caused oversells.
        BookingRoomFactory::new()->create([
            'pms_id' => '1003', 'max_guests' => 4, 'base_price' => 50,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andReturn([
                '1003' => [
                    '2026-07-01' => ['available' => true, 'price' => 100],
                    '2026-07-02' => ['available' => false, 'price' => 100], // ← single bad night
                    '2026-07-03' => ['available' => true, 'price' => 100],
                ],
            ]);
        $this->smoobu->shouldReceive('getRates')->once()->andReturn(['data' => []]);

        $result = $this->service->check('2026-07-01', '2026-07-04', 2, 0);

        $this->assertCount(0, $result['available'],
            'One unavailable night must drop the entire unit from the result.');
    }

    public function test_tier_a_zero_price_night_drops_the_unit(): void
    {
        // Zero-price guard: a per-day cell with price=0 is "no rate
        // published" in Smoobu's data model, not "free". Treating
        // it as available would let guests book uncharged rooms.
        BookingRoomFactory::new()->create([
            'pms_id' => '1004', 'max_guests' => 4, 'base_price' => 50,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andReturn([
                '1004' => [
                    '2026-07-01' => ['available' => true, 'price' => 100],
                    '2026-07-02' => ['available' => true, 'price' => 0],   // ← bad
                    '2026-07-03' => ['available' => true, 'price' => 100],
                ],
            ]);
        $this->smoobu->shouldReceive('getRates')->once()->andReturn(['data' => []]);

        $result = $this->service->check('2026-07-01', '2026-07-04', 2, 0);

        $this->assertCount(0, $result['available']);
    }

    public function test_tier_b_aggregate_fallback_when_per_day_missing(): void
    {
        // When per-day data is missing for a unit (the daily endpoint
        // returns nothing for it), the aggregate /rates endpoint is
        // the next-best source. If it reports available + priced,
        // accept at the aggregate price.
        BookingRoomFactory::new()->create([
            'pms_id' => '1005', 'max_guests' => 4, 'base_price' => 50,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')->once()->andReturn([]);
        $this->smoobu->shouldReceive('getRates')->once()->andReturn([
            'data' => [
                '1005' => [
                    'available' => true,
                    'price'     => 285.50,
                    'min_stay'  => 2,
                ],
            ],
        ]);

        $result = $this->service->check('2026-07-01', '2026-07-04', 2, 0);

        $this->assertCount(1, $result['available']);
        $this->assertSame(285.50, $result['available'][0]['total_price'],
            'Tier B must use the aggregate price as the total.');
        $this->assertSame(2, $result['available'][0]['min_stay']);
    }

    public function test_tier_c_base_price_fallback_when_both_smoobu_sources_empty(): void
    {
        // The Forrest Glamp fix: rooms outside Smoobu's published rate
        // window must still surface, using the local base_price *
        // night count. Pre-fix the unit was silently dropped — guest
        // saw "no rooms" but confirm() would have accepted the same
        // booking. The two sides must agree.
        BookingRoomFactory::new()->create([
            'pms_id'     => '1006',
            'max_guests' => 4,
            'base_price' => 75.00,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')->once()->andReturn([]);
        $this->smoobu->shouldReceive('getRates')->once()->andReturn(['data' => []]);

        $result = $this->service->check('2026-07-01', '2026-07-04', 2, 0);

        $this->assertCount(1, $result['available']);
        // 3 nights × 75 = 225
        $this->assertSame(225.00, $result['available'][0]['total_price'],
            'Tier C must fall back to base_price × nights.');
    }

    public function test_tier_c_skipped_when_base_price_is_zero(): void
    {
        // Without a base_price, tier C has nothing to fall back to.
        // Unit drops out of the result rather than surfacing a free
        // booking. Mirror of the tier-A zero-price guard.
        BookingRoomFactory::new()->create([
            'pms_id' => '1007', 'max_guests' => 4, 'base_price' => 0,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')->once()->andReturn([]);
        $this->smoobu->shouldReceive('getRates')->once()->andReturn(['data' => []]);

        $result = $this->service->check('2026-07-01', '2026-07-04', 2, 0);

        $this->assertCount(0, $result['available'],
            'Tier C must NOT surface a room with base_price=0.');
    }

    public function test_guest_count_filter_drops_unit_over_max_guests(): void
    {
        // Orthogonal filter: even with perfect availability, a room
        // that can't sleep the party drops out. Without this, the
        // booking widget would let staff over-book a 2-person room
        // for 4 guests.
        BookingRoomFactory::new()->create([
            'pms_id' => '1008', 'max_guests' => 2, 'base_price' => 100,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andReturn([
                '1008' => [
                    '2026-07-01' => ['available' => true, 'price' => 100],
                    '2026-07-02' => ['available' => true, 'price' => 100],
                    '2026-07-03' => ['available' => true, 'price' => 100],
                ],
            ]);
        $this->smoobu->shouldReceive('getRates')->once()->andReturn(['data' => []]);

        // 3 adults + 0 children = 3 > max_guests=2 → must drop
        $result = $this->service->check('2026-07-01', '2026-07-04', 3, 0);

        $this->assertCount(0, $result['available']);
    }

    public function test_inventory_gate_drops_unit_when_fully_booked(): void
    {
        // The inventory check: this room has 2 of the same type
        // available, but 2 overlapping non-cancelled bookings already
        // exist. The unit is sold out for the dates.
        $room = BookingRoomFactory::new()->create([
            'pms_id'         => '1009',
            'max_guests'     => 4,
            'base_price'     => 100,
            'inventory_count' => 2,
        ]);

        // Seed 2 overlapping bookings — same apartment_id, overlapping
        // window, non-cancelled. inventory_count is now exhausted.
        BookingMirrorFactory::new()->count(2)->create([
            'apartment_id'   => 1009,
            'arrival_date'   => '2026-07-01',
            'departure_date' => '2026-07-04',
            'booking_state'  => 'confirmed',
            'internal_status' => 'synced',
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andReturn([
                '1009' => [
                    '2026-07-01' => ['available' => true, 'price' => 100],
                    '2026-07-02' => ['available' => true, 'price' => 100],
                    '2026-07-03' => ['available' => true, 'price' => 100],
                ],
            ]);
        $this->smoobu->shouldReceive('getRates')->once()->andReturn(['data' => []]);

        $result = $this->service->check('2026-07-01', '2026-07-04', 2, 0);

        $this->assertCount(0, $result['available'],
            'Fully-booked room must drop out via the inventory gate.');
    }

    public function test_results_sorted_cheapest_first(): void
    {
        // The widget's "best deal" surface relies on the cheapest
        // option being first. Locking sort order avoids unstable
        // results that swap on every reload.
        BookingRoomFactory::new()->create([
            'pms_id' => '2001', 'max_guests' => 4, 'base_price' => 50,
            'name' => 'Expensive',
        ]);
        BookingRoomFactory::new()->create([
            'pms_id' => '2002', 'max_guests' => 4, 'base_price' => 50,
            'name' => 'Cheap',
        ]);

        $this->smoobu->shouldReceive('getDailyRates')->once()->andReturn([
            '2001' => [
                '2026-07-01' => ['available' => true, 'price' => 300],
                '2026-07-02' => ['available' => true, 'price' => 300],
                '2026-07-03' => ['available' => true, 'price' => 300],
            ],
            '2002' => [
                '2026-07-01' => ['available' => true, 'price' => 100],
                '2026-07-02' => ['available' => true, 'price' => 100],
                '2026-07-03' => ['available' => true, 'price' => 100],
            ],
        ]);
        $this->smoobu->shouldReceive('getRates')->once()->andReturn(['data' => []]);

        $result = $this->service->check('2026-07-01', '2026-07-04', 2, 0);

        $this->assertCount(2, $result['available']);
        $this->assertSame('2002', $result['available'][0]['id'],
            'Cheapest unit (Cheap) must be first in the result.');
        $this->assertSame('2001', $result['available'][1]['id']);
    }

    public function test_per_day_smoobu_failure_falls_through_to_tier_b_and_c(): void
    {
        // Per-day endpoint throws (transient Smoobu issue). The
        // service must still try the aggregate endpoint AND the
        // base_price fallback — silent total failure would tank the
        // widget on a Smoobu blip.
        BookingRoomFactory::new()->create([
            'pms_id' => '3001', 'max_guests' => 4, 'base_price' => 80,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andThrow(new \RuntimeException('cURL error 28: Operation timed out'));
        $this->smoobu->shouldReceive('getRates')->once()->andReturn(['data' => []]);

        $result = $this->service->check('2026-07-01', '2026-07-04', 2, 0);

        $this->assertCount(1, $result['available'],
            'Tier C base_price fallback must engage when tier A throws + tier B is empty.');
        $this->assertSame(240.00, $result['available'][0]['total_price'],
            '3 nights × €80 base_price = €240.');
    }

    public function test_both_smoobu_endpoints_failing_still_returns_tier_c_results(): void
    {
        // Total Smoobu outage. Tier C is the only acceptance route
        // left. Without this surviving the dual-throw path, the
        // widget would show "no rooms" during any Smoobu downtime —
        // costing direct bookings on every infrastructure blip.
        BookingRoomFactory::new()->create([
            'pms_id' => '3002', 'max_guests' => 4, 'base_price' => 60,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andThrow(new \RuntimeException('Connection refused'));
        $this->smoobu->shouldReceive('getRates')
            ->once()
            ->andThrow(new \RuntimeException('Connection refused'));

        $result = $this->service->check('2026-07-01', '2026-07-04', 2, 0);

        $this->assertCount(1, $result['available'],
            'Total Smoobu outage must still surface tier-C rooms (base_price fallback).');
        $this->assertSame(180.00, $result['available'][0]['total_price']);
    }

    public function test_cache_returns_identical_result_on_second_call_without_smoobu_round_trip(): void
    {
        // 60-second cache. The second call within that window must
        // NOT hit Smoobu — mock expects exactly ONE call. This is
        // what stops the widget from hammering Smoobu's 60 req/min
        // budget on every page navigation.
        BookingRoomFactory::new()->create([
            'pms_id' => '4001', 'max_guests' => 4, 'base_price' => 75,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')->once()->andReturn([
            '4001' => [
                '2026-07-01' => ['available' => true, 'price' => 100],
                '2026-07-02' => ['available' => true, 'price' => 100],
                '2026-07-03' => ['available' => true, 'price' => 100],
            ],
        ]);
        $this->smoobu->shouldReceive('getRates')->once()->andReturn(['data' => []]);

        $first  = $this->service->check('2026-07-01', '2026-07-04', 2, 0);
        $second = $this->service->check('2026-07-01', '2026-07-04', 2, 0);

        $this->assertSame($first, $second,
            'Second call within cache TTL must return the cached result verbatim.');
        // Mockery's ->once() expectation on getDailyRates + getRates
        // is the real assertion here — if a second round-trip
        // happened, the mock would throw at tearDown.
    }
}
