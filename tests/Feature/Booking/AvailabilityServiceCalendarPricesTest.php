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
 * Locks AvailabilityService::calendarPrices — the per-date
 * widget calendar render that powers the booking widget's date
 * picker. Sister to AvailabilityServiceTest (3-tier acceptance)
 * and AvailabilityServiceFindCombinationsTest.
 *
 * Critical because (per CLAUDE.md 2026-05-13):
 *   - Pre-fix, every PMS rate-calendar gap turned the date into
 *     "available" even when we'd already sold every unit through
 *     Smoobu's own channel manager → sold-out days surfaced as
 *     bookable, oversold inventory
 *   - The May fix added the inventory guard on the optimistic-
 *     fallback path
 *
 * Contract:
 *
 *   Smoobu data available for room/day → trust it verbatim
 *     - available=true + price>0 → date marked available at price
 *     - available=false → date NOT marked available (do NOT
 *       fall back to base_price for explicitly-unavailable
 *       Smoobu data)
 *     - price=0 → not surfaced
 *
 *   No Smoobu entry for room/day (PMS rate-calendar gap):
 *     - Optimistic fallback to base_price IF inventory remains
 *     - No base_price → not surfaced
 *     - Inventory exhausted (booked >= inventory_count) → NOT
 *       surfaced (the May fix — critical for oversell prevention)
 *
 *   Cheapest wins:
 *     - Multiple rooms eligible on same date → result.prices
 *       carries the cheapest
 *
 *   Smoobu failure:
 *     - getDailyRates throws → catch, treat as empty daily map,
 *       fall through to base-price path (graceful degradation —
 *       widget keeps working on Smoobu outage)
 */
