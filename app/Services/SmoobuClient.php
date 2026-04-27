<?php

namespace App\Services;

use App\Models\HotelSetting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * HTTP client for Smoobu PMS API.
 * Reads credentials from hotel_settings (per-org) with env fallback.
 *
 * IMPORTANT — credentials are loaded LAZILY, not in the constructor.
 *
 * Laravel's container resolves typed controller dependencies BEFORE the
 * controller method body runs. On public widget routes, the org is bound
 * inside the method body via bindOrg() — i.e. AFTER this service has
 * already been constructed. If we read settings in __construct, we'd
 * query hotel_settings WHERE organization_id IS NULL (org not yet
 * bound), get nothing, and silently fall into mock mode for the entire
 * request even though a perfectly good API key is sitting in the DB.
 *
 * The fix: defer all setting reads to the first method call. By that
 * point the controller body has already bound the org, so the lookup
 * succeeds. The first call also memoises the result so subsequent
 * calls inside the same request are free.
 */
class SmoobuClient
{
    private ?string $baseUrl   = null;
    private ?string $apiKey    = null;
    private ?string $channelId = null;
    private int $timeout       = 30;
    private ?bool $isMock      = null;
    private ?int $loadedForOrg = null;

    public function __construct()
    {
        // Intentionally empty — credentials are loaded on first use via boot().
    }

    /**
     * Resolve credentials from the current organisation context. Re-runs
     * if the org context changes mid-request (e.g. across queue jobs)
     * so we never serve one tenant's bookings against another tenant's
     * Smoobu key.
     */
    private function boot(): void
    {
        $orgId = app()->bound('current_organization_id') ? (int) app('current_organization_id') : 0;
        if ($this->isMock !== null && $this->loadedForOrg === $orgId) {
            return;
        }

        $this->baseUrl   = rtrim($this->setting('booking_smoobu_base_url', config('services.smoobu.base_url', 'https://login.smoobu.com/api/')), '/');
        // Per-org API key is authoritative. Only fall back to global env key
        // when there is NO tenant context (e.g. artisan commands, queue jobs).
        // This prevents org A's Smoobu rooms from leaking to org B when B has
        // no key configured and the global env key belongs to A.
        $perOrgKey       = $this->setting('booking_smoobu_api_key', '');
        $this->apiKey    = $perOrgKey ?: ($orgId ? '' : config('services.smoobu.api_key', ''));
        $provider        = $this->setting('booking_smoobu_provider', config('services.smoobu.provider', 'mock'));
        // Admin can deactivate the integration without removing credentials.
        // When disabled, behave as if no key is configured: serve mock data,
        // skip outbound calls. Smoobu's own data is never touched.
        $disabled        = !IntegrationStatus::isEnabled('smoobu');
        // Auto-detect: if API key is present AND not disabled, treat as live.
        $this->isMock    = $disabled || (empty($this->apiKey) && $provider === 'mock');
        $this->channelId = $this->setting('booking_smoobu_channel_id', config('services.smoobu.channel_id', ''));
        $this->timeout   = (int) config('services.smoobu.timeout', 30);
        $this->loadedForOrg = $orgId;

        if ($this->isMock) {
            Log::info('SmoobuClient running in MOCK mode', [
                'reason' => empty($this->apiKey) ? 'no_api_key' : 'provider_mock',
                'org_id' => $orgId,
            ]);
        }
    }

    public function isMock(): bool { $this->boot(); return (bool) $this->isMock; }
    public function channelId(): string { $this->boot(); return (string) $this->channelId; }

