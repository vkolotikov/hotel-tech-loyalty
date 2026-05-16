<?php

namespace App\Services;

use App\Exceptions\IdempotencyReplay;
use App\Mail\BookingConfirmationMail;
use App\Mail\BookingMembershipMail;
use App\Models\AuditLog;
use App\Models\BookingHold;
use App\Models\BookingIdempotencyKey;
use App\Models\BookingMirror;
use App\Models\BookingPriceElement;
use App\Models\BookingSubmission;
use App\Models\EmailVerificationCode;
use App\Models\Guest;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class BookingEngineService
{
    public function __construct(private SmoobuClient $smoobu) {}

    /** Create a price quote with hold token. */
    public function quote(array $data): array
    {
        $unitId   = $data['unit_id'];
        $checkIn  = $data['check_in'];
        $checkOut = $data['check_out'];
        $adults   = $data['adults'] ?? 2;
        $children = $data['children'] ?? 0;
        $extras   = $data['extras'] ?? [];

        $units = $this->getUnitsConfig();
        $unit  = $units[$unitId] ?? null;
        if (!$unit) {
            throw new \InvalidArgumentException('Unknown unit');
        }

        $avail = app(AvailabilityService::class);
        $rates = $avail->unitRates($unitId, $checkIn, $checkOut, $adults);

        if (empty($rates) || !($rates['available'] ?? false)) {
            throw new \RuntimeException('Unit not available for selected dates');
        }

        $nights      = max(1, (int) ((strtotime($checkOut) - strtotime($checkIn)) / 86400));
        $roomTotal   = $rates['price'] ?? ($rates['price_per_night'] ?? 0) * $nights;

        // Reject any extra whose preparation lead time can't be met before
        // check-in. The widget hides these client-side; we block them
        // again here so a manipulated request can't sneak one through.
        // Using check_in 00:00 as the deadline is intentionally strict —
        // the hotel needs the lead time IN FULL before arrival.
        $this->assertExtrasMeetLeadTime($extras, $checkIn);

        $extrasTotal = $this->calcExtras($extras, $adults);
        $grossTotal  = $roomTotal + $extrasTotal;

        $holdToken = Str::random(48);
        BookingHold::create([
            'hold_token'   => $holdToken,
            'status'       => 'active',
            'expires_at'   => now()->addMinutes(10),
            'payload_json' => [
                'unit_id'         => $unitId,
                'unit_name'       => $unit['name'],
                'check_in'        => $checkIn,
                'check_out'       => $checkOut,
                'nights'          => $nights,
                'adults'          => $adults,
                'children'        => $children,
                'room_total'      => $roomTotal,
                'extras'          => $extras,
                'extras_total'    => $extrasTotal,
                'gross_total'     => $grossTotal,
                'currency'        => 'EUR',
                'price_per_night' => $rates['price_per_night'] ?? round($roomTotal / $nights, 2),
            ],
        ]);

        return [
            'hold_token'      => $holdToken,
            'expires_at'      => now()->addMinutes(10)->toIso8601String(),
            'unit_id'         => $unitId,
            'unit_name'       => $unit['name'],
            'check_in'        => $checkIn,
            'check_out'       => $checkOut,
            'nights'          => $nights,
            'adults'          => $adults,
            'children'        => $children,
            'room_total'      => $roomTotal,
            'extras_total'    => $extrasTotal,
            'gross_total'     => $grossTotal,
            'currency'        => 'EUR',
            'price_per_night' => $rates['price_per_night'] ?? round($roomTotal / $nights, 2),
        ];
    }

    /** Confirm a booking from hold token. */
    public function confirm(array $data, ?string $idempotencyKey = null, ?string $requestId = null, ?string $ip = null): array
    {
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;

        // Check idempotency
        if ($idempotencyKey && $orgId) {
            $existing = BookingIdempotencyKey::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('idempotency_key', $idempotencyKey)
                ->first();
            if ($existing && $existing->isValid()) {
                return array_merge($existing->response_json, ['replayed' => true]);
            }
        }

        $holdToken = $data['hold_token'];
        $holdQuery = BookingHold::where('hold_token', $holdToken);
        if ($orgId) {
            $holdQuery->where('organization_id', $orgId);
        }
        $hold = $holdQuery->first();

        if (!$hold || !$hold->isActive()) {
            $this->logSubmission('failure', 'hold_expired', 'Hold expired or not found', $data, $requestId, $idempotencyKey);
            throw new \RuntimeException('Hold expired or not found');
        }

        $payload = $hold->payload_json;
        $guest   = $data['guest'] ?? [];
        $apartmentId = $payload['unit_id'];

        // Try to link or create a CRM guest (outside the lock — idempotent by email).
        $guestId = $this->linkOrCreateGuest($guest, $orgId);

        // Serialize concurrent confirms for the same room+org using a PG advisory
        // transaction lock. Two guests holding overlapping dates on the same room
        // would otherwise both pass the quote-time check and both create mirrors,
        // double-booking a single-inventory unit.
        $lockKey = "room:{$orgId}:{$apartmentId}";

        try {
        [$mirror, $result, $internalStatus, $pmsResult] = DB::transaction(function () use (
            $hold, $payload, $orgId, $apartmentId, $data, $guest, $guestId, $requestId, $idempotencyKey, $lockKey
        ) {
            DB::statement('SELECT pg_advisory_xact_lock(hashtext(?))', [$lockKey]);

            // Re-check idempotency INSIDE the lock so two requests with the
            // same key that both missed the pre-check (race window between
            // line ~108 and here) don't both create a booking. The pre-check
            // outside the lock is the fast path; this is the correctness check.
            // Whoever lost the race finds the winner's row and re-throws as
            // a sentinel below, which the outer catch converts into the
            // cached response.
            if ($idempotencyKey && $orgId) {
                $existing = BookingIdempotencyKey::withoutGlobalScopes()
                    ->where('organization_id', $orgId)
                    ->where('idempotency_key', $idempotencyKey)
                    ->first();
                if ($existing && $existing->isValid()) {
                    throw new IdempotencyReplay($existing->response_json);
                }
            }

            // Re-load hold under lock — defends against concurrent consumption.
            $hold = BookingHold::where('id', $hold->id)->lockForUpdate()->first();
            if (!$hold || !$hold->isActive()) {
                $this->logSubmission('failure', 'hold_expired', 'Hold expired or consumed', $data, $requestId, $idempotencyKey);
                throw new \RuntimeException('Hold expired or not found');
            }

            // Re-check inventory now that we own the lock. Anything committed
            // during the quote window is visible here.
            $rooms = \App\Models\BookingRoom::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where(function ($q) use ($apartmentId) {
                    $q->where('pms_id', $apartmentId)->orWhere('id', $apartmentId);
                })
                ->first();
            $inventory = max(1, (int) ($rooms->inventory_count ?? 1));

            $booked = BookingMirror::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('apartment_id', $apartmentId)
                ->whereNotIn('booking_state', ['cancelled'])
                ->where(function ($q) {
                    $q->whereNull('internal_status')->orWhereNotIn('internal_status', ['cancelled']);
                })
                ->where('arrival_date', '<', $payload['check_out'])
                ->where('departure_date', '>', $payload['check_in'])
                ->count();

            if ($booked >= $inventory) {
                $this->logSubmission('failure', 'inventory_unavailable', 'Room no longer available for selected dates', $data, $requestId, $idempotencyKey);
                throw new \RuntimeException('This room is no longer available for the selected dates. Please choose another.');
            }

            // ── Live Smoobu availability re-check ───────────────────
            // The local-mirror check above only sees bookings WE know
            // about. If Booking.com / Airbnb just sold this room 30
            // seconds ago and Smoobu's webhook hasn't reached us yet,
            // our mirror still says "available" and we'd happily
            // double-book. This single API call asks Smoobu what it
            // really thinks RIGHT NOW. Wrapped in try/catch so a
            // transient API error doesn't block the booking — but a
            // confirmed "not available" is a hard stop.
            try {
                $liveRates = $this->smoobu->getRates(
                    $payload['check_in'],
                    $payload['check_out'],
                    [$apartmentId],
                );
                $liveData = $liveRates['data'] ?? $liveRates;
                $unitLive = $liveData[$apartmentId] ?? null;
                if ($unitLive !== null && !($unitLive['available'] ?? false)) {
                    $this->logSubmission('failure', 'pms_unavailable', 'PMS reports unit unavailable at confirm', $data, $requestId, $idempotencyKey);
                    throw new \RuntimeException('This room was just booked through another channel. Please choose another.');
                }
            } catch (\RuntimeException $e) {
                // Our own thrown unavailable error — re-throw.
                throw $e;
            } catch (\Throwable $e) {
                // Transient Smoobu API failure — log but don't block.
                // The createReservation call below will fail hard if
                // Smoobu actually rejects, so we still have a second
                // line of defence.
                \Illuminate\Support\Facades\Log::warning('Live availability re-check failed at confirm', [
                    'org_id'  => $orgId,
                    'unit_id' => $apartmentId,
                    'error'   => $e->getMessage(),
                ]);
            }

            // ── Create reservation in Smoobu ────────────────────────
            // Field names follow Smoobu's documented Channel Manager
            // API contract (camelCase throughout — note `channelId`,
            // not channel_id, which was a bug pre-fix).
            //
            // Error handling has two distinct branches:
            //   (a) Auth / network / 5xx / 404-not-found — Smoobu is
            //       reachable problem on us. We can SAFELY fall back
            //       to a local-only mirror with status pending_pms_sync
            //       so staff can reconcile manually. Customer flow
            //       completes, no double-booking risk because the
            //       availability re-check above already confirmed
            //       Smoobu has the room.
            //   (b) Availability / validation rejection — Smoobu says
            //       "no". HARD FAIL. Pre-fix this fell through to (a)
            //       and we'd create a local mirror + email the
            //       customer for a room they didn't actually get.
            $pmsResult = null;
            $pmsFatal = null;
            try {
                $pmsResult = $this->smoobu->createReservation([
                    'apartmentId'   => $payload['unit_id'],
                    'arrivalDate'   => $payload['check_in'],
                    'departureDate' => $payload['check_out'],
                    'channelId'     => (int) ($this->smoobu->channelId() ?: 0),
                    'firstName'     => $guest['first_name'] ?? '',
                    'lastName'      => $guest['last_name'] ?? '',
                    'email'         => $guest['email'] ?? '',
                    'phone'         => $guest['phone'] ?? '',
                    'adults'        => (int) $payload['adults'],
                    'children'      => (int) $payload['children'],
                    'price'         => (float) $payload['gross_total'],
                    'language'      => 'en',
                ]);
            } catch (\Throwable $e) {
                $msg = $e->getMessage();
                // Heuristic: any error mentioning availability /
                // unavailable / booked / conflict / 409 / 422 is
                // treated as a hard rejection. Everything else is
                // treated as transient and falls back to local mirror.
                $isAvailabilityFail =
                    preg_match('/\b(409|422|unavailable|not available|already booked|overlapping|conflict|inventory)/i', $msg);
                if ($isAvailabilityFail) {
                    $this->logSubmission('failure', 'pms_unavailable', $msg, $data, $requestId, $idempotencyKey);
                    \Illuminate\Support\Facades\Log::warning('Smoobu hard-rejected create (no local fallback)', [
                        'org_id'  => $orgId,
                        'unit_id' => $payload['unit_id'],
                        'error'   => $msg,
                    ]);
                    $pmsFatal = $msg;
                } else {
                    \Illuminate\Support\Facades\Log::warning('Smoobu reservation create failed — falling back to local-only mirror', [
                        'org_id'  => $orgId,
                        'unit_id' => $payload['unit_id'],
                        'error'   => $msg,
                    ]);
                    $this->logSubmission('warning', 'pms_error', $msg, $data, $requestId, $idempotencyKey);
                }
            }

            if ($pmsFatal) {
                throw new \RuntimeException('Booking could not be confirmed: this room is no longer available. Please choose another.');
            }

            $result = $pmsResult ?: [
                'id'           => 'LOCAL-' . strtoupper(\Illuminate\Support\Str::random(10)),
                'reference-id' => 'LOC-' . strtoupper(substr(md5(uniqid('', true)), 0, 8)),
            ];
            $internalStatus = $pmsResult ? 'confirmed' : 'pending_pms_sync';

            // Consume hold inside the lock — the updated row is visible to
            // concurrent requests once this transaction commits.
            $hold->update(['status' => 'consumed']);

            // Resolve payment info (from Stripe verification in controller)
            $paymentIntentId = $data['payment_intent_id'] ?? null;
            $paymentMethod   = $data['payment_method'] ?? null;
            $paymentStatus   = $data['payment_status'] ?? ($paymentIntentId ? 'paid' : null);

            $mirror = BookingMirror::create([
                'reservation_id'    => (string) ($result['id'] ?? ''),
                'booking_reference' => $result['reference-id'] ?? null,
                'booking_type'      => 'reservation',
                'booking_state'     => 'confirmed',
                'apartment_id'      => $payload['unit_id'],
                'apartment_name'    => $payload['unit_name'],
                'channel_name'      => 'Website',
                'guest_id'          => $guestId,
                'guest_name'        => trim(($guest['first_name'] ?? '') . ' ' . ($guest['last_name'] ?? '')),
                'guest_email'       => $guest['email'] ?? null,
                'guest_phone'       => $guest['phone'] ?? null,
                'adults'            => $payload['adults'],
                'children'          => $payload['children'],
                'arrival_date'      => $payload['check_in'],
                'departure_date'    => $payload['check_out'],
                'price_total'       => $payload['gross_total'],
                'price_paid'        => $paymentStatus === 'paid' ? $payload['gross_total'] : null,
                'payment_status'    => $paymentStatus,
                'payment_method'    => $paymentMethod,
                'stripe_payment_intent_id' => $paymentIntentId,
                'internal_status'   => $internalStatus,
                'synced_at'         => $pmsResult ? now() : null,
            ]);

            // Persist line-item breakdown so admin booking detail can show the
            // accommodation row plus every extra the guest selected. Keeping
            // this inside the transaction means the mirror and its line items
            // commit atomically.
            $this->persistPriceElements($mirror, $payload, $orgId);

            return [$mirror, $result, $internalStatus, $pmsResult];
        });
        } catch (IdempotencyReplay $replay) {
            // Concurrent request with the same idempotency_key won the race
            // and already wrote the cached response. The transaction is
            // rolled back automatically, so no partial state remains.
            return array_merge($replay->response, ['replayed' => true]);
        }

        // Lifecycle: a confirmed widget booking is real engagement. If the
        // departure date has already passed (rare for widget but possible
        // for back-dated entries) count it as a completed stay; otherwise
        // just bump activity so the guest doesn't drift toward Inactive.
        if ($guestId) {
            $g = Guest::withoutGlobalScopes()->find($guestId);
            if ($g) {
                $lifecycle = app(GuestLifecycleService::class);
                if (strtotime($payload['check_out']) < strtotime('today')) {
                    $lifecycle->recordStay(
                        $g,
                        $payload['check_in'],
                        $payload['check_out'],
                        null,
                        (float) $payload['gross_total'],
                    );
                    $mirror->update(['lifecycle_counted_at' => now()]);
                } else {
                    $lifecycle->recordActivity($g);
                }
            }
        }

        $response = [
            'success'           => true,
            'booking_reference' => $result['reference-id'] ?? null,
            'reservation_id'    => (string) ($result['id'] ?? ''),
            'unit_name'         => $payload['unit_name'],
            'check_in'          => $payload['check_in'],
            'check_out'         => $payload['check_out'],
            'gross_total'       => $payload['gross_total'],
            'currency'          => 'EUR',
        ];

        // Save idempotency. Unique constraint on (organization_id,
        // idempotency_key) is the final backstop — if a concurrent request
        // slipped past both the pre-check and the in-lock re-check (very
        // unusual: same key targeting different rooms), we catch the 23505
        // here, look up the winner's row, and return THAT response so the
        // caller gets the original booking reference rather than a stranded
        // duplicate. The duplicate booking row already committed before
        // this point, so log it loudly — staff will need to cancel it.
        if ($idempotencyKey) {
            try {
                BookingIdempotencyKey::create([
                    'idempotency_key' => $idempotencyKey,
                    'request_hash'    => md5(json_encode($data)),
                    'response_json'   => $response,
                    'status_code'     => 201,
                    'expires_at'      => now()->addHours(24),
                ]);
            } catch (\Illuminate\Database\QueryException $e) {
                if ($e->getCode() === '23505') {
                    \Illuminate\Support\Facades\Log::error('Idempotency-key race produced a duplicate booking — manual cancel required', [
                        'org_id'           => $orgId,
                        'idempotency_key'  => $idempotencyKey,
                        'duplicate_mirror_id' => $mirror->id ?? null,
                    ]);
                    $existing = BookingIdempotencyKey::withoutGlobalScopes()
                        ->where('organization_id', $orgId)
                        ->where('idempotency_key', $idempotencyKey)
                        ->first();
                    if ($existing && $existing->response_json) {
                        return array_merge($existing->response_json, ['replayed' => true]);
                    }
                }
                throw $e;
            }
        }

        $this->logSubmission('success', null, null, array_merge($data, $response), $requestId, $idempotencyKey, $response, $guestId);

        AuditLog::create([
            'action'      => 'booking.confirmed',
            'subject_type'=> 'booking_mirror',
            'subject_id'  => $result['id'] ?? null,
            'details'     => json_encode(['booking_reference' => $response['booking_reference']]),
            'ip_address'  => $ip,
        ]);

        // Send booking confirmation & membership emails
        $this->sendBookingEmails($guest, $payload, $response, $orgId);

        return $response;
    }

    /** Sync a single reservation from Smoobu into booking_mirror. */
    public function syncReservation(string $reservationId): ?BookingMirror
    {
        $data = $this->smoobu->getReservation($reservationId);
        if (empty($data)) return null;

        return $this->upsertBookingFromData($data);
    }

    /**
     * Pull every reservation from the Smoobu API and upsert it into
     * `booking_mirrors`. Runs TWO passes:
     *
     *   Pass 1 — Arrival window. Uses Smoobu's `from`/`to` (arrival
     *   date range). Covers the obvious "what's coming up + what
     *   just happened" majority of bookings.
     *
     *   Pass 2 — Modified-recently. Uses Smoobu's `modifiedFrom`
     *   to catch any booking that was created or updated in the
     *   last 30 days REGARDLESS of arrival date. This is the fix
     *   for the recurring "sync misses bookings even after retries"
     *   bug: a guest who checks out 4 months ago and pays today,
     *   or who books today for 18 months from now, falls outside
     *   the arrival window but inside `modifiedFrom`.
     *
     * Both passes ride the same upsert path so duplicates are
     * harmless (updateOrCreate by reservation_id).
     *
     * Extra parameters per the official Smoobu /reservations docs:
     *   - `showCancellation=1` — cancellations are EXCLUDED by
     *     default. Without this, a cancellation in Smoobu would
     *     leave our mirror showing the booking as "confirmed"
     *     forever, which is how rooms got double-booked. We need
     *     to see the cancellation so we can flip state.
     *   - `includePriceElements=1` — Smoobu's list endpoint omits
     *     price elements unless asked. Without them, our payment
     *     status detection fall back to the bare `price`/`price-paid`
     *     fields and miss partial payments.
     *
     * Pagination contract: Smoobu returns `page_count` in the
     * response and accepts `page` + `pageSize` (camelCase, max
     * 100). The 200-page safety net stops a runaway loop, but at
     * 100/page that still walks 20 000 reservations per pass.
     *
     * Returns counts + the windows used so the cron / admin
     * "Sync now" button can surface what happened.
     */
    public function syncReservationsFromPms(?string $from = null, ?string $to = null): array
    {
        // Arrival window — widened from the old ±3/+12 to ±12/+18.
        // The ±12 lower bound is mostly belt-and-braces; modifiedFrom
        // pass 2 is the real safety net for stale updates.
        $from = $from ?? now()->subMonths(12)->format('Y-m-d');
        $to   = $to   ?? now()->addMonths(18)->format('Y-m-d');

        // Pass 2 looks at everything modified in the last 30 days.
        // Cron runs every 10 min so this is generous — but a longer
        // window costs nothing (pagination still stops at empty).
        $modifiedFrom = now()->subDays(30)->format('Y-m-d');

        $synced = 0;
        $errors = 0;
        $passesSummary = [];

        // ── Pass 1: arrival window ──────────────────────────────
        $r1 = $this->runSyncPass([
            'from'                 => $from,
            'to'                   => $to,
            'showCancellation'     => 1,
            'includePriceElements' => 1,
        ]);
        $synced += $r1['synced'];
        $errors += $r1['errors'];
        $passesSummary['arrival_window'] = $r1;

        // ── Pass 2: anything modified in the last 30 days ───────
        // This catches bookings whose ARRIVAL falls outside the
        // window above but were touched recently — e.g. payment
        // status changes on past stays, cancellations of long-lead
        // future bookings.
        $r2 = $this->runSyncPass([
            'modifiedFrom'         => $modifiedFrom,
            'showCancellation'     => 1,
            'includePriceElements' => 1,
        ]);
        $synced += $r2['synced'];
        $errors += $r2['errors'];
        $passesSummary['modified_recent'] = $r2;

        return [
            'synced'        => $synced,
            'errors'        => $errors,
            'pages'         => $r1['pages'] + $r2['pages'],
            'page_count'    => $r1['page_count'] + $r2['page_count'],
            'from'          => $from,
            'to'            => $to,
            'modified_from' => $modifiedFrom,
            'passes'        => $passesSummary,
        ];
    }

    /**
     * One pass of the Smoobu reservations list with the given filter
     * params. Pulled out of syncReservationsFromPms so we can run
     * the two strategies through the same pagination + error handler.
     *
     * @param array $baseParams the filter params (from/to or
     *                          modifiedFrom + flags). `page` and
     *                          `pageSize` are added per iteration.
     * @return array{synced:int,errors:int,pages:int,page_count:int}
     */
    private function runSyncPass(array $baseParams): array
    {
        $page = 1;
        $synced = 0;
        $errors = 0;
        $pageCount = 1;
        $maxPages = 200; // safety net — 20 000 rows per pass at 100/page

        while ($page <= $maxPages) {
            $response = $this->smoobu->listReservations(array_merge($baseParams, [
                'page'     => $page,
                'pageSize' => 100,
            ]));

            $bookings = $response['bookings'] ?? [];
            $pageCount = (int) ($response['page_count'] ?? 1);

            if (empty($bookings)) break;

            foreach ($bookings as $b) {
                try {
                    $this->upsertBookingFromData($b);
                    $synced++;
                } catch (\Throwable $e) {
                    $errors++;
                    // Richer log so we can diagnose the next wave of
                    // failures without staring at audit-log counts.
                    // Includes the SQL state when this is a database
                    // error, plus the smallest data snapshot that's
                    // useful for triage.
                    $context = [
                        'id'        => $b['id'] ?? null,
                        'type'      => $b['type'] ?? null,
                        'arrival'   => $b['arrival'] ?? null,
                        'departure' => $b['departure'] ?? null,
                        'channel'   => $b['channel']['name'] ?? null,
                        'apartment' => $b['apartment']['id'] ?? null,
                        'error'     => $e->getMessage(),
                    ];
                    if ($e instanceof \Illuminate\Database\QueryException) {
                        $context['sql_state'] = $e->errorInfo[0] ?? null;
                        $context['sql_code']  = $e->errorInfo[1] ?? null;
                    }
                    \Illuminate\Support\Facades\Log::warning('Sync reservation failed', $context);
                }
            }

            if ($page >= $pageCount) break;
            $page++;
        }

        return [
            'synced'     => $synced,
            'errors'     => $errors,
            'pages'      => $page,
            'page_count' => $pageCount,
        ];
    }

    /**
     * Upsert a booking mirror from already-fetched Smoobu data (no extra API call).
     */
    public function upsertBookingFromData(array $data): ?BookingMirror
    {
        if (empty($data['id'])) return null;

        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;

        $guestEmail = $data['email'] ?? null;
        $guestId    = null;
        if ($guestEmail) {
            $guest = Guest::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('email', $guestEmail)
                ->first();
            $guestId = $guest?->id;
        }

        // ── Sanitization helpers ─────────────────────────────────────
        // Postgres rejects EMPTY STRINGS on typed columns (date / time /
        // decimal / timestamp). Smoobu's API is inconsistent about empty
        // values — channel-imported bookings (Airbnb / Booking.com) and
        // blocked-bookings frequently return `""` for fields a manually-
        // created Smoobu booking would return null for. Without these
        // guards, ~50% of upserts can fail with `invalid input syntax
        // for type X: ""` on certain Smoobu accounts. Reported as the
        // "PMS sync: 721 synced, 665 failed" symptom.
        $strOrNull   = fn($v) => (is_string($v) && trim($v) === '') ? null : $v;
        $intOrNull   = fn($v) => $v === null || $v === '' ? null : (int) $v;
        $floatOrNull = fn($v) => $v === null || $v === '' ? null : (float) $v;
        $dateOrNull  = function($v) {
            $v = is_string($v) ? trim($v) : $v;
            if (!$v) return null;
            // Smoobu returns 'YYYY-MM-DD'. Reject zero-dates ('0000-00-00')
            // and anything else Postgres won't parse.
            if (is_string($v) && !preg_match('/^\d{4}-\d{2}-\d{2}/', $v)) return null;
            if (is_string($v) && str_starts_with($v, '0000')) return null;
            return $v;
        };
        $timeOrNull  = function($v) {
            $v = is_string($v) ? trim($v) : $v;
            if (!$v) return null;
            // Accept HH:MM or HH:MM:SS. Smoobu sometimes returns "00:00"
            // for "not set" — pass it through, Postgres accepts it.
            return is_string($v) && preg_match('/^\d{1,2}:\d{2}(:\d{2})?$/', $v) ? $v : null;
        };
        $tsOrNull    = function($v) {
            $v = is_string($v) ? trim($v) : $v;
            if (!$v) return null;
            // Common Smoobu timestamp shapes: 'YYYY-MM-DD HH:MM:SS' or
            // ISO 8601. Reject anything else — better null than crash.
            if (is_string($v) && !preg_match('/^\d{4}-\d{2}-\d{2}/', $v)) return null;
            if (is_string($v) && str_starts_with($v, '0000')) return null;
            return $v;
        };
        // Truncate string-with-length to the column's max length so
        // long channel-imported IDs don't blow up the INSERT.
        $clip = fn($v, int $max) => is_string($v) ? mb_substr($v, 0, $max) : $v;

        // ── Smoobu bool: "Yes"/"No"/"YES"/"yes" ──────────────────────
        $toBool = fn($v) => is_string($v) ? strtolower(trim($v)) === 'yes' : (bool) $v;

        // ── Money: tolerate strings like "120.50" and empty ─────────
        $priceTotal = $floatOrNull($data['price'] ?? null) ?? 0.0;
        $pricePaidRaw = $data['price-paid'] ?? null;
        $pricePaid = ($pricePaidRaw && $toBool($pricePaidRaw)) ? $priceTotal : 0.0;

        // ── Payment status ──────────────────────────────────────────
        $isBlocked = $data['is-blocked-booking'] ?? false;
        if ($isBlocked) {
            $paymentStatus = null;
        } elseif ($pricePaid >= $priceTotal && $priceTotal > 0) {
            $paymentStatus = 'paid';
        } elseif ($pricePaid > 0 && $pricePaid < $priceTotal) {
            $paymentStatus = 'pending';
        } else {
            $paymentStatus = 'open';
        }

        // Smoobu list uses 'type' field (reservation/cancellation)
        $type = $data['type'] ?? 'reservation';
        $bookingState = match ($type) {
            'cancellation'            => 'cancelled',
            'modification of booking' => 'confirmed',
            default                   => 'confirmed',
        };

        // ── Dates + internal status ─────────────────────────────────
        $arrivalDate   = $dateOrNull($data['arrival'] ?? null);
        $departureDate = $dateOrNull($data['departure'] ?? null);
        $today = now()->toDateString();
        if ($type === 'cancellation') {
            $internalStatus = 'cancelled';
        } elseif ($departureDate && $departureDate < $today) {
            $internalStatus = 'checked-out';
        } elseif ($arrivalDate && $arrivalDate <= $today && $departureDate && $departureDate >= $today) {
            $internalStatus = 'checked-in';
        } else {
            $internalStatus = 'confirmed';
        }

        // ── Defensive nested-array access ───────────────────────────
        // Some channel-imported bookings ship with `apartment: null` or
        // `channel: null`. PHP 8's null-coalesce + array-offset combo
        // mostly tolerates that, but we belt-and-braces it here so the
        // whole upsert doesn't fail on one weird payload.
        $apartment = is_array($data['apartment'] ?? null) ? $data['apartment'] : [];
        $channel   = is_array($data['channel']   ?? null) ? $data['channel']   : [];

        $mirror = BookingMirror::updateOrCreate(
            ['organization_id' => $orgId, 'reservation_id' => $clip((string) $data['id'], 30)],
            [
                'booking_reference'  => $clip($strOrNull($data['reference-id'] ?? null), 60),
                'booking_type'       => $clip($type, 40),
                'booking_state'      => $clip($bookingState, 40),
                'apartment_id'       => $clip($strOrNull($apartment['id'] ?? null), 20),
                'apartment_name'     => $clip($strOrNull($apartment['name'] ?? null), 180),
                'channel_id'         => $clip($strOrNull($channel['id'] ?? null), 20),
                'channel_name'       => $clip($strOrNull($channel['name'] ?? null), 80),
                'guest_id'           => $guestId,
                'guest_name'         => $clip($strOrNull($data['guest-name'] ?? null), 180),
                'guest_email'        => $clip($strOrNull($data['email'] ?? null), 180),
                'guest_phone'        => $clip($strOrNull($data['phone'] ?? null), 40),
                'guest_language'     => $clip($strOrNull($data['language'] ?? null), 10),
                'adults'             => $intOrNull($data['adults'] ?? null),
                'children'           => $intOrNull($data['children'] ?? null),
                'arrival_date'       => $arrivalDate,
                'departure_date'     => $departureDate,
                'check_in_time'      => $timeOrNull($data['check-in'] ?? null),
                'check_out_time'     => $timeOrNull($data['check-out'] ?? null),
                'notice'             => $strOrNull($data['notice'] ?? null),
                'guest_app_url'      => $strOrNull($data['guest-app-url'] ?? null),
                'price_total'        => $priceTotal,
                'price_paid'         => $pricePaid,
                'prepayment_amount'  => $floatOrNull($data['prepayment'] ?? null),
                'prepayment_paid'    => $toBool($data['prepayment-paid'] ?? false),
                'deposit_amount'     => $floatOrNull($data['deposit'] ?? null),
                'deposit_paid'       => $toBool($data['deposit-paid'] ?? false),
                'payment_status'     => $paymentStatus,
                'internal_status'    => $internalStatus,
                'source_created_at'  => $tsOrNull($data['created-at'] ?? null),
                'source_updated_at'  => $tsOrNull($data['modified-at'] ?? $data['modifiedAt'] ?? null),
                'synced_at'          => now(),
                'raw_json'           => $data,
            ]
        );

        // Count toward guest lifecycle the first time this mirror reaches
        // a checked-out state. lifecycle_counted_at acts as the idempotency
        // flag so re-syncing the same Smoobu reservation never double-counts.
        if (
            $guestId
            && $internalStatus === 'checked-out'
            && !$mirror->lifecycle_counted_at
        ) {
            $g = Guest::withoutGlobalScopes()->find($guestId);
            if ($g) {
                app(GuestLifecycleService::class)->recordStay(
                    $g,
                    $arrivalDate,
                    $departureDate,
                    null,
                    (float) $priceTotal,
                );
                $mirror->update(['lifecycle_counted_at' => now()]);
            }
        }

        return $mirror;
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    /**
     * Send booking confirmation email + membership invitation email.
     * Wrapped in try/catch so email failures never break the booking flow.
     *
     * Skipped entirely when booking_mock_mode=true — the UI hint on the
     * Settings → Booking page promises "no charges or emails" for mock
     * bookings so staff can test the full flow against real members
     * without spamming their inboxes.
     */
    private function sendBookingEmails(array $guest, array $payload, array $response, ?int $orgId): void
    {
        $email = $guest['email'] ?? null;
        if (!$email) return;

        $mockMode = $this->resolveSetting($orgId, 'booking_mock_mode', 'false');
        if ($mockMode === 'true' || $mockMode === true) {
            \Illuminate\Support\Facades\Log::info('Mock mode — skipping booking emails', [
                'org_id' => $orgId,
                'email'  => $email,
            ]);
            return;
        }

        $guestName = trim(($guest['first_name'] ?? '') . ' ' . ($guest['last_name'] ?? '')) ?: 'Guest';
        $hotelName = $this->resolveHotelName($orgId);
        $supportEmail = $this->resolveSetting($orgId, 'support_email', 'support@hotel-tech.ai');

        // Load policies for the confirmation email
        $policiesJson = $this->resolveSetting($orgId, 'booking_policies', '');
        $policies = $policiesJson ? (json_decode($policiesJson, true) ?: []) : [];

        // Resolve extras with names for the confirmation email
        $extrasBreakdown = [];
        $selectedExtras = $payload['extras'] ?? [];
        if (!empty($selectedExtras)) {
            $allExtras = collect($this->loadExtrasConfig());
            foreach ($selectedExtras as $item) {
                $def = $allExtras->firstWhere('id', $item['id'] ?? '');
                if ($def) {
                    $qty = max(1, (int) ($item['quantity'] ?? 1));
                    $unitPrice = (float) ($def['price'] ?? 0);
                    $extrasBreakdown[] = [
                        'name' => $def['name'] ?? 'Extra',
                        'quantity' => $qty,
                        'total' => $unitPrice * $qty,
                    ];
                }
            }
        }

        // 1) Booking Confirmation Email
        try {
            Mail::to($email)->send(new BookingConfirmationMail(
                guestName: $guestName,
                hotelName: $hotelName,
                bookingReference: $response['booking_reference'] ?? $response['reservation_id'] ?? '—',
                unitName: $payload['unit_name'] ?? 'Room',
                checkIn: $payload['check_in'],
                checkOut: $payload['check_out'],
                nights: (int) ($payload['nights'] ?? 1),
                adults: (int) ($payload['adults'] ?? 2),
                children: (int) ($payload['children'] ?? 0),
                roomTotal: (float) ($payload['room_total'] ?? 0),
                extrasTotal: (float) ($payload['extras_total'] ?? 0),
                grossTotal: (float) ($payload['gross_total'] ?? 0),
                currency: $payload['currency'] ?? 'EUR',
                pricePerNight: (float) ($payload['price_per_night'] ?? 0),
                extras: $extrasBreakdown,
                policies: $policies,
                supportEmail: $supportEmail,
            ));
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Booking confirmation email failed', [
                'email' => $email, 'error' => $e->getMessage(),
            ]);
        }

        // 1b) Admin notification — broadcast the booking to the hotel's
        //     admin team so no reservation slips through unnoticed. Fails
        //     soft: SMTP problems can't break the guest's flow.
        try {
            app(\App\Services\AdminNotificationService::class)->send(
                $orgId,
                new \App\Mail\AdminBookingNotificationMail(
                    kind:             'room',
                    hotelName:        $hotelName,
                    bookingReference: $response['booking_reference'] ?? $response['reservation_id'] ?? '—',
                    guestName:        $guestName,
                    guestEmail:       $email,
                    guestPhone:       $guest['phone'] ?? null,
                    unitName:         $payload['unit_name'] ?? 'Room',
                    checkIn:          $payload['check_in'] ?? null,
                    checkOut:         $payload['check_out'] ?? null,
                    nights:           (int) ($payload['nights'] ?? 1),
                    adults:           (int) ($payload['adults'] ?? 2),
                    children:         (int) ($payload['children'] ?? 0),
                    serviceName:      null,
                    masterName:       null,
                    startAt:          null,
                    durationMinutes:  null,
                    partySize:        null,
                    baseTotal:        (float) ($payload['room_total'] ?? 0),
                    extrasTotal:      (float) ($payload['extras_total'] ?? 0),
                    grossTotal:       (float) ($payload['gross_total'] ?? 0),
                    currency:         $payload['currency'] ?? 'EUR',
                    extras:           $extrasBreakdown,
                    specialRequests:  $payload['special_requests'] ?? null,
                    paymentStatus:    $response['payment_status'] ?? null,
                ),
            );
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Admin room-booking notification failed', [
                'org_id' => $orgId, 'error' => $e->getMessage(),
            ]);
        }

        // 2) Membership Invitation Email — only on first contact.
        //    Skip if `welcomed_at` is already set on the member record. That
        //    flag is stamped here on first send AND backfilled from
        //    users.email_verified_at, so a returning guest who's already
        //    onboarded never receives a duplicate "set your password" email.
        try {
            $member = LoyaltyMember::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->whereHas('user', fn($q) => $q->where('email', $email))
                ->with(['user', 'tier'])
                ->first();

            if ($member && $member->welcomed_at === null) {
                // Generate a verification code so the guest can set their password
                $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

                EmailVerificationCode::create([
                    'email'      => $email,
                    'code'       => $code,
                    'expires_at' => now()->addHours(48),
                ]);

                Mail::to($email)->send(new BookingMembershipMail(
                    guestName: $guestName,
                    hotelName: $hotelName,
                    memberNumber: $member->member_number,
                    tierName: $member->tier?->name ?? 'Bronze',
                    email: $email,
                    code: $code,
                    supportEmail: $supportEmail,
                ));

                // Stamp the welcome so subsequent bookings / service bookings
                // skip this email — the user gets one chance to onboard, not
                // a fresh nag every time they transact.
                $member->forceFill(['welcomed_at' => now()])->save();
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Booking membership email failed', [
                'email' => $email, 'error' => $e->getMessage(),
            ]);
        }
    }

    private function resolveHotelName(?int $orgId): string
    {
        if (!$orgId) return 'Hotel';

        // Try hotel_settings company_name first
        $name = $this->resolveSetting($orgId, 'company_name', '');
        if ($name) return $name;

        // Fall back to organization name
        $org = Organization::withoutGlobalScopes()->find($orgId);
        return $org?->name ?? 'Hotel';
    }

    private function resolveSetting(?int $orgId, string $key, string $default): string
    {
        if (!$orgId) return $default;

        return HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', $key)
            ->value('value') ?? $default;
    }

    private function linkOrCreateGuest(array $guestData, ?int $orgId): ?int
    {
        $email = $guestData['email'] ?? null;
        if (!$email || !$orgId) return null;

        $guest = Guest::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('email', $email)
            ->first();

        if ($guest) return $guest->id;

        $firstName = $guestData['first_name'] ?? '';
        $lastName  = $guestData['last_name'] ?? '';

        $guest = Guest::withoutGlobalScopes()->create([
            'organization_id' => $orgId,
            'first_name'      => $firstName,
            'last_name'       => $lastName,
            'full_name'       => trim("{$firstName} {$lastName}"),
            'email'           => $email,
            'phone'           => $guestData['phone'] ?? null,
            'guest_type'      => 'Individual',
            'lead_source'     => 'Booking Engine',
        ]);

        return $guest->id;
    }

    /**
     * Write a BookingPriceElement row for the room and one per selected extra
     * so the admin booking detail page can render the full price breakdown.
     */
    private function persistPriceElements(BookingMirror $mirror, array $payload, ?int $orgId): void
    {
        $reservationId = (string) ($mirror->reservation_id ?? '');
        $currency      = $payload['currency'] ?? 'EUR';
        $nights        = max(1, (int) ($payload['nights'] ?? 1));
        $sortOrder     = 0;

        // Room (accommodation) line — quantity is nights so admin sees
        // "€120.00 × 3" rather than a flat lump sum.
        $perNight = (float) ($payload['price_per_night']
            ?? (($payload['room_total'] ?? 0) / max(1, $nights)));

        BookingPriceElement::create([
            'organization_id'  => $orgId,
            'booking_mirror_id'=> $mirror->id,
            'reservation_id'   => $reservationId,
            'element_type'     => 'accommodation',
            'name'             => $payload['unit_name'] ?? 'Accommodation',
            'amount'           => round($perNight, 2),
            'quantity'         => $nights,
            'currency_code'    => $currency,
            'sort_order'       => $sortOrder++,
        ]);

        // Extras: re-resolve names + per-unit amounts from the saved settings
        // so the admin sees the same labels the customer picked.
        $extras    = $payload['extras'] ?? [];
        if (empty($extras)) return;

        $adults    = (int) ($payload['adults'] ?? 1);
        $allExtras = collect($this->loadExtrasConfig());

        foreach ($extras as $item) {
            $extraId = $item['id'] ?? null;
            $qty     = max(1, (int) ($item['quantity'] ?? 1));
            $def     = $allExtras->firstWhere('id', $extraId);
            if (!$def) continue;

            $unitPrice = (float) ($def['price'] ?? 0);
            if (($def['type'] ?? 'per_stay') === 'per_guest') {
                $unitPrice *= max(1, $adults);
            }

            BookingPriceElement::create([
                'organization_id'  => $orgId,
                'booking_mirror_id'=> $mirror->id,
                'reservation_id'   => $reservationId,
                'element_type'     => 'extra',
                'name'             => $def['name'] ?? ($def['label'] ?? 'Extra'),
                'amount'           => round($unitPrice, 2),
                'quantity'         => $qty,
                'currency_code'    => $currency,
                'sort_order'       => $sortOrder++,
            ]);
        }
    }

    /**
     * Catalog of extras for the active org. Mirrors the public config()
     * endpoint's resolution order: DB table first, then legacy JSON
     * setting, then hardcoded config. Without this matching, an extra
     * the widget shows from the DB can't be found in calcExtras() and
     * gross_total silently drops to room-only.
     */
    private function loadExtrasConfig(): array
    {
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;

        // Primary source: booking_extras table. Cast id to string so it
        // matches the widget's stringified id payload.
        if ($orgId) {
            $rows = \App\Models\BookingExtra::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('is_active', true)
                ->orderBy('sort_order')
                ->get();
            if ($rows->isNotEmpty()) {
                return $rows->map(fn ($e) => [
                    'id'    => (string) $e->id,
                    'name'  => $e->name,
                    'price' => (float) $e->price,
                    // calcExtras() checks `type` for per_guest pricing;
                    // the DB column is `price_type`, so alias.
                    'type'  => $e->price_type ?? 'per_stay',
                    'price_type' => $e->price_type ?? 'per_stay',
                    'lead_time_hours' => (int) ($e->lead_time_hours ?? 0),
                ])->values()->all();
            }
        }

        // Legacy JSON setting → finally a hardcoded config fallback.
        $json = \App\Models\HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('key', 'booking_extras')
            ->value('value');

        if ($json) {
            $decoded = json_decode($json, true);
            if (is_array($decoded)) return $decoded;
        }
        return config('booking.extras', []);
    }

    /**
     * Reject the request if any selected extra's `lead_time_hours` is
     * larger than (check_in − now). The DB is the source of truth here
     * — the JSON-fallback codepath never had per-extra lead time, so it
     * implicitly returns 0 (no restriction).
     *
     * Throws InvalidArgumentException with the offending extra's name in
     * the message so the widget can surface a clear error to the guest.
     */
    private function assertExtrasMeetLeadTime(array $selected, string $checkIn): void
    {
        if (empty($selected)) return;

        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $ids = collect($selected)->pluck('id')->filter()->map(fn ($id) => (string) $id)->all();
        if (empty($ids)) return;

        // Catalog rows. Cast to string so a numeric or stringified id
        // both line up against `$ids`.
        $rows = \App\Models\BookingExtra::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->whereIn('id', $ids)
            ->get(['id', 'name', 'lead_time_hours']);

        if ($rows->isEmpty()) return;

        $checkInTs = strtotime($checkIn . ' 00:00:00');
        $hoursUntilCheckIn = max(0, (int) (($checkInTs - time()) / 3600));

        foreach ($rows as $row) {
            $required = (int) ($row->lead_time_hours ?? 0);
            if ($required > 0 && $hoursUntilCheckIn < $required) {
                throw new \InvalidArgumentException(
                    "\"{$row->name}\" requires at least {$required}h notice before check-in. Please remove it or pick a later date."
                );
            }
        }
    }

    private function calcExtras(array $extras, int $adults): float
    {
        // Single source of truth — loadExtrasConfig() prefers the
        // booking_extras DB table (what the widget shows) over the legacy
        // JSON setting. Previously this method read JSON only, so
        // DB-table extras silently summed to 0 and the gross_total /
        // Stripe amount dropped to room-only.
        $allExtras = collect($this->loadExtrasConfig());
        $total     = 0.0;

        foreach ($extras as $item) {
            $extraId = (string) ($item['id'] ?? '');
            $qty     = $item['quantity'] ?? 1;
            // Compare as string so a numeric DB id matches the widget's
            // stringified id payload regardless of which side cast it.
            $def     = $allExtras->first(fn ($e) => (string) ($e['id'] ?? '') === $extraId);
            if (!$def) continue;

            $price = (float) ($def['price'] ?? 0);
            $type  = $def['price_type'] ?? $def['type'] ?? 'per_stay';
            if ($type === 'per_guest') {
                $total += $price * $adults * $qty;
            } else {
                $total += $price * $qty;
            }
        }

        return $total;
    }

    private function logSubmission(string $outcome, ?string $failCode, ?string $failMsg, array $data, ?string $requestId, ?string $idempotencyKey, array $response = [], ?int $guestId = null): void
    {
        $payload = $data['hold_token'] ?? null ? ($data['hold'] ?? []) : [];
        $guest   = $data['guest'] ?? [];

        BookingSubmission::create([
            'request_id'        => $requestId,
            'idempotency_key'   => $idempotencyKey,
            'outcome'           => $outcome,
            'failure_code'      => $failCode,
            'failure_message'   => $failMsg,
            'booking_reference' => $response['booking_reference'] ?? null,
            'reservation_id'    => $response['reservation_id'] ?? null,
            'guest_id'          => $guestId,
            'guest_name'        => trim(($guest['first_name'] ?? '') . ' ' . ($guest['last_name'] ?? '')),
            'guest_email'       => $guest['email'] ?? null,
            'guest_phone'       => $guest['phone'] ?? null,
            'unit_id'           => $payload['unit_id'] ?? $data['unit_id'] ?? null,
            'unit_name'         => $payload['unit_name'] ?? null,
            'check_in'          => $payload['check_in'] ?? null,
            'check_out'         => $payload['check_out'] ?? null,
            'adults'            => $payload['adults'] ?? null,
            'children'          => $payload['children'] ?? null,
            'gross_total'       => $payload['gross_total'] ?? $response['gross_total'] ?? null,
            'payment_method'    => $data['payment_method'] ?? null,
            'payload_json'      => $data,
        ]);

        // Hand off failed widget submissions to the unified Inquiries
        // pipeline so staff can manually rescue the booking. We need at
        // least an email to do anything useful with it.
        if ($outcome === 'failure' && !empty($guest['email'])) {
            $this->createInquiryFromFailedSubmission($guest, $payload, $failCode, $failMsg);
        }
    }

    private function createInquiryFromFailedSubmission(array $guest, array $payload, ?string $failCode, ?string $failMsg): void
    {
        try {
            $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;
            if (!$orgId) return;

            // Reuse linkOrCreateGuest so the failed-submission flow goes
            // through the same auto-Bronze + lifecycle hooks as a successful
            // booking — the customer ends up in Members regardless.
            $guestId = $this->linkOrCreateGuest($guest, $orgId);
            if (!$guestId) return;

            $inquiry = \App\Models\Inquiry::create([
                'organization_id' => $orgId,
                'guest_id'        => $guestId,
                'inquiry_type'    => 'Room Reservation',
                'source'          => 'booking_widget_failed',
                'status'          => 'New',
                'priority'        => 'High',
                'check_in'        => $payload['check_in'] ?? null,
                'check_out'       => $payload['check_out'] ?? null,
                'num_adults'      => $payload['adults'] ?? null,
                'num_children'    => $payload['children'] ?? null,
                'room_type_requested' => $payload['unit_name'] ?? null,
                'total_value'     => $payload['gross_total'] ?? null,
                'notes'           => "Booking widget failed: {$failCode} — {$failMsg}",
            ]);

            // Surface a realtime toast so staff know to follow up before the
            // would-be guest goes cold. Hooks the existing realtime poll bus
            // that already drives arrival / inquiry notifications.
            try {
                $guestName = trim(($guest['first_name'] ?? '') . ' ' . ($guest['last_name'] ?? '')) ?: ($guest['email'] ?? 'Unknown');
                $unit      = $payload['unit_name'] ?? null;
                $dates     = ($payload['check_in'] ?? null) && ($payload['check_out'] ?? null)
                    ? " ({$payload['check_in']} → {$payload['check_out']})"
                    : '';
                app(\App\Services\RealtimeEventService::class)->dispatch(
                    'inquiry',
                    'Booking widget failed — follow up',
                    "{$guestName}" . ($unit ? " · {$unit}" : '') . $dates,
                    ['inquiry_id' => $inquiry->id, 'reason' => $failCode]
                );
            } catch (\Throwable $notifyError) {
                \Illuminate\Support\Facades\Log::warning('Realtime dispatch failed for rescue inquiry', [
                    'error' => $notifyError->getMessage(),
                ]);
            }
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Failed to create rescue inquiry from booking failure', [
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function mapBookingState($status): string
    {
        return match ($status) {
            1       => 'confirmed',
            2       => 'cancelled',
            default => 'new',
        };
    }

    private function getUnitsConfig(): array
    {
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;

        // Primary: booking_rooms table
        $dbRooms = \App\Models\BookingRoom::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
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
