<?php

namespace App\Console\Commands;

use App\Console\Commands\Concerns\ReleasesScheduleLock;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\ServiceBooking;
use App\Services\StripeService;
use App\Support\AdvisoryLock;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
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
 *   - ServiceBooking rows under the same criteria, EXCEPT status 'pending'
 *     (awaiting staff confirmation — captured on the first run after staff
 *     confirm it; if they never do, the hold lapses uncharged).
 *
 *   The 5-minute lower bound gives the synchronous capture path
 *   plenty of slack so we don't race against a confirm() that's still
 *   in flight.
 *
 *   The 6-day upper bound is one day inside Stripe's 7-day auth
 *   window so we never try to capture an auth that just expired
 *   (which would 400). Beyond 6 days the row is handled by
 *   `reconcileStaleAuths()` instead, which flips it to capture_expired
 *   so staff can see it.
 *
 * Behaviour per PI (stays):
 *   - status = requires_capture → capture → flip mirror to paid.
 *   - status = succeeded → no-op (already captured, somewhere — flip
 *     mirror to paid in case it was missed).
 *   - status = canceled → flip mirror to payment_status='cancelled'.
 *   - status = requires_payment_method / requires_action /
 *     requires_confirmation → leave alone (guest hasn't finished
 *     authorising; the cron isn't responsible for those).
 *   - status = processing → leave alone (Stripe is working on it).
 *   - retrieve fails → log, leave alone (no audit — nothing about the PI
 *     is known to record).
 *
 * A CANCELLED stay (`booking_state` or `internal_status` = 'cancelled', or
 * `cancelled_at` set) is never captured:
 *   - PI still requires_capture → the hold is released instead of
 *     captured (per PaymentIntent, once — see COMBO below), rows flip to
 *     'cancelled', one `booking.capture.cancelled_booking` audit per row.
 *   - PI already succeeded → the money is genuinely at Stripe, so the row
 *     is marked paid exactly as the plain 'succeeded' case above, and
 *     additionally flagged once with `booking.capture.needs_refund` so
 *     staff know to give it back.
 * A NO-SHOW stay is not covered by this rule and is charged normally —
 * charging a no-show is the venue's own policy, not the cron's to decide.
 *
 * Service bookings whose own status is 'cancelled' or 'no_show':
 *   - status = requires_capture → cancel the PI (reason 'abandoned'),
 *     payment_status='cancelled', audit service_booking.capture.cancelled_booking.
 *   - status = succeeded → leave the row exactly as it is (a refund is the
 *     operator's own action, from the Stripe dashboard) and, once, flag it
 *     with service_booking.capture.needs_refund so staff know to give it
 *     back.
 *   --dry-run reports both without writing.
 *
 * COMBO stays: several rooms of one public-widget stay can share one
 * PaymentIntent (`booking_group_id`). The decision above is made once per
 * PaymentIntent, over every BookingMirror row that carries it (a
 * single-room stay is a group of one): one `retrieve` and, when capturing,
 * one `capturePaymentIntent` call serve the whole group, and a refused
 * capture produces one audit row and one realtime alert for the group
 * rather than one per room.
 *
 * Console output / summary counters report one line per swept row, never
 * one per PaymentIntent group, so a multi-room hold reads the same as N
 * independent single-room holds would: for an ordinary (non-cancelled)
 * group, `captureGroup()` reports one row `captured` and every other
 * swept-open row `already_captured`, matching the outcome each row
 * actually ends up with once markBookingPaid() flips every sibling to
 * paid in the same call — one real Stripe capture stands in for the whole
 * group's arithmetic rather than retrieving the PI once per row. A
 * --dry-run never actually captures anything, so every room's retrieve
 * keeps reporting the same live status across the whole group and each
 * gets its own line. A failed `retrieve` is similarly counted once per row
 * it would otherwise have blocked (nothing but a log line is ever at
 * stake reading it N times), but logged only once (the group's lowest id).
 *
 * Idempotent — re-running over the same PaymentIntent is safe because we
 * dispatch on the live Stripe status, not on the local rows' status.
 *
 * Concurrency, MAIN SWEEP: each PaymentIntent's decision — a stay's whole
 * room group, or one service booking — runs inside a single
 * `DB::transaction()` that takes the row lock(s) FIRST (`lockForUpdate()`,
 * which is also the fresh read: nothing here trusts the sweep's own
 * SELECT) and only then `AdvisoryLock::within('pi:' . $intentId)` — the
 * SAME order `MemberCancellation` uses (see that class's docblock), never
 * reversed: an `UPDATE` needs the row lock, so a job that took `pi:` first
 * and only then tried to write the row would cross `MemberCancellation`'s
 * row-then-`pi:` path in the opposite order — two transactions each
 * holding what the other wants next. Row-then-`pi:` everywhere means
 * whichever side reaches the row lock first simply finishes (commits or
 * rolls back, releasing both locks) before the other is let in — no
 * cycle, ever. `--dry-run` takes NEITHER lock and opens no transaction at
 * all: it reads with a plain, unlocked query and prints.
 *
 * Concurrency, STALE-AUTH PATH (`reconcileStaleAuths()`): takes NO lock of
 * its own — row or `pi:` — at all. It relies entirely on conditioning
 * every write on the `payment_status` its own read just observed, so a
 * writer that DOES hold the `pi:` lock (a confirm, a cancellation, the
 * main sweep above) can still never be silently overwritten by it, even
 * though nothing here ever waits for that lock.
 *
 * Every `payment_status` write below is conditioned on the status the
 * relevant read just observed (`where('payment_status', …)` on the
 * `UPDATE`, or `markBookingPaid()`'s own per-row conditional query), so
 * even a writer that takes no lock at all (a raw admin query, a PMS sync,
 * `reconcileStaleAuths()` itself) can never silently overwrite a status a
 * lock-holding writer changed — the guarded write simply becomes a no-op.
 * Audit rows that record something that genuinely HAPPENED AT STRIPE
 * (`*.capture.recovered`, a capture, a release, an expiry) are written
 * UNCONDITIONALLY once that fact is known, regardless of whether the local
 * write took effect — the description says so when it didn't. In the main
 * sweep those audits are collected while the transaction is open and
 * written only AFTER it returns, so a later, unrelated failure inside the
 * same transaction can roll back the row writes without losing the record
 * that Stripe already did something. The `needs_refund` flagging loop
 * (`captureGroup()`, `syncAlreadyCapturedGroup()`) walks only the rows
 * just marked paid that are ALSO cancelled — never every cancelled row in
 * the group regardless of its own payment state, which would wrongly flag
 * an already-refunded sibling as still needing one.
 *
 * On PostgreSQL, one failed statement aborts the WHOLE surrounding
 * transaction — a PHP-level try/catch around that one statement does NOT
 * save it, because the connection is left in an aborted state until a
 * ROLLBACK regardless of whether PHP caught the exception. Every write
 * that must survive its own failure without taking the rest of the
 * PaymentIntent's decision down with it therefore runs inside
 * its own SAVEPOINT (a nested `DB::transaction()`, via the private
 * `guarded()` helper) rather than a bare try/catch. A capture that
 * succeeds at Stripe is reported captured (with its `recovered` audit)
 * even if every local write after it fails, or if the surrounding
 * transaction's own commit fails — the capture path additionally stashes
 * its own outcome by reference before attempting any local write, so
 * `processBooking()`'s / `processServiceBooking()`'s outer catch can fall
 * back to it instead of guessing `'failed'`.
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

        // Rows older than 6 days are past the main sweep's window (see the
        // class docblock) and would otherwise sit 'authorized' forever;
        // reconcile them separately by retrieving the PI to see whether the
        // auth expired (canceled) or is still alive.
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
        // A booking still awaiting staff confirmation (`status = pending`,
        // `services_require_staff_confirmation`) is not charged until staff
        // accept it: it is left out here and captured by the first run after
        // it is confirmed, while still inside the six-day window. If staff
        // never confirm it, the hold lapses uncharged. Filtered in the query,
        // not per row, so pending rows never crowd real captures out of
        // --limit.
        $services = ServiceBooking::withoutGlobalScopes()
            ->whereIn('payment_status', ['authorized', 'pending'])
            ->where(fn ($q) => $q->where('status', '!=', 'pending')->orWhereNull('status'))
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

        $totals = $this->tally();

        // A combo's rooms all carry the same PaymentIntent and all appear
        // in $bookings (same eligible-status filter, and the same --limit
        // cutoff) — decide each PI once. processBooking() itself locks +
        // re-reads every row of the WHOLE group (a sibling this run's
        // --limit cut off is still locked and written when the intent is
        // captured or released — money correctness first), but counts and
        // prints only over the ids THIS sweep actually selected — passed in
        // as $sweptIds so "captured" etc. can never exceed "Found N" and a
        // later sibling row here is simply skipped without opening a second
        // transaction or a second Stripe call for the same PI.
        $sweptIdsByPi = [];
        foreach ($bookings as $mirror) {
            $piKey = $mirror->organization_id . ':' . $mirror->stripe_payment_intent_id;
            $sweptIdsByPi[$piKey][] = $mirror->id;
        }
        $decidedPis = [];
        foreach ($bookings as $mirror) {
            $piKey = $mirror->organization_id . ':' . $mirror->stripe_payment_intent_id;
            if (isset($decidedPis[$piKey])) {
                continue;
            }
            $decidedPis[$piKey] = true;

            $this->addTally($totals, $this->processBooking($stripe, $mirror, $dryRun, $sweptIdsByPi[$piKey]));
        }

        foreach ($services as $booking) {
            $this->addTally($totals, $this->processServiceBooking($stripe, $booking, $dryRun));
        }

        $this->info("Sweep complete: {$totals['captured']} captured · {$totals['already_captured']} already captured · {$totals['expired']} expired · {$totals['skipped']} skipped · {$totals['failed']} failed · {$totals['released']} released (booking cancelled) · {$totals['needs_refund']} need a refund");

        return self::SUCCESS;
    }

    /** A zeroed outcome tally, merged with the given overrides. */
    private function tally(array $overrides = []): array
    {
        return array_merge([
            'captured' => 0, 'already_captured' => 0, 'expired' => 0,
            'skipped' => 0, 'failed' => 0, 'released' => 0, 'needs_refund' => 0,
        ], $overrides);
    }

    private function addTally(array &$totals, array $t): void
    {
        foreach ($t as $k => $v) {
            $totals[$k] = ($totals[$k] ?? 0) + $v;
        }
    }

    /**
     * Run $fn as its own SAVEPOINT (a nested `DB::transaction()`) so a
     * failing statement here cannot poison a surrounding transaction — see
     * the class docblock's PostgreSQL paragraph. Logs and swallows;
     * returns $fn's result on success — for this class's closures, the
     * number of rows the conditional UPDATE matched (an int, never null) —
     * or null when $fn threw. Callers tell the three apart: `=== 0` is a
     * conditional write that matched no row ("already moved on"), null is
     * a genuine exception, anything else wrote. $message is the FULL log
     * line (no prefix is added here).
     */
    private function guarded(callable $fn, string $message, array $logContext = []): mixed
    {
        try {
            return DB::transaction($fn);
        } catch (\Throwable $e) {
            Log::warning($message, $logContext + ['error' => $e->getMessage()]);
            return null;
        }
    }

    /**
     * Resolve every BookingMirror row carrying this PaymentIntent (one room,
     * or a whole combo) and act on the group as one decision. $sweptIds are
     * the ids THIS sweep's own SELECT chose for this PI (may be a strict
     * subset of the group when --limit cut it off) — counters and printed
     * lines follow $sweptIds; the group's full row set is still locked and
     * written for money correctness (see the class docblock). Returns an
     * outcome tally (see tally()).
     */
    private function processBooking(StripeService $stripe, BookingMirror $mirror, bool $dryRun, array $sweptIds): array
    {
        // Bind tenant so StripeService picks up the right key.
        app()->instance('current_organization_id', (int) $mirror->organization_id);

        if (!$stripe->isEnabled()) {
            // A skip for every row THIS SWEEP chose for this PI — nothing
            // is being decided either way, so no query is needed; $sweptIds
            // already is that count.
            return $this->tally(['skipped' => max(1, count($sweptIds))]);
        }

        $orgId = (int) $mirror->organization_id;
        $piId  = (string) $mirror->stripe_payment_intent_id;

        if ($dryRun) {
            // No row lock, no `pi:` lock, no transaction — a pure read and
            // report.
            $rows = BookingMirror::withoutGlobalScopes()
                ->where('organization_id', $orgId)
                ->where('stripe_payment_intent_id', $piId)
                ->orderBy('id')
                ->get();
            if ($rows->isEmpty()) {
                return $this->tally();
            }
            $audits = [];
            $alerts = [];
            $fallback = [];
            return $this->decideBookingGroup($stripe, $rows, $sweptIds, $piId, true, $audits, $alerts, $fallback);
        }

        $audits = [];
        $alerts = [];
        $fallback = [];
        try {
            $result = DB::transaction(function () use ($stripe, $orgId, $piId, $sweptIds, &$audits, &$alerts, &$fallback) {
                // Row lock first, `pi:` second — see the class docblock.
                $rows = BookingMirror::withoutGlobalScopes()
                    ->where('organization_id', $orgId)
                    ->where('stripe_payment_intent_id', $piId)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get();
                if ($rows->isEmpty()) {
                    return $this->tally();
                }
                AdvisoryLock::within('pi:' . $piId);

                return $this->decideBookingGroup($stripe, $rows, $sweptIds, $piId, false, $audits, $alerts, $fallback);
            });
        } catch (\Throwable $e) {
            Log::error('Capture cron — booking group transaction failed', [
                'mirror_id' => $mirror->id, 'pi_id' => $piId, 'organization_id' => $orgId, 'error' => $e->getMessage(),
            ]);
            // A successful Stripe capture followed by a failed commit is
            // still reported captured — Stripe already has the money.
            $result = $fallback['tally'] ?? $this->tally(['failed' => 1]);
        }

        // Written after the transaction ends, each independently — see the
        // class docblock.
        foreach ($audits as $a) {
            $this->auditOutcome($a['org'], $a['action'], $a['pi'], $a['extra'], $a['description'], $a['subjectType'] ?? 'stripe_payment', $a['subjectId'] ?? null);
        }
        foreach ($alerts as $al) {
            try {
                app(\App\Services\RealtimeEventService::class)->dispatch($al['type'], $al['title'], $al['body'], $al['data'], $al['orgId']);
            } catch (\Throwable $e) {
                Log::warning('Capture-failed realtime alert dispatch failed', ['mirror_id' => $al['data']['mirror_id'] ?? null, 'error' => $e->getMessage()]);
            }
        }

        return $result;
    }

    /**
     * The whole group's decision, made from the rows the row lock just
     * read fresh (real run) or a plain unlocked read (--dry-run). $sweptIds
     * are the ids this run's own SELECT actually chose for this PI (see
     * processBooking()); $audits and $alerts collect anything that must
     * survive the transaction, each written/dispatched independently after
     * it ends; $fallback['tally'], set by captureGroup()/
     * decideServiceBooking() right after a successful Stripe capture, is
     * what the outer catch falls back to if the transaction fails after
     * that point.
     *
     * @param Collection<int, BookingMirror> $rows
     */
    private function decideBookingGroup(StripeService $stripe, Collection $rows, array $sweptIds, string $piId, bool $dryRun, array &$audits, array &$alerts, array &$fallback): array
    {
        $openRows = $rows->filter(fn (BookingMirror $r) => in_array((string) $r->payment_status, ['authorized', 'pending'], true));
        if ($openRows->isEmpty()) {
            // Every row already resolved (paid, refunded, cancelled) since
            // the sweep's SELECT — never ours to touch, and no Stripe call
            // worth making.
            return $this->tally();
        }
        // The rows THIS sweep actually selected for this PI, still open —
        // what counters and printed lines follow; a sibling --limit cut off
        // is still locked/written above via $rows and $openRows, just never
        // counted or printed by this run.
        $sweptOpenRows = $openRows->filter(fn (BookingMirror $r) => in_array($r->id, $sweptIds, true));

        try {
            $intent = $stripe->retrievePaymentIntent($piId);
        } catch (\Throwable $e) {
            Log::warning('Capture cron — retrieve failed', ['mirror_id' => $this->firstOpenSwept($sweptOpenRows, $openRows)->id, 'pi_id' => $piId, 'error' => $e->getMessage()]);
            // Counted once per swept row this retrieve failure blocks, so
            // the group's shape in the sweep's output matches a run over
            // independent single-room holds — see the class docblock.
            return $this->tally(['failed' => $sweptOpenRows->count()]);
        }
        $status = (string) ($intent->status ?? '');

        $allCancelled = $rows->every(fn (BookingMirror $r) => $this->isCancelledStayRow($r));
        $anyCancelled = $rows->contains(fn (BookingMirror $r) => $this->isCancelledStayRow($r));

        if ($status === 'requires_capture') {
            if ($allCancelled) {
                return $this->releaseCancelledGroup($stripe, $openRows, $sweptOpenRows, $piId, $dryRun, $audits);
            }
            return $this->captureGroup($stripe, $rows, $openRows, $sweptOpenRows, $piId, $intent, $dryRun, $audits, $alerts, $anyCancelled, $fallback);
        }

        if ($status === 'succeeded') {
            return $this->syncAlreadyCapturedGroup($rows, $openRows, $sweptOpenRows, $piId, $dryRun, $audits, $anyCancelled);
        }

        if ($status === 'canceled') {
            return $this->expireGroup($openRows, $sweptOpenRows, $piId, $dryRun, $audits);
        }

        // requires_payment_method / requires_action / requires_confirmation
        // / processing — not our problem to resolve yet. Counted once per
        // swept row, same reasoning as the retrieve-failure branch above.
        return $this->tally(['skipped' => $sweptOpenRows->count()]);
    }

    private function isCancelledStayRow(BookingMirror $row): bool
    {
        // NOT no-show — see the class docblock, "A NO-SHOW stay...".
        return (string) $row->internal_status === 'cancelled'
            || (string) $row->booking_state === 'cancelled'
            || $row->cancelled_at !== null;
    }

    /**
     * The first open row THIS sweep selected — used for log lines; any open
     * row of the group when none of the swept ones is still open by lock
     * time.
     */
    private function firstOpenSwept(Collection $sweptOpenRows, Collection $openRows): BookingMirror
    {
        return $sweptOpenRows->first() ?? $openRows->first();
    }

    /**
     * Every room of the group is cancelled: cancel the hold once, flip every
     * OPEN row, one audit per open row. Counters and dry-run lines follow the
     * open rows THIS sweep selected (a sibling --limit cut off is still
     * written, never counted — see decideBookingGroup()).
     */
    private function releaseCancelledGroup(StripeService $stripe, Collection $openRows, Collection $sweptOpenRows, string $piId, bool $dryRun, array &$audits): array
    {
        if ($dryRun) {
            foreach ($sweptOpenRows as $row) {
                $this->line("[dry-run] would cancel the hold on cancelled booking #{$row->id} (PI {$piId})");
            }
            return $this->tally(['released' => $sweptOpenRows->count()]);
        }
        try {
            $stripe->cancelPaymentIntent($piId, 'abandoned');
        } catch (\Throwable $e) {
            Log::error("Capture cron — cancel of a cancelled booking's hold failed", ['mirror_id' => $this->firstOpenSwept($sweptOpenRows, $openRows)->id, 'pi_id' => $piId, 'error' => $e->getMessage()]);
            return $this->tally(['failed' => 1]);
        }

        // The hold really was released at Stripe now — every OPEN row's
        // audit below fires regardless of whether its own local write
        // happens to match; a sibling in any other status (already paid,
        // refunded, …) is left untouched and not counted.
        foreach ($openRows as $row) {
            $result = $this->guarded(
                fn () => BookingMirror::withoutGlobalScopes()->where('id', $row->id)->where('payment_status', $row->payment_status)->update(['payment_status' => 'cancelled']),
                'Capture cron — cancelled-group write failed', ['mirror_id' => $row->id],
            );
            // "already moved on" describes a clean predicate mismatch (the
            // row was already changed by someone else); any other outcome —
            // a successful write, or the write itself throwing — uses the
            // generic wording, since the audit records that the PI was
            // released at Stripe, not the local row's persistence outcome.
            $description = $result === 0
                ? "Booking #{$row->id} is cancelled; PI {$piId} was cancelled at Stripe, but this row had already moved on by the time the cron wrote it"
                : "Booking #{$row->id} is cancelled; PI {$piId} was cancelled instead of captured";
            $audits[] = [
                'org' => $row->organization_id, 'action' => 'booking.capture.cancelled_booking', 'pi' => $piId,
                'extra' => ['mirror_id' => $row->id],
                'description' => $description,
                'subjectType' => 'booking_mirror', 'subjectId' => (int) $row->id,
            ];
        }
        return $this->tally(['released' => $sweptOpenRows->count()]);
    }

    /** At least one room of the group is still live: capture once, mark every open row paid, flag every cancelled one just paid. */
    private function captureGroup(StripeService $stripe, Collection $rows, Collection $openRows, Collection $sweptOpenRows, string $piId, $intent, bool $dryRun, array &$audits, array &$alerts, bool $anyCancelled, array &$fallback): array
    {
        // The FIRST OPEN row THIS SWEEP selected — a run only ever reports
        // on the rows its own SELECT found, never a sibling cut off by
        // --limit or already resolved. Falls back to any open row of the
        // group if none of the swept ones are still open by lock time.
        $repRow = $sweptOpenRows->first() ?? $openRows->first() ?? $rows->first();
        $repId  = $repRow->id;
        $orgId  = $repRow->organization_id;

        if ($dryRun) {
            // Nothing is actually captured, so every swept-open row
            // independently still sees requires_capture — one line, one
            // 'captured' count, PER SWEPT ROW (a row --limit cut off never
            // appears here).
            foreach ($sweptOpenRows as $row) {
                $this->line("[dry-run] would capture booking #{$row->id} (PI {$piId})");
            }
            $needsRefundCount = 0;
            if ($anyCancelled) {
                foreach ($openRows as $row) {
                    if ($this->isCancelledStayRow($row)) {
                        // Not yet captured — "already captured" would be
                        // the wrong wording here since nothing has actually
                        // been captured in dry-run.
                        $this->line("[dry-run] would flag booking #{$row->id} for a refund once PI {$piId} is captured");
                        $needsRefundCount++;
                    }
                }
            }
            return $this->tally(['captured' => $sweptOpenRows->count(), 'needs_refund' => $needsRefundCount]);
        }

        try {
            $stripe->capturePaymentIntent($piId);
        } catch (\Throwable $e) {
            Log::error('Capture cron — capture failed', ['mirror_id' => $repId, 'pi_id' => $piId, 'error' => $e->getMessage()]);

            // A capture refusal writes an audit row and pushes a realtime
            // alert so the admin UI surfaces a badge that the booking needs
            // manual review — one attempt/audit/alert per group, not once
            // per room (see the class docblock). Both are collected here
            // and written/dispatched AFTER the transaction ends, each
            // independently, so a failing audit insert cannot lose the
            // alert.
            $audits[] = [
                'org' => $orgId, 'action' => 'booking.capture.failed', 'pi' => $piId,
                'extra' => ['mirror_id' => $repId, 'error' => mb_substr($e->getMessage(), 0, 500)],
                'description' => "Capture failed for PI {$piId} — manual review needed",
            ];
            $alerts[] = [
                'type' => 'booking.capture_failed', 'title' => 'Payment capture failed',
                'body' => "Booking #{$repId} (guest: {$repRow->guest_name}) — Stripe refused capture. Manual review needed.",
                'data' => ['mirror_id' => $repId, 'pi_id' => $piId, 'error' => mb_substr($e->getMessage(), 0, 200), 'action_url' => "/bookings/{$repId}"],
                'orgId' => $orgId,
            ];
            // The counter follows the swept-open count even though the
            // attempt itself stays one per group — see the class docblock.
            return $this->tally(['failed' => $sweptOpenRows->count()]);
        }

        // One real capture stands in for the whole group: this row is
        // reported captured, every other swept-open row already_captured —
        // see the class docblock's COMBO paragraph. Stashed immediately —
        // before any further read or write — so a commit failure after this
        // point still falls back to the true "captured at Stripe" outcome.
        $t = $this->tally(['captured' => 1, 'already_captured' => max(0, $sweptOpenRows->count() - 1)]);
        $fallback['tally'] = $t;

        $this->markBookingPaid($repRow);

        $audits[] = [
            'org' => $orgId, 'action' => 'booking.capture.recovered', 'pi' => $piId,
            'extra' => ['mirror_id' => $repId, 'amount' => (int) ($intent->amount ?? 0)],
            'description' => "Captured PI {$piId} via cron after sync capture missed",
        ];

        if ($anyCancelled) {
            // Only the rows just marked paid that are ALSO cancelled — not
            // every cancelled row in the group regardless of payment state.
            foreach ($openRows as $row) {
                if ($this->isCancelledStayRow($row) && $this->flagBookingForRefundRow($row, $piId, $audits)) {
                    $t['needs_refund']++;
                }
            }
        }

        return $t;
    }

    /**
     * The PI already succeeded elsewhere: sync every open row to paid, flag
     * every cancelled one just paid, no Stripe call. The already-captured
     * count and the dry-run lines follow the open rows THIS sweep selected;
     * needs_refund counts the flags actually queued.
     */
    private function syncAlreadyCapturedGroup(Collection $rows, Collection $openRows, Collection $sweptOpenRows, string $piId, bool $dryRun, array &$audits, bool $anyCancelled): array
    {
        if ($dryRun) {
            if ($anyCancelled) {
                foreach ($sweptOpenRows as $row) {
                    if ($this->isCancelledStayRow($row)) {
                        $this->line("[dry-run] would flag booking #{$row->id} for a refund (PI {$piId} already captured)");
                    }
                }
            }
            return $this->tally(['already_captured' => $sweptOpenRows->count()]);
        }

        $this->markBookingPaid($rows->first());
        $t = $this->tally(['already_captured' => $sweptOpenRows->count()]);
        if ($anyCancelled) {
            foreach ($openRows as $row) {
                if ($this->isCancelledStayRow($row) && $this->flagBookingForRefundRow($row, $piId, $audits)) {
                    $t['needs_refund']++;
                }
            }
        }

        return $t;
    }

    /** One row, just marked paid, that is cancelled: flag it once (idempotent). Returns whether a NEW flag was queued. */
    private function flagBookingForRefundRow(BookingMirror $row, string $piId, array &$audits): bool
    {
        $flagged = AuditLog::withoutGlobalScopes()
            ->where('organization_id', $row->organization_id)
            ->where('action', 'booking.capture.needs_refund')
            ->where('subject_type', 'booking_mirror')
            ->where('subject_id', $row->id)
            ->exists();
        if ($flagged) {
            return false;
        }
        $audits[] = [
            'org' => $row->organization_id, 'action' => 'booking.capture.needs_refund', 'pi' => $piId,
            'extra' => ['mirror_id' => $row->id],
            'description' => "Booking #{$row->id} is cancelled but PI {$piId} was already captured — refund it from the booking's page if due",
            'subjectType' => 'booking_mirror', 'subjectId' => (int) $row->id,
        ];
        return true;
    }

    /**
     * The PI itself was cancelled at Stripe: flip every still-open row, one
     * audit per row, always written; the expired count follows the open rows
     * THIS sweep selected.
     */
    private function expireGroup(Collection $openRows, Collection $sweptOpenRows, string $piId, bool $dryRun, array &$audits): array
    {
        if ($dryRun) {
            // 'expired' is still counted in dry-run — only the write and
            // audit are gated on it.
            return $this->tally(['expired' => $sweptOpenRows->count()]);
        }
        foreach ($openRows as $row) {
            $result = $this->guarded(
                fn () => BookingMirror::withoutGlobalScopes()->where('id', $row->id)->where('payment_status', $row->payment_status)->update(['payment_status' => 'cancelled']),
                'Capture cron — expire-group write failed', ['mirror_id' => $row->id],
            );
            // "already moved on" only for a clean predicate mismatch; any
            // other outcome uses the generic wording below.
            $description = $result === 0
                ? "PI {$piId} was canceled before capture; mirror #{$row->id} had already moved on by the time the cron wrote it"
                : "PI {$piId} was canceled before capture; mirror flipped to cancelled";
            $audits[] = [
                'org' => $row->organization_id, 'action' => 'booking.capture.expired', 'pi' => $piId,
                'extra' => ['mirror_id' => $row->id],
                'description' => $description,
            ];
        }
        return $this->tally(['expired' => $sweptOpenRows->count()]);
    }

    /**
     * Same shape as processBooking but for one ServiceBooking row — no
     * combo notion for services, each has its own PaymentIntent.
     */
    private function processServiceBooking(StripeService $stripe, ServiceBooking $booking, bool $dryRun): array
    {
        app()->instance('current_organization_id', (int) $booking->organization_id);

        if (!$stripe->isEnabled()) {
            return $this->tally(['skipped' => 1]);
        }

        $piId = (string) $booking->stripe_payment_intent_id;
        $bookingId = $booking->id;

        if ($dryRun) {
            // No row lock, no `pi:` lock, no transaction — see processBooking().
            $fresh = ServiceBooking::withoutGlobalScopes()->where('id', $bookingId)->first();
            if (!$fresh || !in_array((string) $fresh->payment_status, ['authorized', 'pending'], true)) {
                return $this->tally();
            }
            $audits = [];
            $fallback = [];
            return $this->decideServiceBooking($stripe, $fresh, $piId, true, $audits, $fallback);
        }

        $audits = [];
        $fallback = [];
        try {
            $result = DB::transaction(function () use ($stripe, $bookingId, $piId, &$audits, &$fallback) {
                // Row lock first, `pi:` second — see the class docblock.
                $fresh = ServiceBooking::withoutGlobalScopes()
                    ->where('id', $bookingId)
                    ->lockForUpdate()
                    ->first();
                if (!$fresh || !in_array((string) $fresh->payment_status, ['authorized', 'pending'], true)) {
                    return $this->tally();
                }
                AdvisoryLock::within('pi:' . $piId);

                return $this->decideServiceBooking($stripe, $fresh, $piId, false, $audits, $fallback);
            });
        } catch (\Throwable $e) {
            Log::error('Capture cron (service) — booking transaction failed', ['service_booking_id' => $booking->id, 'pi_id' => $piId, 'error' => $e->getMessage()]);
            $result = $fallback['tally'] ?? $this->tally(['failed' => 1]);
        }

        foreach ($audits as $a) {
            $this->auditOutcome($a['org'], $a['action'], $a['pi'], $a['extra'], $a['description'], $a['subjectType'] ?? 'stripe_payment', $a['subjectId'] ?? null);
        }

        return $result;
    }

    private function decideServiceBooking(StripeService $stripe, ServiceBooking $fresh, string $piId, bool $dryRun, array &$audits, array &$fallback): array
    {
        $observedPaymentStatus = (string) $fresh->payment_status;

        try {
            $intent = $stripe->retrievePaymentIntent($piId);
        } catch (\Throwable $e) {
            Log::warning('Capture cron (service) — retrieve failed', ['service_booking_id' => $fresh->id, 'pi_id' => $piId, 'error' => $e->getMessage()]);
            return $this->tally(['failed' => 1]);
        }
        $status = (string) ($intent->status ?? '');

        // A booking cancelled (or marked no-show) inside the capture window
        // must not be charged: release a hold that is still open, and flag
        // — never touch — one whose payment was already taken (a refund is
        // the operator's decision).
        if (in_array((string) $fresh->status, ['cancelled', 'no_show'], true)) {
            if ($status === 'requires_capture') {
                return $this->releaseCancelledServiceBooking($stripe, $fresh, $piId, $observedPaymentStatus, $dryRun, $audits);
            }
            if ($status === 'succeeded') {
                return $this->flagServiceBookingForRefund($fresh, $piId, $dryRun, $audits);
            }
        }

        if ($status === 'requires_capture') {
            if ($dryRun) {
                $this->line("[dry-run] would capture service booking #{$fresh->id} (PI {$piId})");
                return $this->tally(['captured' => 1]);
            }
            try {
                $stripe->capturePaymentIntent($piId);
            } catch (\Throwable $e) {
                Log::error('Capture cron (service) — capture failed', ['service_booking_id' => $fresh->id, 'pi_id' => $piId, 'error' => $e->getMessage()]);
                return $this->tally(['failed' => 1]);
            }
            $t = $this->tally(['captured' => 1]);
            $fallback['tally'] = $t;

            $this->guarded(
                fn () => ServiceBooking::withoutGlobalScopes()->where('id', $fresh->id)->where('payment_status', $observedPaymentStatus)->update(['payment_status' => 'paid']),
                'Capture cron (service) — paid write failed', ['service_booking_id' => $fresh->id],
            );
            $audits[] = [
                'org' => $fresh->organization_id, 'action' => 'service_booking.capture.recovered', 'pi' => $piId,
                'extra' => ['service_booking_id' => $fresh->id, 'amount' => (int) ($intent->amount ?? 0)],
                'description' => "Captured PI {$piId} via cron after sync capture missed",
            ];
            return $t;
        }

        if ($status === 'succeeded') {
            if (!$dryRun) {
                $this->guarded(
                    fn () => ServiceBooking::withoutGlobalScopes()->where('id', $fresh->id)->where('payment_status', $observedPaymentStatus)->update(['payment_status' => 'paid']),
                    'Capture cron (service) — already-captured write failed', ['service_booking_id' => $fresh->id],
                );
            }
            return $this->tally(['already_captured' => 1]);
        }

        if ($status === 'canceled') {
            if (!$dryRun) {
                $result = $this->guarded(
                    fn () => ServiceBooking::withoutGlobalScopes()->where('id', $fresh->id)->where('payment_status', $observedPaymentStatus)->update(['payment_status' => 'cancelled']),
                    'Capture cron (service) — expire write failed', ['service_booking_id' => $fresh->id],
                );
                // "already moved on" only for a clean predicate mismatch; any
                // other outcome uses the generic wording below.
                $description = $result === 0
                    ? "PI {$piId} was canceled before capture; booking #{$fresh->id} had already moved on by the time the cron wrote it"
                    : "PI {$piId} was canceled before capture; booking flipped to cancelled";
                $audits[] = [
                    'org' => $fresh->organization_id, 'action' => 'service_booking.capture.expired', 'pi' => $piId,
                    'extra' => ['service_booking_id' => $fresh->id],
                    'description' => $description,
                ];
            }
            return $this->tally(['expired' => 1]);
        }

        return $this->tally(['skipped' => 1]);
    }

    /** A cancelled / no-show service booking whose card is still only held: cancel the hold instead of capturing it. */
    private function releaseCancelledServiceBooking(StripeService $stripe, ServiceBooking $booking, string $piId, string $observedPaymentStatus, bool $dryRun, array &$audits): array
    {
        if ($dryRun) {
            $this->line("[dry-run] would cancel the hold on cancelled service booking #{$booking->id} (PI {$piId}, status {$booking->status})");
            return $this->tally(['released' => 1]);
        }
        try {
            $stripe->cancelPaymentIntent($piId, 'abandoned');
        } catch (\Throwable $e) {
            Log::error("Capture cron (service) — cancel of a cancelled booking's hold failed", ['service_booking_id' => $booking->id, 'pi_id' => $piId, 'error' => $e->getMessage()]);
            return $this->tally(['failed' => 1]);
        }
        $result = $this->guarded(
            fn () => ServiceBooking::withoutGlobalScopes()->where('id', $booking->id)->where('payment_status', $observedPaymentStatus)->update(['payment_status' => 'cancelled']),
            'Capture cron (service) — release write failed', ['service_booking_id' => $booking->id],
        );
        // "already moved on" only for a clean predicate mismatch; any
        // other outcome uses the generic wording below.
        $description = $result === 0
            ? "Booking #{$booking->id} is {$booking->status}; PI {$piId} was cancelled at Stripe, but this row had already moved on by the time the cron wrote it"
            : "Booking #{$booking->id} is {$booking->status}; PI {$piId} was cancelled instead of captured";
        $audits[] = [
            'org' => $booking->organization_id, 'action' => 'service_booking.capture.cancelled_booking', 'pi' => $piId,
            'extra' => ['service_booking_id' => $booking->id, 'booking_status' => $booking->status],
            'description' => $description,
            'subjectType' => 'service_booking', 'subjectId' => (int) $booking->id,
        ];
        return $this->tally(['released' => 1]);
    }

    /**
     * A cancelled / no-show service booking whose payment was already
     * taken: left exactly as it is (a refund is the operator's action) and
     * flagged with one audit row, once.
     */
    private function flagServiceBookingForRefund(ServiceBooking $booking, string $piId, bool $dryRun, array &$audits): array
    {
        if ($dryRun) {
            $this->line("[dry-run] would flag service booking #{$booking->id} for a refund (PI {$piId} already captured, status {$booking->status})");
            return $this->tally(['needs_refund' => 1]);
        }
        $flagged = AuditLog::withoutGlobalScopes()
            ->where('organization_id', $booking->organization_id)
            ->where('action', 'service_booking.capture.needs_refund')
            ->where('subject_type', 'service_booking')
            ->where('subject_id', $booking->id)
            ->exists();
        if (!$flagged) {
            $audits[] = [
                'org' => $booking->organization_id, 'action' => 'service_booking.capture.needs_refund', 'pi' => $piId,
                'extra' => ['service_booking_id' => $booking->id, 'booking_status' => $booking->status],
                'description' => "Booking #{$booking->id} is {$booking->status} but PI {$piId} was already captured — refund it in the Stripe dashboard if due",
                'subjectType' => 'service_booking', 'subjectId' => (int) $booking->id,
            ];
        }
        return $this->tally(['needs_refund' => 1]);
    }

    /**
     * Flip a BookingMirror (and any siblings in the same booking_group
     * sharing the same PI — combo bookings) to paid. Skip mirrors
     * already in a terminal state so we don't clobber refunds. Each row's
     * own UPDATE runs in its own SAVEPOINT (see the class docblock's
     * PostgreSQL paragraph) and is conditioned on the payment_status that
     * same read just observed, so even a caller with no lock of its own
     * (`reconcileStaleAuths()`) cannot clobber a status a lock-holding
     * writer changed between the SELECT and the UPDATE.
     *
     * Includes orWhereNull because Postgres `IN` never matches NULL —
     * orphan-recovered mirrors with a null payment_status would otherwise
     * stay null after capture.
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
            $query->get()->each(function (BookingMirror $m) {
                $observed = $m->payment_status;
                $this->guarded(function () use ($m, $observed) {
                    return BookingMirror::withoutGlobalScopes()
                        ->where('id', $m->id)
                        ->where(function ($q) use ($observed) {
                            $observed === null ? $q->whereNull('payment_status') : $q->where('payment_status', $observed);
                        })
                        ->update([
                            'payment_status' => 'paid',
                            'payment_method' => $m->payment_method ?: 'stripe',
                            'price_paid'     => $m->price_total,
                        ]);
                }, 'Capture cron — markBookingPaid failed', ['mirror_id' => $m->id]);
            });
        } catch (\Throwable $e) {
            Log::warning('Capture cron — markBookingPaid failed', [
                'mirror_id' => $mirror->id,
                'error'     => $e->getMessage(),
            ]);
        }
    }

    /**
     * Stale-auth reconciliation.
     *
     * For mirrors older than 6 days that are still 'authorized' or
     * 'pending', retrieve the PI and decide:
     * - canceled / requires_payment_method → the auth genuinely expired
     *   unused: flip to 'capture_expired' + audit, for EVERY such stay,
     *   cancelled or not — this method does not check cancellation state;
     *   only the write itself is conditioned on the payment_status just
     *   read, exactly like every other write in this class.
     * - succeeded → the money is at Stripe regardless of local state: mark
     *   paid (markBookingPaid()'s own conditional write), and if the stay
     *   is a cancelled one, also flag it with booking.capture.needs_refund
     *   once — the same rule the main sweep applies, so a stale cancelled
     *   stay never sits silently 'authorized' for want of this path
     *   running.
     * - requires_capture → still capturable somehow (rare) → leave; the
     *   main sweep will pick it up if it's now < 6 days, otherwise audit
     *   and leave for staff.
     * - retrieve fails → leave + log (no audit — nothing is known about the
     *   PI to record).
     *
     * A write that THROWS here (as opposed to a clean predicate mismatch)
     * is logged only, no audit — the audit only follows a write whose
     * outcome (matched or not) is actually known.
     *
     * Takes no lock of its own (row or `pi:`) — see the class docblock.
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

            $observed = (string) $mirror->payment_status;
            if ($status === 'canceled' || $status === 'requires_payment_method') {
                $result = $this->guarded(
                    fn () => BookingMirror::withoutGlobalScopes()->where('id', $mirror->id)->where('payment_status', $observed)->update(['payment_status' => 'capture_expired']),
                    'Stale-auth reconcile — update failed', ['mirror_id' => $mirror->id],
                );
                if ($result !== null) {
                    // A clean write (a row updated, or 0 matched — then the
                    // description says the row had already moved on) always
                    // audits here; an EXCEPTION ($result === null) instead
                    // logs only, inside guarded().
                    $this->auditOutcome($mirror->organization_id, 'booking.capture.auth_expired', $piId, [
                        'mirror_id' => $mirror->id, 'stripe_status' => $status, 'age_days' => $mirror->created_at?->diffInDays(now()),
                    ], "PI {$piId} authorization expired/cancelled before capture (status={$status}, mirror age > 6d). Flipped to capture_expired." . ($result === 0 ? ' (row had already moved on)' : ''));
                }
            } elseif ($status === 'succeeded') {
                $this->markBookingPaid($mirror);
                // Re-read fresh: flag needs_refund only when the row is
                // genuinely 'paid' now — either this run's own
                // markBookingPaid() wrote it, or it already was — never
                // from the in-memory $mirror, which markBookingPaid() never
                // updates in place. A database error in this per-row block
                // is logged and the loop moves on to the next row.
                try {
                    $freshMirror = BookingMirror::withoutGlobalScopes()->find($mirror->id);
                    if ($freshMirror && (string) $freshMirror->payment_status === 'paid' && $this->isCancelledStayRow($freshMirror)) {
                        $audits = [];
                        $this->flagBookingForRefundRow($freshMirror, $piId, $audits);
                        foreach ($audits as $a) {
                            $this->auditOutcome($a['org'], $a['action'], $a['pi'], $a['extra'], $a['description'], $a['subjectType'] ?? 'stripe_payment', $a['subjectId'] ?? null);
                        }
                    }
                } catch (\Throwable $e) {
                    Log::warning('Stale-auth reconcile — update failed', [
                        'mirror_id' => $mirror->id, 'error' => $e->getMessage(),
                    ]);
                }
            } else {
                // Unexpected — audit but don't touch the mirror.
                $this->auditOutcome($mirror->organization_id, 'booking.capture.stale_unhandled', $piId, [
                    'mirror_id' => $mirror->id, 'stripe_status' => $status,
                ], "Stale auth mirror #{$mirror->id} has PI in unexpected state {$status}");
            }
        }
        return $processed;
    }

    private function auditOutcome(?int $orgId, string $action, string $piId, array $extra, string $description, string $subjectType = 'stripe_payment', ?int $subjectId = null): void
    {
        try {
            AuditLog::create([
                'organization_id' => $orgId,
                'action'          => $action,
                'subject_type'    => $subjectType,
                'subject_id'      => $subjectId,
                'new_values'      => array_merge(['payment_intent_id' => $piId], $extra),
                'description'     => $description,
            ]);
        } catch (\Throwable) {
            // best-effort
        }
    }
}
