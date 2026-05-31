<?php

namespace App\Services;

use App\Models\HotelSetting;
use Illuminate\Support\Facades\Cache;
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
    private ?string $baseUrl     = null;
    private ?string $apiKey      = null;
    private ?string $channelId   = null;
    /** Cached output of resolveDirectChannelId() so the booking flow
     *  doesn't repeat /channels on every confirm. */
    private int $resolvedDirectChannelId = 0;
    private int $timeout         = 30;
    private ?bool $isMock        = null;
    private ?int $loadedForOrg   = null;
    private ?int $loadedForBrand = null;

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
        $orgId   = app()->bound('current_organization_id') ? (int) app('current_organization_id') : 0;
        $brandId = app()->bound('current_brand_id')        ? (int) app('current_brand_id')        : 0;
        if ($this->isMock !== null && $this->loadedForOrg === $orgId && $this->loadedForBrand === $brandId) {
            return;
        }

        $this->baseUrl   = rtrim($this->setting('booking_smoobu_base_url', config('services.smoobu.base_url', 'https://login.smoobu.com/api/')), '/');

        // Phase 3: per-brand Smoobu credentials. The brand-stamped key on the
        // brands table wins when present. Falls through to the org-level
        // hotel_settings entry, then finally to the global env var (only when
        // there is no tenant context at all). This lets a corporate group run
        // separate Smoobu accounts per sub-brand without forking SmoobuClient.
        $perBrandKey = '';
        $perBrandChannelId = '';
        if ($brandId) {
            try {
                $brand = \App\Models\Brand::withoutGlobalScopes()->find($brandId);
                if ($brand) {
                    $perBrandKey = (string) ($brand->pms_smoobu_api_key ?? '');
                    $perBrandChannelId = (string) ($brand->pms_smoobu_channel_id ?? '');
                }
            } catch (\Throwable $e) {
                // Defensive — if the brand lookup fails for any reason, fall
                // through to org-level creds rather than break PMS sync.
                Log::warning('SmoobuClient brand lookup failed: ' . $e->getMessage());
            }
        }

        $perOrgKey       = $this->setting('booking_smoobu_api_key', '');
        $this->apiKey    = $perBrandKey ?: ($perOrgKey ?: ($orgId ? '' : config('services.smoobu.api_key', '')));
        $provider        = $this->setting('booking_smoobu_provider', config('services.smoobu.provider', 'mock'));
        // Admin can deactivate the integration without removing credentials.
        // When disabled, behave as if no key is configured: serve mock data,
        // skip outbound calls. Smoobu's own data is never touched.
        $disabled        = !IntegrationStatus::isEnabled('smoobu');
        // Auto-detect: if API key is present AND not disabled, treat as live.
        $this->isMock    = $disabled || (empty($this->apiKey) && $provider === 'mock');
        $this->channelId = $perBrandChannelId
            ?: $this->setting('booking_smoobu_channel_id', config('services.smoobu.channel_id', ''));
        $this->timeout   = (int) config('services.smoobu.timeout', 30);
        $this->loadedForOrg   = $orgId;
        $this->loadedForBrand = $brandId;
        // Reset per-tenant caches so a long-lived SmoobuClient instance
        // doesn't carry one org's resolved channel into the next.
        $this->resolvedDirectChannelId = 0;

        if ($this->isMock) {
            Log::info('SmoobuClient running in MOCK mode', [
                'reason' => empty($this->apiKey) ? 'no_api_key' : 'provider_mock',
                'org_id' => $orgId,
            ]);
        }
    }

    public function isMock(): bool { $this->boot(); return (bool) $this->isMock; }
    public function channelId(): string { $this->boot(); return (string) $this->channelId; }

    /**
     * Resolve the channel id to use when CREATING reservations.
     *
     * Smoobu's POST /reservations needs a real channel id. If the admin
     * hasn't configured one (or set it to 0), Smoobu attributes the
     * reservation to a generic "Blocked Channel" — the booking shows
     * up grey on the calendar and is filtered out of the New
     * Reservations list. We saw exactly this in the wild.
     *
     * Resolution order:
     *   1. Admin-configured booking_smoobu_channel_id (per-brand → per-org)
     *      — VALIDATED against the live /channels list. If the pinned id
     *      matches an OTA / blocked channel, or doesn't exist on the
     *      account at all, we log a warning and FALL THROUGH to auto-detect
     *      rather than push bookings into a wrong-attribution channel.
     *      (If /channels itself is unreachable we trust the pin — better
     *      to push to the admin's pick than to fail closed during a
     *      Smoobu outage.)
     *   2. Auto-detect from GET /channels — two-pass selection:
     *        A) Prefer channels whose `type === 'direct_booking'` (Smoobu's
     *           own canonical marker) OR whose name matches a
     *           direct/website/manual/api pattern.
     *        B) Fall back to the first non-OTA, non-blocked candidate.
     *      Result is cached for 1 hour per org+brand via Laravel Cache so
     *      we don't hit /channels on every booking confirm.
     *   3. Strict mode (booking confirm path): throw a clear
     *      RuntimeException with marker text "Smoobu channel configuration"
     *      so the caller can surface a "contact support" message to the
     *      guest instead of "room not available".
     *      Non-strict mode (admin discovery, diagnostic commands): return 0
     *      so the caller can surface "no suggestion" UX without bombing
     *      the whole request.
     *
     * In-instance cache (`$this->resolvedDirectChannelId`) protects
     * back-to-back calls within the same request; the 1h Cache layer
     * survives across requests.
     */
    public function resolveDirectChannelId(bool $strict = false): int
    {
        $this->boot();

        $orgId   = $this->loadedForOrg ?? 0;
        $brandId = $this->loadedForBrand ?? 0;
        $cacheKey = "smoobu:direct_channel_id:{$orgId}:{$brandId}";
        $cacheTtl = 3600; // 1 hour — cheap to recompute, expensive to call /channels on every confirm

        // Mock mode short-circuits everything: synthesise a placeholder so
        // the local-only booking flow doesn't crash. Caching not needed.
        if ($this->isMock) {
            return $this->resolvedDirectChannelId = 1;
        }

        // In-instance cache wins (set on first successful resolution within
        // this request).
        if (!empty($this->resolvedDirectChannelId)) {
            return $this->resolvedDirectChannelId;
        }

        // Pull the live channel list ONCE — used for both (a) validating
        // the admin-pinned id and (b) auto-detect when there is no pin.
        // Wrapped in try/catch so a Smoobu outage doesn't kill the whole
        // booking flow.
        $items = null;
        $listError = null;
        try {
            $resp  = $this->get('/channels');
            $items = is_array($resp['channels'] ?? null) ? $resp['channels'] : (is_array($resp) ? $resp : []);

            Log::info('SmoobuClient: /channels resolved', [
                'count'    => count($items),
                'channels' => array_map(fn ($c) => [
                    'id'   => $c['id']   ?? null,
                    'name' => $c['name'] ?? null,
                    'type' => $c['type'] ?? null,
                ], $items),
            ]);
        } catch (\Throwable $e) {
            $listError = $e->getMessage();
            Log::warning('SmoobuClient: /channels lookup failed', ['error' => $listError]);
        }

        $blockNamePattern  = '/(blocked|block channel|блок)/i';
        $otaNamePattern    = '/(booking\.?com|airbnb|expedia|vrbo|hotels?\.com|agoda|trip\.com|hostelworld|despegar)/i';
        $directNamePattern = '/(direct|website|manual|\bapi\b|own.?website|direct.?booking)/i';

        // Helper — classify a channel record as "direct/usable for our own
        // widget bookings" vs "OTA / blocked / unknown".
        $isUsableDirect = function (array $ch) use ($blockNamePattern, $otaNamePattern): bool {
            $id   = (int) ($ch['id'] ?? 0);
            $name = (string) ($ch['name'] ?? '');
            $type = (string) ($ch['type'] ?? '');
            if ($id <= 0) return false;
            if ((bool) ($ch['is_blocked_channel'] ?? $ch['blocked'] ?? false)) return false;
            if (preg_match($blockNamePattern, $name)) return false;
            if (preg_match($otaNamePattern, $name)) return false;
            // Smoobu's `type` field, when present, distinguishes channels
            // managed via the channel manager (OTA pulls) from the account's
            // own direct/website channel. Names like 'channel' or types like
            // 'ota_*' are signs we shouldn't attribute widget bookings here.
            if ($type !== '' && preg_match('/^(ota|channel_manager|ical|pms_pull)/i', $type)) return false;
            return true;
        };

        // ── 1. Admin-pinned channel id — VALIDATE before trusting ──
        if (!empty($this->channelId) && ((int) $this->channelId) > 0) {
            $pinnedId = (int) $this->channelId;

            // If /channels is unreachable we can't validate. Trust the pin —
            // failing closed during a Smoobu outage would be worse than
            // pushing to the admin's last-known-good channel.
            if ($items === null) {
                Log::info('SmoobuClient: trusting admin-pinned channel without validation (channels listing unavailable)', [
                    'pinned' => $pinnedId,
                    'reason' => $listError,
                ]);
                return $this->resolvedDirectChannelId = $pinnedId;
            }

            $matched = null;
            foreach ($items as $ch) {
                if ((int) ($ch['id'] ?? 0) === $pinnedId) {
                    $matched = $ch;
                    break;
                }
            }

            if ($matched !== null && $isUsableDirect($matched)) {
                // Pinned id is real AND usable. Cache + return.
                Cache::put($cacheKey, $pinnedId, $cacheTtl);
                return $this->resolvedDirectChannelId = $pinnedId;
            }

            // Pin is bad. Log loudly so ops can see + fix the override,
            // then fall through to auto-detect.
            Log::warning('SmoobuClient: admin-pinned channel id is unusable, falling back to auto-detect', [
                'pinned'        => $pinnedId,
                'found_in_list' => $matched !== null,
                'matched_name'  => $matched['name'] ?? null,
                'matched_type'  => $matched['type'] ?? null,
                'reason'        => $matched === null
                    ? 'not_in_channels_list'
                    : 'classified_as_ota_or_blocked',
            ]);
        }

        // ── 2. Auto-detect — check per-org cross-request cache first ──
        $cached = Cache::get($cacheKey);
        if (is_int($cached) && $cached > 0 && $items !== null) {
            // Re-verify the cached pick is still usable — channel lists
            // change as admins add/remove OTA hookups.
            foreach ($items as $ch) {
                if ((int) ($ch['id'] ?? 0) === $cached && $isUsableDirect($ch)) {
                    return $this->resolvedDirectChannelId = $cached;
                }
            }
            // Stale cache — drop it and fall through to re-resolve.
            Cache::forget($cacheKey);
        }

        // 2-a. Live auto-detect from the channels list we already fetched.
        if ($items !== null) {
            $candidates = [];
            foreach ($items as $ch) {
                if (!$isUsableDirect($ch)) continue;
                $candidates[] = [
                    'id'   => (int) $ch['id'],
                    'name' => (string) ($ch['name'] ?? ''),
                    'type' => (string) ($ch['type'] ?? ''),
                ];
            }

            // Pass A1: prefer Smoobu's own `type === 'direct_booking'` marker.
            foreach ($candidates as $c) {
                if (strcasecmp($c['type'], 'direct_booking') === 0) {
                    Log::info('SmoobuClient: resolved direct channel by type=direct_booking', $c);
                    Cache::put($cacheKey, $c['id'], $cacheTtl);
                    return $this->resolvedDirectChannelId = $c['id'];
                }
            }
            // Pass A2: prefer direct-style names (Direct / Website / Manual / API).
            foreach ($candidates as $c) {
                if (preg_match($directNamePattern, $c['name'])) {
                    Log::info('SmoobuClient: resolved direct channel by name match', $c);
                    Cache::put($cacheKey, $c['id'], $cacheTtl);
                    return $this->resolvedDirectChannelId = $c['id'];
                }
            }
            // Pass B: first non-OTA, non-blocked candidate.
            if (!empty($candidates)) {
                $pick = $candidates[0];
                Log::info('SmoobuClient: resolved direct channel as first non-OTA fallback', $pick);
                Cache::put($cacheKey, $pick['id'], $cacheTtl);
                return $this->resolvedDirectChannelId = $pick['id'];
            }

            Log::warning('SmoobuClient: no usable direct channel found', [
                'total_channels' => count($items),
            ]);
        }

        // ── 3. Give up ──
        // Strict mode (booking confirm path) — throw a marker exception so
        // the user-facing error can route to "contact support" instead of
        // the generic "room not available" message.
        if ($strict) {
            $detail = $items === null
                ? "PMS channels list unreachable ({$listError})"
                : 'no direct channel is available in this account';
            throw new \RuntimeException(
                "Smoobu channel configuration error: {$detail}. "
                . 'Please contact support so we can finish wiring up your direct-booking channel.'
            );
        }

        // Non-strict (diagnostic / admin discovery) — preserve legacy
        // contract by returning 0 so callers can render "no suggestion" UX.
        return 0;
    }

    /**
     * Return raw /channels response for the admin to inspect. Used by the
     * Settings → Integrations → Smoobu "Discover channels" picker so admins
     * can copy the right channel ID into booking_smoobu_channel_id rather
     * than relying on auto-detection.
     */
    public function listChannels(): array
    {
        $this->boot();
        if ($this->isMock) {
            return [
                'channels' => [
                    ['id' => 1, 'name' => 'Direct booking (mock)'],
                    ['id' => 2, 'name' => 'Booking.com (mock)'],
                ],
                'note' => 'Mock mode — configure booking_smoobu_api_key to fetch real channels.',
            ];
        }
        $resp = $this->get('/channels');
        $items = is_array($resp['channels'] ?? null) ? $resp['channels'] : (is_array($resp) ? $resp : []);
        return ['channels' => $items];
    }

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

    /**
     * Returns the Smoobu account's user ID (`id` from /api/me). Needed
     * by /booking/checkApartmentAvailability which requires it as
     * `customerId`. Cached per-tenant for 24h since it never changes
     * for a given API key.
     *
     * NOTE: deliberately NOT using Cache::remember here — that would
     * cache a null result from a transient failure for the full 24h,
     * silently bricking pricing. We cache the success only; failures
     * fall through and let the NEXT call retry.
     */
    public function getUserId(): ?int
    {
        $this->boot();
        if ($this->isMock) return null;

        $orgId   = $this->loadedForOrg ?? 0;
        $brandId = $this->loadedForBrand ?? 0;
        $cacheKey = "smoobu:user_id:{$orgId}:{$brandId}";

        $cached = \Illuminate\Support\Facades\Cache::get($cacheKey);
        if ($cached !== null) return (int) $cached;

        try {
            $resp = $this->get('/me');
            $id = $resp['id'] ?? null;
            if (is_numeric($id)) {
                \Illuminate\Support\Facades\Cache::put($cacheKey, (int) $id, 86400);
                return (int) $id;
            }
        } catch (\Throwable $e) {
            Log::warning('Smoobu /api/me lookup failed', ['error' => $e->getMessage()]);
        }
        return null;
    }

    /**
     * Ask Smoobu to compute the final stay price WITH all configured
     * rules applied server-side — length-of-stay discounts, weekend
     * markups, channel-specific rate plans, etc. This is the only
     * Smoobu endpoint that does that math for a prospective stay; the
     * `/api/rates` endpoint only returns raw per-day prices and would
     * miss any LOS discount the customer has configured.
     *
     * Endpoint sits at /booking/checkApartmentAvailability (NOT under
     * /api/) — we pass an absolute URL through `request()` for this
     * one call.
     *
     * @param  string $checkIn  arrival YYYY-MM-DD
     * @param  string $checkOut departure YYYY-MM-DD
     * @param  int[]  $unitIds  apartment IDs to quote
     * @param  int    $guests   guest count (optional, sometimes affects price)
     * @return array{
     *   available: array<int, string>,
     *   prices: array<string, array{price: float, currency: string}>,
     *   errors: array<string, string>,
     * }
     */
    public function checkAvailability(string $checkIn, string $checkOut, array $unitIds, int $guests = 2): array
    {
        $this->boot();
        if ($this->isMock) {
            return ['available' => [], 'prices' => [], 'errors' => []];
        }
        $customerId = $this->getUserId();
        if (!$customerId) {
            // Without a customerId the endpoint rejects the request.
            // Return empty so the caller falls back to its own pricing
            // path rather than throwing — a Smoobu user-lookup hiccup
            // shouldn't break the booking widget.
            return ['available' => [], 'prices' => [], 'errors' => []];
        }

        $body = [
            'arrivalDate'   => $checkIn,
            'departureDate' => $checkOut,
            'apartments'    => array_map('intval', array_values($unitIds)),
            'customerId'    => $customerId,
        ];
        if ($guests > 0) $body['guests'] = $guests;

        try {
            // Absolute URL — endpoint lives on /booking/, not /api/.
            $resp = $this->request('POST', 'https://login.smoobu.com/booking/checkApartmentAvailability', ['json' => $body]);

            $available = array_map('strval', $resp['availableApartments'] ?? []);
            $prices = [];
            foreach (($resp['prices'] ?? []) as $aptId => $row) {
                $prices[(string) $aptId] = [
                    'price'    => (float) ($row['price'] ?? 0),
                    'currency' => (string) ($row['currency'] ?? 'EUR'),
                ];
            }
            $errors = [];
            foreach (($resp['errorMessages'] ?? []) as $aptId => $row) {
                $errors[(string) $aptId] = is_array($row)
                    ? (string) ($row['message'] ?? '')
                    : (string) $row;
            }
            return ['available' => $available, 'prices' => $prices, 'errors' => $errors];
        } catch (\Throwable $e) {
            Log::warning('Smoobu checkAvailability failed', ['error' => $e->getMessage()]);
            return ['available' => [], 'prices' => [], 'errors' => []];
        }
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

    /**
     * Cancel a reservation in Smoobu (best-effort).
     *
     * Smoobu's external API supports DELETE on reservations created via
     * the API for the org's direct booking channel. Channel-managed
     * bookings (Airbnb, Booking.com etc.) cannot be cancelled through us
     * because the OTA is the source of truth — Smoobu will return 4xx
     * and the caller must handle that gracefully (typically by audit-
     * logging the failure and prompting staff to cancel in the PMS UI).
     *
     * Mock mode short-circuits to a synthetic success.
     */
    public function cancelReservation(string $reservationId): array
    {
        $this->boot();
        if ($this->isMock) {
            return ['id' => $reservationId, 'status' => 'cancelled'];
        }

        return $this->delete("/reservations/{$reservationId}");
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

    /**
     * Load a setting via Eloquent so the model's getValueAttribute accessor
     * runs and decrypts ENCRYPTED_KEYS (like booking_smoobu_api_key) on
     * the way out. Using ->value() would skip the accessor and return
     * ciphertext for encrypted keys.
     */
    private function setting(string $key, string $default = ''): string
    {
        try {
            $row = HotelSetting::withoutGlobalScopes()
                ->where('organization_id', app()->bound('current_organization_id') ? app('current_organization_id') : null)
                ->where('key', $key)
                ->first();
            return $row && $row->value !== null && $row->value !== '' ? $row->value : $default;
        } catch (\Throwable) {
            return $default;
        }
    }

    /**
     * Smoobu rate-limits most endpoints at ~60 req/min. On 429, retry with
     * exponential backoff (250ms / 500ms / 1s) up to 3 times, honouring the
     * `Retry-After` header when Smoobu sends one. Non-429 5xx errors also
     * get one retry (transient gateway hiccups), but 4xx other than 429 are
     * fatal — those reflect a real client problem.
     */
    private const RATE_LIMIT_RETRIES = 3;
    private const BACKOFF_MS_BASE    = 250;

    private function get(string $path, array $params = []): array
    {
        return $this->request('GET', $path, ['query' => $params]);
    }

    private function post(string $path, array $data): array
    {
        return $this->request('POST', $path, ['json' => $data]);
    }

    private function delete(string $path): array
    {
        return $this->request('DELETE', $path, [], ['ok' => true]);
    }

    /**
     * Render an HTTP response body as a single-line excerpt suitable for
     * embedding in an exception message + CLI output + audit log.
     *
     * Smoobu's error responses are typically small JSON objects like
     *   {"detail":"channelId 70 not allowed for this account"}
     * Re-encoding via json_decode + json_encode strips formatting noise
     * (pretty-print whitespace, unnecessary unicode escapes) so the
     * excerpt reads cleanly in one line. Non-JSON bodies (HTML 502 pages,
     * plain-text errors) fall through to the raw string with newlines
     * collapsed.
     *
     * Result is hard-capped at $maxLen characters with an "…" suffix on
     * truncation so a misbehaving server can't drown our logs in a
     * 100 KB HTML payload.
     */
    private function formatBodyExcerpt(string $body, int $maxLen = 1000): string
    {
        $body = trim($body);
        if ($body === '') {
            return '(empty body)';
        }

        // Try JSON first — strip pretty-print whitespace, drop unicode escapes.
        $decoded = json_decode($body, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            $reencoded = json_encode($decoded, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($reencoded !== false) {
                $body = $reencoded;
            }
        } else {
            // Plain text / HTML — collapse newlines + runs of whitespace so the
            // excerpt sits on a single line.
            $body = preg_replace('/\s+/', ' ', $body) ?? $body;
        }

        if (mb_strlen($body) > $maxLen) {
            $body = mb_substr($body, 0, $maxLen) . '…';
        }
        return $body;
    }

    private function request(string $method, string $path, array $options, array $default = []): array
    {
        // Most paths are relative to the configured `/api` base URL.
        // A few endpoints (notably `/booking/checkApartmentAvailability`)
        // sit OUTSIDE the `/api` namespace on Smoobu — callers can pass
        // an absolute URL in that case and we use it as-is.
        $url = str_starts_with($path, 'http') ? $path : "{$this->baseUrl}{$path}";
        $attempt = 0;

        while (true) {
            // cURL timeout + connection failure handling: a request that
            // never gets an HTTP response throws ConnectionException
            // (or a wrapped RequestException whose message contains
            // "cURL error 28" / "cURL error 7" / "timed out") BEFORE
            // the 429+5xx status check below ever runs. Without this
            // try/catch the loop bails on the first transient blip,
            // even though such failures are exactly the class we want
            // to retry — e.g. Forrest Glamp's /reservations call timing
            // out at 8s mid-sync. Treat any of those as transient and
            // fall into the same exponential backoff path as 429+5xx.
            try {
                $client = Http::withHeaders(['Api-Key' => $this->apiKey])->timeout($this->timeout);
                $response = match ($method) {
                    'GET'    => $client->get($url, $options['query'] ?? []),
                    'POST'   => $client->post($url, $options['json'] ?? []),
                    'DELETE' => $client->delete($url),
                    default  => throw new \LogicException("Unsupported method: {$method}"),
                };
            } catch (\Illuminate\Http\Client\ConnectionException $e) {
                if ($attempt >= self::RATE_LIMIT_RETRIES) {
                    Log::error("Smoobu {$method} {$path} connection failed", ['error' => $e->getMessage(), 'attempts' => $attempt + 1]);
                    throw new \RuntimeException("Smoobu API connection error: " . $e->getMessage(), 0, $e);
                }
                $sleepMs = (int) (self::BACKOFF_MS_BASE * (2 ** $attempt));
                Log::info("Smoobu {$method} {$path} retrying after {$sleepMs}ms (connection)", ['error' => $e->getMessage(), 'attempt' => $attempt + 1]);
                usleep($sleepMs * 1000);
                $attempt++;
                continue;
            } catch (\Illuminate\Http\Client\RequestException $e) {
                // RequestException can wrap a cURL transport error
                // (timed out / connect refused / DNS) that didn't
                // surface as ConnectionException — match by message.
                $msg = $e->getMessage();
                if (preg_match('/timed out|cURL error 28|cURL error 7|connection (refused|reset)|could not resolve host/i', $msg)
                    && $attempt < self::RATE_LIMIT_RETRIES) {
                    $sleepMs = (int) (self::BACKOFF_MS_BASE * (2 ** $attempt));
                    Log::info("Smoobu {$method} {$path} retrying after {$sleepMs}ms (transport)", ['error' => $msg, 'attempt' => $attempt + 1]);
                    usleep($sleepMs * 1000);
                    $attempt++;
                    continue;
                }
                Log::error("Smoobu {$method} {$path} request failed", ['error' => $msg, 'attempts' => $attempt + 1]);
                throw $e;
            }

            if ($response->successful()) {
                return $response->json() ?? $default;
            }

            $status = $response->status();
            $isRetryable = $status === 429 || $status >= 500;

            if (!$isRetryable || $attempt >= self::RATE_LIMIT_RETRIES) {
                $rawBody = (string) $response->body();
                Log::error("Smoobu {$method} {$path} failed", ['status' => $status, 'body' => $rawBody, 'attempts' => $attempt + 1]);

                // Build a diagnostic message that carries the actual Smoobu
                // reason all the way out to callers (and into audit logs).
                // Previously this exception only carried the HTTP status code,
                // forcing staff to grep laravel.log to see WHY a booking was
                // rejected. The body — usually a small JSON error object —
                // contains the real cause (invalid channelId, unknown
                // apartmentId, missing required field, etc.).
                $excerpt = $this->formatBodyExcerpt($rawBody, 1000);
                $hint = '';
                // Reservation-create 404s are almost always a bad channel id —
                // either pointing at an OTA channel we're not allowed to write
                // to, or a channel that no longer exists. Point staff at the
                // diagnostic command rather than making them guess.
                if ($status === 404 && $method === 'POST' && str_contains($path, '/reservations')) {
                    $cid = (int) ($this->resolvedDirectChannelId ?: (int) $this->channelId);
                    $hint = " — common cause: channel_id ({$cid}) is an OTA channel or doesn't exist. Run 'php artisan diag:smoobu-channels --org=<id>' to list valid direct channels.";
                }

                throw new \RuntimeException(
                    "Smoobu API error: {$status} {$method} {$path} — {$excerpt}{$hint}"
                );
            }

            // Honour Retry-After if present; otherwise exponential backoff.
            $retryAfter = (int) $response->header('Retry-After');
            $sleepMs    = $retryAfter > 0
                ? $retryAfter * 1000
                : (int) (self::BACKOFF_MS_BASE * (2 ** $attempt));
            Log::info("Smoobu {$method} {$path} retrying after {$sleepMs}ms", ['status' => $status, 'attempt' => $attempt + 1]);
            usleep($sleepMs * 1000);
            $attempt++;
        }
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
