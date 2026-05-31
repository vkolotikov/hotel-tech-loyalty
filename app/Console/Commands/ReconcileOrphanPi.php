<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Models\Organization;
use App\Services\BookingEngineService;
use App\Services\BookingRefundService;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Console\Command;

/**
 * Hand-grenade rescue command for a captured Stripe PaymentIntent that has
 * NO matching BookingMirror row — i.e. money was taken from the guest but
 * our /confirm flow never wrote the booking. Triage tool when the orphan-
 * recovery webhook path didn't fire (webhook dropped, signature failed,
 * Stripe event misrouted, etc.). Companion to diag:orphan-stripe-pis,
 * which surfaces the list — this one rescues each.
 *
 * Three rescue paths, picked automatically per PI:
 *
 *   PATH A — booking actually exists in Smoobu
 *     The customer's reservation IS in the PMS (because confirm() failed
 *     AFTER Smoobu's createReservation succeeded — e.g. DB commit blew up,
 *     network drop between Smoobu OK and our local write). We rebuild the
 *     missing BookingMirror manually with the Smoobu reservation_id +
 *     stripe_payment_intent_id, mark it paid, send the guest the missing
 *     confirmation email. NO Stripe action — money already taken, booking
 *     now exists. This is the cheapest, least-destructive outcome and is
 *     what we want for Laima / Arturs.
 *
 *   PATH B — booking is NOT in Smoobu, --auto-refund passed
 *     The €170 succeeded orphan case. The guest has nothing to show for
 *     their money. We refund the PI in full via BookingRefundService when
 *     a mirror exists, or fall back to a direct Stripe refund when there
 *     is none to point at. Audit-logged either way.
 *
 *   PATH C — dry run (default, or --dry-run)
 *     No DB writes, no Stripe calls, no emails. Prints the plan: "WOULD
 *     create BookingMirror linked to Smoobu reservation 12345" or "WOULD
 *     refund €170 — no booking found in Smoobu". Re-run with --apply or
 *     --auto-refund to actually do it.
 *
 * Default to dry-run when neither --apply nor --auto-refund is passed.
 *
 * Match rules (strict — never attach a stranger's booking to an orphan PI):
 *   - Smoobu reservation's apartment.id MUST equal hold's unit_id. Mismatch → REFUSED.
 *   - Smoobu reservation's arrival/departure MUST equal hold's check_in/check_out. Mismatch → REFUSED.
 *   - HIGH confidence: emails match. Auto-proceeds with --apply.
 *   - MEDIUM confidence: hold has no email + name fuzzy-matches. Requires --force in addition to --apply.
 *   - Otherwise: REFUSED. Operator must --auto-refund or fix the data and re-run.
 *
 * Usage:
 *   php artisan booking:reconcile-orphan-pi pi_3Abc... --org-id=12                    # DRY RUN
 *   php artisan booking:reconcile-orphan-pi pi_3Abc... --org-id=12 --apply            # Apply Path A if HIGH-confidence Smoobu match
 *   php artisan booking:reconcile-orphan-pi pi_3Abc... --org-id=12 --apply --force    # Also accept MEDIUM-confidence name-only matches
 *   php artisan booking:reconcile-orphan-pi pi_3Abc... --org-id=12 --apply --auto-refund   # Apply Path A OR Path B
 *   php artisan booking:reconcile-orphan-pi pi_3Abc... --org-id=12 --apply --guest-email=...  # narrow Smoobu match
 */
class ReconcileOrphanPi extends Command
{
    protected $signature = 'booking:reconcile-orphan-pi
                            {intent_id : Stripe PaymentIntent id (pi_...)}
                            {--org-id= : Organization id (required for per-tenant Stripe + Smoobu credentials)}
                            {--guest-email= : Narrow the Smoobu reservation search by guest email}
                            {--auto-refund : When no Smoobu match exists, refund the PI in full}
                            {--apply : Actually perform the action. Without this (and without --auto-refund), command is dry-run}
                            {--force : Required to accept a MEDIUM-confidence (name-only) match. Without it, name-only candidates are refused.}
                            {--dry-run : Force dry-run mode even when --apply / --auto-refund passed (safety override)}';

    protected $description = 'Reconcile a captured Stripe PaymentIntent that has no BookingMirror. Hand-grenade — defaults to dry-run.';

