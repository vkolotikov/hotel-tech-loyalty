<?php

namespace App\Services;

use App\Models\BookingRoom;
use Illuminate\Support\Facades\Cache;

class AvailabilityService
{
    public function __construct(private SmoobuClient $smoobu) {}

    /** Get available units for date range. */
    public function check(string $checkIn, string $checkOut, int $adults = 2, int $children = 0): array
    {
        $orgId    = app()->bound('current_organization_id') ? app('current_organization_id') : 0;
        $cacheKey = "booking:avail:{$orgId}:{$checkIn}:{$checkOut}:{$adults}:{$children}";
        $cached   = Cache::get($cacheKey);
        if ($cached) return $cached;

        $rooms   = $this->getRooms();
        $unitIds = array_keys($rooms);
        $rates   = $this->smoobu->getRates($checkIn, $checkOut, $unitIds);
        $data    = $rates['data'] ?? $rates;
        $results = [];

        foreach ($rooms as $id => $room) {
            $rate = $data[$id] ?? null;
            if (!$rate || !($rate['available'] ?? false)) continue;
            if ($adults + $children > ($room['max_guests'] ?? 99)) continue;

            $results[] = [
                'id'              => (string) $id,
                'name'            => $room['name'] ?? '',
                'slug'            => $room['slug'] ?? '',
                'max_guests'      => $room['max_guests'] ?? 0,
                'bedrooms'        => $room['bedrooms'] ?? 0,
                'bed_type'        => $room['bed_type'] ?? '',
                'size'            => $room['size'] ?? '',
                'image'           => $room['image'] ?? '',
                'gallery'         => $room['gallery'] ?? [],
                'description'     => $room['description'] ?? '',
                'short_description' => $room['short_description'] ?? '',
                'amenities'       => $room['amenities'] ?? [],
                'tags'            => $room['tags'] ?? [],
                'available'       => true,
                'price_per_night' => $rate['price_per_night'] ?? $room['base_price'] ?? 0,
                'total_price'     => $rate['price'] ?? 0,
                'currency'        => $rate['currency'] ?? 'EUR',
                'min_stay'        => $rate['min_stay'] ?? 1,
            ];
        }

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

    /** Get cheapest price per night for each date in a range. */
    public function calendarPrices(string $start, string $end): array
    {
        $rooms = $this->getRooms();
        if (empty($rooms)) return [];

        $prices  = [];
        $current = new \DateTime($start);
        $endDate = new \DateTime($end);

        if ($this->smoobu->isMock()) {
            while ($current <= $endDate) {
                $dateStr   = $current->format('Y-m-d');
                $dayOfWeek = (int) $current->format('N');
                $cheapest  = PHP_INT_MAX;

                foreach ($rooms as $room) {
                    $base  = $room['base_price'] ?? $room['price_per_night'] ?? 100;
                    $price = ($dayOfWeek >= 5 && $dayOfWeek <= 6) ? (int)($base * 1.2) : (int) $base;
                    $seed  = crc32($dateStr . ($room['id'] ?? ''));
                    $price = max(1, $price + ($seed % 21) - 10);
                    $cheapest = min($cheapest, $price);
                }

                $prices[$dateStr] = $cheapest === PHP_INT_MAX ? 0 : $cheapest;
                $current->modify('+1 day');
            }
            return $prices;
        }

        try {
            $rates = $this->smoobu->getRates($start, $end);
            $data  = $rates['data'] ?? $rates;

            while ($current <= $endDate) {
                $dateStr  = $current->format('Y-m-d');
                $cheapest = PHP_INT_MAX;

                foreach ($data as $unitId => $rate) {
                    $nightlyRate = $rate['price_per_night'] ?? 0;
                    if ($nightlyRate > 0) $cheapest = min($cheapest, $nightlyRate);
                }

                $prices[$dateStr] = $cheapest === PHP_INT_MAX ? 0 : $cheapest;
                $current->modify('+1 day');
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Calendar prices fetch failed', ['error' => $e->getMessage()]);
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
