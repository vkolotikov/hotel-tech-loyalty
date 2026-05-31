<?php

namespace App\Console\Commands;

use App\Models\Organization;
use App\Services\SmoobuClient;
use Illuminate\Console\Command;

/**
 * Probe Smoobu's createReservation endpoint to surface the EXACT error
 * message Smoobu returns when our booking flow fails.
 *
 * Defaults to DRY-RUN — builds a minimal valid payload but does NOT
 * actually call Smoobu. Prints the payload + the channel-id resolution
 * chain so the operator can see whether resolveDirectChannelId() picked
 * a sensible channel.
 *
 * With --commit:
 *   1. Actually POSTs to Smoobu /reservations
 *   2. If success, captures the new reservation id
 *   3. IMMEDIATELY deletes it via cancelReservation to keep the calendar
 *      clean (best-effort — channel-managed reservations may not be
 *      cancellable from the API, which we log)
 *   4. Prints the verbatim Smoobu response (success or error)
 *
 * This is the smoking-gun test — if it rejects, we'll see WHY (channel
 * permission, missing field, apartment_id mismatch, etc.) without losing
 * a real customer booking.
 *
 * Usage:
 *   # Minimal known-good payload (dry-run)
 *   php artisan diag:smoobu-create-probe --org=12 --apartment-id=1001 --from=2026-06-10 --to=2026-06-12
 *
 *   # Minimal payload, actually hit Smoobu (auto-cleans up)
 *   php artisan diag:smoobu-create-probe --org=12 --apartment-id=1001 --from=2026-06-10 --to=2026-06-12 --commit
 *
 *   # Replay production confirm() payload shape verbatim — adds country, language='en',
 *   # type='reservation', assistant-notice, drops channelId when 0, array_filter cleanup.
 *   # Use this to reproduce a real customer rejection without a real customer booking.
 *   php artisan diag:smoobu-create-probe --org=12 --apartment-id=1001 --from=2026-06-10 --to=2026-06-12 --like-production --commit
 *
 *   # Override price fields to match a specific failing production payload
 *   php artisan diag:smoobu-create-probe --org=12 --apartment-id=1001 --from=2026-06-10 --to=2026-06-12 --like-production --price=560 --price-paid=560 --price-status=1 --commit
 */
class DiagSmoobuCreateProbe extends Command
{
    protected $signature = 'diag:smoobu-create-probe
                            {--org= : Organization id (required)}
                            {--apartment-id= : Smoobu apartment id to book (required)}
                            {--from= : Arrival date YYYY-MM-DD (required)}
                            {--to= : Departure date YYYY-MM-DD (required)}
                            {--guest-email= : Guest email (defaults to qa-probe@hotel-tech.ai)}
                            {--like-production : Replay production confirm() payload shape verbatim (adds country, language, type=reservation, assistant-notice, channelId-drop-when-zero, array_filter cleanup)}
                            {--price= : Override price field (default 1.00)}
                            {--price-paid= : Override price-paid field (default 0.00)}
                            {--price-status= : Override priceStatus field (default 0)}
                            {--commit : Actually hit Smoobu (otherwise dry-run). Cleans up by deleting the reservation it created.}';

    protected $description = 'Probe Smoobu createReservation to surface the verbatim rejection reason.';

