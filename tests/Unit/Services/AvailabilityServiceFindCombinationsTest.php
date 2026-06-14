<?php

namespace Tests\Unit\Services;

use App\Services\AvailabilityService;
use App\Services\SmoobuClient;
use Mockery;
use PHPUnit\Framework\TestCase;

/**
 * Locks AvailabilityService::findCombinations — the multi-room
 * combo finder that surfaces "Room A (4p) + Room B (2p)" packages
 * when no single room fits a 6-person party.
 *
 * Sister to AvailabilityServiceTest (3-tier acceptance). That
 * test pins single-room availability; this one pins the combo
 * fallback that fires when single-room results are empty.
 *
 * The algorithm per the existing code:
 *
 *   1. Expand rooms by remaining inventory (up to 3 copies per
 *      room type — bounded so 100-inventory rooms don't blow up
 *      combinatorics)
 *
 *   2. Pass 1: 2-room pairs whose combined max_guests >= party
 *
 *   3. Pass 2: 3-room triples ONLY if no 2-room combos fit (skip
 *      otherwise — keeps result set focused on minimum room count)
 *
 *   4. Sort by total_price ascending — cheapest first
 *
 *   5. Dedupe by SET of room ids (combo of [A,B] and [B,A] match)
 *
 *   6. Return top 5 cheapest
 *
 * Pure unit test — no DB, no Smoobu HTTP. The SmoobuClient
 * constructor dep is satisfied by a Mockery mock with zero
 * expectations.
 */
class AvailabilityServiceFindCombinationsTest extends TestCase
{
    private AvailabilityService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $smoobu = Mockery::mock(SmoobuClient::class);
        $this->service = new AvailabilityService($smoobu);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function room(int $id, string $name, int $maxGuests, float $totalPrice, int $remaining = 1): array
    {
        return [
            'id'          => $id,
            'name'        => $name,
            'max_guests'  => $maxGuests,
            'total_price' => $totalPrice,
            'remaining'   => $remaining,
        ];
    }

    public function test_empty_available_list_returns_empty(): void
    {
        $result = $this->service->findCombinations([], 4, 3);
        $this->assertSame([], $result);
    }

    public function test_zero_guests_returns_empty(): void
    {
        $rooms = [$this->room(1, 'Suite', 2, 200)];
        $result = $this->service->findCombinations($rooms, 0, 3);
        $this->assertSame([], $result);
    }

    public function test_negative_guests_returns_empty(): void
    {
        // Defensive: negative party count from upstream bug
        // mustn't crash combinatorics.
        $rooms = [$this->room(1, 'Suite', 2, 200)];
        $result = $this->service->findCombinations($rooms, -1, 3);
        $this->assertSame([], $result);
    }

    public function test_finds_two_room_pair_when_combined_capacity_satisfies_party(): void
    {
        // Canonical use case: 6-person party, two 4-person rooms.
        // Combo capacity = 8, party = 6 → eligible.
        $rooms = [
            $this->room(1, 'Forest Cabin', 4, 200),
            $this->room(2, 'Beach Suite',  4, 300),
        ];

        $combos = $this->service->findCombinations($rooms, 6, 3);

        $this->assertCount(1, $combos);
        $this->assertSame(8, $combos[0]['total_guests']);
        $this->assertSame(500.00, (float) $combos[0]['total_price']);
        // price_per_night = total / nights
        $this->assertSame(round(500 / 3, 2), $combos[0]['price_per_night']);
        $this->assertSame(3, $combos[0]['nights']);
        $this->assertCount(2, $combos[0]['rooms']);
    }

    public function test_pair_below_party_capacity_is_skipped(): void
    {
        // Two 2-person rooms can't host a 6-person party. The
        // 2-room pass yields nothing → triples pass engages.
        $rooms = [
            $this->room(1, 'Small A', 2, 100),
            $this->room(2, 'Small B', 2, 100),
        ];

        $combos = $this->service->findCombinations($rooms, 6, 1);

        // Only 2 rooms total, so triples pass also can't combine 3
        // — result is empty.
        $this->assertSame([], $combos);
    }

    public function test_triples_pass_only_engages_when_no_pair_fits(): void
    {
        // Mixed scenario: rooms can fit as both pair AND triple.
        // Pass 2 (triples) is SKIPPED because Pass 1 found pairs —
        // keeps the result list focused on minimum room count.
        $rooms = [
            $this->room(1, 'A', 4, 200),
            $this->room(2, 'B', 4, 300),
            $this->room(3, 'C', 4, 400),
        ];

        $combos = $this->service->findCombinations($rooms, 6, 1);

        // Only pairs should appear (3 pairs from 3 rooms).
        // Each combo has exactly 2 rooms — no 3-room triples.
        foreach ($combos as $c) {
            $this->assertCount(2, $c['rooms'],
                'When 2-room pairs satisfy, triples pass MUST be skipped.');
        }
    }

    public function test_triples_pass_engages_when_pairs_are_insufficient(): void
    {
        // 3 small rooms (2 max each) for a 6-person party. Pairs
        // top out at 4 capacity → all pairs skipped → triples
        // pass fires.
        $rooms = [
            $this->room(1, 'Small A', 2, 100),
            $this->room(2, 'Small B', 2, 100),
            $this->room(3, 'Small C', 2, 100),
        ];

        $combos = $this->service->findCombinations($rooms, 6, 1);

        $this->assertCount(1, $combos);
        $this->assertCount(3, $combos[0]['rooms'],
            'Triples pass must yield 3-room combos.');
        $this->assertSame(6, $combos[0]['total_guests']);
        $this->assertSame(300.00, (float) $combos[0]['total_price']);
    }

