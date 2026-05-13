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

        Cache::put($cacheKey, $results, 60);
        return $results;
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

        $unitIds   = array_keys($rooms);
        $prices    = [];
        $available = [];

        try {
            $daily = $this->smoobu->getDailyRates($start, $end, $unitIds);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Calendar prices fetch failed', ['error' => $e->getMessage()]);
            $daily = [];
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

                // No Smoobu entry — optimistic fallback to base price. The
                // booking page's final availability check will reject the
                // dates if the PMS later disagrees.
                $base = (float) ($room['base_price'] ?? $room['price_per_night'] ?? 0);
                if ($base > 0) {
                    $anyAvailable = true;
                    $cheapest     = min($cheapest, $base);
                }
            }

            $prices[$dateStr]    = $cheapest === PHP_INT_MAX ? 0 : (float) $cheapest;
            $available[$dateStr] = $anyAvailable;
            $current->modify('+1 day');
        }

        return ['prices' => $prices, 'availability' => $available];
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
