<?php

namespace App\Services;

use App\Models\BookingRoom;
use Illuminate\Support\Facades\Cache;

class AvailabilityService
{
    public function __construct(private SmoobuClient $smoobu) {}

    /**
     * Cache key version. Bump this whenever the availability shape or
     * Smoobu parsing changes so stale cache entries (e.g. from when the
     * client was running in mock mode) are evicted automatically.
     */
    private const CACHE_VERSION = 'v2';

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
                // Per-day data missing for this unit — only trust the
                // aggregate response, and only if the daily call itself
                // succeeded (otherwise we have zero confirmation).
                if (!$dailyOk) continue;

                $rate = $data[$key] ?? $data[$id] ?? null;
                if (!$rate || !($rate['available'] ?? false)) continue;
                $totalPrice = (float) ($rate['price'] ?? 0);
                $minStay    = (int) ($rate['min_stay'] ?? 1);
                if ($totalPrice <= 0) continue;
            }

            if (!$isAvail) continue;
            if (count($nights) < $minStay) continue;

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
        $rooms = $this->getRooms();
        $room  = $rooms[$unitId] ?? null;
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
    public function calendarPrices(string $start, string $end): array
    {
        $rooms = $this->getRooms();
        if (empty($rooms)) return [];

        $unitIds = array_keys($rooms);
        $prices  = [];

        try {
            $daily = $this->smoobu->getDailyRates($start, $end, $unitIds);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Calendar prices fetch failed', ['error' => $e->getMessage()]);
            $daily = [];
        }

        $current = new \DateTime($start);
        $endDate = new \DateTime($end);

        while ($current <= $endDate) {
            $dateStr  = $current->format('Y-m-d');
            $cheapest = PHP_INT_MAX;

            foreach ($unitIds as $unitId) {
                $day = $daily[(string) $unitId][$dateStr] ?? null;
                if ($day && ($day['available'] ?? false) && ($day['price'] ?? 0) > 0) {
                    $cheapest = min($cheapest, (float) $day['price']);
                }
            }

            // Fallback to DB base_price if no PMS data for this day at all
            if ($cheapest === PHP_INT_MAX) {
                $cheapestDb = PHP_INT_MAX;
                foreach ($rooms as $room) {
                    $base = (float) ($room['base_price'] ?? $room['price_per_night'] ?? 0);
                    if ($base > 0) $cheapestDb = min($cheapestDb, $base);
                }
                $prices[$dateStr] = $cheapestDb === PHP_INT_MAX ? 0 : (float) $cheapestDb;
            } else {
                $prices[$dateStr] = (float) $cheapest;
            }

            $current->modify('+1 day');
        }

        return $prices;
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
