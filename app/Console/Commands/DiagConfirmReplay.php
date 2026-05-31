<?php

namespace App\Console\Commands;

use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Models\Organization;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Console\Command;

/**
 * Walks through EVERY step of BookingEngineService::confirm() for a given
 * hold without actually creating anything in Smoobu or writing a
 * BookingMirror. Tells the operator EXACTLY which step would fail and why.
 *
 * Why this exists: when /confirm blows up after Stripe charged the guest,
 * the laravel.log line tells you a step failed but not which one or
 * why. Re-running confirm() against the same hold to reproduce is
 * impossible (the hold has been consumed, and double-confirming a real PI
 * double-bills the guest). This replay walks the same flow read-only.
 *
 * Usage:
 *   php artisan diag:confirm-replay vKZV8tpHsFbYOLgV3rEoP6OyvLmIhL4Y0J5vqrk9yHF7GArY
 *   php artisan diag:confirm-replay <token> --org=12
 *   php artisan diag:confirm-replay <token> --json
 *
 * --dry-run is implicit — this command NEVER writes to the database
 * and NEVER POSTs to Smoobu. Read-only by construction.
 */
class DiagConfirmReplay extends Command
{
    protected $signature = 'diag:confirm-replay
                            {hold_token : BookingHold.hold_token to replay}
                            {--org= : Organization id (auto-derived from the hold if omitted)}
                            {--dry-run : No-op flag — this command never writes (kept for shell-script clarity)}
                            {--json : Output machine-readable JSON instead of a human table}';

    protected $description = 'Replay BookingEngineService::confirm() read-only and report which step would fail.';

    /** Numbered steps + a status per step. Used for both the table render
     *  and the JSON output. */
    private array $steps = [];

    /** First step that returned FAIL, or null when every step passed.
     *  Drives the bottom-line verdict. */
    private ?int $firstFailedStep = null;