    public function handle(StripeService $stripe, SmoobuClient $smoobu, BookingEngineService $bookings, BookingRefundService $refunds): int
    {
        $intentId = (string) $this->argument('intent_id');
        $orgId    = (int) $this->option('org-id');
        $guestEmailFilter = $this->option('guest-email') ? strtolower(trim((string) $this->option('guest-email'))) : null;
        $autoRefund = (bool) $this->option('auto-refund');
        $apply      = (bool) $this->option('apply');
        $force      = (bool) $this->option('force');
        $forceDry   = (bool) $this->option('dry-run');

        // Default: dry-run unless an explicit "yes do it" flag was passed.
        // --dry-run wins over everything as a safety override.
        $dryRun = $forceDry || (!$apply && !$autoRefund);

        if (!$intentId) {
            $this->error('intent_id argument is required.');
            return self::FAILURE;
        }
        if (!$orgId) {
            $this->error('--org-id=<id> is required so per-tenant Stripe + Smoobu credentials resolve correctly.');
            return self::FAILURE;
        }

        $org = Organization::find($orgId);
        if (!$org) {
            $this->error("Organization {$orgId} not found.");
            return self::FAILURE;
        }

        // Bind tenant so StripeService, SmoobuClient, BookingMirror queries,
        // BookingRefundService, and BookingEngineService::sendBookingEmails
        // all resolve against this org's credentials + data.
        app()->instance('current_organization_id', $orgId);

        if ($dryRun) {
            $this->warn('=== DRY RUN — no DB writes, no Stripe calls, no emails. Pass --apply (and --auto-refund if needed) to actually execute. ===');
        } else {
            $this->warn('=== APPLY MODE — changes will be persisted. This is a hand-grenade command. ===');
        }
        $this->newLine();

        // ── Step 1: Stripe setup + PI lookup ──────────────────────────
        if (!$stripe->isEnabled()) {
            $this->error("Stripe is not configured for org {$orgId}. Check Settings → Integrations.");
            return self::FAILURE;
        }

        try {
            $pi = $stripe->retrievePaymentIntent($intentId);
        } catch (\Throwable $e) {
            $this->error('Stripe PI retrieve failed: ' . $e->getMessage());
            return self::FAILURE;
        }

        $piStatus = (string) $pi->status;
        $piAmount = (int) ($pi->amount ?? 0);
        $piCurrency = strtoupper((string) ($pi->currency ?? ''));
        $piAmountMajor = round($piAmount / 100, 2);

        $this->line("PaymentIntent <info>{$intentId}</info>");
        $this->line("  status     = <comment>{$piStatus}</comment>");
        $this->line("  amount     = {$piAmountMajor} {$piCurrency}");
        $this->line("  created    = " . ($pi->created ? date('c', (int) $pi->created) : '—'));
        $this->line("  metadata   = " . json_encode($this->safeMetadata($pi), JSON_UNESCAPED_SLASHES));
        $this->newLine();

        if ($piStatus !== 'succeeded') {
            $this->warn("PI status is '{$piStatus}', not 'succeeded'. This command rescues CAPTURED orphans only. For uncaptured states use `stripe:cancel-pi` instead.");
            return self::FAILURE;
        }

        // ── Step 2: confirm there's no mirror already ─────────────────
        $existingMirror = BookingMirror::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('stripe_payment_intent_id', $intentId)
            ->first();

        if ($existingMirror) {
            $this->info("BookingMirror #{$existingMirror->id} already exists for this PI (payment_status={$existingMirror->payment_status}). Not an orphan — nothing to reconcile.");
            return self::SUCCESS;
        }

        // ── Step 3: pull the hold token + payload from PI metadata ────
        $meta = $this->safeMetadata($pi);
        $holdToken = $meta['hold_token'] ?? null;
        $hold = null;
        $payload = [];

        if ($holdToken) {
            $hold = BookingHold::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('hold_token', $holdToken)
                ->first();
            if ($hold) {
                $payload = $hold->payload_json ?? [];
                $this->line("Hold <info>{$holdToken}</info> found.");
                $this->line("  unit_id     = " . ($payload['unit_id'] ?? '—'));
                $this->line("  check_in    = " . ($payload['check_in'] ?? '—'));
                $this->line("  check_out   = " . ($payload['check_out'] ?? '—'));
                $this->line("  guest_name  = " . trim(($payload['guest']['first_name'] ?? '') . ' ' . ($payload['guest']['last_name'] ?? '')));
                $this->line("  guest_email = " . ($payload['guest']['email'] ?? '—'));
            } else {
                $this->warn("Hold token '{$holdToken}' from PI metadata not found in booking_holds. Smoobu match will rely on Stripe billing details only.");
            }
        } else {
            $this->warn("No hold_token in PI metadata. Smoobu match will rely on Stripe billing details only.");
        }
        $this->newLine();

        // Pull a sensible guest email + name to use for both Smoobu match
        // and the rescue mirror row. Prefer the hold payload, fall back
        // to Stripe billing details, then to the explicit --guest-email
        // flag the operator passed.
        $billing = $this->stripeBillingDetails($pi);
        $guestEmail = $payload['guest']['email']
            ?? $billing['email']
            ?? $guestEmailFilter
            ?? null;
        $guestName = trim(($payload['guest']['first_name'] ?? '') . ' ' . ($payload['guest']['last_name'] ?? ''))
            ?: ($billing['name'] ?? '');
        $guestPhone = $payload['guest']['phone'] ?? $billing['phone'] ?? null;

        // ── Step 4: search Smoobu for a matching reservation ──────────
        $checkIn  = $payload['check_in']  ?? ($meta['check_in']  ?? null);
        $checkOut = $payload['check_out'] ?? ($meta['check_out'] ?? null);
        // Hold's unit_id is the Smoobu apartment id (pms_id on booking_rooms).
        // This is the load-bearing key for refusing cross-apartment matches.
        $holdUnitId = $payload['unit_id'] ?? ($meta['unit_id'] ?? null);

        $smoobuMatch = null;
        $matchConfidence = null;   // 'high' | 'medium'
        $evaluatedCandidates = [];
        $searchError = null;

        if ($checkIn && $checkOut) {
            $this->line("Searching Smoobu for a reservation matching arrival={$checkIn} apartment_id={$holdUnitId}…");
            try {
                // Smoobu's /reservations supports from/to filters that bound
                // the search by arrival date. A ±2 day window catches any
                // off-by-one between hold-payload date and what got pushed
                // to Smoobu.
                $from = date('Y-m-d', strtotime($checkIn . ' -2 days'));
                $to   = date('Y-m-d', strtotime($checkIn . ' +2 days'));
                $resp = $smoobu->listReservations([
                    'from'     => $from,
                    'to'       => $to,
                    'pageSize' => 50,
                ]);
                $candidates = $resp['bookings'] ?? [];
                $pick = $this->pickSmoobuMatch(
                    $candidates,
                    $guestEmail,
                    $guestName,
                    $checkIn,
                    $checkOut,
                    $holdUnitId,
                );
                $smoobuMatch         = $pick['match'];
                $matchConfidence     = $pick['confidence'];
                $evaluatedCandidates = $pick['evaluated'];
            } catch (\Throwable $e) {
                $searchError = $e->getMessage();
                $this->warn('Smoobu listReservations failed: ' . $e->getMessage() . ' — assuming no match.');
            }
        } else {
            $this->warn('No check_in / check_out available — cannot search Smoobu. Will treat as Path B (no match).');
        }

        // Always show every candidate we considered + WHY each was accepted/skipped/refused.
        // Operator needs this to debug "we expected match X but got nothing / got Y instead."
        if (!empty($evaluatedCandidates)) {
            $this->newLine();
            $this->line('Smoobu candidates evaluated (' . count($evaluatedCandidates) . ' total):');
            foreach ($evaluatedCandidates as $i => $row) {
                $tag = match ($row['disposition']) {
                    'accepted_high'   => '<fg=green>ACCEPTED (HIGH — apartment+email)</>',
                    'accepted_medium' => '<fg=yellow>ACCEPTED (MEDIUM — apartment+name)</>',
                    'refused'         => '<fg=red>REFUSED</>',
                    'skipped'         => '<fg=red>SKIPPED</>',
                    default           => $row['disposition'],
                };
                $this->line(sprintf(
                    '  [%d] %s — res=%s apartment=%s(#%s) guest=%s <%s> arr=%s dep=%s',
                    $i + 1,
                    $tag,
                    (string) ($row['raw']['id'] ?? '—'),
                    (string) ($row['raw']['apartment']['name'] ?? '—'),
                    (string) ($row['raw']['apartment']['id']   ?? '—'),
                    (string) ($row['raw']['guest-name']        ?? '—'),
                    (string) ($row['raw']['email']             ?? '—'),
                    (string) ($row['raw']['arrival']           ?? '—'),
                    (string) ($row['raw']['departure']         ?? '—'),
                ));
                $this->line('       reason: ' . $row['reason']);
            }
        } elseif ($checkIn && $checkOut && !$searchError) {
            $this->line('Smoobu returned 0 reservations in the ±2 day window — nothing to evaluate.');
        }

        $this->newLine();

        // ── Step 5: branch on outcome ─────────────────────────────────
        if ($smoobuMatch) {
            $smoobuId  = (string) ($smoobuMatch['id'] ?? '');
            $smoobuRef = (string) ($smoobuMatch['reference-id'] ?? '');

            // MEDIUM confidence (name-only match): require --force, otherwise
            // refuse rather than risk attaching the wrong stranger's booking
            // to this PI. This is the Arturs-vs-Janai case the strictness
            // pass was added to prevent.
            if ($matchConfidence === 'medium' && !$force) {
                $this->warn('=== MEDIUM-CONFIDENCE MATCH (name-only) — refusing without --force ===');
                $this->line("  Candidate: Smoobu res {$smoobuId} ({$smoobuRef})");
                $this->line('  Apartment matches the hold unit_id, but only the guest NAME matches (no email).');
                $this->line('  Re-run with --force ONLY if you have verified this is the correct guest:');
                $this->line("       php artisan booking:reconcile-orphan-pi {$intentId} --org-id={$orgId} --apply --force");
                $this->line('  OR re-run with --guest-email=… to bring this match up to HIGH confidence.');
                return self::FAILURE;
            }

            $confidenceLabel = $matchConfidence === 'high' ? 'HIGH (apartment + email)' : 'MEDIUM (apartment + name, --force acknowledged)';
            $this->info("Smoobu match found [{$confidenceLabel}]: id={$smoobuId} reference={$smoobuRef}");
            $this->line('  apartment   = ' . (($smoobuMatch['apartment']['name'] ?? '') . ' (#' . ($smoobuMatch['apartment']['id'] ?? '') . ')'));
            $this->line('  guest       = ' . ($smoobuMatch['guest-name'] ?? '—') . ' <' . ($smoobuMatch['email'] ?? '—') . '>');
            $this->line('  arrival     = ' . ($smoobuMatch['arrival'] ?? '—'));
            $this->line('  departure   = ' . ($smoobuMatch['departure'] ?? '—'));
            $this->newLine();

            return $this->executePathA(
                dryRun: $dryRun,
                pi: $pi,
                hold: $hold,
                payload: $payload,
                smoobuMatch: $smoobuMatch,
                matchConfidence: $matchConfidence ?: 'unknown',
                guestEmail: $guestEmail,
                guestName: $guestName,
                guestPhone: $guestPhone,
                orgId: $orgId,
                bookings: $bookings,
            );
        }

        // No Smoobu match — guest paid, has nothing.
        $this->warn('No SAFE Smoobu match found for this PI.');
        $this->line('  (A match requires apartment_id == hold.unit_id AND dates match AND email/name match. See evaluated candidates above for why each was refused.)');
        $this->newLine();

        if (!$autoRefund) {
            $this->error('No safe match found; pass --auto-refund to refund the PI or manually create the Smoobu reservation and re-run with --apply.');
            $this->newLine();
            $this->line('Options:');
            $this->line("  1. Investigate manually in Stripe Dashboard ({$intentId}) + Smoobu UI.");
            $this->line("  2. If the guest should be refunded, re-run with --auto-refund:");
            $this->line("       php artisan booking:reconcile-orphan-pi {$intentId} --org-id={$orgId} --auto-refund");
            $this->line("  3. If you can find the Smoobu booking under a different email, re-run with --guest-email=…");
            $this->line("  4. If the right Smoobu reservation exists but matched only by name (no email), re-run with --apply --force after confirming the candidate manually.");
            $this->line("  5. If no Smoobu reservation exists yet, create one in Smoobu UI and re-run with --apply.");
            return self::FAILURE;
        }

        return $this->executePathB(
            dryRun: $dryRun,
            pi: $pi,
            guestEmail: $guestEmail,
            orgId: $orgId,
            stripe: $stripe,
        );
    }

