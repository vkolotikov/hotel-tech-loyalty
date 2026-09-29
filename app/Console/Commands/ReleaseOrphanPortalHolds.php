<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\HotelSetting;
use App\Services\Booking\PortalPaymentIntentGuard;
use App\Services\StripeService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Releases card holds the member portal took for a booking that was never
 * written: the card was authorised, then the browser closed or the
 * connection dropped before confirm. No row carries such a payment, so
 * the capture job never sees it; without this the hold sits on the
 * member's card until Stripe's authorisation lapses (about a week).
 *
 * Deliberately narrow. It releases a payment only when ALL of these hold:
 *   - the portal made it (metadata `kind` is portal_service_booking or
 *     portal_stay_booking) for THIS organisation (metadata `org_id`);
 *   - a card is held and nothing was taken (`requires_capture`);
 *   - the card was actually AUTHORISED (not merely created as an intent)
 *     more than --minutes ago (default 45: a stay's hold lives fifteen
 *     minutes from the payment step) — a member who leaves the pay step
 *     open, then pays, is never eligible however old the intent itself is;
 *   - no service booking and no stay of the organisation carries it.
 * Every one of these is checked twice: once here, cheaply, from the
 * PaymentIntent object Stripe's list already returned — a non-authoritative
 * first pass that never touches Stripe or the DB beyond the list call
 * itself — and again, fully and authoritatively, inside
 * `PortalPaymentIntentGuard::releaseOrphan()`, against a FRESH retrieve
 * taken under the SAME `pi:` advisory lock a confirm takes before it
 * spends the intent (see that method's docblock). That second check is
 * what closes the gap a stale list read would otherwise leave open, and
 * it — not this command — is the one place that decides "carried, still
 * eligible, else cancel" over a member's money.
 * A captured payment is never touched: returning money is a person's decision.
 *
 * The audit row `portal.hold.orphan_released` is written only AFTER
 * releaseOrphan()'s own lock/transaction has returned true — so it can
 * never record a release that turned out not to happen (the intent was
 * carried after all, no longer eligible, or Stripe's cancel call itself
 * failed).
 */
class ReleaseOrphanPortalHolds extends Command
{
    protected $signature = 'bookings:release-orphan-portal-holds
                            {--org= : Limit to a single organization id}
                            {--dry-run : Report what would be released without calling Stripe}
                            {--minutes=45 : How old a hold must be before it is released}';

    protected $description = 'Release card holds the member portal took for bookings that were never written.';

    public function handle(StripeService $stripe, PortalPaymentIntentGuard $guard): int
    {
        $dry = (bool) $this->option('dry-run');
        $minutes = max(20, (int) $this->option('minutes'));
        $cutoff = now()->subMinutes($minutes)->timestamp;
        $released = 0;

        $orgIds = HotelSetting::withoutGlobalScopes()
            ->where('key', 'booking_payment_enabled')
            ->where('value', 'true')
            ->when($this->option('org'), fn ($q) => $q->where('organization_id', (int) $this->option('org')))
            ->pluck('organization_id')
            ->unique();

        foreach ($orgIds as $orgId) {
            $orgId = (int) $orgId;
            $hadPrevious = app()->bound('current_organization_id');
            $previous = $hadPrevious ? app('current_organization_id') : null;
            app()->instance('current_organization_id', $orgId);
            try {
                if (!$stripe->isEnabled()) {
                    continue;
                }
                foreach ($stripe->listPaymentIntents(now()->subDays(6)->timestamp, $cutoff) as $pi) {
                    if ($this->isOrphanedHold($pi, $orgId, $cutoff) && $this->release($guard, $pi, $orgId, $cutoff, $dry)) {
                        $released++;
                    }
                }
            } catch (\Throwable $e) {
                // One venue's Stripe being down must not stop the others.
                Log::warning('bookings:release-orphan-portal-holds failed for a venue', ['org' => $orgId, 'error' => $e->getMessage()]);
            } finally {
                // Restored per organisation, not just once at the end — the
                // next org's own iteration (isEnabled(), listPaymentIntents(),
                // every carried()/releaseOrphan() lookup) must never run
                // under a binding this org's own iteration left behind.
                if ($hadPrevious) {
                    app()->instance('current_organization_id', $previous);
                } else {
                    app()->forgetInstance('current_organization_id');
                }
            }
        }

        $this->info(($dry ? '[dry-run] ' : '') . "{$released} hold(s) " . ($dry ? 'would be released.' : 'released.'));

        return self::SUCCESS;
    }

    /**
     * A cheap, non-authoritative first pass over the PaymentIntent object
     * Stripe's own list already returned — see the class docblock.
     * releaseOrphan() re-proves every one of these against a fresh retrieve
     * under the lock before it ever cancels anything.
     */
    private function isOrphanedHold(object $pi, int $orgId, int $cutoff): bool
    {
        $meta = $this->metadata($pi);

        return (string) ($pi->status ?? '') === 'requires_capture'
            && in_array($meta['kind'] ?? null, PortalPaymentIntentGuard::PORTAL_KINDS, true)
            && (int) ($meta['org_id'] ?? 0) === $orgId
            && (int) ($pi->created ?? PHP_INT_MAX) <= $cutoff;
    }

    private function release(PortalPaymentIntentGuard $guard, object $pi, int $orgId, int $cutoff, bool $dry): bool
    {
        $id = (string) $pi->id;
        $kind = (string) ($this->metadata($pi)['kind'] ?? '');

        if ($dry) {
            // Lock-free, read-only, no Stripe call: a service booking still
            // awaiting staff confirmation carries its intent uncaptured for
            // days by design, and must not be reported as an orphan.
            if ($guard->isCarried($id, $orgId)) {
                return false;
            }
            $this->line("[dry-run] would release {$id} (org {$orgId}, {$kind})");
            return true;
        }

        // The full, authoritative "carried, still eligible, else cancel"
        // decision — and the pi: lock it runs under — lives entirely in
        // the guard; see the class docblock.
        if (!$guard->releaseOrphan($id, $orgId, $cutoff)) {
            return false;
        }

        AuditLog::create([
            'organization_id' => $orgId,
            'action'          => 'portal.hold.orphan_released',
            'subject_type'    => 'stripe_payment',
            'subject_id'      => null,
            'new_values'      => ['payment_intent_id' => $id, 'kind' => $kind, 'amount' => (int) ($pi->amount ?? 0), 'currency' => (string) ($pi->currency ?? '')],
            'description'     => "Released the card hold {$id}: the member portal took it for a booking that was never written",
        ]);

        return true;
    }

    private function metadata(object $pi): array
    {
        $m = $pi->metadata ?? [];

        return is_array($m) ? $m : (method_exists($m, 'toArray') ? $m->toArray() : (array) $m);
    }
}