    public function handle(SmoobuClient $smoobu, StripeService $stripe): int
    {
        $holdToken = (string) $this->argument('hold_token');
        $orgOpt    = $this->option('org');
        $asJson    = (bool) $this->option('json');

        // ── Step 1: lookup hold ──────────────────────────────────────
        // We do this BEFORE binding the org so we can support callers
        // who don't know the org but do have the hold token. If --org
        // is omitted we read it off the hold row itself.
        $hold = BookingHold::withoutGlobalScopes()
            ->where('hold_token', $holdToken)
            ->first();

        if (!$hold) {
            $this->recordStep(1, 'Look up BookingHold by token', false, 'hold not found');
            $this->renderOutput($asJson);
            return self::FAILURE;
        }

        $this->recordStep(1, 'Look up BookingHold by token', true,
            "hold_id={$hold->id}, org={$hold->organization_id}, status={$hold->status}");

        // Bind tenant context now that we know the org — SmoobuClient,
        // StripeService, and any global-scoped models all read this.
        $orgId = $orgOpt !== null ? (int) $orgOpt : (int) $hold->organization_id;
        if ($orgId) {
            app()->instance('current_organization_id', $orgId);
        }

        $payload = is_array($hold->payload_json) ? $hold->payload_json : [];

        // Combo holds take a different confirm() branch — this command's
        // step model is single-room. Flag and continue with a best-effort
        // walkthrough for the first room, but warn the operator that
        // they're seeing a partial picture.
        $isCombo = !empty($payload['is_combo']);
        if ($isCombo) {
            $this->warn('Note: this hold is a multi-room combo. Replaying step model against the FIRST room only.');
        }

        // Resolve the apartment + dates the same way confirm() would.
        $apartmentId = $isCombo
            ? ($payload['rooms'][0]['unit_id'] ?? null)
            : ($payload['unit_id'] ?? null);
        $checkIn  = $payload['check_in']  ?? null;
        $checkOut = $payload['check_out'] ?? null;

        // ── Step 2: not expired ──────────────────────────────────────
        $now = now();
        if (!$hold->expires_at || $hold->expires_at->isPast()) {
            $this->recordStep(2, 'Hold not expired', false,
                'expired at ' . ($hold->expires_at?->toIso8601String() ?? 'NULL')
                . ', now is ' . $now->toIso8601String());
        } else {
            $this->recordStep(2, 'Hold not expired', true,
                'expires_at=' . $hold->expires_at->toIso8601String() . ' (in ' . $now->diffForHumans($hold->expires_at, ['parts' => 2]) . ')');
        }

        // ── Step 3: not consumed ─────────────────────────────────────
        if ($hold->status !== 'active') {
            $this->recordStep(3, 'Hold not consumed', false,
                "status='{$hold->status}' (consumed/cancelled — confirm() rejects via isActive())");
        } else {
            $this->recordStep(3, 'Hold not consumed', true, "status='active'");
        }

        // ── Step 4: Stripe PaymentIntent matches ─────────────────────
        // Hold itself doesn't carry the PI id — confirm() reads it off
        // $data['payment_intent_id'] (controller-passed). We expose the
        // same field via payload_json['payment_intent_id'] if a previous
        // /payment-intent call stamped it (recent codepath), OR fall
        // back to "no PI on file" which is informational — confirm()
        // would still work but as an unpaid/manual booking.
        $piId = $payload['payment_intent_id'] ?? null;
        if (!$piId) {
            // Try the most-recent BookingMirror with this org's PI on
            // any pending mirror that links back to this hold's unit
            // — best-effort, only used when payload didn't stamp the PI.
            // Skipped silently if nothing useful is found.
            $this->recordStep(4, 'Stripe PaymentIntent matches', true,
                'no payment_intent_id on hold (unpaid/manual flow — confirm() would skip PI check)');
        } else {
            try {
                $pi = $stripe->retrievePaymentIntent($piId);
                $status = $pi->status ?? 'unknown';
                if (in_array($status, ['succeeded', 'requires_capture'], true)) {
                    $this->recordStep(4, 'Stripe PaymentIntent matches', true,
                        "pi={$piId}, status={$status}, amount=" . (($pi->amount ?? 0) / 100) . ' ' . strtoupper($pi->currency ?? '?'));
                } else {
                    $this->recordStep(4, 'Stripe PaymentIntent matches', false,
                        "PI status is '{$status}' (expected succeeded or requires_capture)");
                }
            } catch (\Throwable $e) {
                $this->recordStep(4, 'Stripe PaymentIntent matches', false,
                    'Stripe retrieve threw: ' . $e->getMessage());
            }
        }

        // ── Step 5: local inventory check ────────────────────────────
        // Mirrors the in-lock query inside confirm() — same filters,
        // same scope-bypass, same date predicate. PRINTS overlapping
        // rows so the operator can see WHO is in the way.
        if (!$apartmentId || !$checkIn || !$checkOut) {
            $this->recordStep(5, 'Local inventory check', false,
                'cannot run — payload missing unit_id / check_in / check_out');
        } else {
            try {
                $overlapping = BookingMirror::withoutGlobalScopes()
                    ->where('organization_id', $orgId)
                    ->where('apartment_id', $apartmentId)
                    ->whereNotIn('booking_state', ['cancelled'])
                    ->where(function ($q) {
                        $q->whereNull('internal_status')->orWhereNotIn('internal_status', ['cancelled']);
                    })
                    ->where('arrival_date', '<', $checkOut)
                    ->where('departure_date', '>', $checkIn)
                    ->get([
                        'id', 'reservation_id', 'booking_reference', 'apartment_id',
                        'arrival_date', 'departure_date', 'booking_state', 'internal_status',
                        'guest_name', 'guest_email', 'stripe_payment_intent_id',
                    ]);

                // Resolve inventory cap so a single overlap on a 2-key
                // room doesn't flag a false positive.
                $room = \App\Models\BookingRoom::withoutGlobalScopes()
                    ->where('organization_id', $orgId)
                    ->where(function ($q) use ($apartmentId) {
                        $q->where('pms_id', $apartmentId)->orWhere('id', $apartmentId);
                    })
                    ->first();
                $inventory = max(1, (int) ($room->inventory_count ?? 1));

                $detail = "found {$overlapping->count()} overlapping row(s), inventory_count={$inventory}";
                if ($overlapping->isNotEmpty()) {
                    $rows = $overlapping->map(fn ($m) => [
                        'id'                    => $m->id,
                        'reservation_id'        => $m->reservation_id,
                        'booking_reference'     => $m->booking_reference,
                        'arrival_date'          => optional($m->arrival_date)->toDateString(),
                        'departure_date'        => optional($m->departure_date)->toDateString(),
                        'booking_state'         => $m->booking_state,
                        'internal_status'       => $m->internal_status,
                        'guest_name'            => $m->guest_name,
                        'guest_email'           => $m->guest_email,
                        'stripe_payment_intent' => $m->stripe_payment_intent_id,
                    ])->all();
                    $detail .= "\n      overlapping_rows=" . json_encode($rows, JSON_UNESCAPED_SLASHES);
                }

                if ($overlapping->count() >= $inventory) {
                    $this->recordStep(5, 'Local inventory check', false,
                        "{$detail} — confirm() throws 'no longer available'");
                } else {
                    $this->recordStep(5, 'Local inventory check', true, $detail);
                }
            } catch (\Throwable $e) {
                $this->recordStep(5, 'Local inventory check', false, 'query threw: ' . $e->getMessage());
            }
        }

        // ── Step 6: live Smoobu recheck ──────────────────────────────
        // confirm() uses getRates() to ask "is this unit available NOW
        // for these dates" — we mirror that, plus pull listReservations
        // around the window so the operator can SEE what's there.
        if (!$apartmentId || !$checkIn || !$checkOut) {
            $this->recordStep(6, 'Live Smoobu recheck', false,
                'cannot run — payload missing unit_id / check_in / check_out');
        } else {
            try {
                if ($smoobu->isMock()) {
                    $this->recordStep(6, 'Live Smoobu recheck', true,
                        'SmoobuClient is in MOCK mode — recheck would short-circuit available=true in confirm()');
                } else {
                    // Pull the same /rates view confirm() uses for its
                    // hard-stop check.
                    $liveRates = $smoobu->getRates($checkIn, $checkOut, [$apartmentId]);
                    $liveData = $liveRates['data'] ?? $liveRates;
                    $unitLive = $liveData[$apartmentId] ?? null;
                    $available = is_array($unitLive) ? (bool) ($unitLive['available'] ?? false) : null;

                    // Plus the actual reservation list in a slightly
                    // wider window so the operator can spot the OTA
                    // booking that snuck in.
                    $windowFrom = date('Y-m-d', strtotime($checkIn . ' -2 days'));
                    $windowTo   = date('Y-m-d', strtotime($checkOut . ' +2 days'));
                    $listResp = $smoobu->listReservations([
                        'from'                 => $windowFrom,
                        'to'                   => $windowTo,
                        'showCancellation'     => 1,
                        'includePriceElements' => 0,
                        'pageSize'             => 50,
                    ]);
                    $allBookings = $listResp['bookings'] ?? [];
                    $relevant = array_values(array_filter($allBookings, function ($b) use ($apartmentId, $checkIn, $checkOut) {
                        $bAptId = (string) ($b['apartment']['id'] ?? '');
                        if ($bAptId !== (string) $apartmentId) return false;
                        $bArrival   = $b['arrival']   ?? null;
                        $bDeparture = $b['departure'] ?? null;
                        if (!$bArrival || !$bDeparture) return false;
                        // Overlap = bArrival < checkOut AND bDeparture > checkIn
                        return $bArrival < $checkOut && $bDeparture > $checkIn;
                    }));

                    $rows = array_map(fn ($b) => [
                        'id'         => $b['id'] ?? null,
                        'type'       => $b['type'] ?? null,
                        'arrival'    => $b['arrival'] ?? null,
                        'departure'  => $b['departure'] ?? null,
                        'channel'    => $b['channel']['name'] ?? null,
                        'guest'      => $b['guest-name'] ?? ($b['first-name'] ?? '') . ' ' . ($b['last-name'] ?? ''),
                    ], $relevant);

                    $detail = 'rates-available=' . var_export($available, true)
                        . ", smoobu_window={$windowFrom}..{$windowTo}, overlapping_reservations=" . count($rows);
                    if (!empty($rows)) {
                        $detail .= "\n      reservations=" . json_encode($rows, JSON_UNESCAPED_SLASHES);
                    }

                    // Two failure shapes mirror confirm():
                    //   1. rates explicitly says unavailable → hard fail
                    //   2. an active (non-cancellation) overlap exists → hard fail
                    $hasActiveOverlap = count(array_filter($relevant, fn ($b) =>
                        ($b['type'] ?? 'reservation') !== 'cancellation'
                    )) > 0;

                    if ($available === false || $hasActiveOverlap) {
                        $this->recordStep(6, 'Live Smoobu recheck', false,
                            "{$detail} — confirm() would throw 'just booked through another channel'");
                    } else {
                        $this->recordStep(6, 'Live Smoobu recheck', true, $detail);
                    }
                }
            } catch (\Throwable $e) {
                // confirm() classifies any throw from getRates as a
                // transient Smoobu outage and fails closed with 503.
                $this->recordStep(6, 'Live Smoobu recheck', false,
                    'Smoobu API threw: ' . $e->getMessage() . ' — confirm() would fail closed via SmoobuUnavailable → HTTP 503');
            }
        }

        // ── Step 7: Smoobu createReservation dry-run ─────────────────
        // Build the same payload confirm() builds. Print it. DO NOT POST.
        try {
            $guest = $payload['guest'] ?? [];
            $grossTotal = (float) ($payload['gross_total'] ?? 0);
            $piIdForPayload = $payload['payment_intent_id'] ?? null;
            $isPaid = (($payload['payment_status'] ?? null) === 'paid') || !empty($piIdForPayload);
            $paidAmount = $isPaid ? $grossTotal : 0.0;

            // Channel id — non-strict resolution so a misconfigured org
            // returns 0 without throwing (confirm() uses strict=true and
            // would throw the "Smoobu channel configuration" marker).
            $channelId = 0;
            try {
                if (!$smoobu->isMock()) {
                    $channelId = (int) $smoobu->resolveDirectChannelId(false);
                }
            } catch (\Throwable $e) {
                // Non-strict shouldn't throw; if it did, log it on the step.
                $channelId = 0;
            }

            $smoobuPayload = [
                'apartmentId'      => $apartmentId,
                'arrivalDate'      => $checkIn,
                'departureDate'    => $checkOut,
                'firstName'        => $guest['first_name'] ?? '',
                'lastName'         => $guest['last_name'] ?? '',
                'email'            => $guest['email'] ?? '',
                'phone'            => $guest['phone'] ?? '',
                'country'          => $guest['country'] ?? null,
                'adults'           => (int) ($payload['adults'] ?? 0),
                'children'         => (int) ($payload['children'] ?? 0),
                'price'            => $grossTotal,
                'price-paid'       => $paidAmount,
                'priceStatus'      => $paidAmount > 0 ? 1 : 0,
                'language'         => 'en',
                'notice'           => trim((string) ($guest['special_requests'] ?? '')) ?: null,
                'assistant-notice' => '(elided from dry-run — see BookingEngineService::confirm for the formatter)',
                'type'             => 'reservation',
            ];
            if ($channelId > 0) {
                $smoobuPayload['channelId'] = $channelId;
            }
            $smoobuPayload = array_filter($smoobuPayload, fn ($v) => $v !== null && $v !== '');

            // Well-formedness checks — what Smoobu's validator typically
            // rejects on minimum-viable contract.
            $issues = [];
            foreach (['apartmentId', 'arrivalDate', 'departureDate', 'firstName', 'lastName', 'email', 'price'] as $required) {
                if (!isset($smoobuPayload[$required]) || $smoobuPayload[$required] === '' || $smoobuPayload[$required] === null) {
                    $issues[] = "missing/empty {$required}";
                }
            }
            if ($channelId === 0 && !$smoobu->isMock()) {
                $issues[] = 'channel id resolved to 0 — confirm() runs in strict mode and would throw "Smoobu channel configuration"';
            }

            $detail = 'payload=' . json_encode($smoobuPayload, JSON_UNESCAPED_SLASHES);
            if (!empty($issues)) {
                $detail .= "\n      issues=" . json_encode($issues, JSON_UNESCAPED_SLASHES);
                $this->recordStep(7, 'Smoobu createReservation dry-run', false, $detail);
            } else {
                $this->recordStep(7, 'Smoobu createReservation dry-run', true, $detail);
            }
        } catch (\Throwable $e) {
            $this->recordStep(7, 'Smoobu createReservation dry-run', false, 'payload build threw: ' . $e->getMessage());
        }

        // ── Step 8: BookingMirror create() params dry-run ────────────
        try {
            $guest = $payload['guest'] ?? [];
            $piIdForMirror = $payload['payment_intent_id'] ?? null;
            $paymentStatus = $payload['payment_status'] ?? ($piIdForMirror ? 'paid' : null);
            $paymentMethod = $payload['payment_method'] ?? null;
            $grossTotal = (float) ($payload['gross_total'] ?? 0);

            $mirrorParams = [
                'organization_id'           => $orgId,
                'reservation_id'            => '<from Smoobu response>',
                'booking_reference'         => '<from Smoobu response>',
                'booking_type'              => 'reservation',
                'booking_state'             => 'confirmed',
                'apartment_id'              => $apartmentId,
                'apartment_name'            => $payload['unit_name'] ?? null,
                'channel_name'              => 'Website',
                'guest_id'                  => '<from linkOrCreateGuest()>',
                'guest_name'                => trim(($guest['first_name'] ?? '') . ' ' . ($guest['last_name'] ?? '')),
                'guest_email'               => $guest['email'] ?? null,
                'guest_phone'               => $guest['phone'] ?? null,
                'adults'                    => (int) ($payload['adults'] ?? 0),
                'children'                  => (int) ($payload['children'] ?? 0),
                'arrival_date'              => $checkIn,
                'departure_date'            => $checkOut,
                'price_total'               => $grossTotal,
                'price_paid'                => $paymentStatus === 'paid' ? $grossTotal : null,
                'payment_status'            => $paymentStatus,
                'payment_method'            => $paymentMethod,
                'stripe_payment_intent_id'  => $piIdForMirror,
                'internal_status'           => '<confirmed or pending_pms_sync depending on PMS result>',
                'synced_at'                 => '<now() if Smoobu POST succeeded, null otherwise>',
            ];

            $this->recordStep(8, 'Build BookingMirror create() params', true,
                'params=' . json_encode($mirrorParams, JSON_UNESCAPED_SLASHES));
        } catch (\Throwable $e) {
            $this->recordStep(8, 'Build BookingMirror create() params', false, 'param build threw: ' . $e->getMessage());
        }

        $this->renderOutput($asJson);
        return $this->firstFailedStep === null ? self::SUCCESS : self::FAILURE;
    }

