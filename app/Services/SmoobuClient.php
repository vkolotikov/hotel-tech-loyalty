<?php

namespace App\Services;

use App\Models\HotelSetting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * HTTP client for Smoobu PMS API.
 * Reads credentials from hotel_settings (per-org) with env fallback.
 */
class SmoobuClient
{
    private string $baseUrl;
    private string $apiKey;
    private string $channelId;
    private int $timeout;
    private bool $isMock;

    public function __construct()
    {
        $this->baseUrl   = rtrim($this->setting('booking_smoobu_base_url', config('services.smoobu.base_url', 'https://login.smoobu.com/api/')), '/');
        $this->apiKey    = $this->setting('booking_smoobu_api_key', config('services.smoobu.api_key', ''));
        $provider        = $this->setting('booking_smoobu_provider', config('services.smoobu.provider', 'mock'));
        // Auto-detect: if API key is present, treat as live regardless of provider setting
        $this->isMock    = empty($this->apiKey) && $provider === 'mock';
        $this->channelId = $this->setting('booking_smoobu_channel_id', config('services.smoobu.channel_id', ''));
        $this->timeout   = (int) config('services.smoobu.timeout', 30);
    }

    public function isMock(): bool { return $this->isMock; }
    public function channelId(): string { return $this->channelId; }

    public function getRates(string $checkIn, string $checkOut, array $unitIds = []): array
    {
        if ($this->isMock) {
            return $this->mockRates($checkIn, $checkOut, $unitIds);
        }

        $raw = $this->fetchRawRates($checkIn, $checkOut, $unitIds);

        // Normalize Smoobu response: convert per-apartment daily rates into our format
        return $this->normalizeRates($raw, $checkIn, $checkOut);
    }

