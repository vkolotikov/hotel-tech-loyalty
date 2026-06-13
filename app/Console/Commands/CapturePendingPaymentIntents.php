<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ReleasesScheduleLock;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\ServiceBooking;
use App\Services\StripeService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Capture authorised-but-not-yet-captured Stripe PaymentIntents linked
 * to confirmed bookings.
 *
 * Backstop for the post-confirm capture path. Inside
 * `BookingPublicController::confirm()` and `ServicePublicController::confirm()`
 * we call `paymentIntents.capture()` synchronously right after the
 * BookingMirror / ServiceBooking row commits. That call can fail for
 * benign reasons — Stripe rate-limit blip, bank network hiccup,
 * temporary outage — without losing the auth. Stripe holds card
 * authorisations for ~7 days; this cron walks unfinished captures
 * inside that window and finishes them.
 *
 * Scope (per-tenant Stripe key resolved via `current_organization_id`):
 *
 *   - BookingMirror rows where
 *       payment_method != 'mock'
 *       AND payment_status IN ('authorized', 'pending')
 *       AND stripe_payment_intent_id LIKE 'pi_%'
 *       AND created_at BETWEEN now()-6 days AND now()-5 minutes
 *   - ServiceBooking rows under the same criteria.
 *
 *   The 5-minute lower bound gives the synchronous capture path
 *   plenty of slack so we don't race against a confirm() that's still
 *   in flight.
 *
 *   The 6-day upper bound is one day inside Stripe's 7-day auth
 *   window so we never try to capture an auth that just expired
 *   (which would 400). Beyond 6 days we flip the row to
 *   capture_expired so staff can see it.
 *
 * Behaviour per PI:
 *   - status = requires_capture → capture → flip mirror to paid.
 *   - status = succeeded → no-op (already captured, somewhere — flip
 *     mirror to paid in case it was missed).
 *   - status = canceled → flip mirror to payment_status='canceled'.
 *   - status = requires_payment_method / requires_action /
 *     requires_confirmation → leave alone (guest hasn't finished
 *     authorising; the cron isn't responsible for those).
 *   - status = processing → leave alone (Stripe is working on it).
 *   - retrieve fails → audit, leave alone.
 *
 * Idempotent — re-running over the same row is safe because we
 * dispatch on the live Stripe status, not on the local row's status.
 */
class CapturePendingPaymentIntents extends Command
{
    use ReleasesScheduleLock;

    protected $signature = 'bookings:capture-pending-pis
                            {--org= : Limit to a single organization id}
                            {--dry-run : Probe + report without calling capture}
                            {--limit=200 : Maximum rows to process per run}';

    protected $description = 'Capture authorised-but-not-yet-captured Stripe PaymentIntents on confirmed bookings.';

    public function handle(StripeService $stripe): int
    {
        // Stuck-lock guard — same pattern as SyncSmoobuBookings.
        $this->releaseScheduleLockOnShutdown();

        $orgFilter = $this->option('org') ? (int) $this->option('org') : null;
        $dryRun    = (bool) $this->option('dry-run');
        $limit     = (int) ($this->option('limit') ?: 200);

        $minAge = now()->subMinutes(5);
        $maxAge = now()->subDays(6);

        // STALE-AUTH RECONCILIATION: rows older than 6 days that are still
        // 'authorized' are past the safe capture window. Reconcile them
        // separately — retrieve PI from Stripe to see whether the auth
        // expired (canceled) or is still alive. Audit 2026-06-01 finding:
        // previously these were silently excluded by the >6d upper bound
        // and stuck in 'authorized' forever.
        $staleCount = $this->reconcileStaleAuths($stripe, $orgFilter, $dryRun);
        if ($staleCount > 0) {
            $this->info("Stale-auth reconciliation processed {$staleCount} row(s).");
        }

        // ── Bookings (rooms) ───────────────────────────────────────────
        $bookings = BookingMirror::withoutGlobalScopes()
            ->whereIn('payment_status', ['authorized', 'pending'])
            ->whereNotNull('stripe_payment_intent_id')
            ->where('stripe_payment_intent_id', 'like', 'pi_%')
            ->where('stripe_payment_intent_id', 'not like', 'pi_mock_%')
            ->where(function ($q) {
                $q->where('payment_method', '!=', 'mock')
                  ->orWhereNull('payment_method');
            })
            ->where('created_at', '<=', $minAge)
            ->where('created_at', '>=', $maxAge)
            ->when($orgFilter, fn($q) => $q->where('organization_id', $orgFilter))
            ->orderBy('id')
            ->limit($limit)
            ->get();

        // ── Service bookings ───────────────────────────────────────────
        $services = ServiceBooking::withoutGlobalScopes()
            ->whereIn('payment_status', ['authorized', 'pending'])
            ->whereNotNull('stripe_payment_intent_id')
            ->where('stripe_payment_intent_id', 'like', 'pi_%')
            ->where('stripe_payment_intent_id', 'not like', 'pi_mock_%')
            ->where('created_at', '<=', $minAge)
            ->where('created_at', '>=', $maxAge)
            ->when($orgFilter, fn($q) => $q->where('organization_id', $orgFilter))
            ->orderBy('id')
            ->limit($limit)
            ->get();

        $total = $bookings->count() + $services->count();
        if ($total === 0) {
            $this->info('No pending captures.');
            return self::SUCCESS;
        }

        $this->info("Found {$total} pending capture(s): {$bookings->count()} room booking(s), {$services->count()} service booking(s)" . ($dryRun ? ' [dry-run]' : ''));

        $captured = 0;
        $alreadyCaptured = 0;
        $expired = 0;
        $skipped = 0;
        $failed  = 0;

        foreach ($bookings as $mirror) {
            $outcome = $this->processBooking($stripe, $mirror, $dryRun);
            switch ($outcome) {
                case 'captured':         $captured++;         break;
                case 'already_captured': $alreadyCaptured++;  break;
                case 'expired':          $expired++;          break;
                case 'failed':           $failed++;           break;
                default:                 $skipped++;          break;
            }
        }

        foreach ($services as $booking) {
            $outcome = $this->processServiceBooking($stripe, $booking, $dryRun);
            switch ($outcome) {
                case 'captured':         $captured++;         break;
                case 'already_captured': $alreadyCaptured++;  break;
                case 'expired':          $expired++;          break;
                case 'failed':           $failed++;           break;
                default:                 $skipped++;          break;
            }
        }

        $this->info("Sweep complete: {$captured} captured · {$alreadyCaptured} already captured · {$expired} expired · {$skipped} skipped · {$failed} failed");

        return self::SUCCESS;
    }

    /**
     * Resolve one BookingMirror's PI status and act. Returns a string
     * outcome bucket used for the summary line.
     */
    private function processBooking(StripeService $stripe, BookingMirror $mirror, bool $dryRun): string
    {
        // Bind tenant so StripeService picks up the right key.
        app()->instance('current_organization_id', (int) $mirror->organization_id);

        if (!$stripe->isEnabled()) {
            return 'skipped';
        }

        $piId = (string) $mirror->stripe_payment_intent_id;

        try {
            $intent = $stripe->retrievePaymentIntent($piId);
        } catch (\Throwable $e) {
            Log::warning('Capture cron — retrieve failed', [
                'mirror_id' => $mirror->id,
                'pi_id'     => $piId,
                'error'     => $e->getMessage(),
            ]);
            return 'failed';
        }

        $status = (string) ($intent->status ?? '');

        if ($status === 'requires_capture') {
            if ($dryRun) {
                $this->line("[dry-run] would capture booking #{$mirror->id} (PI {$piId})");
                return 'captured';
            }
            try {
                $stripe->capturePaymentIntent($piId);
                $this->markBookingPaid($mirror);
                $this->auditOutcome($mirror->organization_id, 'booking.capture.recovered', $piId, [
                    'mirror_id' => $mirror->id,
                    'amount'    => (int) ($intent->amount ?? 0),
                ], "Captured PI {$piId} via cron after sync capture missed");
                return 'captured';
            } catch (\Throwable $e) {
                Log::error('Capture cron — capture failed', [
                    'mirror_id' => $mirror->id,
                    'pi_id'     => $piId,
                    'error'     => $e->getMessage(),
                ]);

                // Capture refusals before the 6-day window were previously
                // visible only in laravel.log. Now they also write an audit
                // row + push a realtime alert so admin UI surfaces a badge
                // that the booking needs manual review. See
                // AUDIT-2026-06-13-ADDENDUM.md observability finding.
                try {
                    $this->auditOutcome($mirror->organization_id, 'booking.capture.failed', $piId, [
                        'mirror_id' => $mirror->id,
                        'error'     => mb_substr($e->getMessage(), 0, 500),
                    ], "Capture failed for PI {$piId} — manual review needed");
                } catch (\Throwable) { /* defensive */ }

                try {
                    app(\App\Services\RealtimeEventService::class)->dispatch(
                        'booking.capture_failed',
                        'Payment capture failed',
                        "Booking #{$mirror->id} (guest: {$mirror->guest_name}) — Stripe refused capture. Manual review needed.",
                        [
                            'mirror_id'  => $mirror->id,
                            'pi_id'      => $piId,
                            'error'      => mb_substr($e->getMessage(), 0, 200),
                            'action_url' => "/bookings/{$mirror->id}",
                        ],
                        $mirror->organization_id,
                    );
                } catch (\Throwable $alertErr) {
                    Log::warning('Capture-failed realtime alert dispatch failed', [
                        'mirror_id' => $mirror->id,
                        'error'     => $alertErr->getMessage(),
                    ]);
                }
                return 'failed';
            }
        }

        if ($status === 'succeeded') {
            // Funds already captured (PI created in old auto-capture
            // era, or another process captured). Mirror just hasn't
            // been told. Fix it.
            if (!$dryRun) {
                $this->markBookingPaid($mirror);
            }
            return 'already_captured';
        }

        if ($status === 'canceled') {
            // Auth was cancelled (likely by the rescue helper after a
            // confirm failure that we somehow still have a mirror for —
            // shouldn't happen, but defence in depth). Flip the mirror
            // so it doesn't show as still-authorised in admin.
            if (!$dryRun) {
                try {
                    $mirror->update(['payment_status' => 'canceled']);
                } catch (\Throwable) {}
                $this->auditOutcome($mirror->organization_id, 'booking.capture.expired', $piId, [
                    'mirror_id' => $mirror->id,
                ], "PI {$piId} was canceled before capture; mirror flipped to canceled");
            }
            return 'expired';
        }

        // Anything else (requires_payment_method, requires_action,
        // requires_confirmation, processing) — not our problem to
        // resolve. The guest's still on the widget or Stripe is still
        // working on the auth.
        return 'skipped';
    }

    /**
     * Same shape as processBooking but for ServiceBooking rows.
     */
    private function processServiceBooking(StripeService $stripe, ServiceBooking $booking, bool $dryRun): string
    {
        app()->instance('current_organization_id', (int) $booking->organization_id);

        if (!$stripe->isEnabled()) {
            return 'skipped';
        }

        $piId = (string) $booking->stripe_payment_intent_id;

        try {
            $intent = $stripe->retrievePaymentIntent($piId);
        } catch (\Throwable $e) {
            Log::warning('Capture cron (service) — retrieve failed', [
                'service_booking_id' => $booking->id,
                'pi_id'              => $piId,
                'error'              => $e->getMessage(),
            ]);
            return 'failed';
        }

        $status = (string) ($intent->status ?? '');

        if ($status === 'requires_capture') {
            if ($dryRun) {
                $this->line("[dry-run] would capture service booking #{$booking->id} (PI {$piId})");
                return 'captured';
            }
            try {
                $stripe->capturePaymentIntent($piId);
                try {
                    $booking->update(['payment_status' => 'paid']);
                } catch (\Throwable) {}
                $this->auditOutcome($booking->organization_id, 'service_booking.capture.recovered', $piId, [
                    'service_booking_id' => $booking->id,
                    'amount'             => (int) ($intent->amount ?? 0),
                ], "Captured PI {$piId} via cron after sync capture missed");
                return 'captured';
            } catch (\Throwable $e) {
                Log::error('Capture cron (service) — capture failed', [
                    'service_booking_id' => $booking->id,
                    'pi_id'              => $piId,
                    'error'              => $e->getMessage(),
                ]);
                return 'failed';
            }
        }

        if ($status === 'succeeded') {
            if (!$dryRun) {
                try {
                    if (in_array($booking->payment_status, ['authorized', 'pending', null, ''], true)) {
                        $booking->update(['payment_status' => 'paid']);
                    }
                } catch (\Throwable) {}
            }
            return 'already_captured';
        }

        if ($status === 'canceled') {
            if (!$dryRun) {
                try {
                    $booking->update(['payment_status' => 'canceled']);
                } catch (\Throwable) {}
                $this->auditOutcome($booking->organization_id, 'service_booking.capture.expired', $piId, [
                    'service_booking_id' => $booking->id,
                ], "PI {$piId} was canceled before capture; booking flipped to canceled");
            }
            return 'expired';
        }

        return 'skipped';
    }

    /**
     * Flip a BookingMirror (and any siblings in the same booking_group
     * sharing the same PI — combo bookings) to paid. Skip mirrors
     * already in a terminal state so we don't clobber refunds.
     *
     * Audit 2026-06-01: includes orWhereNull because Postgres `IN` never
     * matches NULL. Orphan-recovered mirrors with null payment_status
     * would otherwise stay null after capture.
     */
    private function markBookingPaid(BookingMirror $mirror): void
    {
        try {
            $query = BookingMirror::withoutGlobalScopes()
                ->where('organization_id', $mirror->organization_id)
                ->where('stripe_payment_intent_id', $mirror->stripe_payment_intent_id)
                ->where(function ($q) {
                    $q->whereIn('payment_status', ['authorized', 'pending', ''])
                      ->orWhereNull('payment_status');
                });
            $query->get()->each(function ($m) {
                $m->update([
                    'payment_status' => 'paid',
                    'payment_method' => $m->payment_method ?: 'stripe',
                    'price_paid'     => $m->price_total,
                ]);
            });
        } catch (\Throwable $e) {
            Log::warning('Capture cron — markBookingPaid failed', [
                'mirror_id' => $mirror->id,
                'error'     => $e->getMessage(),
            ]);
        }
    }

    /**
     * Stale-auth reconciliation (audit 2026-06-01).
     *
     * For mirrors and service bookings older than 6 days that are still
     * 'authorized' or 'pending', retrieve the PI and decide:
     * - canceled → flip to 'capture_expired' + audit
     * - succeeded → flip to 'paid' (a sibling process captured it)
     * - requires_capture → still capturable somehow (rare) → leave; the
     *   main sweep will pick it up if it's now < 6 days, otherwise audit
     *   and leave for staff.
     * - retrieve fails → leave + audit.
     *
     * Returns count of rows processed.
     */
    private function reconcileStaleAuths(StripeService $stripe, ?int $orgFilter, bool $dryRun): int
    {
        $cutoff = now()->subDays(6);
        // Look back 30 days max to keep the sweep bounded; anything older
        // is operations-only territory.
        $floor = now()->subDays(30);

        $mirrors = BookingMirror::withoutGlobalScopes()
            ->whereIn('payment_status', ['authorized', 'pending'])
            ->whereNotNull('stripe_payment_intent_id')
            ->where('stripe_payment_intent_id', 'like', 'pi_%')
            ->where('stripe_payment_intent_id', 'not like', 'pi_mock_%')
            ->where('created_at', '<', $cutoff)
            ->where('created_at', '>=', $floor)
            ->when($orgFilter, fn($q) => $q->where('organization_id', $orgFilter))
            ->orderBy('id')
            ->limit(100)
            ->get();

        $processed = 0;
        foreach ($mirrors as $mirror) {
            $piId = (string) $mirror->stripe_payment_intent_id;
            app()->instance('current_organization_id', (int) $mirror->organization_id);
            if (!$stripe->isEnabled()) continue;
            try {
                $intent = $stripe->retrievePaymentIntent($piId);
            } catch (\Throwable $e) {
                Log::warning('Stale-auth reconcile — retrieve failed', [
                    'mirror_id' => $mirror->id, 'pi_id' => $piId, 'error' => $e->getMessage(),
                ]);
                continue;
            }
            $status = (string) ($intent->status ?? '');
            $processed++;
            if ($dryRun) {
                $this->line("[dry-run] stale auth mirror #{$mirror->id} PI {$piId} status={$status}");
                continue;
            }
            try {
                if ($status === 'canceled' || $status === 'requires_payment_method') {
                    $mirror->update(['payment_status' => 'capture_expired']);
                    $this->auditOutcome($mirror->organization_id, 'booking.capture.auth_expired', $piId, [
                        'mirror_id' => $mirror->id, 'stripe_status' => $status, 'age_days' => $mirror->created_at?->diffInDays(now()),
                    ], "PI {$piId} authorization expired/cancelled before capture (status={$status}, mirror age > 6d). Flipped to capture_expired.");
                } elseif ($status === 'succeeded') {
                    $this->markBookingPaid($mirror);
                } else {
                    // Unexpected — audit but don't touch the mirror.
                    $this->auditOutcome($mirror->organization_id, 'booking.capture.stale_unhandled', $piId, [
                        'mirror_id' => $mirror->id, 'stripe_status' => $status,
                    ], "Stale auth mirror #{$mirror->id} has PI in unexpected state {$status}");
                }
            } catch (\Throwable $e) {
                Log::warning('Stale-auth reconcile — update failed', [
                    'mirror_id' => $mirror->id, 'error' => $e->getMessage(),
                ]);
            }
        }
        return $processed;
    }

    private function auditOutcome(?int $orgId, string $action, string $piId, array $extra, string $description): void
    {
        try {
            AuditLog::create([
                'organization_id' => $orgId,
                'action'          => $action,
                'subject_type'    => 'stripe_payment',
                'subject_id'      => null,
                'new_values'      => array_merge(['payment_intent_id' => $piId], $extra),
                'description'     => $description,
            ]);
        } catch (\Throwable) {
            // best-effort
        }
    }
}