    /** Record a step result + track the first failure for the verdict. */
    private function recordStep(int $n, string $name, bool $pass, string $detail): void
    {
        $this->steps[] = [
            'step'   => $n,
            'name'   => $name,
            'status' => $pass ? 'PASS' : 'FAIL',
            'detail' => $detail,
        ];
        if (!$pass && $this->firstFailedStep === null) {
            $this->firstFailedStep = $n;
        }
    }

    /** Render either a human table or machine-readable JSON. */
    private function renderOutput(bool $asJson): void
    {
        $verdict = $this->firstFailedStep === null
            ? 'confirm() would SUCCEED'
            : "confirm() would FAIL at step {$this->firstFailedStep}: " . $this->steps[$this->firstFailedStep - 1]['detail'];

        if ($asJson) {
            $this->line(json_encode([
                'verdict'           => $verdict,
                'first_failed_step' => $this->firstFailedStep,
                'steps'             => $this->steps,
            ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
            return;
        }

        $this->newLine();
        $this->info('═══ Replay of BookingEngineService::confirm() ═══');
        $this->newLine();

        $this->table(
            ['#', 'Step', 'Status', 'Detail'],
            array_map(fn ($s) => [
                $s['step'],
                $s['name'],
                $s['status'],
                // Wrap long detail strings so the table doesn't blow up.
                $this->wrapDetail($s['detail']),
            ], $this->steps),
        );

        $this->newLine();
        if ($this->firstFailedStep === null) {
            $this->info('Bottom line: ' . $verdict);
        } else {
            $this->error('Bottom line: ' . $verdict);
        }
    }

    /** Wrap detail at ~120 cols so the table stays readable on a normal
     *  terminal. JSON payloads are kept on single lines after wrapping. */
    private function wrapDetail(string $detail, int $width = 120): string
    {
        // Keep explicit newlines (we use them for overlapping_rows /
        // reservations sub-sections) but wrap long single-line chunks.
        $lines = preg_split('/\R/', $detail) ?: [$detail];
        $wrapped = array_map(fn ($line) => wordwrap($line, $width, "\n      ", true), $lines);
        return implode("\n", $wrapped);
    }
}
