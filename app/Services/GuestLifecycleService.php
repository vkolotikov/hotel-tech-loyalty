<?php

namespace App\Services;

use App\Models\Guest;
use Carbon\Carbon;

/**
 * Drives lifecycle_status transitions for Guest records based on stay
 * activity. Without this, every auto-Bronze guest looks the same — a
 * single form fill is indistinguishable from a repeat customer in the
 * Members list.
 *
 * Transitions (using the values from crm_settings.lifecycle_statuses):
 *   created (no stays)        -> Prospect
 *   first confirmed stay      -> First-Time Guest
 *   2+ confirmed stays        -> Returning Guest
 *   90+ days since activity   -> Inactive
 *
 * VIP and Corporate are intentionally manual — never overwritten here.
 */
class GuestLifecycleService
{
    public const PROSPECT       = 'Prospect';
    public const FIRST_TIME     = 'First-Time Guest';
    public const RETURNING      = 'Returning Guest';
    public const INACTIVE       = 'Inactive';
    public const VIP            = 'VIP';
    public const CORPORATE      = 'Corporate';

    /** Manual states we never auto-overwrite. */
    protected const MANUAL_STATES = [self::VIP, self::CORPORATE];

    public const DORMANT_AFTER_DAYS = 90;

    /**
     * Default state for a brand-new guest. Called from Guest::created.
     */
    public function initialize(Guest $guest): void
    {
        if ($guest->lifecycle_status) return;
        $guest->update(['lifecycle_status' => self::PROSPECT]);
    }

    /**
     * Record a confirmed stay against a guest. Increments aggregates,
     * updates first/last stay dates, and bumps lifecycle_status forward
     * (never backwards, never over a manual VIP/Corporate flag).
     */
    public function recordStay(
        Guest $guest,
        string|Carbon|null $checkIn,
        string|Carbon|null $checkOut,
        ?int $nights = null,
        float $revenue = 0
    ): void {
        $checkInDate  = $checkIn ? Carbon::parse($checkIn) : null;
        $checkOutDate = $checkOut ? Carbon::parse($checkOut) : null;
        if ($nights === null && $checkInDate && $checkOutDate) {
            $nights = max(0, $checkInDate->diffInDays($checkOutDate));
        }

        $guest->increment('total_stays');
        if ($nights)  $guest->increment('total_nights', $nights);
        if ($revenue) $guest->increment('total_revenue', $revenue);

        $updates = ['last_activity_at' => now()];
        if ($checkOutDate) $updates['last_stay_date'] = $checkOutDate->toDateString();
        if ($checkInDate && !$guest->first_stay_date) {
            $updates['first_stay_date'] = $checkInDate->toDateString();
        }
        $guest->update($updates);

        // Reload to pick up the freshly incremented total_stays before
        // computing lifecycle_status.
        $guest->refresh();
        $this->reassess($guest);
    }

    /**
     * Mark a fresh touch (chat reply, opened email, etc.) — bumps
     * last_activity_at without affecting stay counters.
     */
    public function recordActivity(Guest $guest): void
    {
        $guest->update(['last_activity_at' => now()]);
        // Coming back from inactive after any touch is a useful signal.
        if ($guest->lifecycle_status === self::INACTIVE) {
            $this->reassess($guest);
        }
    }

    /**
     * Recompute lifecycle_status from the guest's current totals.
     * Called after any state-changing event. Idempotent.
     */
    public function reassess(Guest $guest): void
    {
        if (in_array($guest->lifecycle_status, self::MANUAL_STATES, true)) return;

        $stays = (int) ($guest->total_stays ?? 0);
        $next  = match (true) {
            $stays >= 2 => self::RETURNING,
            $stays === 1 => self::FIRST_TIME,
            default      => self::PROSPECT,
        };

        if ($guest->lifecycle_status !== $next) {
            $guest->update(['lifecycle_status' => $next]);
        }
    }

    /**
     * Backfill: walk every guest system-wide and reassess their lifecycle
     * from current totals. Used as a one-shot cleanup for rows that pre-date
     * the auto-lifecycle logic or that hold stale "Lead"/null values.
     * Returns the number of guests whose status actually changed.
     */
    public function reassessAll(): int
    {
        $changed = 0;
        Guest::withoutGlobalScopes()
            ->whereNotIn('lifecycle_status', self::MANUAL_STATES)
            ->orWhereNull('lifecycle_status')
            ->chunkById(500, function ($guests) use (&$changed) {
                foreach ($guests as $guest) {
                    $before = $guest->lifecycle_status;
                    $this->reassess($guest);
                    if ($guest->fresh()->lifecycle_status !== $before) {
                        $changed++;
                    }
                }
            });
        return $changed;
    }

    /**
     * Sweep all guests in the current scope and mark anyone with no
     * activity in the last DORMANT_AFTER_DAYS as Inactive. Run from
     * a scheduled console command.
     */
    public function sweepDormant(): int
    {
        $cutoff = now()->subDays(self::DORMANT_AFTER_DAYS);

        // System-wide sweep — runs from a console command with no tenant
        // context, so bypass the tenant scope and process every org at once.
        return Guest::withoutGlobalScopes()
            ->whereNotIn('lifecycle_status', array_merge(self::MANUAL_STATES, [self::INACTIVE]))
            ->where(function ($q) use ($cutoff) {
                $q->where('last_activity_at', '<', $cutoff)
                  ->orWhere(function ($qq) use ($cutoff) {
                      $qq->whereNull('last_activity_at')->where('created_at', '<', $cutoff);
                  });
            })
            ->update(['lifecycle_status' => self::INACTIVE]);
    }
}