    public function getRates(string $checkIn, string $checkOut, array $unitIds = []): array
    {
        $this->boot();
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
        $this->boot();
        if ($this->isMock) {
            return $this->mockDailyRates($start, $end, $unitIds);
        }

        $raw = $this->fetchRawRates($start, $end, $unitIds);
        $data = $raw['data'] ?? $raw;

        // Constrain the returned window to the requested night range
        // (start..end-1 inclusive). The fetch helper already passes the
        // correct end_date to Smoobu, but Smoobu can return adjacent days
        // and we never want callers to see them.
        $startTs = strtotime($start);
        $endTs   = strtotime($end);

        $result = [];
        foreach ($data as $aptId => $dailyRates) {
            if (!is_array($dailyRates)) continue;
            $byDate = [];
            foreach ($dailyRates as $date => $dayData) {
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) continue;
                $ts = strtotime($date);
                if ($ts < $startTs || $ts >= $endTs) continue;

                if (is_array($dayData)) {
                    $byDate[$date] = [
                        'price'     => (float) ($dayData['price'] ?? 0),
                        'available' => ((int) ($dayData['available'] ?? 0)) === 1,
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

    /**
     * Smoobu's /api/rates `end_date` is INCLUSIVE — it represents the last
     * NIGHT of the stay, not the departure day. A stay of checkIn..checkOut
     * has nights checkIn..(checkOut - 1), so we must subtract one day before
     * passing it to Smoobu, otherwise the response leaks the checkout-day
     * rate into our totals and availability checks.
     */
    private function fetchRawRates(string $checkIn, string $checkOut, array $unitIds = []): array
    {
        $lastNight = date('Y-m-d', strtotime($checkOut . ' -1 day'));
        // Guard against same-day or inverted ranges — clamp to checkIn.
        if (strtotime($lastNight) < strtotime($checkIn)) {
            $lastNight = $checkIn;
        }

        $params = [
            'start_date' => $checkIn,
            'end_date'   => $lastNight,
        ];
        if (!empty($unitIds)) {
            $params['apartments'] = array_values($unitIds);
        }
        return $this->get('/rates', $params);
    }

    public function createReservation(array $data): array
    {
        $this->boot();
        if ($this->isMock) {
            return $this->mockCreateReservation($data);
        }

        return $this->post('/reservations', $data);
    }

    public function getReservation(string $reservationId): array
    {
        $this->boot();
        if ($this->isMock) {
            return $this->mockReservation($reservationId);
        }

        return $this->get("/reservations/{$reservationId}");
    }

    public function listReservations(array $params = []): array
    {
        $this->boot();
        if ($this->isMock) {
            return $this->mockListReservations($params);
        }

        return $this->get('/reservations', $params);
    }

    public function getPriceElements(string $reservationId): array
    {
        $this->boot();
        if ($this->isMock) {
            return [];
        }

        return $this->get("/reservations/{$reservationId}/price-elements");
    }

    /**
     * GET /apartments — fetch ALL apartments/units from Smoobu.
     *
     * Smoobu paginates `/apartments` (default 25 per page, max 50). The
     * previous implementation only fetched page 1, which silently dropped
     * any units past #25 — typically the Airbnb / Booking.com / Expedia
     * channel-imported listings, since Smoobu lists manually-created units
     * first. Now we walk through every page until `page_count` is reached.
     *
     * Returns: { "apartments": [ { id, name, rooms{maxOccupancy,bedrooms}, ... }, ... ] }
     */
    public function getApartments(): array
    {
        $this->boot();
        if ($this->isMock) {
            return $this->mockApartments();
        }

        $all = [];
        $page = 1;
        $pageSize = 50; // Smoobu's max per page — fewer round-trips
        $maxPages = 20; // safety cap (1000 units max — generous)

        do {
            $raw = $this->get('/apartments', [
                'page'      => $page,
                'page_size' => $pageSize,
            ]);

            $apartments = $raw['apartments'] ?? $raw;
            if (!is_array($apartments)) break;

            foreach ($apartments as $key => $apt) {
                if (!is_array($apt)) continue;
                if (!isset($apt['id'])) $apt['id'] = $key;
                $all[] = $apt;
            }

            // Smoobu returns `page_count`. If absent, fall back to
            // "stop when this page returned fewer rows than asked for".
            $pageCount = isset($raw['page_count']) ? (int) $raw['page_count'] : null;
            $returned = count($apartments);

            $hasMore = $pageCount !== null
                ? $page < $pageCount
                : $returned >= $pageSize;

            if (!$hasMore) break;
            $page++;
        } while ($page <= $maxPages);

        return ['apartments' => $all];
    }

    /**
     * GET /apartments/{id} — fetch single apartment details.
     */
    public function getApartment(string $id): array
    {
        $this->boot();
        if ($this->isMock) {
            return ['id' => $id, 'name' => 'Mock Unit'];
        }

        return $this->get("/apartments/{$id}");
    }

    // ─── Rate Normalization ─────────────────────────────────────────────

    /**
     * Normalize Smoobu /rates response into our standard format.
     *
     * Smoobu returns: { "data": { "<aptId>": { "<date>": { "price": 100, "min_length_of_stay": 2, "available": 1 }, ... } } }
     * We normalize to: { "data": { "<aptId>": { "available": true, "price_per_night": avg, "price": total, "min_stay": N } } }
     *
     * IMPORTANT: only nights inside the requested window count toward
     * total/availability/min_stay. Smoobu sometimes returns adjacent dates,
     * and even our own corrected fetchRawRates passes start..(checkOut - 1),
     * so we still defensively filter here. A unit is "available" only if
     * EVERY night is bookable AND priced > 0; one bad night kills the unit.
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

        // Build the strict night window: checkIn..(checkOut - 1).
        $nights = max(1, (int) round((strtotime($checkOut) - strtotime($checkIn)) / 86400));
        $window = [];
        for ($i = 0; $i < $nights; $i++) {
            $window[date('Y-m-d', strtotime($checkIn . " +{$i} day"))] = true;
        }

        $result = [];

        foreach ($data as $aptId => $dailyRates) {
            if (!is_array($dailyRates)) continue;

            // Pre-normalized format passthrough.
            if (isset($dailyRates['available']) || isset($dailyRates['price_per_night'])) {
                $result[$aptId] = $dailyRates;
                continue;
            }

            $totalPrice = 0.0;
            $available  = true;
            $minStay    = 1;
            $matched    = 0;

            foreach ($window as $date => $_) {
                $dayData = $dailyRates[$date] ?? null;
                if ($dayData === null) {
                    // Smoobu silently omits dates outside its rate calendar
                    // — treat that as unavailable, never as "free".
                    $available = false;
                    break;
                }

                if (is_array($dayData)) {
                    $dayPrice     = (float) ($dayData['price'] ?? 0);
                    $dayAvailable = ((int) ($dayData['available'] ?? 0)) === 1;
                    $dayMinStay   = (int) ($dayData['min_length_of_stay'] ?? $dayData['min_stay'] ?? 1);
                } else {
                    $dayPrice     = (float) $dayData;
                    $dayAvailable = true;
                    $dayMinStay   = 1;
                }

                if (!$dayAvailable || $dayPrice <= 0) {
                    $available = false;
                    break;
                }

                $totalPrice += $dayPrice;
                $minStay     = max($minStay, $dayMinStay);
                $matched++;
            }

            // Reject if the requested stay is shorter than the unit's min_stay.
            if ($available && $nights < $minStay) {
                $available = false;
            }

            $avgPrice = $available && $matched > 0 ? round($totalPrice / $nights, 2) : 0.0;

            $result[$aptId] = [
                'apartment_id'    => $aptId,
                'available'       => $available && $avgPrice > 0,
                'min_stay'        => $minStay,
                'price'           => $available ? round($totalPrice, 2) : 0.0,
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
                // Use the exact base price (with weekend markup) — no random noise
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
