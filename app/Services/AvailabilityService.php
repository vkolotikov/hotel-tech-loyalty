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
                'unit_id'         => $id,
                'unit_name'       => $unit['name'] ?? '',
                'slug'            => $unit['slug'] ?? '',
                'max_guests'      => $unit['max_guests'] ?? 0,
                'bedrooms'        => $unit['bedrooms'] ?? 0,
                'thumbnail'       => $unit['thumbnail'] ?? '',
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
