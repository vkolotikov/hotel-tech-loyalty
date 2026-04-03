<?php

namespace App\Services;

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

        $units   = $this->getUnitsConfig();
        $rates   = $this->smoobu->getRates($checkIn, $checkOut);
        $data    = $rates['data'] ?? $rates;
        $results = [];

        foreach ($units as $id => $unit) {
            $rate = $data[$id] ?? null;
            if (!$rate || !($rate['available'] ?? false)) continue;
            if ($adults + $children > ($unit['max_guests'] ?? 99)) continue;

            $results[] = [
                'id'              => (string) $id,
                'name'            => $unit['name'] ?? '',
                'slug'            => $unit['slug'] ?? '',
                'max_guests'      => $unit['max_guests'] ?? 0,
                'bedrooms'        => $unit['bedrooms'] ?? 0,
                'image'           => $unit['thumbnail'] ?? $unit['image'] ?? '',
                'description'     => $unit['description'] ?? '',
                'available'       => true,
                'price_per_night' => $rate['price_per_night'] ?? 0,
                'total_price'     => $rate['price'] ?? 0,
                'currency'        => $rate['currency'] ?? 'EUR',
                'min_stay'        => $rate['min_stay'] ?? 2,
            ];
        }

        Cache::put($cacheKey, $results, 60);
        return $results;
    }

    /** Get rates for a single unit. */
    public function unitRates(string $unitId, string $checkIn, string $checkOut, int $adults = 2): array
    {
        $rates = $this->smoobu->getRates($checkIn, $checkOut, [$unitId]);
        $data  = $rates['data'] ?? $rates;

        return $data[$unitId] ?? [];
    }

    /** Get cheapest price per night for each date in a range. Returns ['2026-04-15' => 89, ...] */
    public function calendarPrices(string $start, string $end): array
    {
        $units = $this->getUnitsConfig();
        if (empty($units)) return [];

        $prices = [];
        $current = new \DateTime($start);
        $endDate = new \DateTime($end);

        // For mock mode, generate deterministic-ish prices
        if ($this->smoobu->isMock()) {
            while ($current <= $endDate) {
                $dateStr = $current->format('Y-m-d');
                $dayOfWeek = (int) $current->format('N'); // 1=Mon, 7=Sun

                // Find cheapest unit base price
                $cheapest = PHP_INT_MAX;
                foreach ($units as $unit) {
                    $base = $unit['price_per_night'] ?? 100;
                    // Weekend markup (Fri/Sat)
                    $price = ($dayOfWeek >= 5 && $dayOfWeek <= 6) ? (int)($base * 1.2) : $base;
                    // Slight daily variation using date hash
                    $seed = crc32($dateStr . ($unit['id'] ?? ''));
                    $variation = ($seed % 21) - 10; // -10 to +10
                    $price = max(1, $price + $variation);
                    $cheapest = min($cheapest, $price);
                }

                $prices[$dateStr] = $cheapest === PHP_INT_MAX ? 0 : $cheapest;
                $current->modify('+1 day');
            }
            return $prices;
        }

        // Real PMS mode: query rates for each 1-night window
        // (batch if the PMS supports date-range rate queries)
        try {
            $rates = $this->smoobu->getRates($start, $end);
            $data = $rates['data'] ?? $rates;

            while ($current <= $endDate) {
                $dateStr = $current->format('Y-m-d');
                $cheapest = PHP_INT_MAX;

                foreach ($data as $unitId => $rate) {
                    $nightlyRate = $rate['price_per_night'] ?? 0;
                    if ($nightlyRate > 0) {
                        $cheapest = min($cheapest, $nightlyRate);
                    }
                }

                $prices[$dateStr] = $cheapest === PHP_INT_MAX ? 0 : $cheapest;
                $current->modify('+1 day');
            }
        } catch (\Throwable $e) {
            // If rate fetch fails, return empty — calendar will just not show prices
            \Illuminate\Support\Facades\Log::warning('Calendar prices fetch failed', ['error' => $e->getMessage()]);
        }

        return $prices;
    }

    private function getUnitsConfig(): array
    {
        $json = \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', app()->bound('current_organization_id') ? app('current_organization_id') : null)
            ->where('key', 'booking_units')
            ->value('value');

        if ($json) {
            $decoded = json_decode($json, true);
            if (is_array($decoded) && !empty($decoded)) return $decoded;
        }

        return config('booking.units', []);
    }
}