    public function handle(SmoobuClient $smoobu): int
    {
        $orgId = (int) $this->option('org');
        $apartmentId = $this->option('apartment-id');
        $from = $this->option('from');
        $to = $this->option('to');
        $guestEmail = $this->option('guest-email') ?: 'qa-probe@hotel-tech.ai';
        $commit = (bool) $this->option('commit');
        $likeProduction = (bool) $this->option('like-production');

        // Price overrides — null when not passed, otherwise cast to the right shape.
        $priceOverride = $this->option('price');
        $pricePaidOverride = $this->option('price-paid');
        $priceStatusOverride = $this->option('price-status');
        $price = $priceOverride !== null ? (float) $priceOverride : 1.00;
        $pricePaid = $pricePaidOverride !== null ? (float) $pricePaidOverride : 0.00;
        $priceStatus = $priceStatusOverride !== null ? (int) $priceStatusOverride : 0;

        // ── Validate inputs ──
        if (!$orgId) {
            $this->error('--org=<id> is required.');
            return self::FAILURE;
        }
        if (!$apartmentId) {
            $this->error('--apartment-id=<N> is required (Smoobu apartment id, NOT the local booking_rooms.id).');
            return self::FAILURE;
        }
        if (!$from || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) {
            $this->error('--from=YYYY-MM-DD is required.');
            return self::FAILURE;
        }
        if (!$to || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
            $this->error('--to=YYYY-MM-DD is required.');
            return self::FAILURE;
        }
        if (strtotime($to) <= strtotime($from)) {
            $this->error('--to must be strictly after --from.');
            return self::FAILURE;
        }

        $org = Organization::find($orgId);
        if (!$org) {
            $this->error("Organization {$orgId} not found.");
            return self::FAILURE;
        }

        // Bind tenant so SmoobuClient picks up THIS org's API key.
        app()->instance('current_organization_id', $orgId);

        // ── Print the channel context FIRST ──
        // Single probe run now shows both the channel table (with the
        // ✅/❌/⚠ verdict against the admin-pinned channel id) AND the
        // rejection reason from the create call below. That's the
        // smoking-gun pair an operator needs to see together.
        $this->info('═══ Smoobu channel context (diag:smoobu-channels) ═══');
        $this->call('diag:smoobu-channels', ['--org' => $orgId]);
        $this->newLine();

        // ── Resolve channel id (and explain the chain) ──
        $resolvedChannelId = $smoobu->resolveDirectChannelId();
        $configuredChannelId = $smoobu->channelId();

        $channelResolutionChain = [];
        if (!empty($configuredChannelId) && (int) $configuredChannelId > 0) {
            $channelResolutionChain[] = "Path 1: configured booking_smoobu_channel_id={$configuredChannelId} (admin-pinned)";
        } else {
            $channelResolutionChain[] = "Path 1: no admin-configured channel id (booking_smoobu_channel_id is empty/0)";
            if ($resolvedChannelId > 0) {
                $channelResolutionChain[] = "Path 2: auto-resolved via GET /channels → channel id {$resolvedChannelId}";
            } else {
                $channelResolutionChain[] = "Path 2: GET /channels found NO usable direct/manual channel — resolved to 0 ⚠";
                $channelResolutionChain[] = "Path 3: returning 0 — Smoobu will reject the create";
            }
        }

        // ── Build the createReservation payload ──
        // Field names match Smoobu's documented createReservation
        // contract — apartmentId (NOT arrivalApartment), price-paid
        // (legacy kebab amount) + priceStatus (docs-compliant 0/1
        // paid flag). Mirrors BookingEngineService::confirm() so this
        // probe surfaces the exact same rejection paths.
        //
        // Two payload shapes:
        //   Default (minimal)   — known-good baseline. Always sends channelId
        //                         even when 0 (so we can see Smoobu's reaction).
        //   --like-production    — verbatim replay of BookingEngineService::confirm()'s
        //                         single-room payload: adds country, language='en',
        //                         type='reservation' (avoids Blocked Channel default),
        //                         assistant-notice; channelId dropped when 0;
        //                         array_filter strips null/empty at the end.
        if ($likeProduction) {
            $payload = [
                'apartmentId'      => (int) $apartmentId,
                'arrivalDate'      => $from,
                'departureDate'    => $to,
                'firstName'        => 'QA',
                'lastName'         => 'Probe',
                'email'            => $guestEmail,
                'phone'            => '+10000000000',
                'country'          => 'LV',
                'adults'           => 1,
                'children'         => 0,
                'price'            => $price,
                'price-paid'       => $pricePaid,
                'priceStatus'      => $priceStatus,
                'language'         => 'en',
                'notice'           => 'Internal diagnostic probe — safe to delete. Sent by diag:smoobu-create-probe (--like-production).',
                'assistant-notice' => 'HotelTech booking widget',
                'type'             => 'reservation',
            ];
            // Match production's conditional include — channelId only when > 0.
            // Production never sends channelId=0 (would trigger Smoobu's default
            // Blocked Channel behaviour on some accounts).
            if ($resolvedChannelId > 0) {
                $payload['channelId'] = $resolvedChannelId;
            }
            // Production's final cleanup step — drop null + empty-string values.
            $payload = array_filter($payload, fn ($v) => $v !== null && $v !== '');
        } else {
            $payload = [
                'arrivalDate'      => $from,
                'departureDate'    => $to,
                'apartmentId'      => (int) $apartmentId,
                'channelId'        => $resolvedChannelId,
                'firstName'        => 'QA',
                'lastName'         => 'Probe',
                'email'            => $guestEmail,
                'phone'            => '+10000000000',
                'adults'           => 1,
                'children'         => 0,
                'price'            => $price,
                'price-paid'       => $pricePaid,
                'priceStatus'      => $priceStatus,
                'notice'           => 'Internal diagnostic probe — safe to delete. Sent by diag:smoobu-create-probe.',
            ];
        }

        $modeLabel = $likeProduction ? 'LIKE-PRODUCTION (replays confirm() payload shape verbatim)' : 'MINIMAL (known-good baseline)';
        $this->info("Probe target: org={$orgId} ({$org->name}), apartment={$apartmentId}, {$from} → {$to}");
        $this->line("Mode: {$modeLabel}");
        $this->newLine();

        $this->info('═══ Channel ID resolution ═══');
        foreach ($channelResolutionChain as $step) {
            $this->line('  • ' . $step);
        }
        $this->newLine();

        $this->info('═══ Smoobu createReservation payload ═══');
        $this->line(json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        $this->newLine();

        if (!$commit) {
            $this->warn('Dry-run mode (no --commit). Payload above WOULD be sent to Smoobu POST /reservations.');
            $this->line('Re-run with --commit to actually hit Smoobu (probe will auto-delete on success).');
            return self::SUCCESS;
        }

        // ── --commit path: actually hit Smoobu, then clean up ──
        if ($smoobu->isMock()) {
            $this->warn('SmoobuClient is in MOCK mode — no real API call. Configure booking_smoobu_api_key + enable Smoobu integration to probe live.');
            return self::FAILURE;
        }

        $this->info('═══ Calling Smoobu POST /reservations ═══');

        $reservationId = null;
        $createResponse = null;
        $createError = null;

        try {
            $createResponse = $smoobu->createReservation($payload);
            $reservationId = $createResponse['id'] ?? null;
        } catch (\Throwable $e) {
            $createError = $e;
        }

        if ($createError) {
            $this->newLine();
            $this->error('Smoobu createReservation: REJECTED');
            $this->newLine();
            $this->line('Exception class: ' . get_class($createError));
            $this->line('Verbatim message: ' . $createError->getMessage());
            $this->newLine();

            // The SmoobuClient::request() helper logs the full response
            // body before throwing the wrapped RuntimeException — the
            // message often includes the HTTP status but not the body.
            // Point the operator at the log for the full body.
            $this->warn('Full HTTP response body was logged via Log::error("Smoobu POST /reservations failed", …).');
            $this->warn('Check storage/logs/laravel.log for the most recent "Smoobu POST /reservations failed" entry.');
            return self::FAILURE;
        }

        $this->newLine();
        $this->info('Smoobu createReservation: OK');
        $this->line('New reservation id: ' . ($reservationId ?? '<missing>'));
        $this->newLine();
        $this->line('Response:');
        $this->line(json_encode($createResponse, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

        // ── Clean up — cancel the reservation we just created ──
        if (!$reservationId) {
            $this->newLine();
            $this->warn('No reservation id returned — cannot auto-clean. If a reservation appeared in Smoobu, delete it manually.');
            return self::SUCCESS;
        }

        $this->newLine();
        $this->info('═══ Cleanup: calling Smoobu DELETE /reservations/' . $reservationId . ' ═══');
        try {
            $cancelResponse = $smoobu->cancelReservation((string) $reservationId);
            $this->info('Cleanup OK — probe reservation deleted.');
            $this->line('Cancel response: ' . json_encode($cancelResponse, JSON_UNESCAPED_SLASHES));
        } catch (\Throwable $cancelErr) {
            $this->newLine();
            $this->warn('Cleanup FAILED — probe reservation may remain in Smoobu.');
            $this->line('Cancel error: ' . $cancelErr->getMessage());
            $this->line('Manual cleanup: delete reservation ' . $reservationId . ' in https://login.smoobu.com/en/dashboard');
            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
