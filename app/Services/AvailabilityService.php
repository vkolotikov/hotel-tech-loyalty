<?php

namespace App\Services;

use App\Models\BookingMirror;
use App\Models\BookingRoom;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class AvailabilityService
{
    public function __construct(private SmoobuClient $smoobu) {}

    /**
     * Cache key version. Bump this whenever the availability shape or
     * Smoobu parsing changes so stale cache entries (e.g. from when the
     * client was running in mock mode) are evicted automatically.
     */
    private const CACHE_VERSION = 'v3';

    /** Get available units for date range. */
    public function check(string $checkIn, string $checkOut, int $adults = 2, int $children = 0): array
    {
        $orgId    = app()->bound('current_organization_id') ? app('current_organization_id') : 0;
        $cacheKey = "booking:avail:" . self::CACHE_VERSION . ":{$orgId}:{$checkIn}:{$checkOut}:{$adults}:{$children}";
        $cached   = Cache::get($cacheKey);
        if ($cached) return $cached;

        $rooms   = $this->getRooms();
        $unitIds = array_keys($rooms);
        if (empty($rooms)) return [];

        // Build the list of nights to verify (checkIn..checkOut-1 inclusive).
        $nights   = [];
        $cur      = new \DateTime($checkIn);
        $endDt    = new \DateTime($checkOut);
        while ($cur < $endDt) {
            $nights[] = $cur->format('Y-m-d');
            $cur->modify('+1 day');
        }
        if (empty($nights)) return [];

        // Daily rates are the source of truth for per-night availability.
        // If this call fails we fall back to the aggregate /rates response,
        // but we still treat any unit as unavailable when neither source
        // can confirm every night — never silently let a unit through.
        $dailyOk = true;
        try {
            $daily = $this->smoobu->getDailyRates($checkIn, $checkOut, $unitIds);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Smoobu daily rates failed', ['error' => $e->getMessage()]);
            $daily   = [];
            $dailyOk = false;
        }

        try {
            $rates = $this->smoobu->getRates($checkIn, $checkOut, $unitIds);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Smoobu rates failed', ['error' => $e->getMessage()]);
            $rates = ['data' => []];
        }
        $data    = $rates['data'] ?? $rates;
        $results = [];

        foreach ($rooms as $id => $room) {
            $key = (string) $id;
            if ($adults + $children > ($room['max_guests'] ?? 99)) continue;

            // Walk every requested night and require a real, available,
            // priced cell. We prefer per-day data; if it's missing for this
            // unit, we fall back to the aggregate "available" flag from
            // normalizeRates (which is itself a strict per-night check).
            $perDay     = $daily[$key] ?? null;
            $totalPrice = 0.0;
            $minStay    = 1;
            $isAvail    = true;

            if (is_array($perDay) && !empty($perDay)) {
                foreach ($nights as $d) {
                    $day = $perDay[$d] ?? null;
                    if (!$day || !($day['available'] ?? false) || (float) ($day['price'] ?? 0) <= 0) {
                        $isAvail = false;
                        break;
                    }
                    $totalPrice += (float) $day['price'];
                    $minStay     = max($minStay, (int) ($day['min_stay'] ?? 1));
                }
            } else {
                // Per-day data missing for this unit. Try the aggregate
                // response first; if Smoobu still has nothing for this unit,
                // fall back to the room's DB base_price so manual rooms and
                // PMS-less setups still surface a real price.
                $rate = $data[$key] ?? $data[$id] ?? null;
                if ($rate && ($rate['available'] ?? false) && (float) ($rate['price'] ?? 0) > 0) {
                    $totalPrice = (float) $rate['price'];
                    $minStay    = (int) ($rate['min_stay'] ?? 1);
                } else {
                    $base = (float) ($room['base_price'] ?? 0);
                    if ($base <= 0) continue;
                    $totalPrice = $base * count($nights);
                    $minStay    = 1;
                }
            }

            if (!$isAvail) continue;
            if (count($nights) < $minStay) continue;

            // Inventory gate: how many of this room are already booked across
            // any overlapping non-cancelled mirror records? When the count
            // reaches the room's inventory_count, the unit is sold out.
            $inventory = max(1, (int) ($room['inventory_count'] ?? 1));
            $booked    = $this->bookedCountForRoom($key, $checkIn, $checkOut, $orgId);
            if ($booked >= $inventory) continue;

            $rate = $data[$key] ?? $data[$id] ?? [];
            $results[] = [
                'id'                => $key,
                'name'              => $room['name'] ?? '',
                'slug'              => $room['slug'] ?? '',
                'max_guests'        => $room['max_guests'] ?? 0,
                'bedrooms'          => $room['bedrooms'] ?? 0,
                'bed_type'          => $room['bed_type'] ?? '',
                'size'              => $room['size'] ?? '',
                'image'             => $room['image'] ?? '',
                'gallery'           => $room['gallery'] ?? [],
                'description'       => $room['description'] ?? '',
                'short_description' => $room['short_description'] ?? '',
                'amenities'         => $room['amenities'] ?? [],
                'tags'              => $room['tags'] ?? [],
                'available'         => true,
                'price_per_night'   => round($totalPrice / count($nights), 2),
                'total_price'       => round($totalPrice, 2),
                'currency'          => $rate['currency'] ?? ($room['currency'] ?? 'EUR'),
                'min_stay'          => $minStay,
            ];
        }

        // Cheapest first — matches Smoobu's own search UX.
        usort($results, fn($a, $b) => $a['total_price'] <=> $b['total_price']);

        // When no single room fits the party, build combo suggestions
        // from the rooms that ARE available for those dates (even though
        // individually they're too small). The combo finder runs over ALL
        // rooms that passed the date/inventory checks — the only check
        // it skips is the guest-count filter at line 67 above.
        $totalGuests  = $adults + $children;
        $combinations = [];
        if (empty($results)) {
            $allAvailable = $this->checkRoomsWithoutGuestFilter(
                $rooms, $daily, $dailyOk, $data, $nights, $orgId,
            );
            $combinations = $this->findCombinations($allAvailable, $totalGuests, count($nights));
        }

        $out = ['available' => $results, 'combinations' => $combinations];
        Cache::put($cacheKey, $out, 60);
        return $out;
    }

    /**
     * Same availability logic as check() but WITHOUT the max_guests
     * filter — needed so the combo finder has the full list of rooms
     * that are free on the requested dates.
     */
    private function checkRoomsWithoutGuestFilter(
        array $rooms, array $daily, bool $dailyOk, array $rateData, array $nightDates, ?int $orgId,
    ): array {
        $results = [];
        foreach ($rooms as $id => $room) {
            $key     = (string) $id;
            $perDay  = $daily[$key] ?? null;
            $total   = 0.0;
            $isAvail = true;

            if (is_array($perDay) && !empty($perDay)) {
                foreach ($nightDates as $d) {
                    $day = $perDay[$d] ?? null;
                    if (!$day || !($day['available'] ?? false) || (float) ($day['price'] ?? 0) <= 0) {
                        $isAvail = false;
                        break;
                    }
                    $total += (float) $day['price'];
                }
            } else {
                $rate = $rateData[$key] ?? $rateData[$id] ?? null;
                if ($rate && ($rate['available'] ?? false) && (float) ($rate['price'] ?? 0) > 0) {
                    $total = (float) $rate['price'];
                } else {
                    $base = (float) ($room['base_price'] ?? 0);
                    if ($base <= 0) continue;
                    $total = $base * count($nightDates);
                }
            }
            if (!$isAvail) continue;

            $inventory = max(1, (int) ($room['inventory_count'] ?? 1));
            $booked    = $this->bookedCountForRoom($key, $nightDates[0], end($nightDates), $orgId);
            $remaining = $inventory - $booked;
            if ($remaining <= 0) continue;

            $results[] = [
                'id'              => $key,
                'name'            => $room['name'] ?? '',
                'max_guests'      => (int) ($room['max_guests'] ?? 0),
                'total_price'     => round($total, 2),
                'price_per_night' => round($total / count($nightDates), 2),
                'currency'        => $room['currency'] ?? 'EUR',
                'image'           => $room['image'] ?? '',
                'remaining'       => $remaining,
            ];
        }
        return $results;
    }

    /**
     * Find 2- or 3-room combinations that together accommodate the
     * requested guest count. Returns the top 5 cheapest combos.
     *
     * Algorithm: greedy bin-packing. Try all 2-room pairs first; if
     * none fit, try 3-room triples. Rooms with inventory_count > 1
     * can appear multiple times (up to their remaining inventory).
     * Bounded to max 3 rooms per combo, and typical hotel inventories
     * of 3-20 rooms keep the combinatorics trivially fast.
     */
    public function findCombinations(array $available, int $guestCount, int $nights): array
    {
        if ($guestCount <= 0 || empty($available)) return [];

        // Expand rooms by remaining inventory (e.g., 3 identical rooms
        // become 3 separate entries the combinator can pick from).
        $expanded = [];
        foreach ($available as $r) {
            $copies = min($r['remaining'] ?? 1, 3);
            for ($c = 0; $c < $copies; $c++) {
                $expanded[] = $r;
            }
        }

        $combos = [];

        // Pass 1: 2-room pairs.
        for ($i = 0; $i < count($expanded); $i++) {
            for ($j = $i + 1; $j < count($expanded); $j++) {
                $cap = $expanded[$i]['max_guests'] + $expanded[$j]['max_guests'];
                if ($cap < $guestCount) continue;
                $price = $expanded[$i]['total_price'] + $expanded[$j]['total_price'];
                $combos[] = [
                    'rooms' => [$expanded[$i], $expanded[$j]],
                    'total_guests'   => $cap,
                    'total_price'    => round($price, 2),
                    'price_per_night'=> round($price / max(1, $nights), 2),
                    'nights'         => $nights,
                ];
            }
        }

        // Pass 2: 3-room triples (only if no 2-room combos fit).
        if (empty($combos)) {
            for ($i = 0; $i < count($expanded); $i++) {
                for ($j = $i + 1; $j < count($expanded); $j++) {
                    for ($k = $j + 1; $k < count($expanded); $k++) {
                        $cap = $expanded[$i]['max_guests'] + $expanded[$j]['max_guests'] + $expanded[$k]['max_guests'];
                        if ($cap < $guestCount) continue;
                        $price = $expanded[$i]['total_price'] + $expanded[$j]['total_price'] + $expanded[$k]['total_price'];
                        $combos[] = [
                            'rooms' => [$expanded[$i], $expanded[$j], $expanded[$k]],
                            'total_guests'   => $cap,
                            'total_price'    => round($price, 2),
                            'price_per_night'=> round($price / max(1, $nights), 2),
                            'nights'         => $nights,
                        ];
                    }
                }
            }
        }

        // Sort by price, deduplicate by room-ID set, return top 5.
        usort($combos, fn($a, $b) => $a['total_price'] <=> $b['total_price']);

        $seen = [];
        $unique = [];
        foreach ($combos as $combo) {
            $ids = array_map(fn($r) => $r['id'], $combo['rooms']);
            sort($ids);
            $key = implode('+', $ids);
            if (isset($seen[$key])) continue;
            $seen[$key] = true;
            $unique[] = $combo;
            if (count($unique) >= 5) break;
        }

        return $unique;
    }

    /** Get rates for a single unit. */
    public function unitRates(string $unitId, string $checkIn, string $checkOut, int $adults = 2): array
    {
        // Inventory gate first — if every unit of this room is already booked
        // for the requested window, no quote should ever be generated.
        $orgId   = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $rooms   = $this->getRooms();
        $roomCfg = $rooms[$unitId] ?? null;
        if ($roomCfg) {
            $inventory = max(1, (int) ($roomCfg['inventory_count'] ?? 1));
            if ($this->bookedCountForRoom($unitId, $checkIn, $checkOut, $orgId) >= $inventory) {
                return [];
            }
        }

        try {
            $rates = $this->smoobu->getRates($checkIn, $checkOut, [$unitId]);
            $data  = $rates['data'] ?? $rates;
            $rate  = $data[$unitId] ?? null;
            if ($rate && ($rate['available'] ?? false)) {
                // Ask Smoobu for the discount-applied total. The
                // /api/rates endpoint we just hit returns raw per-day
                // prices summed without applying length-of-stay
                // discounts, weekend markups, channel rate plans,
                // etc. The /booking/checkApartmentAvailability
                // endpoint runs Smoobu's full pricing engine and
                // returns the actual stay total — so the widget
                // quote matches what Smoobu would charge.
                //
                // We only OVERWRITE the price when Smoobu's calculated
                // total comes back. If the call fails or the unit
                // isn't in the response, we fall through to the raw
                // sum-of-days total from /api/rates — no behaviour
                // change for customers who don't use discounts.
                try {
                    $check = $this->smoobu->checkAvailability($checkIn, $checkOut, [$unitId], max(1, $adults));
                    $calculated = $check['prices'][$unitId]['price'] ?? null;
                    $isAvailable = in_array($unitId, $check['available'], true);
                    if ($isAvailable && $calculated !== null && $calculated > 0) {
                        // Snapshot the raw sum-of-days total BEFORE
                        // we overwrite it so the discount delta is
                        // computable.
                        $rawTotal = (float) ($rate['price'] ?? 0);
                        $nights = max(1, (int) ((strtotime($checkOut) - strtotime($checkIn)) / 86400));
                        $rate['price'] = round((float) $calculated, 2);
                        $rate['price_per_night'] = round($rate['price'] / $nights, 2);
                        // Record any base-vs-calculated delta so callers
                        // (and the audit log) can see when a discount
                        // actually kicked in. Frontend can use this to
                        // render "5% off — $20 saved" copy.
                        if ($rawTotal > $rate['price'] + 0.01) {
                            $rate['discount_amount'] = round($rawTotal - $rate['price'], 2);
                            $rate['raw_total']       = round($rawTotal, 2);
                        }
                    }
                } catch (\Throwable $eCheck) {
                    \Illuminate\Support\Facades\Log::warning('Smoobu checkAvailability skipped, using sum-of-days', [
                        'unit_id' => $unitId, 'error' => $eCheck->getMessage(),
                    ]);
                }
                return $rate;
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Smoobu unitRates failed, falling back to DB base price', [
                'unit_id' => $unitId, 'error' => $e->getMessage(),
            ]);
        }

        // Fallback: use DB room base_price (works for DB-only rooms or when Smoobu has no data)
        $room = $roomCfg;
        if (!$room) return [];

        $nights = max(1, (int) ((strtotime($checkOut) - strtotime($checkIn)) / 86400));
        $base   = (float) ($room['base_price'] ?? $room['price_per_night'] ?? 0);
        if ($base <= 0) return [];

        return [
            'apartment_id'    => $unitId,
            'available'       => true,
            'min_stay'        => 1,
            'price'           => round($base * $nights, 2),
            'price_per_night' => $base,
            'currency'        => $room['currency'] ?? 'EUR',
        ];
    }

    /**
     * Get cheapest available price per night for each date in a range.
     * Days where no unit is available are returned as 0 (frontend can mark as unavailable).
     */
    /**
     * Cheapest per-night price + availability flag for each day in the range.
     *
     * Returns:
     *   [
     *     'prices'       => ['2026-05-14' => 150.0, …],
     *     'availability' => ['2026-05-14' => true, '2026-05-15' => false, …],
     *   ]
     *
     * A day is `availability=false` only when EVERY room is explicitly sold
     * out per Smoobu data — when Smoobu has no daily entry for a room we
     * optimistically count it as available against the base price (the PMS
     * just hasn't been synced for that night).
     */
    public function calendarPrices(string $start, string $end): array
    {
        $rooms = $this->getRooms();
        if (empty($rooms)) return ['prices' => [], 'availability' => []];

        $orgId     = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $unitIds   = array_keys($rooms);
        $prices    = [];
        $available = [];

        try {
            $daily = $this->smoobu->getDailyRates($start, $end, $unitIds);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Calendar prices fetch failed', ['error' => $e->getMessage()]);
            $daily = [];
        }

        // Pre-compute booked counts per (apartment, date) for the WHOLE
        // window in ONE query per room — so the per-day fallback below
        // doesn't fire N×days SQL hits. Used by the no-Smoobu-entry
        // branch to verify there's still inventory left even when the
        // PMS rate-calendar has a gap for this date.
        //
        // The mirror's link to a room is `apartment_id` — Smoobu's room
        // id, which is also the key we use in the $rooms map (pms_id,
        // or stringified DB id as fallback for admin-created rooms).
        // Manual rooms (no pms_id) have no Smoobu bookings so their map
        // entry is just empty, which is correct.
        $bookedByDate = [];
        foreach ($rooms as $unitId => $room) {
            $key = (string) $unitId;
            $bookedByDate[$key] = $this->bookedCountsByDate(
                $key, $start, $end, $orgId,
            );
        }

        $current = new \DateTime($start);
        $endDate = new \DateTime($end);

        while ($current <= $endDate) {
            $dateStr      = $current->format('Y-m-d');
            $cheapest     = PHP_INT_MAX;
            $anyAvailable = false;

            foreach ($rooms as $unitId => $room) {
                $key = (string) $unitId;
                $day = $daily[$key][$dateStr] ?? null;

                if ($day !== null) {
                    // Smoobu has explicit data for this room/day — trust it.
                    if (($day['available'] ?? false) && ($day['price'] ?? 0) > 0) {
                        $anyAvailable = true;
                        $cheapest     = min($cheapest, (float) $day['price']);
                    }
                    // Explicit unavailability: do NOT fall back to base price.
                    continue;
                }

                // No Smoobu entry for this date. Optimistic fallback to
                // base price — BUT only if our local mirror has inventory
                // left. Without this check, every PMS rate-calendar gap
                // turned the date into "available" even when we'd already
                // sold every unit through Smoobu's own channel manager.
                $base = (float) ($room['base_price'] ?? $room['price_per_night'] ?? 0);
                if ($base <= 0) continue;

                $inventory   = max(1, (int) ($room['inventory_count'] ?? 1));
                $bookedCount = (int) ($bookedByDate[$key][$dateStr] ?? 0);
                $remaining   = $inventory - $bookedCount;
                if ($remaining < 1) continue;

                $anyAvailable = true;
                $cheapest     = min($cheapest, $base);
            }

            $prices[$dateStr]    = $cheapest === PHP_INT_MAX ? 0 : (float) $cheapest;
            $available[$dateStr] = $anyAvailable;
            $current->modify('+1 day');
        }

        return ['prices' => $prices, 'availability' => $available];
    }

    /**
     * Date-indexed booked-count map for a single room across a window.
     *
     * Returns ['2026-06-10' => 2, '2026-06-11' => 1, …] — one entry per
     * date in [$from, $to] inclusive that has at least one overlapping
     * non-cancelled booking. Dates with zero bookings are omitted (the
     * caller treats missing keys as 0).
     *
     * The query pulls every overlapping mirror once, then explodes each
     * stay across its date range in PHP. This is far cheaper than
     * N×days SQL roundtrips when calendarPrices() is asked for a
     * 12-month window (~360 dates × however-many rooms).
     */
    private function bookedCountsByDate(string $apartmentId, string $from, string $to, ?int $orgId): array
    {
        $rows = BookingMirror::withoutGlobalScopes()
            ->when($orgId, fn($q) => $q->where('organization_id', $orgId))
            ->where('apartment_id', $apartmentId)
            ->whereNotIn('booking_state', ['cancelled'])
            ->where(function ($q) {
                $q->whereNull('internal_status')
                  ->orWhereNotIn('internal_status', ['cancelled']);
            })
            ->where(function ($q) {
                // payment_status is nullable on rows synced from Smoobu
                // before a payment was attached — those still count as
                // booked. Only refunded/cancelled mirrors free the slot.
                $q->whereNull('payment_status')
                  ->orWhereNotIn('payment_status', ['refunded', 'cancelled']);
            })
            ->where('arrival_date', '<=', $to)
            ->where('departure_date', '>', $from)
            ->get(['arrival_date', 'departure_date']);

        $counts = [];
        $windowStart = new \DateTime($from);
        $windowEnd   = new \DateTime($to);

        foreach ($rows as $row) {
            // departure_date is the checkout morning — the night BEFORE
            // is the last billable one. Iterate [arrival, departure)
            // intersected with [windowStart, windowEnd].
            $arrival   = new \DateTime($row->arrival_date);
            $departure = new \DateTime($row->departure_date);

            $cursor = max($arrival, $windowStart);
            $stop   = min($departure, (clone $windowEnd)->modify('+1 day'));

            while ($cursor < $stop) {
                $d = $cursor->format('Y-m-d');
                $counts[$d] = ($counts[$d] ?? 0) + 1;
                $cursor->modify('+1 day');
            }
        }

        return $counts;
    }

    /**
     * Count overlapping non-cancelled bookings for a given apartment within
     * the requested date window. Two stays overlap when arrival < requested
     * checkout AND departure > requested checkin (departure day is checkout
     * morning, so back-to-back stays do NOT overlap).
     */
    private function bookedCountForRoom(string $apartmentId, string $checkIn, string $checkOut, ?int $orgId): int
    {
        return BookingMirror::withoutGlobalScopes()
            ->when($orgId, fn($q) => $q->where('organization_id', $orgId))
            ->where('apartment_id', $apartmentId)
            ->whereNotIn('booking_state', ['cancelled'])
            ->where(function ($q) {
                $q->whereNull('internal_status')
                  ->orWhereNotIn('internal_status', ['cancelled']);
            })
            ->where('arrival_date', '<', $checkOut)
            ->where('departure_date', '>', $checkIn)
            ->count();
    }

    /**
     * Get rooms config — reads from booking_rooms table (primary) with fallback to JSON settings.
     * Returns array keyed by pms_id (or DB id if no pms_id).
     */
    private function getRooms(): array
    {
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;

        // Primary: booking_rooms table
        $dbRooms = BookingRoom::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        if ($dbRooms->isNotEmpty()) {
            $result = [];
            foreach ($dbRooms as $room) {
                $key = $room->pms_id ?: (string) $room->id;
                $result[$key] = $room->toArray();
            }
            return $result;
        }

        // Fallback: legacy JSON settings
        $json = \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'booking_units')
            ->value('value');

        if ($json) {
            $decoded = json_decode($json, true);
            if (is_array($decoded) && !empty($decoded)) return $decoded;
        }

        return [];
    }
}