    /**
     * Get per-day rates without averaging.
     * Returns: [ '<unitId>' => [ '<YYYY-MM-DD>' => ['price'=>..., 'available'=>0|1, 'min_length_of_stay'=>...], ... ] ]
     * Used for calendar pricing where we need cheapest-per-day, not average.
     */
    public function getDailyRates(string $start, string $end, array $unitIds = []): array
    {
        if ($this->isMock) {
            return $this->mockDailyRates($start, $end, $unitIds);
        }

        $raw = $this->fetchRawRates($start, $end, $unitIds);
        $data = $raw['data'] ?? $raw;
        $result = [];
        foreach ($data as $aptId => $dailyRates) {
            if (!is_array($dailyRates)) continue;
            $byDate = [];
            foreach ($dailyRates as $date => $dayData) {
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) continue;
                if (is_array($dayData)) {
                    $byDate[$date] = [
                        'price'     => (float) ($dayData['price'] ?? 0),
                        'available' => ($dayData['available'] ?? 0) == 1,
                        'min_stay'  => (int) ($dayData['min_length_of_stay'] ?? $dayData['min_stay'] ?? 1),
                    ];
                } else {
                    $byDate[$date] = ['price' => (float) $dayData, 'available' => true, 'min_stay' => 1];
                }
            }
            $result[(string) $aptId] = $byDate;
        }
        return $result;
    }

    private function fetchRawRates(string $checkIn, string $checkOut, array $unitIds = []): array
    {
        $params = [
            'start_date' => $checkIn,
            'end_date'   => $checkOut,
        ];
        if (!empty($unitIds)) {
            $params['apartments'] = $unitIds;
        }
        return $this->get('/rates', $params);
    }

    public function createReservation(array $data): array
    {
        if ($this->isMock) {
            return $this->mockCreateReservation($data);
        }

        return $this->post('/reservations', $data);
    }

    public function getReservation(string $reservationId): array
    {
        if ($this->isMock) {
            return $this->mockReservation($reservationId);
        }

        return $this->get("/reservations/{$reservationId}");
    }

    public function listReservations(array $params = []): array
    {
        if ($this->isMock) {
            return $this->mockListReservations($params);
        }

        return $this->get('/reservations', $params);
    }

    public function getPriceElements(string $reservationId): array
    {
        if ($this->isMock) {
            return [];
        }

        return $this->get("/reservations/{$reservationId}/price-elements");
    }

    /**
     * GET /apartments — fetch all apartments/units from Smoobu.
     * Returns array of apartments with id, name, rooms details.
     */
    public function getApartments(): array
    {
        if ($this->isMock) {
            return $this->mockApartments();
        }

        $raw = $this->get('/apartments');

        // Smoobu may return apartments as object keyed by ID or as an array
        // Normalize to { "apartments": [ { "id": ..., "name": ... }, ... ] }
        $apartments = $raw['apartments'] ?? $raw;
        if (!is_array($apartments)) return ['apartments' => []];

        // If keyed by ID (object), convert to sequential array
        $normalized = [];
        foreach ($apartments as $key => $apt) {
            if (is_array($apt)) {
                if (!isset($apt['id'])) $apt['id'] = $key;
                $normalized[] = $apt;
            }
        }

        return ['apartments' => $normalized];
    }

    /**
     * GET /apartments/{id} — fetch single apartment details.
     */
    public function getApartment(string $id): array
    {
        if ($this->isMock) {
            return ['id' => $id, 'name' => 'Mock Unit'];
        }

        return $this->get("/apartments/{$id}");
    }

    // ─── Rate Normalization ─────────────────────────────────────────────

    /**
     * Normalize Smoobu /rates response into our standard format.
     * Smoobu returns: { "data": { "<aptId>": { "<date>": { "price": 100, "min_length_of_stay": 2, "available": 1 }, ... } } }
     * We normalize to: { "data": { "<aptId>": { "available": true, "price_per_night": avg, "price": total, "min_stay": N } } }
     */
    private function normalizeRates(array $raw, string $checkIn, string $checkOut): array
    {
        // If already in our format (mock), pass through
        if (isset($raw['data']) && !empty($raw['data'])) {
            $firstVal = reset($raw['data']);
            if (isset($firstVal['price_per_night'])) {
                return $raw; // Already normalized
            }
        }

        $data = $raw['data'] ?? $raw;
        $nights = max(1, (int)((strtotime($checkOut) - strtotime($checkIn)) / 86400));
        $result = [];

        foreach ($data as $aptId => $dailyRates) {
            if (!is_array($dailyRates)) continue;

            // Check if this is daily rates format (keyed by date)
            $totalPrice = 0;
            $available = true;
            $minStay = 1;
            $dayCount = 0;

            foreach ($dailyRates as $date => $dayData) {
                // Skip non-date keys
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                    // Might be pre-normalized format
                    if ($date === 'available' || $date === 'price_per_night') {
                        $result[$aptId] = $dailyRates;
                        continue 2;
                    }
                    continue;
                }

                if (is_array($dayData)) {
                    $dayPrice = $dayData['price'] ?? 0;
                    $dayAvailable = ($dayData['available'] ?? 0) == 1;
                    $dayMinStay = $dayData['min_length_of_stay'] ?? $dayData['min_stay'] ?? 1;
                } else {
                    $dayPrice = (float) $dayData;
                    $dayAvailable = true;
                    $dayMinStay = 1;
                }

                $totalPrice += $dayPrice;
                if (!$dayAvailable) $available = false;
                $minStay = max($minStay, (int) $dayMinStay);
                $dayCount++;
            }

            $avgPrice = $dayCount > 0 ? round($totalPrice / $dayCount, 2) : 0;

            $result[$aptId] = [
                'apartment_id'    => $aptId,
                'available'       => $available && $avgPrice > 0,
                'min_stay'        => $minStay,
                'price'           => round($totalPrice, 2),
                'price_per_night' => $avgPrice,
                'currency'        => 'EUR',
            ];
        }

        return ['data' => $result];
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    private function setting(string $key, string $default = ''): string
    {
        try {
            return HotelSetting::withoutGlobalScopes()
                ->where('organization_id', app()->bound('current_organization_id') ? app('current_organization_id') : null)
                ->where('key', $key)
                ->value('value') ?? $default;
        } catch (\Throwable) {
            return $default;
        }
    }

    private function get(string $path, array $params = []): array
    {
        $response = Http::withHeaders(['Api-Key' => $this->apiKey])
            ->timeout($this->timeout)
            ->get("{$this->baseUrl}{$path}", $params);

        if (!$response->successful()) {
            Log::error("Smoobu GET {$path} failed", ['status' => $response->status(), 'body' => $response->body()]);
            throw new \RuntimeException("Smoobu API error: {$response->status()}");
        }

        return $response->json() ?? [];
    }

    private function post(string $path, array $data): array
    {
        $response = Http::withHeaders(['Api-Key' => $this->apiKey])
            ->timeout($this->timeout)
            ->post("{$this->baseUrl}{$path}", $data);

        if (!$response->successful()) {
            Log::error("Smoobu POST {$path} failed", ['status' => $response->status(), 'body' => $response->body()]);
            throw new \RuntimeException("Smoobu API error: {$response->status()}");
        }

        return $response->json() ?? [];
    }

    // ─── Mock Responses ────────────────────────────────────────────────────

    /**
     * Get rooms config — reads from booking_rooms table (primary) with legacy JSON fallback.
     * Returns array keyed by pms_id (or DB id).
     */
    private function getUnitsConfig(): array
    {
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;

        // Primary: booking_rooms table
        $dbRooms = \App\Models\BookingRoom::withoutGlobalScopes()
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
        $json = $this->setting('booking_units', '');
        if ($json) {
            $decoded = json_decode($json, true);
            if (is_array($decoded) && !empty($decoded)) return $decoded;
        }
        return [];
    }

    private function mockDailyRates(string $start, string $end, array $unitIds): array
    {
        $units  = $this->getUnitsConfig();
        $result = [];
        foreach ($units as $id => $unit) {
            if (!empty($unitIds) && !in_array((string)$id, array_map('strval', $unitIds)) && !in_array($id, $unitIds)) continue;
            $base = (float) ($unit['base_price'] ?? $unit['price_per_night'] ?? 100);
            $byDate = [];
            $cur = new \DateTime($start);
            $endDt = new \DateTime($end);
            while ($cur <= $endDt) {
                $dateStr = $cur->format('Y-m-d');
                $dow = (int) $cur->format('N');
                $price = ($dow >= 5 && $dow <= 6) ? round($base * 1.2, 2) : $base;
                $seed = crc32($dateStr . $id);
                $price = max(1.0, $price + ($seed % 21) - 10);
                $byDate[$dateStr] = ['price' => $price, 'available' => true, 'min_stay' => 1];
                $cur->modify('+1 day');
            }
            $result[(string) $id] = $byDate;
        }
        return $result;
    }

    private function mockRates(string $checkIn, string $checkOut, array $unitIds): array
    {
        $units  = $this->getUnitsConfig();
        $result = [];

        foreach ($units as $id => $unit) {
            if (!empty($unitIds) && !in_array((string)$id, array_map('strval', $unitIds)) && !in_array($id, $unitIds)) continue;

            $nights   = max(1, (int) ((strtotime($checkOut) - strtotime($checkIn)) / 86400));
            $baseRate = $unit['base_price'] ?? $unit['price_per_night'] ?? 100;

            $result[$id] = [
                'apartment_id'    => $id,
                'available'       => true,
                'min_stay'        => 1,
                'price'           => $baseRate * $nights,
                'price_per_night' => $baseRate,
                'currency'        => $unit['currency'] ?? 'EUR',
            ];
        }

        return ['data' => $result];
    }

    private function mockCreateReservation(array $data): array
    {
        return [
            'id'            => rand(100000, 999999),
            'reference-id'  => 'BK-' . strtoupper(substr(md5(uniqid()), 0, 8)),
            'apartment'     => ['id' => $data['arrivalApartment'] ?? '', 'name' => ''],
            'arrival'       => $data['arrival'] ?? '',
            'departure'     => $data['departure'] ?? '',
            'channel'       => ['id' => $this->channelId, 'name' => 'Website'],
            'guest-name'    => ($data['firstName'] ?? '') . ' ' . ($data['lastName'] ?? ''),
            'email'         => $data['email'] ?? '',
            'phone'         => $data['phone'] ?? '',
            'adults'        => $data['adults'] ?? 2,
            'children'      => $data['children'] ?? 0,
            'price'         => $data['price'] ?? 0,
            'price-paid'    => 0,
        ];
    }

    private function mockReservation(string $id): array
    {
        return [
            'id'            => $id,
            'reference-id'  => 'BK-MOCK' . substr($id, -4),
            'type'          => 'reservation',
            'status'        => 1,
            'apartment'     => ['id' => 'MOCK', 'name' => 'Mock Unit'],
            'channel'       => ['id' => '', 'name' => 'Website'],
            'guest-name'    => 'Test Guest',
            'email'         => 'test@example.com',
            'phone'         => '+000 00000000',
            'adults'        => 2,
            'children'      => 0,
            'arrival'       => now()->addDays(7)->format('Y-m-d'),
            'departure'     => now()->addDays(9)->format('Y-m-d'),
            'price'         => 350.00,
            'price-paid'    => 0,
        ];
    }

    private function mockListReservations(array $params): array
    {
        return ['bookings' => [], 'page_count' => 0, 'page' => 1];
    }

    private function mockApartments(): array
    {
        return [
            'apartments' => [
                ['id' => 1001, 'name' => 'ForRest DeLuxe House', 'description' => 'A luxurious private house surrounded by forest, featuring a spacious living area, fully equipped kitchen, private sauna, and outdoor jacuzzi with forest views.', 'rooms' => ['maxOccupancy' => 6, 'bedrooms' => 3], 'price' => 176],
                ['id' => 1002, 'name' => 'ForRest Lodge', 'description' => 'A cozy lodge nestled among the trees, perfect for couples or small families seeking a peaceful nature retreat with modern comforts.', 'rooms' => ['maxOccupancy' => 4, 'bedrooms' => 2], 'price' => 88],
                ['id' => 1003, 'name' => 'ForRest No.5', 'description' => 'A unique forest dwelling combining rustic charm with contemporary design. Features an open-plan living space and private terrace.', 'rooms' => ['maxOccupancy' => 4, 'bedrooms' => 2], 'price' => 171],
                ['id' => 1004, 'name' => 'ForRest Sauna Lodge', 'description' => 'An exclusive lodge with a built-in private sauna, wood-burning fireplace, and panoramic forest views from every window.', 'rooms' => ['maxOccupancy' => 4, 'bedrooms' => 2], 'price' => 149],
                ['id' => 1005, 'name' => 'ForRest Tiny House', 'description' => 'A charming compact house designed for couples, featuring a loft bedroom, kitchenette, and a private deck overlooking the forest canopy.', 'rooms' => ['maxOccupancy' => 2, 'bedrooms' => 1], 'price' => 89],
                ['id' => 1006, 'name' => 'Sauna House', 'description' => 'A dedicated wellness retreat with a premium sauna, relaxation lounge, outdoor shower, and peaceful garden setting.', 'rooms' => ['maxOccupancy' => 4, 'bedrooms' => 1], 'price' => 113],
            ],
        ];
    }
}