    /**
     * PATH A — Smoobu has the booking. Create the missing BookingMirror
     * + send the guest the missing confirmation email. NO Stripe action.
     */
    private function executePathA(
        bool $dryRun,
        \Stripe\PaymentIntent $pi,
        ?BookingHold $hold,
        array $payload,
        array $smoobuMatch,
        string $matchConfidence,
        ?string $guestEmail,
        string $guestName,
        ?string $guestPhone,
        int $orgId,
        BookingEngineService $bookings,
    ): int {
        $smoobuId  = (string) ($smoobuMatch['id'] ?? '');
        $smoobuRef = (string) ($smoobuMatch['reference-id'] ?? '');
        $piId      = (string) $pi->id;
        $amountMaj = round(((int) ($pi->amount ?? 0)) / 100, 2);

        $this->info('=== PATH A — Smoobu match exists, rebuild BookingMirror ===');
        $this->line("  WOULD create BookingMirror with:");
        $this->line("    reservation_id           = {$smoobuId}");
        $this->line("    booking_reference        = {$smoobuRef}");
        $this->line("    stripe_payment_intent_id = {$piId}");
        $this->line("    payment_status           = paid");
        $this->line("    internal_status          = confirmed");
        $this->line("    price_total              = {$amountMaj}");
        $this->line("  WOULD trigger sendBookingEmails to: " . ($guestEmail ?: '<no email — will be skipped>'));
        $this->newLine();

        if ($dryRun) {
            $this->info('Dry-run — no changes made. Re-run with --apply to execute.');
            return self::SUCCESS;
        }

        // Build the mirror payload. We trust Smoobu for the structural
        // fields (dates, apartment, guest name on file) and the PI for
        // amount + payment provenance. Channel name pinned to "Website"
        // so future syncs from Smoobu don't relabel it — the same logic
        // BookingEngineService::upsertBookingFromData applies.
        $apartment = is_array($smoobuMatch['apartment'] ?? null) ? $smoobuMatch['apartment'] : [];
        $arrivalDate   = $smoobuMatch['arrival']   ?? ($payload['check_in']  ?? null);
        $departureDate = $smoobuMatch['departure'] ?? ($payload['check_out'] ?? null);

        try {
            $mirror = BookingMirror::create([
                'organization_id'          => $orgId,
                'reservation_id'           => mb_substr($smoobuId, 0, 30),
                'booking_reference'        => $smoobuRef ?: ('PI-' . substr($piId, -8)),
                'booking_type'             => 'reservation',
                'booking_state'            => 'confirmed',
                'apartment_id'             => $apartment['id']   ?? ($payload['unit_id']   ?? null),
                'apartment_name'           => $apartment['name'] ?? ($payload['unit_name'] ?? 'Room'),
                'channel_name'             => 'Website',
                'guest_name'               => $guestName ?: ($smoobuMatch['guest-name'] ?? null),
                'guest_email'              => $guestEmail ?: ($smoobuMatch['email'] ?? null),
                'guest_phone'              => $guestPhone ?: ($smoobuMatch['phone'] ?? null),
                'adults'                   => $smoobuMatch['adults']   ?? ($payload['adults']   ?? null),
                'children'                 => $smoobuMatch['children'] ?? ($payload['children'] ?? null),
                'arrival_date'             => $arrivalDate,
                'departure_date'           => $departureDate,
                'price_total'              => $amountMaj,
                'price_paid'               => $amountMaj,
                'payment_status'           => 'paid',
                'payment_method'           => 'stripe',
                'stripe_payment_intent_id' => $piId,
                'internal_status'          => 'confirmed',
                'synced_at'                => now(),
            ]);
        } catch (\Illuminate\Database\UniqueConstraintViolationException $e) {
            // Race with the orphan-recovery webhook: it just created a
            // mirror for this PI a moment ago. Re-fetch + report.
            $this->warn('UniqueConstraintViolation — another process created the mirror first. Re-fetching.');
            $mirror = BookingMirror::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('stripe_payment_intent_id', $piId)
                ->first();
            if (!$mirror) {
                $this->error('Race detected but no mirror found on re-fetch. Inspect manually.');
                return self::FAILURE;
            }
            $this->info("Mirror #{$mirror->id} already created by parallel path. Continuing to email step.");
        } catch (\Throwable $e) {
            $this->error('BookingMirror create failed: ' . $e->getMessage());
            return self::FAILURE;
        }

        $this->info("Created BookingMirror #{$mirror->id}.");

        // Send the confirmation email the original flow would have sent.
        // sendBookingEmails is public + best-effort; failures log + return.
        $emailSent = false;
        if ($guestEmail) {
            try {
                $guestArr = [
                    'first_name' => $payload['guest']['first_name'] ?? $this->firstNameOf($guestName),
                    'last_name'  => $payload['guest']['last_name']  ?? $this->lastNameOf($guestName),
                    'email'      => $guestEmail,
                    'phone'      => $guestPhone,
                ];
                // Reuse the original quote payload when present (carries
                // unit_name + extras breakdown + totals). Fall back to a
                // minimal synthesised payload from Smoobu + PI.
                $emailPayload = !empty($payload) ? $payload : [
                    'unit_name'   => $apartment['name'] ?? 'Room',
                    'check_in'    => $arrivalDate,
                    'check_out'   => $departureDate,
                    'nights'      => $this->nightsBetween($arrivalDate, $departureDate),
                    'adults'      => $smoobuMatch['adults']   ?? null,
                    'children'    => $smoobuMatch['children'] ?? 0,
                    'room_total'  => $amountMaj,
                    'extras_total'=> 0,
                    'gross_total' => $amountMaj,
                    'currency'    => strtoupper((string) ($pi->currency ?? 'EUR')),
                ];
                $bookings->sendBookingEmails(
                    $guestArr,
                    $emailPayload,
                    [
                        'booking_reference' => $smoobuRef ?: ('PI-' . substr($piId, -8)),
                        'reservation_id'    => $smoobuId,
                        'payment_status'    => 'paid',
                    ],
                    $orgId,
                );
                $emailSent = true;
                $this->info("Confirmation email queued to {$guestEmail}.");
            } catch (\Throwable $e) {
                $this->warn('Email send failed (non-fatal): ' . $e->getMessage());
            }
        } else {
            $this->warn('No guest email available — confirmation email skipped.');
        }

        // Audit.
        $this->auditLog($orgId, 'booking.reconcile.orphan', [
            'path'                 => 'A_smoobu_match',
            'match_confidence'     => $matchConfidence,
            'payment_intent_id'    => $piId,
            'mirror_id'            => $mirror->id,
            'smoobu_reservation_id'=> $smoobuId,
            'smoobu_reference'     => $smoobuRef,
            'smoobu_apartment_id'  => is_array($smoobuMatch['apartment'] ?? null) ? ($smoobuMatch['apartment']['id'] ?? null) : null,
            'hold_unit_id'         => $payload['unit_id'] ?? null,
            'amount'               => $amountMaj,
            'currency'             => strtoupper((string) ($pi->currency ?? '')),
            'email_sent'           => $emailSent,
            'hold_token'           => $hold?->hold_token,
            'guest_email'          => $guestEmail,
        ], "Reconciled orphan PI {$piId} → BookingMirror #{$mirror->id} (Smoobu res {$smoobuId}, confidence={$matchConfidence})");

        $this->newLine();
        $this->info("Done. BookingMirror #{$mirror->id} now linked to PI {$piId} and Smoobu res {$smoobuId}.");
        return self::SUCCESS;
    }