    public function test_results_sorted_cheapest_first(): void
    {
        // Three pairs available at different prices. Result must
        // be sorted ascending by total_price.
        $rooms = [
            $this->room(1, 'Cheap',     2, 100),
            $this->room(2, 'Mid',       2, 200),
            $this->room(3, 'Expensive', 2, 400),
        ];

        $combos = $this->service->findCombinations($rooms, 4, 1);

        $this->assertGreaterThanOrEqual(2, count($combos));
        // First combo must be the cheapest pair (Cheap + Mid = 300).
        $this->assertSame(300.00, (float) $combos[0]['total_price']);
    }

    public function test_inventory_expansion_lets_same_room_pair_with_itself(): void
    {
        // A single "Family Suite" with inventory_remaining=2 means
        // two of them can be booked. The expansion duplicates the
        // entry so the pair pass picks Family+Family.
        $rooms = [
            $this->room(1, 'Family Suite', 4, 300, remaining: 2),
        ];

        $combos = $this->service->findCombinations($rooms, 6, 1);

        $this->assertCount(1, $combos);
        $this->assertSame(8, $combos[0]['total_guests']);
        $this->assertSame(600.00, (float) $combos[0]['total_price']);
    }

    public function test_inventory_capped_at_3_copies_per_room_type(): void
    {
        // Even an inventory of 100 only contributes 3 copies to
        // the combinator — defensive cap so combinatorics don't
        // explode (3 copies × pair = 3 entries to consider).
        $rooms = [
            $this->room(1, 'Hostel Room', 2, 50, remaining: 100),
        ];

        $combos = $this->service->findCombinations($rooms, 6, 1);

        // 3 copies cap → only 3-room triple is possible (3 × 2 = 6
        // capacity). With > 3 copies allowed, more combos would
        // surface. Result is the SINGLE triple of 3 × hostel.
        $this->assertCount(1, $combos);
        $this->assertCount(3, $combos[0]['rooms']);
    }

    public function test_dedup_by_room_id_set_ignores_pair_order(): void
    {
        // Inventory of 2 yields two copies of the same room. The
        // pair pass iterates i < j so it can't produce [B,A]
        // already — but the dedupe step is what prevents
        // expansion-based duplicates. Lock the behavior so a
        // refactor of the dedup hash doesn't accidentally allow
        // [A,B] AND [A,B] (same exact pair listed twice).
        $rooms = [
            $this->room(1, 'Twin Cabin A', 4, 200, remaining: 1),
            $this->room(2, 'Twin Cabin B', 4, 300, remaining: 1),
        ];

        $combos = $this->service->findCombinations($rooms, 6, 1);

        // Exactly 1 combo for the unique pair {1, 2}.
        $this->assertCount(1, $combos);
        $ids = array_column($combos[0]['rooms'], 'id');
        sort($ids);
        $this->assertSame([1, 2], $ids);
    }

    public function test_returns_at_most_5_combos(): void
    {
        // Back-pressure: if many pairs fit, the result caps at 5.
        // 5 rooms = C(5,2) = 10 pairs all eligible. Result is
        // exactly 5 (the cheapest 5).
        $rooms = [];
        for ($i = 1; $i <= 5; $i++) {
            $rooms[] = $this->room($i, "Room {$i}", 4, 100 + $i * 10);
        }

        $combos = $this->service->findCombinations($rooms, 6, 1);

        $this->assertCount(5, $combos,
            'findCombinations must cap result at 5 combos.');
    }

    public function test_price_per_night_uses_max1_division_for_zero_night_safety(): void
    {
        // Defensive: nights=0 from upstream bug would 0-divide.
        // The code uses `max(1, $nights)` to avoid PHP's
        // DivisionByZeroError → price_per_night == total_price
        // when nights would otherwise be 0.
        $rooms = [
            $this->room(1, 'A', 4, 200),
            $this->room(2, 'B', 4, 300),
        ];

        $combos = $this->service->findCombinations($rooms, 6, 0);

        $this->assertCount(1, $combos);
        $this->assertSame(500.00, $combos[0]['price_per_night'],
            'Zero nights must NOT divide-by-zero; price_per_night == total.');
    }

    public function test_room_data_in_combo_carries_original_room_fields(): void
    {
        // The rooms[] returned in each combo are the verbatim
        // room arrays — frontend renders them as per-room price
        // breakdown.
        $rooms = [
            $this->room(1, 'Forest Cabin', 4, 200),
            $this->room(2, 'Beach Suite',  4, 300),
        ];

        $combos = $this->service->findCombinations($rooms, 6, 1);

        $this->assertSame('Forest Cabin', $combos[0]['rooms'][0]['name']);
        $this->assertSame('Beach Suite',  $combos[0]['rooms'][1]['name']);
        // Original fields preserved (id, max_guests, total_price)
        $this->assertSame(1, $combos[0]['rooms'][0]['id']);
        $this->assertSame(200.0, (float) $combos[0]['rooms'][0]['total_price']);
    }
}
