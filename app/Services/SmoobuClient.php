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

        return $this->get('/rates', [
            'start_date'   => $checkIn,
            'end_date'     => $checkOut,
            'apartments'   => $unitIds,
        ]);
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

        return $this->get('/apartments');
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

    private function getUnitsConfig(): array
    {
        $json = $this->setting('booking_units', '');
        if ($json) {
            $decoded = json_decode($json, true);
            if (is_array($decoded) && !empty($decoded)) return $decoded;
        }
        return config('booking.units', []);
    }

    private function mockRates(string $checkIn, string $checkOut, array $unitIds): array
    {
        $units  = $this->getUnitsConfig();
        $result = [];

        foreach ($units as $id => $unit) {
            if (!empty($unitIds) && !in_array($id, $unitIds)) continue;

            $nights   = max(1, (int) ((strtotime($checkOut) - strtotime($checkIn)) / 86400));
            $baseRate = rand(85, 180);

            $result[$id] = [
                'apartment_id'    => $id,
                'available'       => true,
                'min_stay'        => 2,
                'price'           => $baseRate * $nights,
                'price_per_night' => $baseRate,
                'currency'        => 'EUR',
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
                ['id' => 1001, 'name' => 'Deluxe Garden Suite',  'rooms' => ['maxOccupancy' => 4, 'bedrooms' => 1]],
                ['id' => 1002, 'name' => 'Superior Forest Lodge', 'rooms' => ['maxOccupancy' => 6, 'bedrooms' => 2]],
                ['id' => 1003, 'name' => 'Premium Lakeside Tent', 'rooms' => ['maxOccupancy' => 2, 'bedrooms' => 1]],
            ],
        ];
    }
}