    /**
     * PATH B — no Smoobu match, --auto-refund passed. Refund the PI in
     * full. No BookingMirror to point BookingRefundService at, so we fire
     * a direct Stripe refund via StripeService::refund() and audit-log.
     */
    private function executePathB(
        bool $dryRun,
        \Stripe\PaymentIntent $pi,
        ?string $guestEmail,
        int $orgId,
        StripeService $stripe,
    ): int {
        $piId      = (string) $pi->id;
        $amountMaj = round(((int) ($pi->amount ?? 0)) / 100, 2);

        $this->warn('=== PATH B — no Smoobu match, refund the PI ===');
        $this->line("  WOULD refund payment intent: {$piId}");
        $this->line("  WOULD refund amount        : {$amountMaj} " . strtoupper((string) ($pi->currency ?? '')));
        $this->line("  WOULD notify guest         : " . ($guestEmail ?: '<no email — cannot notify>'));
        $this->newLine();

        if ($dryRun) {
            $this->info('Dry-run — no refund issued. Re-run with --auto-refund (and not --dry-run) to actually refund.');
            return self::SUCCESS;
        }

        try {
            $refund = $stripe->refund($piId, null, 'requested_by_customer');
        } catch (\Throwable $e) {
            // Restricted-key permission failure: surface the actionable
            // dashboard URL so the operator can flip the scope on without
            // hunting through Stripe support docs. Same self-heal pattern
            // used in stripe:cancel-pi and BookingRefundService.
            $scope = StripeService::isRestrictedKeyPermissionError($e);
            $errorMsg = $scope
                ? StripeService::restrictedKeyMessage('auto-refund this orphan PaymentIntent', $scope, $piId)
                : ('Stripe refund failed: ' . $e->getMessage());
            $this->error($errorMsg);
            $this->auditLog($orgId, 'booking.reconcile.orphan', [
                'path'              => $scope ? 'B_refund_restricted_key' : 'B_refund_failed',
                'payment_intent_id' => $piId,
                'amount'            => $amountMaj,
                'error'             => mb_substr($errorMsg, 0, 480),
                'restricted_scope'  => $scope,
            ], "Reconcile-orphan refund FAILED for PI {$piId}" . ($scope ? " (restricted key missing {$scope})" : ''));
            return self::FAILURE;
        }

        $this->info("Stripe refund issued: {$refund->id} (status={$refund->status})");

        $this->auditLog($orgId, 'booking.reconcile.orphan', [
            'path'              => 'B_refunded',
            'payment_intent_id' => $piId,
            'refund_id'         => (string) $refund->id,
            'refund_status'     => (string) $refund->status,
            'amount'            => $amountMaj,
            'currency'          => strtoupper((string) ($pi->currency ?? '')),
            'guest_email'       => $guestEmail,
            'reason'            => 'orphan_pi_no_smoobu_match',
        ], "Refunded orphan PI {$piId} — no Smoobu booking found, full refund {$amountMaj}");

        if ($guestEmail) {
            $this->line("Reminder: notify {$guestEmail} manually that the refund has been issued — no BookingMirror exists so the standard refund email path was not invoked.");
        }

        return self::SUCCESS;
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    /**
     * Pick the best Smoobu reservation candidate for this PI under strict
     * rules. NEVER attach an orphan PI to a stranger's booking — false
     * positives here are catastrophic (money tied to wrong reservation,
     * wrong guest emailed, points granted to wrong member).
     *
     * Required for ANY acceptance:
     *   - Smoobu reservation's apartment.id == hold's unit_id (the Smoobu
     *     PMS id of the room the guest actually paid for). NO exceptions —
     *     a date-only or email-only match on a DIFFERENT apartment is
     *     refused outright. This is the load-bearing check.
     *   - Smoobu reservation's arrival == hold's check_in
     *   - Smoobu reservation's departure == hold's check_out
     *
     * Then for guest-identity confirmation, in order:
     *   - HIGH confidence: emails match (case-insensitive). Auto-proceeds.
     *   - MEDIUM confidence: hold has no email AND fuzzy case-insensitive
     *     substring match on guest name (either direction). Caller MUST
     *     re-prompt operator with --force before proceeding.
     *   - Otherwise: REFUSED.
     *
     * Returns:
     *   [
     *     'match'      => ?array,   // the chosen Smoobu booking, or null
     *     'confidence' => ?string,  // 'high' | 'medium' | null
     *     'evaluated'  => array[],  // every candidate considered + reason + disposition
     *   ]
     */
    private function pickSmoobuMatch(
        array $candidates,
        ?string $guestEmail,
        ?string $guestName,
        ?string $checkIn,
        ?string $checkOut,
        $holdUnitId,
    ): array {
        $evaluated = [];
        $high = null;
        $medium = null;

        $emailLc = $guestEmail ? strtolower(trim($guestEmail)) : null;
        $nameLc  = $guestName  ? strtolower(trim($guestName))  : null;
        $holdUnitIdStr = $holdUnitId === null ? '' : (string) $holdUnitId;

        foreach ($candidates as $b) {
            if (!is_array($b)) continue;

            $bId    = (string) ($b['id'] ?? '');
            $bAptId = isset($b['apartment']['id']) ? (string) $b['apartment']['id'] : '';
            $bEmail = strtolower(trim((string) ($b['email'] ?? '')));
            $bName  = strtolower(trim((string) ($b['guest-name'] ?? '')));
            $bArr   = (string) ($b['arrival']   ?? '');
            $bDep   = (string) ($b['departure'] ?? '');
            $bType  = (string) ($b['type']      ?? '');

            // Skip cancellations — orphan PI guest still wants their booking.
            if ($bType === 'cancellation') {
                $evaluated[] = [
                    'raw'         => $b,
                    'disposition' => 'skipped',
                    'reason'      => "candidate skipped: type=cancellation",
                ];
                continue;
            }

            // Apartment gate — UNCONDITIONAL refusal on mismatch.
            if ($holdUnitIdStr === '') {
                $evaluated[] = [
                    'raw'         => $b,
                    'disposition' => 'refused',
                    'reason'      => 'candidate refused: hold has no unit_id, cannot verify apartment',
                ];
                continue;
            }
            if ($bAptId === '' || $bAptId !== $holdUnitIdStr) {
                $evaluated[] = [
                    'raw'         => $b,
                    'disposition' => 'refused',
                    'reason'      => "candidate skipped: apartment_id mismatch (smoobu={$bAptId} vs hold={$holdUnitIdStr})",
                ];
                continue;
            }

            // Dates gate.
            $arrivalMatch   = ($checkIn  && $bArr === $checkIn);
            $departureMatch = ($checkOut && $bDep === $checkOut);
            if (!$arrivalMatch || !$departureMatch) {
                $evaluated[] = [
                    'raw'         => $b,
                    'disposition' => 'refused',
                    'reason'      => "candidate refused: dates mismatch (smoobu arr={$bArr} dep={$bDep} vs hold arr={$checkIn} dep={$checkOut})",
                ];
                continue;
            }

            // Guest identity gate.
            if ($emailLc !== null) {
                if ($bEmail !== '' && $bEmail === $emailLc) {
                    $evaluated[] = [
                        'raw'         => $b,
                        'disposition' => 'accepted_high',
                        'reason'      => 'apartment + dates + email all match',
                    ];
                    if ($high === null) $high = $b;
                    continue;
                }
                // We had an email; Smoobu's email doesn't match. Refuse
                // — falling back to name when the email disagreed would
                // attach the wrong guest.
                $evaluated[] = [
                    'raw'         => $b,
                    'disposition' => 'refused',
                    'reason'      => "candidate refused: email mismatch (smoobu={$bEmail} vs hold={$emailLc}) — apartment+dates matched but email override rejected",
                ];
                continue;
            }

            // No email available — try fuzzy name match. Substring match in
            // either direction so "John Smith" matches "John Q Smith" and
            // vice-versa. Refuse when neither name is present at all.
            if ($nameLc !== null && $nameLc !== '' && $bName !== '') {
                $nameFuzzyMatch = (str_contains($bName, $nameLc) || str_contains($nameLc, $bName));
                if ($nameFuzzyMatch) {
                    $evaluated[] = [
                        'raw'         => $b,
                        'disposition' => 'accepted_medium',
                        'reason'      => "apartment + dates match; name fuzzy-match ('{$bName}' ~ '{$nameLc}') — MEDIUM confidence, --force required",
                    ];
                    if ($medium === null) $medium = $b;
                    continue;
                }
                $evaluated[] = [
                    'raw'         => $b,
                    'disposition' => 'refused',
                    'reason'      => "candidate refused: no email on hold AND name does not match (smoobu='{$bName}' vs hold='{$nameLc}')",
                ];
                continue;
            }

            $evaluated[] = [
                'raw'         => $b,
                'disposition' => 'refused',
                'reason'      => 'candidate refused: no email AND no usable name to verify guest identity (dates+apartment alone is not sufficient)',
            ];
        }

        // Prefer HIGH over MEDIUM.
        if ($high !== null) {
            return ['match' => $high, 'confidence' => 'high', 'evaluated' => $evaluated];
        }
        if ($medium !== null) {
            return ['match' => $medium, 'confidence' => 'medium', 'evaluated' => $evaluated];
        }
        return ['match' => null, 'confidence' => null, 'evaluated' => $evaluated];
    }

    private function safeMetadata(object $pi): array
    {
        $meta = $pi->metadata ?? null;
        if ($meta === null) return [];
        if (is_object($meta) && method_exists($meta, 'toArray')) return $meta->toArray();
        if (is_object($meta)) return get_object_vars($meta);
        return is_array($meta) ? $meta : [];
    }

    /**
     * Pull guest name / email / phone from Stripe's charges → billing_details
     * blob. Falls back across the structure variants we've seen in the wild.
     */
    private function stripeBillingDetails(\Stripe\PaymentIntent $pi): array
    {
        try {
            $charge = $pi->charges?->data[0] ?? null;
            if (!$charge) return [];
            $bd = $charge->billing_details ?? null;
            if (!$bd) return [];
            return [
                'name'  => (string) ($bd->name  ?? '') ?: null,
                'email' => (string) ($bd->email ?? '') ?: null,
                'phone' => (string) ($bd->phone ?? '') ?: null,
            ];
        } catch (\Throwable) {
            return [];
        }
    }

    private function firstNameOf(string $full): string
    {
        $parts = preg_split('/\s+/', trim($full)) ?: [];
        return $parts[0] ?? '';
    }

    private function lastNameOf(string $full): string
    {
        $parts = preg_split('/\s+/', trim($full)) ?: [];
        if (count($parts) <= 1) return '';
        array_shift($parts);
        return implode(' ', $parts);
    }

    private function nightsBetween(?string $checkIn, ?string $checkOut): int
    {
        if (!$checkIn || !$checkOut) return 1;
        $a = strtotime($checkIn);
        $b = strtotime($checkOut);
        if (!$a || !$b || $b <= $a) return 1;
        return (int) max(1, round(($b - $a) / 86400));
    }

    /**
     * Audit-log with the canonical action 'booking.reconcile.orphan' so
     * the post-incident review can pull every reconciliation done by this
     * command across all paths.
     */
    private function auditLog(int $orgId, string $action, array $payload, string $description): void
    {
        try {
            AuditLog::create([
                'organization_id' => $orgId,
                'user_id'         => null,
                'action'          => $action,
                'subject_type'    => 'stripe_payment_intent',
                'subject_id'      => null,
                'new_values'      => $payload,
                'description'     => $description,
            ]);
        } catch (\Throwable $e) {
            $this->warn('Audit-log write failed: ' . $e->getMessage());
        }
    }
}