class AvailabilityServiceCalendarPricesTest extends TestCase
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

        Cache::flush();

        $this->smoobu  = Mockery::mock(SmoobuClient::class);
        $this->service = new AvailabilityService($this->smoobu);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    public function test_empty_rooms_returns_empty_prices_and_availability(): void
    {
        // No rooms configured → both arrays empty. The widget
        // renders "no calendar data" — better than crashing.
        // No Smoobu call needed.
        $this->smoobu->shouldNotReceive('getDailyRates');

        $result = $this->service->calendarPrices('2026-07-01', '2026-07-03');

        $this->assertSame(['prices' => [], 'availability' => []], $result);
    }

    public function test_smoobu_explicit_data_available_with_price_is_used_verbatim(): void
    {
        // Smoobu says "available=true + price=120" → trust it.
        BookingRoomFactory::new()->create([
            'pms_id'     => '5001',
            'base_price' => 200, // base price would be wrong — Smoobu wins
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andReturn([
                '5001' => [
                    '2026-07-01' => ['available' => true,  'price' => 120],
                    '2026-07-02' => ['available' => true,  'price' => 130],
                ],
            ]);

        $result = $this->service->calendarPrices('2026-07-01', '2026-07-02');

        $this->assertSame(120.0, $result['prices']['2026-07-01']);
        $this->assertSame(130.0, $result['prices']['2026-07-02']);
        $this->assertTrue($result['availability']['2026-07-01']);
        $this->assertTrue($result['availability']['2026-07-02']);
    }

    public function test_smoobu_available_false_yields_unavailable_no_base_price_fallback(): void
    {
        // CRITICAL guard per the docblock: explicit
        // unavailability from Smoobu must NOT fall back to
        // base_price. The fallback is for PMS calendar GAPS
        // (missing entry), not explicit NOs.
        BookingRoomFactory::new()->create([
            'pms_id'     => '5002',
            'base_price' => 100,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andReturn([
                '5002' => [
                    '2026-07-01' => ['available' => false, 'price' => 100],
                ],
            ]);

        $result = $this->service->calendarPrices('2026-07-01', '2026-07-01');

        $this->assertFalse($result['availability']['2026-07-01'],
            'Smoobu explicit unavailability must NOT fall back to base_price.');
    }

    public function test_smoobu_zero_price_yields_unavailable(): void
    {
        // Smoobu's "no rate published" sentinel — price=0 must
        // be treated as "no rate" not "free". Date stays
        // unavailable.
        BookingRoomFactory::new()->create([
            'pms_id'     => '5003',
            'base_price' => 100,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andReturn([
                '5003' => [
                    '2026-07-01' => ['available' => true, 'price' => 0],
                ],
            ]);

        $result = $this->service->calendarPrices('2026-07-01', '2026-07-01');

        $this->assertFalse($result['availability']['2026-07-01']);
    }

    public function test_no_smoobu_entry_falls_back_to_base_price_when_inventory_remains(): void
    {
        // PMS rate-calendar gap (no Smoobu entry for this room
        // on this date). Inventory remains → optimistic fallback
        // to base_price. Without this, manual rooms / PMS-less
        // setups would never surface.
        BookingRoomFactory::new()->create([
            'pms_id'          => '5004',
            'base_price'      => 95,
            'inventory_count' => 1,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andReturn([]); // empty — no Smoobu data for any room

        $result = $this->service->calendarPrices('2026-07-01', '2026-07-01');

        $this->assertSame(95.0, $result['prices']['2026-07-01'],
            'Empty Smoobu data + base_price + inventory → fallback to base.');
        $this->assertTrue($result['availability']['2026-07-01']);
    }

    public function test_no_smoobu_entry_no_base_price_yields_unavailable(): void
    {
        // No Smoobu data AND no base_price → can't fall back.
        // Date stays unavailable rather than surfacing a price=0
        // "free" booking.
        BookingRoomFactory::new()->create([
            'pms_id'     => '5005',
            'base_price' => 0,  // no fallback price
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andReturn([]);

        $result = $this->service->calendarPrices('2026-07-01', '2026-07-01');

        $this->assertFalse($result['availability']['2026-07-01']);
        // Empty-cheapest sentinel: the implementation surfaces
        // a plain `0` (int) when no room qualified — not 0.0. Either
        // is fine for the widget (renders "—"); lock the value
        // rather than the type.
        $this->assertEquals(0, $result['prices']['2026-07-01']);
    }

    public function test_inventory_exhausted_via_local_mirrors_prevents_fallback_surface(): void
    {
        // THE May 2026 CRITICAL FIX: when no Smoobu entry exists
        // AND local mirrors show every unit booked for this
        // date, the fallback MUST NOT engage. Pre-fix, this
        // resulted in oversold inventory because every PMS gap
        // surfaced as "available" regardless of local sold-out
        // state.
        $orgId = (int) app('current_organization_id');
        BookingRoomFactory::new()->create([
            'pms_id'          => '5006',
            'base_price'      => 100,
            'inventory_count' => 1, // single inventory unit
        ]);

        // Seed: ONE confirmed booking covering 2026-07-01 →
        // 2026-07-02, blocking the only inventory unit on
        // 2026-07-01.
        //
        // Raw insert via DB::table so we bypass model traits +
        // factory state defaults — keeps this test focused on the
        // calendarPrices contract, not on factory hydration. Tests
        // the actual query the service runs.
        \DB::table('booking_mirror')->insert([
            'organization_id'  => $orgId,
            'reservation_id'   => 'SM-INV-EX-1',
            'booking_reference' => 'BK-INV-EX-1',
            'booking_state'    => 'confirmed',
            'apartment_id'     => 5006,
            'arrival_date'     => '2026-07-01',
            'departure_date'   => '2026-07-02',
            'price_total'      => 100,
            'payment_method'   => 'stripe',
            'payment_status'   => 'paid',
            'internal_status'  => 'synced',
            'created_at'       => now(),
            'updated_at'       => now(),
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andReturn([]); // gap — fallback path engages

        $result = $this->service->calendarPrices('2026-07-01', '2026-07-01');

        $this->assertFalse($result['availability']['2026-07-01'],
            'CRITICAL: PMS gap + local sold-out must NOT surface as available.');
    }

    public function test_cheapest_of_multiple_eligible_rooms_wins(): void
    {
        // Calendar shows the LOWEST price per date so the widget
        // surfaces the most affordable option. Locks the min()
        // semantic.
        BookingRoomFactory::new()->create(['pms_id' => '5007', 'base_price' => 200]);
        BookingRoomFactory::new()->create(['pms_id' => '5008', 'base_price' => 150]);
        BookingRoomFactory::new()->create(['pms_id' => '5009', 'base_price' => 300]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andReturn([
                '5007' => ['2026-07-01' => ['available' => true, 'price' => 220]],
                '5008' => ['2026-07-01' => ['available' => true, 'price' => 170]],
                '5009' => ['2026-07-01' => ['available' => true, 'price' => 310]],
            ]);

        $result = $this->service->calendarPrices('2026-07-01', '2026-07-01');

        $this->assertSame(170.0, $result['prices']['2026-07-01'],
            'Cheapest room price per date must surface.');
    }

    public function test_smoobu_failure_is_caught_and_falls_through_to_base_price_path(): void
    {
        // Graceful degradation per the docblock: Smoobu outage
        // mustn't blank the widget calendar. catch + treat as
        // empty daily map → every date hits the fallback path.
        BookingRoomFactory::new()->create([
            'pms_id'     => '5010',
            'base_price' => 80,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andThrow(new \RuntimeException('Smoobu API connection error'));

        $result = $this->service->calendarPrices('2026-07-01', '2026-07-01');

        // The Smoobu failure was swallowed — widget gets the
        // base_price fallback so the calendar stays usable.
        $this->assertSame(80.0, $result['prices']['2026-07-01']);
        $this->assertTrue($result['availability']['2026-07-01']);
    }

    public function test_date_range_walks_inclusive_of_both_endpoints(): void
    {
        // The window must include BOTH start AND end dates so a
        // single-day query yields one entry, a 3-day query yields
        // 3 entries, etc.
        BookingRoomFactory::new()->create([
            'pms_id'     => '5011',
            'base_price' => 100,
        ]);

        $this->smoobu->shouldReceive('getDailyRates')
            ->once()
            ->andReturn([]);

        $result = $this->service->calendarPrices('2026-07-01', '2026-07-03');

        $this->assertCount(3, $result['prices'],
            '3-day window must yield 3 date entries (inclusive of both endpoints).');
        $this->assertArrayHasKey('2026-07-01', $result['prices']);
        $this->assertArrayHasKey('2026-07-02', $result['prices']);
        $this->assertArrayHasKey('2026-07-03', $result['prices']);
    }

    public function test_returns_prices_AND_availability_keys_in_payload(): void
    {
        // The result shape: documented in CLAUDE.md as
        // ['prices' => ..., 'availability' => ...]. Lock both
        // keys present.
        BookingRoomFactory::new()->create(['pms_id' => '5012', 'base_price' => 100]);
        $this->smoobu->shouldReceive('getDailyRates')->once()->andReturn([]);

        $result = $this->service->calendarPrices('2026-07-01', '2026-07-01');

        $this->assertArrayHasKey('prices', $result);
        $this->assertArrayHasKey('availability', $result);
    }
}
