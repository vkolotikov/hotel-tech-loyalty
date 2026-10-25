<?php

namespace App\Services;


use App\Models\AuditLog;
use App\Models\DomainEvent;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\PointExpiryBucket;
use App\Models\PointsTransaction;
use App\Models\TierAssessment;
use App\Models\User;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class LoyaltyService
{
    /**
     * Award points to a member with full ledger accounting.
     */
    public function awardPoints(
        LoyaltyMember $member,
        int           $points,
        string        $description,
        string        $type = 'earn',
        ?User         $staff = null,
        ?string       $referenceType = null,
        ?int          $referenceId = null,
        ?float        $amountSpent = null,
        ?int          $propertyId = null,
        ?int          $outletId = null,
        ?string       $reasonCode = null,
        ?string       $sourceType = null,
        ?string       $sourceId = null,
        ?string       $idempotencyKey = null,
        bool          $qualifying = true,
        ?string       $approvalStatus = 'auto_approved',
    ): PointsTransaction {
        // Idempotency check
        if ($idempotencyKey) {
            $existing = PointsTransaction::where('idempotency_key', $idempotencyKey)->first();
            if ($existing) {
                return $existing;
            }
        }

        return DB::transaction(function () use (
            $member, $points, $description, $type, $staff, $referenceType,
            $referenceId, $amountSpent, $propertyId, $outletId, $reasonCode,
            $sourceType, $sourceId, $idempotencyKey, $qualifying, $approvalStatus,
        ) {
            // Serialize per-member writes, then re-check idempotency
            // under the lock. The pre-transaction check alone is a
            // TOCTOU race: two same-key retries can both pass it and
            // double-credit (idempotency_key has no unique index).
            // Lock via a throwaway SELECT and refresh the CALLER's
            // instance in place — swapping in a new instance would
            // leave the caller holding stale attributes after return.
            LoyaltyMember::whereKey($member->id)->lockForUpdate()->firstOrFail();
            $member->refresh();
            if ($idempotencyKey) {
                $existing = PointsTransaction::where('idempotency_key', $idempotencyKey)->first();
                if ($existing) {
                    return $existing;
                }
            }

            $member->increment('current_points', $points);
            $member->increment('lifetime_points', $points);

            if ($qualifying) {
                $member->increment('qualifying_points', $points);
            }

            $member->update(['last_activity_at' => now()]);

            $freshMember = $member->fresh();

            $transaction = PointsTransaction::create([
                'member_id'        => $member->id,
                'property_id'      => $propertyId,
                'outlet_id'        => $outletId,
                'type'             => $type,
                'points'           => $points,
                'qualifying_points'=> $qualifying ? $points : 0,
                'balance_after'    => $freshMember->current_points,
                'description'      => $description,
                'reference_type'   => $referenceType,
                'reference_id'     => $referenceId,
                'source_type'      => $sourceType ?? ($staff ? 'admin' : 'system'),
                'source_id'        => $sourceId,
                'staff_id'         => $staff?->id,
                'amount_spent'     => $amountSpent,
                'earn_rate'        => $member->tier?->earn_rate,
                'idempotency_key'  => $idempotencyKey ?? Str::uuid()->toString(),
                'reason_code'      => $reasonCode ?? $type,
                'approval_status'  => $approvalStatus,
                'approved_at'      => $approvalStatus === 'auto_approved' ? now() : null,
            ]);

            // Create expiry bucket for earned points (no expiry date when the venue's points never expire).
            $bucket = PointExpiryBucket::create([
                'member_id'        => $member->id,
                'transaction_id'   => $transaction->id,
                'original_points'  => $points,
                'remaining_points' => $points,
                'earned_at'        => now()->toDateString(),
                'expires_at'       => $this->expiresOn((int) $member->organization_id),
            ]);

            $transaction->update(['expiry_bucket_id' => $bucket->id]);

            // Record domain event
            DomainEvent::record('PointsAwarded', $transaction, [
                'member_id' => $member->id,
                'points'    => $points,
                'type'      => $type,
                'reason'    => $reasonCode ?? $type,
            ], $propertyId);

            // Audit log
            AuditLog::record('points_awarded', $transaction, [
                'points'      => $points,
                'type'        => $type,
                'description' => $description,
                'balance'     => $freshMember->current_points,
            ]);

            // Check tier upgrade
            $this->assessTier($freshMember);

            AnalyticsService::clearDashboardCache();

            return $transaction;
        });
    }

    /**
     * Redeem points using oldest-first expiry bucket strategy.
     */
    public function redeemPoints(
        LoyaltyMember $member,
        int           $points,
        string        $description,
        ?User         $staff = null,
        ?int          $propertyId = null,
        ?string       $reasonCode = null,
        ?string       $idempotencyKey = null,
    ): PointsTransaction {
        // Advisory fast-fail only — the authoritative balance check runs
        // under a row lock inside the transaction below.
        if ($member->current_points < $points) {
            throw new \RuntimeException("Insufficient points. Available: {$member->current_points}, Requested: {$points}");
        }

        // Idempotency check
        if ($idempotencyKey) {
            $existing = PointsTransaction::where('idempotency_key', $idempotencyKey)->first();
            if ($existing) {
                return $existing;
            }
        }

        return DB::transaction(function () use ($member, $points, $description, $staff, $propertyId, $reasonCode, $idempotencyKey) {
            // Serialize concurrent redemptions on the member row. Without
            // the lock, two simultaneous redeems (double-clicked button,
            // admin + mobile app at once) both pass the balance pre-check
            // and both decrement — driving current_points negative.
            // Lock + refresh in place (see awardPoints for why not a
            // re-fetch): the balance check below then reads the row's
            // true committed state, not the caller's possibly-stale copy.
            LoyaltyMember::whereKey($member->id)->lockForUpdate()->firstOrFail();
            $member->refresh();

            // Idempotency re-check under the lock — same-key retries that
            // raced past the pre-transaction check settle to exactly-once
            // here instead of double-debiting.
            if ($idempotencyKey) {
                $existing = PointsTransaction::where('idempotency_key', $idempotencyKey)->first();
                if ($existing) {
                    return $existing;
                }
            }

            if ($member->current_points < $points) {
                throw new \RuntimeException("Insufficient points. Available: {$member->current_points}, Requested: {$points}");
            }

            // Consume from oldest expiry buckets first; points that never expire go last (an explicit order: SQLite
            // and MySQL put an empty date first, PostgreSQL last).
            $remaining = $points;
            $buckets = $member->activeExpiryBuckets()->reorder()
                ->orderByRaw('CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END')
                ->orderBy('expires_at')->orderBy('id')
                ->get();

            foreach ($buckets as $bucket) {
                if ($remaining <= 0) break;
                $consumed = $bucket->consume($remaining);
                $remaining -= $consumed;
            }

            $member->decrement('current_points', $points);

            $transaction = PointsTransaction::create([
                'member_id'       => $member->id,
                'property_id'     => $propertyId,
                'type'            => 'redeem',
                'points'          => -$points,
                'balance_after'   => $member->fresh()->current_points,
                'description'     => $description,
                'staff_id'        => $staff?->id,
                'source_type'     => $staff ? 'admin' : 'mobile',
                'idempotency_key' => $idempotencyKey ?? Str::uuid()->toString(),
                'reason_code'     => $reasonCode ?? 'redeem',
                'approval_status' => 'auto_approved',
                'approved_at'     => now(),
            ]);

            DomainEvent::record('PointsRedeemed', $transaction, [
                'member_id' => $member->id,
                'points'    => $points,
            ], $propertyId);

            AuditLog::record('points_redeemed', $transaction, [
                'points'      => $points,
                'description' => $description,
                'balance'     => $member->fresh()->current_points,
            ]);

            AnalyticsService::clearDashboardCache();

            return $transaction;
        });
    }

    /**
     * Reverse a transaction (creates a counter-entry, never deletes).
     */
    /**
     * Put the expiry buckets back in agreement with the balance after a
     * reversal.
     *
     * Two directions:
     *
     *  - Reversing an EARN takes points away, so the bucket that award
     *     created must give them up. It may already be partly spent, so we
     *     take what is left and log any shortfall rather than going
     *     negative — the shortfall means those points were redeemed from
     *     this bucket before the reversal, and the redemption's own ledger
     *     row already accounts for them.
     *  - Reversing a REDEEM hands points back, and the buckets it consumed
     *     were decremented at the time. Rather than guess which ones and by
     *     how much, mint one replacement bucket for the restored amount. It
     *     carries a fresh expiry window, which is marginally generous to
     *     the member and never the other way round.
     */
    private function realignExpiryBuckets(LoyaltyMember $member, PointsTransaction $transaction): void
    {
        $points = (int) $transaction->points;

        if ($points > 0) {
            $bucket = PointExpiryBucket::where('transaction_id', $transaction->id)->first()
                ?? ($transaction->expiry_bucket_id
                    ? PointExpiryBucket::find($transaction->expiry_bucket_id)
                    : null);

            if (!$bucket) {
                return;
            }

            $reclaim = min((int) $bucket->remaining_points, $points);
            $bucket->update([
                'remaining_points' => (int) $bucket->remaining_points - $reclaim,
                'is_expired'       => ((int) $bucket->remaining_points - $reclaim) <= 0,
            ]);

            if ($reclaim < $points) {
                Log::info('reverseTransaction: bucket partly spent before reversal', [
                    'transaction_id' => $transaction->id,
                    'member_id'      => $member->id,
                    'reversed'       => $points,
                    'reclaimed'      => $reclaim,
                ]);
            }

            return;
        }

        if ($points < 0) {
            $restored = -$points;

            PointExpiryBucket::create([
                'member_id'        => $member->id,
                'transaction_id'   => $transaction->id,
                'original_points'  => $restored,
                'remaining_points' => $restored,
                'earned_at'        => now()->toDateString(),
                'expires_at'       => $this->expiresOn((int) $member->organization_id),
            ]);
        }
    }

    /**
     * The day points earned now expire, from the venue's `points_expiry_months` (read through ProgrammeOptions, for
     * the organisation named — never whichever tenant is bound): null when it is 0, points that never expire (release
     * 7, spec 2026-10-25 §4.4; until then 0 expired them at once). A bucket without a date is passed over by the
     * expiry sweep and the monthly report.
     */
    public function expiresOn(int $orgId): ?string
    {
        $months = (int) $this->option($orgId, 'points_expiry_months');

        return $months > 0 ? now()->addMonths($months)->toDateString() : null;
    }

    /**
     * One programme option of the organisation named, as ProgrammeOptions gives it — its key, its type, its default
     * when the venue never set it or left it empty — read from the organisation's cached settings map, which every
     * settings write flushes (ProgrammeOptions::save() too). The points path asks on every earn, every completed visit
     * and every appointment's points preview, so once the map is cached it costs no query (spec §1: an engine reader
     * "reads the same key with the same default"). Only the numeric options the engine reads here.
     */
    private function option(int $orgId, string $key): int|float
    {
        [$type, $default] = ProgrammeOptions::OPTIONS[$key];
        $raw = $this->underOrg($orgId, fn () => HotelSetting::getValue($key));
        if ($raw === null || $raw === '' || !is_numeric($raw)) {
            return $default;
        }

        return $type === 'int' ? (int) $raw : round((float) $raw, 2);
    }

    public function reverseTransaction(
        PointsTransaction $transaction,
        string            $reason,
        ?User             $staff = null,
    ): PointsTransaction {
        // Advisory fast-fail; the authoritative check re-reads the row
        // under lock inside the transaction.
        if ($transaction->is_reversed) {
            throw new \RuntimeException('Transaction already reversed.');
        }

        return DB::transaction(function () use ($transaction, $reason, $staff) {
            // Same TOCTOU class as redeemPoints: without the lock, a
            // double-clicked "Reverse" runs twice — both requests read
            // is_reversed=false, both flip it, and a single +500 award
            // gets reversed into a net −500.
            $transaction = PointsTransaction::whereKey($transaction->id)->lockForUpdate()->firstOrFail();
            if ($transaction->is_reversed) {
                throw new \RuntimeException('Transaction already reversed.');
            }

            $transaction->update(['is_reversed' => true]);
            $member = LoyaltyMember::whereKey($transaction->member_id)->lockForUpdate()->firstOrFail();

            $reversePoints = -$transaction->points;
            $member->increment('current_points', $reversePoints);

            if ($transaction->qualifying_points != 0) {
                $member->increment('qualifying_points', -$transaction->qualifying_points);
            }
            if ($transaction->points > 0) {
                $member->decrement('lifetime_points', $transaction->points);
            }

            // Keep the expiry buckets in step with the balance.
            //
            // Without this the counters unwind but the buckets don't, so
            // reversing a +500 award left a bucket still holding 500 points
            // the member no longer has. The hourly expiry sweep then debits
            // that orphan and drives the balance to -500 — a customer-facing
            // negative balance produced by an ordinary refund, since
            // BookingRefundService calls this for every refunded booking.
            $this->realignExpiryBuckets($member, $transaction);

            $reversal = PointsTransaction::create([
                'member_id'       => $member->id,
                'property_id'     => $transaction->property_id,
                'type'            => 'reverse',
                'points'          => $reversePoints,
                'qualifying_points' => -($transaction->qualifying_points ?? 0),
                'balance_after'   => $member->fresh()->current_points,
                'description'     => "Reversal: {$reason}",
                'reversal_of_id'  => $transaction->id,
                'staff_id'        => $staff?->id,
                'source_type'     => 'admin',
                'idempotency_key' => 'rev_' . $transaction->id,
                'reason_code'     => 'correction',
                'approval_status' => 'auto_approved',
                'approved_at'     => now(),
            ]);

            AuditLog::record('points_reversed', $reversal, [
                'original_transaction_id' => $transaction->id,
                'original_points'         => $transaction->points,
                'reason'                  => $reason,
            ]);

            // Re-assess tier after reversal
            $this->assessTier($member->fresh());

            AnalyticsService::clearDashboardCache();

            return $reversal;
        });
    }

    /**
     * One formula for "how many points does this spend earn" -- null-safe
     * on a member without a tier (earns at the base 1.0 rate rather than
     * crashing on a null `tier->earn_rate` dereference).
     */
    public function pointsForSpend(LoyaltyMember $member, float $amount, ?int $propertyId = null, ?int $outletId = null): int
    {
        $base = (float) $this->option((int) $member->organization_id, 'points_per_currency');
        if ($base <= 0) {
            $base = 1.0;
        }

        $earnRate = (float) ($member->tier?->earn_rate ?? 1.0);

        // Check outlet override
        if ($outletId) {
            $outlet = \App\Models\Outlet::find($outletId);
            if ($outlet?->earn_rate_override) {
                $earnRate = (float) $outlet->earn_rate_override;
            }
        }
        if ($earnRate <= 0) {
            $earnRate = 1.0;
        }

        // Apply the highest-matching active earn-rate event multiplier.
        // We pick the highest (not the product of all matches) so two
        // overlapping campaigns can't accidentally combine into a
        // surprise 6x for a member. Stable, predictable behaviour for
        // a marketing surface that has to be auditable. Release 7: a
        // claimed `points_multiplier` offer is the member's own boost
        // and joins the same "highest wins" (never multiplied in).
        $multiplier = max($this->bestActiveMultiplier($member, $propertyId), $this->bestOfferMultiplier($member));

        // A tier may also carry a standing `points_multiplier` benefit
        // ("Gold earns 2x"). It composes with the event multiplier because
        // the two mean different things: one is a privilege the member
        // holds, the other a promotion running this week.
        $tierMultiplier = app(DiscountService::class)->pointsMultiplierFor($member, $propertyId);

        return (int) floor($amount * $base * $earnRate * $multiplier * $tierMultiplier);
    }

    /**
     * Calculate points earned for a booking amount. Kept for existing
     * callers; delegates to the single formula in pointsForSpend().
     */
    public function calculateEarnedPoints(LoyaltyMember $member, float $amount, ?int $outletId = null, ?int $propertyId = null): int
    {
        return $this->pointsForSpend($member, $amount, $propertyId, $outletId);
    }

    /**
     * Returns the highest matching multiplier across active
     * EarnRateEvents for the given member + property + now. 1.0 when
     * no event matches.
     */
    public function bestActiveMultiplier(?LoyaltyMember $member, ?int $propertyId, ?\DateTimeInterface $when = null): float
    {
        $when = $when ?: now();
        try {
            // In its own savepoint when a caller's transaction is open: on
            // PostgreSQL a failing read would otherwise abort the caller's.
            $events = DB::transaction(fn () => \App\Models\EarnRateEvent::activeNow()->get());
        } catch (\Throwable $e) {
            // Table missing during a deploy window: don't blow up the
            // earn flow — just skip the boost.
            return 1.0;
        }
        $best = 1.0;
        foreach ($events as $event) {
            if (!$event->appliesTo($member, $propertyId, $when)) continue;
            $m = (float) $event->multiplier;
            if ($m > $best) $best = $m;
        }
        return $best;
    }

    /** An offer's multiplier counts up to the boosts' own ceiling (a boost is 1–10x): a typo never pays 500x. */
    public const OFFER_MULTIPLIER_MAX = 10.0;

    /**
     * The member's own boost (release 7, spec 2026-10-25 §4.2): the highest multiplier among the `points_multiplier`
     * offers they have claimed and not used, live now — the offer this organisation's and switched on, today inside
     * its dates, the claim not past its own expiry (DiscountService's rule for a claimed offer). 1.0 when none.
     * pointsForSpend() takes the higher of this and the best running boost. Read-only; the claim is not used up by
     * earning — it lasts as long as the offer.
     */
    public function bestOfferMultiplier(?LoyaltyMember $member): float
    {
        if ($member === null || !$member->id) {
            return 1.0;
        }
        try {
            // In its own savepoint, as bestActiveMultiplier()'s read.
            $claims = DB::transaction(fn () => DB::table('member_offers as mo')
                ->join('special_offers as so', 'so.id', '=', 'mo.offer_id')
                ->where('mo.member_id', $member->id)
                ->where('mo.status', 'claimed')
                ->whereNull('mo.used_at')
                ->where('so.organization_id', $member->organization_id)
                ->where('so.type', 'points_multiplier')
                ->where('so.is_active', true)
                ->get(['so.value', 'so.start_date', 'so.end_date', 'mo.expires_at']));
        } catch (\Throwable) {
            // A database without the offer tables (a narrower test schema): no offer boost.
            return 1.0;
        }

        $best = 1.0;
        foreach ($claims as $claim) {
            if ($claim->start_date && \Illuminate\Support\Carbon::parse($claim->start_date)->startOfDay()->isFuture()) {
                continue;
            }
            if ($claim->end_date && \Illuminate\Support\Carbon::parse($claim->end_date)->endOfDay()->isPast()) {
                continue;
            }
            if ($claim->expires_at && \Illuminate\Support\Carbon::parse($claim->expires_at)->isPast()) {
                continue;
            }
            $best = max($best, min((float) $claim->value, self::OFFER_MULTIPLIER_MAX));
        }

        return $best;
    }

    /**
     * Assess a member's tier with full qualification logic.
     * Supports soft landing (drop only one tier at a time).
     */
    public function assessTier(LoyaltyMember $member, ?User $assessedBy = null, string $reason = 'qualification'): bool
    {
        $member->loadMissing('tier');
        $currentTier = $member->tier;
        $appropriateTier = $this->getTierForMember($member);

        if (!$appropriateTier || $appropriateTier->id === $member->tier_id) {
            return false;
        }

        // No current tier set — assign appropriate tier without comparison
        if (!$currentTier) {
            $member->update([
                'tier_id'             => $appropriateTier->id,
                'tier_effective_from' => now()->toDateString(),
                'tier_effective_until'=> now()->addYear()->toDateString(),
                'tier_review_date'    => now()->addYear()->toDateString(),
            ]);
            return true;
        }

        // Direction comes from the points ladder, not sort_order.
        //
        // Tier SELECTION is done by min_points (getTierForPoints), but the
        // direction was read off sort_order — two orderings that only agree
        // when an admin keeps them in sync by hand. The tier form defaults
        // sort_order to 0 while every seeded ladder starts at 1, so a tier
        // created through the UI looked like the BOTTOM of the ladder: a
        // member qualifying for it was treated as being downgraded, which
        // then hit the tier_locked and tier_override guards and blocked the
        // promotion outright, while soft-landing actively pushed them a
        // tier further down. Audit rows, DomainEvents and the tier-movement
        // analytics were all wrong for anyone affected.
        //
        // min_points is the same axis the tier was chosen on, so the two can
        // no longer disagree. Ties are no move.
        //
        // Release 7: on the axis the member is judged on (ladderFloors()).
        [$newFloor, $oldFloor] = $this->ladderFloors($member, $appropriateTier, $currentTier);
        $isUpgrade = $newFloor > $oldFloor;
        $isDowngrade = $newFloor < $oldFloor;

        // Prevent downgrade if tier is locked (invitation tier, etc.)
        if ($isDowngrade && $member->tier_locked) {
            return false;
        }

        // Grace period. `loyalty_tiers.grace_period_days` was validated,
        // stored and rendered in the UI but read NOWHERE in app/ — a
        // setting that did nothing.
        //
        // On the first assessment that would drop a member, start the clock
        // instead and leave them where they are; only drop them once it has
        // run out. `tier_effective_until` was already being written and
        // never read, so it becomes the deadline.
        //
        // Applies regardless of qualification basis because it can only ever
        // DELAY a downgrade — it never promotes anyone or extends a benefit
        // they hadn't already earned.
        if ($isDowngrade) {
            $graceDays = (int) ($currentTier->grace_period_days ?? 0);

            if ($graceDays > 0) {
                $until = $member->tier_effective_until;

                if (!$until) {
                    $member->update([
                        'tier_effective_until' => now()->addDays($graceDays)->toDateString(),
                        'tier_review_date'     => now()->addDays($graceDays)->toDateString(),
                    ]);

                    Log::info('tier downgrade deferred by grace period', [
                        'member_id'   => $member->id,
                        'tier_id'     => $currentTier->id,
                        'grace_days'  => $graceDays,
                        'review_date' => now()->addDays($graceDays)->toDateString(),
                    ]);

                    return false;
                }

                // Clock started but not yet expired — hold the tier.
                if (now()->lt($until)) {
                    return false;
                }
            }
        }

        // Honour a still-active admin tier override. Pre-fix admins could
        // manually promote a member (e.g. "give them Platinum for this
        // stay") and the next assessTier sweep would drop them back —
        // the override survived less than a day. tier_override_until in
        // the future means the override holds; upgrades still apply
        // (a member can always climb past their override).
        if ($isDowngrade && $member->tier_override_until && $member->tier_override_until->isFuture()) {
            return false;
        }

        // Soft landing: only drop one tier at a time
        if ($isDowngrade && $currentTier->soft_landing) {
            $oneTierDown = LoyaltyTier::where('is_active', true)
                ->where('sort_order', '<', $currentTier->sort_order)
                ->orderByDesc('sort_order')
                ->first();

            if ($oneTierDown && $oneTierDown->sort_order > $appropriateTier->sort_order) {
                $appropriateTier = $oneTierDown;
            }
        }

        if ($appropriateTier->id === $member->tier_id) {
            return false;
        }

        $oldTierId = $member->tier_id;

        // Determine assessment window
        $windowEnd = now()->toDateString();
        $joinedAt = $member->joined_at ?: $member->created_at ?: now();
        $windowStart = match ($currentTier->qualification_window ?? 'rolling_12') {
            'calendar_year'    => now()->startOfYear()->toDateString(),
            'anniversary_year' => $joinedAt->copy()->addYears(now()->diffInYears($joinedAt))->toDateString(),
            default            => now()->subYear()->toDateString(),
        };

        $member->update([
            'tier_id'             => $appropriateTier->id,
            'tier_effective_from' => now()->toDateString(),
            // Resets any grace clock that was running: the member has moved,
            // so the old deadline no longer describes anything.
            'tier_effective_until'=> now()->addYear()->toDateString(),
            'tier_review_date'    => now()->addYear()->toDateString(),
        ]);

        // Record tier assessment
        TierAssessment::create([
            'member_id'                         => $member->id,
            'old_tier_id'                       => $oldTierId,
            'new_tier_id'                       => $appropriateTier->id,
            'reason'                            => $reason,
            'qualifying_points_at_assessment'   => $member->qualifying_points,
            'qualifying_nights_at_assessment'   => $member->qualifying_nights,
            'qualifying_stays_at_assessment'    => $member->qualifying_stays,
            'qualifying_spend_at_assessment'    => $member->qualifying_spend,
            'assessment_window_start'           => $windowStart,
            'assessment_window_end'             => $windowEnd,
            'assessed_by'                       => $assessedBy?->id,
        ]);

        $member->refresh();

        AuditLog::record(
            $isUpgrade ? 'tier_upgraded' : 'tier_downgraded',
            $member,
            ['tier' => $appropriateTier->name],
            ['tier' => optional(LoyaltyTier::find($oldTierId))->name]
        );

        DomainEvent::record('TierEvaluated', $member, [
            'old_tier_id' => $oldTierId,
            'new_tier_id' => $appropriateTier->id,
            'direction'   => $isUpgrade ? 'upgrade' : 'downgrade',
            'reason'      => $reason,
        ]);

        // Tier change notification — both directions. Pre-fix only upgrades
        // were notified; downgrades happened silently and customers lost
        // Gold/Platinum benefits without any signal, which is a known
        // churn trigger.
        try {
            if ($isUpgrade) {
                app(NotificationService::class)->sendTierUpgradeNotification($member, $appropriateTier);
            } else {
                app(NotificationService::class)->sendTierDowngradeNotification($member, $appropriateTier);
            }
        } catch (\Throwable $e) {
            \Log::warning('Failed to send tier notification: ' . $e->getMessage());
        }

        return true;
    }

    /**
     * Where the two tiers stand on the ladder the member is judged on, so that a move's direction — and with it the
     * downgrade rules above (tier lock, grace period, override, soft landing) — follows the programme's measure
     * (release 8, `tier_progress_by`): `visits` compares the visits floors, `spend` the spend floors, `points` the
     * points floor, as before. Release 7 read the member's own qualification model here, so that a demotion between two
     * tiers on the same points floor still had a direction; two tiers level on the measure's axis fall back to the
     * points floor the same way.
     *
     * @return array{0: float, 1: float} the new tier's floor, then the current tier's
     */
    private function ladderFloors(LoyaltyMember $member, LoyaltyTier $new, LoyaltyTier $current): array
    {
        $column = self::FLOOR_COLUMNS[$this->progressBy((int) $member->organization_id)];
        if ($column !== 'min_points') {
            $newFloor = (float) ($new->{$column} ?? 0);
            $oldFloor = (float) ($current->{$column} ?? 0);
            if ($newFloor !== $oldFloor) {
                return [$newFloor, $oldFloor];
            }
        }

        return [(float) $new->min_points, (float) $current->min_points];
    }

    /** The tier column each measure of `tier_progress_by` reads a tier's floor from. */
    public const FLOOR_COLUMNS = ['points' => 'min_points', 'visits' => 'min_visits', 'spend' => 'min_spend'];

    /**
     * How the venue's members move between tiers (release 8, spec 2026-10-25 §3, R8-4): `points` (the default, as
     * always), `visits` or `spend` — ProgrammeOptions' `tier_progress_by`, read from the cached settings map (every
     * assessment asks). The member column `tier_qualification_model` is no longer read: nothing ever set it.
     */
    public function progressBy(int $orgId): string
    {
        $by = ProgrammeOptions::cached($orgId, 'tier_progress_by');

        return isset(self::FLOOR_COLUMNS[$by]) ? $by : 'points';
    }

    /**
     * Adds what one visit counts towards the member's tier qualification (release 7, spec 2026-10-25 §4.3) —
     * `qualifying_nights`, `qualifying_stays`, `qualifying_spend` and, since release 8, `qualifying_visits` — then
     * assesses the tier when the programme moves members by visits or spend (judgedOnCounters()). The counters' one
     * writer (the merge adds two members' up); App\Services\Loyalty\Visits\TierCounters is its caller.
     *
     * Once per reference: the row in `tier_qualification_counts` records what this one added, so a repeated call (the
     * nightly stay sweep) adds nothing and a reversal takes back exactly that. A visit with a venue day counts one visit,
     * once per member per venue day (release 8): a second visit the same day adds nothing to the visits — its spend still
     * counts — and its row keeps the day, so a reversal of the day's counted visit can pass the visit on to it. Under the
     * member row lock, in its own transaction (a savepoint inside a caller's). A visit without a venue day and with
     * nothing to add writes nothing.
     *
     * @return bool whether this call counted the visit
     */
    public function countQualifyingVisit(LoyaltyMember $member, string $referenceType, int $referenceId, int $nights, int $stays, float $spend, ?string $venueDay = null): bool
    {
        $nights = max(0, $nights);
        $stays = max(0, $stays);
        $spend = round(max(0.0, $spend), 2);
        if ($venueDay === null && $nights === 0 && $stays === 0 && $spend <= 0) {
            return false;
        }
        $orgId = (int) $member->organization_id;

        // Every statement inside the transaction (a savepoint in a caller's), as in uncountQualifyingVisit().
        return $this->underOrg($orgId, fn () => DB::transaction(function () use ($member, $orgId, $referenceType, $referenceId, $nights, $stays, $spend, $venueDay) {
            $locked = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($member->id)->lockForUpdate()->first();
            if (!$locked) {
                return false;
            }
            $counted = DB::table('tier_qualification_counts')
                ->where('organization_id', $orgId)->where('reference_type', $referenceType)->where('reference_id', $referenceId)
                ->exists();
            if ($counted) {
                return false;
            }
            // One visit per member per venue day, checked under the member's lock (two visits at once cannot both count).
            // A day's later visit is still recorded, with no visit of its own: should the counted one be taken back,
            // the day's visit passes to it (uncountQualifyingVisit()).
            $visits = $venueDay !== null && !DB::table('tier_qualification_counts')
                ->where('organization_id', $orgId)->where('member_id', $locked->id)->where('venue_day', $venueDay)
                ->whereNull('reversed_at')->where('visits', '>', 0)->exists() ? 1 : 0;

            $row = [
                'organization_id' => $orgId,
                'member_id'       => $locked->id,
                'reference_type'  => $referenceType,
                'reference_id'    => $referenceId,
                'nights'          => $nights,
                'stays'           => $stays,
                'spend'           => $spend,
                'created_at'      => now(),
                'updated_at'      => now(),
            ];
            if ($venueDay !== null) {
                $row += ['visits' => $visits, 'venue_day' => $venueDay];
            }
            DB::table('tier_qualification_counts')->insert($row);

            $counters = [
                'qualifying_nights' => (int) $locked->qualifying_nights + $nights,
                'qualifying_stays'  => (int) $locked->qualifying_stays + $stays,
                'qualifying_spend'  => round((float) $locked->qualifying_spend + $spend, 2),
            ];
            if ($visits > 0) {
                $counters['qualifying_visits'] = (int) $locked->qualifying_visits + $visits;
            }
            $locked->forceFill($counters)->save();

            if ($this->judgedOnCounters($locked)) {
                $this->assessTier($locked->fresh());
            }
            $member->refresh();

            return true;
        }));
    }

    /**
     * A refunded or cancelled visit: takes back exactly what countQualifyingVisit() added for this reference — never
     * below zero — and assesses the tier again (through its own downgrade rules) when the programme moves members by
     * visits or spend. Once: the row is stamped `reversed_at`, and a reference already taken back (or never counted)
     * changes nothing. A day's counted visit taken back while another visit of that venue day still stands passes the
     * visit on to it (release 8): the member was there that day, so the day keeps its one visit.
     *
     * @return bool whether this call took anything back
     */
    public function uncountQualifyingVisit(int $orgId, string $referenceType, int $referenceId): bool
    {
        // Every statement inside the transaction — a savepoint in a caller's (a refund's points reversal): on PostgreSQL
        // a failing one then rolls back only this, and the caller's transaction stays usable.
        return $this->underOrg($orgId, fn () => DB::transaction(function () use ($orgId, $referenceType, $referenceId) {
            $row = DB::table('tier_qualification_counts')
                ->where('organization_id', $orgId)->where('reference_type', $referenceType)->where('reference_id', $referenceId)
                ->whereNull('reversed_at')
                ->first();
            if (!$row) {
                return false;
            }
            $member = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $orgId)->whereKey($row->member_id)->lockForUpdate()->first();
            if (!$member) {
                return false;
            }
            // Conditional, under the member's lock: a second reversal of the same visit takes nothing.
            $taken = DB::table('tier_qualification_counts')->where('id', $row->id)->whereNull('reversed_at')
                ->update(['reversed_at' => now(), 'updated_at' => now()]);
            if ($taken === 0) {
                return false;
            }

            $visits = (int) ($row->visits ?? 0);
            $day = $row->venue_day ?? null;
            if ($visits > 0 && $day !== null) {
                $heir = DB::table('tier_qualification_counts')
                    ->where('organization_id', $orgId)->where('member_id', $member->id)->where('venue_day', $day)
                    ->whereNull('reversed_at')->where('visits', 0)->orderBy('id')->value('id');
                if ($heir !== null) {
                    DB::table('tier_qualification_counts')->where('id', $heir)->update(['visits' => 1, 'updated_at' => now()]);
                    $visits = 0;
                }
            }

            $counters = [
                'qualifying_nights' => max(0, (int) $member->qualifying_nights - (int) $row->nights),
                'qualifying_stays'  => max(0, (int) $member->qualifying_stays - (int) $row->stays),
                'qualifying_spend'  => max(0.0, round((float) $member->qualifying_spend - (float) $row->spend, 2)),
            ];
            if ($visits > 0) {
                $counters['qualifying_visits'] = max(0, (int) $member->qualifying_visits - $visits);
            }
            $member->forceFill($counters)->save();

            if ($this->judgedOnCounters($member)) {
                $this->assessTier($member->fresh(), null, 'reversal');
            }

            return true;
        }));
    }

    /**
     * Whether the programme moves members by a counter (`visits` or `spend`, release 8): only then can a counted or
     * reversed visit move a tier, so only then is the tier assessed — a programme by points assesses when points move
     * (awardPoints(), reverseTransaction()), never by a visit that changed nothing members are judged on.
     */
    private function judgedOnCounters(LoyaltyMember $member): bool
    {
        return $this->progressBy((int) $member->organization_id) !== 'points';
    }

    /** Run $fn with the organisation bound (the tier ladder and the assessment rows are tenant-scoped), then restore. */
    private function underOrg(int $orgId, callable $fn): mixed
    {
        $prior = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        if ((int) $prior === $orgId) {
            return $fn();
        }
        app()->instance('current_organization_id', $orgId);
        try {
            return $fn();
        } finally {
            if ($prior !== null) {
                app()->instance('current_organization_id', $prior);
            } else {
                app()->forgetInstance('current_organization_id');
            }
        }
    }

    /**
     * Determine the appropriate tier for a member based on qualification model.
     */
    /**
     * Org setting that decides whether tier windows mean anything.
     *
     * `lifetime` (the default) qualifies on monotonic `lifetime_points`,
     * which is what this app has always done. `windowed` honours each
     * tier's `qualification_window`.
     *
     * Opt-in on purpose. `loyalty_tiers.qualification_window` defaults to
     * `rolling_12` in the schema, so every tier already carries a value
     * nobody deliberately chose — switching it on globally would silently
     * re-qualify every existing member against twelve months of points
     * instead of their lifetime, and downgrade most of them overnight.
     */
    public const BASIS_LIFETIME = 'lifetime';
    public const BASIS_WINDOWED = 'windowed';

    public function qualificationBasis(): string
    {
        return HotelSetting::getValue('tier_qualification_basis', self::BASIS_LIFETIME) === self::BASIS_WINDOWED
            ? self::BASIS_WINDOWED
            : self::BASIS_LIFETIME;
    }

    /**
     * The points total a member is judged on.
     *
     * Under `lifetime` this is just `lifetime_points`. Under `windowed` it
     * is what they actually earned inside the tier's window — the thing the
     * "Rolling 12 Months / Calendar Year / Anniversary Year" dropdown has
     * always claimed to control while changing nothing.
     *
     * Only positive, non-reversed ledger rows count: a redemption spends
     * points but does not un-earn them, and a reversal already has its own
     * offsetting row that would double-count if included.
     */
    public function qualifyingPointsFor(LoyaltyMember $member): int
    {
        if ($this->qualificationBasis() === self::BASIS_LIFETIME) {
            return (int) $member->lifetime_points;
        }

        $window = $member->tier?->qualification_window ?? 'rolling_12';
        $start = $this->windowStartFor($member, $window);

        return (int) PointsTransaction::where('member_id', $member->id)
            ->where('is_reversed', false)
            ->where('points', '>', 0)
            // Expiry and redemption rows are negative and already excluded;
            // this keeps corrections from inflating a window.
            ->whereIn('type', ['earn', 'bonus', 'adjust'])
            ->where('created_at', '>=', $start)
            ->sum('points');
    }

    /** When the qualification window for this member opened. */
    public function windowStartFor(LoyaltyMember $member, string $window): \Illuminate\Support\Carbon
    {
        $joined = $member->joined_at ? $member->joined_at->copy() : now()->subYear();

        return match ($window) {
            'calendar_year'    => now()->startOfYear(),
            // Most recent anniversary of joining, not the next one.
            'anniversary_year' => $joined->setYear(
                $joined->copy()->setYear(now()->year)->isFuture() ? now()->year - 1 : now()->year
            )->startOfDay(),
            default            => now()->subYear(),
        };
    }

    /**
     * The tier a member qualifies for on the programme's measure (release 8, `tier_progress_by`): the points they are
     * judged on (qualifyingPointsFor()), their visits (qualifyingVisitsFor(), against `min_visits`) or their spend
     * (qualifyingSpendFor(), against `min_spend`). A tier without a floor on the measure is not reached by it.
     */
    public function getTierForMember(LoyaltyMember $member): ?LoyaltyTier
    {
        return match ($this->progressBy((int) $member->organization_id)) {
            'visits' => $this->getTierByVisits($this->qualifyingVisitsFor($member)),
            'spend'  => $this->getTierBySpend($this->qualifyingSpendFor($member)),
            default  => $this->getTierForPoints($this->qualifyingPointsFor($member)),
        };
    }

    /**
     * The visits a member is judged on: `qualifying_visits` under the `lifetime` basis, else the visits counted inside
     * the tier's window (the counter rows not taken back), as qualifyingPointsFor() reads points.
     */
    public function qualifyingVisitsFor(LoyaltyMember $member): int
    {
        if ($this->qualificationBasis() === self::BASIS_LIFETIME) {
            return (int) ($member->qualifying_visits ?? 0);
        }

        return (int) $this->windowedCounts($member)->sum('visits');
    }

    /** The spend a member is judged on: `qualifying_spend`, or inside the tier's window under the `windowed` basis. */
    public function qualifyingSpendFor(LoyaltyMember $member): float
    {
        if ($this->qualificationBasis() === self::BASIS_LIFETIME) {
            return round((float) ($member->qualifying_spend ?? 0), 2);
        }

        return round((float) $this->windowedCounts($member)->sum('spend'), 2);
    }

    /** The member's counter rows inside their tier's qualification window, not taken back. */
    private function windowedCounts(LoyaltyMember $member): \Illuminate\Database\Query\Builder
    {
        $start = $this->windowStartFor($member, $member->tier?->qualification_window ?? 'rolling_12');

        return DB::table('tier_qualification_counts')
            ->where('organization_id', (int) $member->organization_id)->where('member_id', $member->id)
            ->whereNull('reversed_at')->where('created_at', '>=', $start);
    }

    /**
     * How far the member is from the next tier, in the programme's terms (release 8): the measure (`by`), what the
     * member has on it, the next tier with its floor, what is still needed ("3 more visits", "€120 more", "1,250 points")
     * and how far along, 0–100. On points it is the workspace's reading as before (the points the member is judged on,
     * the next active tier by `min_points`); on visits and spend the next active tier, not invitation-only, whose floor
     * on the measure is above the member's tier's. Null `next_tier` where no tier is above.
     *
     * @return array{by: string, qualifying: int|float, next_tier: ?array{id: int, name: string, min_points: int, floor: int|float}, needed: int|float, percent: int}
     */
    public function tierProgress(LoyaltyMember $member): array
    {
        $orgId = (int) $member->organization_id;

        return $this->underOrg($orgId, function () use ($member, $orgId) {
            $member->loadMissing('tier');
            $by = $this->progressBy($orgId);
            $column = self::FLOOR_COLUMNS[$by];
            $money = $by === 'spend';
            $qualifying = match ($by) {
                'visits' => $this->qualifyingVisitsFor($member),
                'spend'  => $this->qualifyingSpendFor($member),
                default  => $this->qualifyingPointsFor($member),
            };
            $floor = $money ? (float) ($member->tier?->{$column} ?? 0) : (int) ($member->tier?->{$column} ?? 0);

            $next = LoyaltyTier::cachedActiveForCurrentOrg()
                ->reject(fn (LoyaltyTier $t) => $by !== 'points' && (bool) ($t->invitation_only ?? false))
                ->filter(fn (LoyaltyTier $t) => $t->{$column} !== null && (float) $t->{$column} > $floor)
                ->sortBy(fn (LoyaltyTier $t) => (float) $t->{$column})
                ->first();
            if (!$next) {
                return ['by' => $by, 'qualifying' => $qualifying, 'next_tier' => null, 'needed' => 0, 'percent' => 100];
            }
            $target = $money ? round((float) $next->{$column}, 2) : (int) $next->{$column};
            $span = max($money ? 0.01 : 1, $target - $floor);
            $needed = $money ? round(max(0.0, $target - $qualifying), 2) : max(0, $target - $qualifying);

            return [
                'by'         => $by,
                'qualifying' => $qualifying,
                'next_tier'  => ['id' => (int) $next->id, 'name' => (string) $next->name, 'min_points' => (int) $next->min_points, 'floor' => $target],
                'needed'     => $needed,
                'percent'    => (int) max(0, min(100, floor(($qualifying - $floor) * 100 / $span))),
            ];
        });
    }

    /**
     * Get the appropriate tier for a given points total.
     *
     * Reads from the per-org cached active-tier collection and filters in PHP
     * so the points hot-path doesn't re-query loyalty_tiers on every scan/award.
     */
    /**
     * Read-only "would this member qualify?" check used by the admin
     * tier-rules preview tool. Mirrors getTierForMember() but reads
     * raw numeric inputs rather than a persisted LoyaltyMember row,
     * so admins can sketch out "what if a member had 5000 points and
     * 6 nights" before committing to a tier schema change.
     *
     * @param  string                 $model  points|nights|stays|spend|hybrid
     * @param  array{points?:int,nights?:int,stays?:int,spend?:float} $vals
     */
    public function previewTier(string $model, array $vals): ?LoyaltyTier
    {
        $points = (int) ($vals['points'] ?? 0);
        $nights = (int) ($vals['nights'] ?? 0);
        $stays  = (int) ($vals['stays']  ?? 0);
        $spend  = (float) ($vals['spend'] ?? 0);

        return match ($model) {
            'nights' => $this->getTierByNights($nights),
            'stays'  => $this->getTierByStays($stays),
            'spend'  => $this->getTierBySpend($spend),
            'hybrid' => LoyaltyTier::cachedActiveForCurrentOrg()
                ->reject(fn (LoyaltyTier $t) => (bool) ($t->invitation_only ?? false))
                ->filter(function (LoyaltyTier $t) use ($points, $nights, $stays, $spend) {
                    return $t->min_points <= $points
                        || ($t->min_nights !== null && $t->min_nights <= $nights)
                        || ($t->min_stays  !== null && $t->min_stays  <= $stays)
                        || ($t->min_spend  !== null && $t->min_spend  <= $spend);
                })
                ->sortByDesc('sort_order')
                ->first(),
            default  => $this->getTierForPoints($points),
        };
    }

    public function getTierForPoints(int $lifetimePoints): ?LoyaltyTier
    {
        return LoyaltyTier::cachedActiveForCurrentOrg()
            ->reject(fn (LoyaltyTier $t) => (bool) ($t->invitation_only ?? false))
            ->filter(fn (LoyaltyTier $t) => $t->min_points <= $lifetimePoints
                && ($t->max_points === null || $t->max_points >= $lifetimePoints))
            ->sortByDesc('min_points')
            ->first();
    }

    private function getTierByNights(int $nights): ?LoyaltyTier
    {
        return LoyaltyTier::cachedActiveForCurrentOrg()
            ->reject(fn (LoyaltyTier $t) => (bool) ($t->invitation_only ?? false))
            ->filter(fn (LoyaltyTier $t) => $t->min_nights !== null && $t->min_nights <= $nights)
            ->sortByDesc('min_nights')
            ->first();
    }

    private function getTierByStays(int $stays): ?LoyaltyTier
    {
        return LoyaltyTier::cachedActiveForCurrentOrg()
            ->reject(fn (LoyaltyTier $t) => (bool) ($t->invitation_only ?? false))
            ->filter(fn (LoyaltyTier $t) => $t->min_stays !== null && $t->min_stays <= $stays)
            ->sortByDesc('min_stays')
            ->first();
    }

    private function getTierByVisits(int $visits): ?LoyaltyTier
    {
        return LoyaltyTier::cachedActiveForCurrentOrg()
            ->reject(fn (LoyaltyTier $t) => (bool) ($t->invitation_only ?? false))
            ->filter(fn (LoyaltyTier $t) => $t->min_visits !== null && (int) $t->min_visits <= $visits)
            ->sortByDesc('min_visits')
            ->first();
    }

    private function getTierBySpend(float $spend): ?LoyaltyTier
    {
        return LoyaltyTier::cachedActiveForCurrentOrg()
            ->reject(fn (LoyaltyTier $t) => (bool) ($t->invitation_only ?? false))
            ->filter(fn (LoyaltyTier $t) => $t->min_spend !== null && $t->min_spend <= $spend)
            ->sortByDesc('min_spend')
            ->first();
    }

    /**
     * Get member dashboard summary data.
     */
    public function getMemberSummary(LoyaltyMember $member): array
    {
        $member->loadMissing(['tier', 'user', 'guests']);
        $progress = $this->summaryProgress($member);
        $recentTransactions = $member->pointsTransactions()
            ->where('is_reversed', false)
            ->orderByDesc('created_at')
            ->limit(5)
            ->get();

        // Pull stay stats from linked CRM guest if available, else from bookings
        $linkedGuest = $member->guests->first();
        $totalStays  = $linkedGuest?->total_stays ?? $member->bookings()->count();
        $totalNights = $linkedGuest?->total_nights ?? 0;

        return [
            'member_number'     => $member->member_number,
            'name'              => $member->user->name,
            'tier'              => $member->tier,
            'current_points'    => $member->current_points,
            'lifetime_points'   => $member->lifetime_points,
            'qualifying_points' => $member->qualifying_points,
            'referral_code'     => $member->referral_code,
            'total_stays'       => $totalStays,
            'total_nights'      => $totalNights,
            'progress'          => $progress,
            'recent_activity'   => $recentTransactions,
            // Communication preferences. Absent until now, so a client had
            // no way to show the member their own settings — the web
            // portal's consent toggle saved correctly and then rendered
            // itself back off, because it was reading a key that was never
            // in the payload. `marketing_consent` in particular is what the
            // campaign consent gate reads, so the member needs to see and
            // control it.
            'marketing_consent'   => (bool) $member->marketing_consent,
            'email_notifications' => (bool) $member->email_notifications,
            'push_notifications'  => (bool) $member->push_notifications,
            'unsubscribed_at'     => $member->unsubscribed_at?->toIso8601String(),
            'member_since'      => $member->joined_at->format('Y-m-d'),
            'created_at'        => $member->created_at?->toIso8601String(),
            // `date_of_birth` is cast to a Carbon `date` on User, so it can't
            // ride along in `only()` — that serialises the full datetime
            // (`1990-05-12T00:00:00.000000Z`), which `<input type="date">`
            // on the portal profile page rejects outright and silently
            // blanks. Format it explicitly to the plain `Y-m-d` the input
            // (and a round-trip PUT back to updateProfile()) expects.
            'user'              => array_merge(
                $member->user->only('id', 'name', 'email', 'phone', 'nationality', 'language', 'avatar_url'),
                ['date_of_birth' => $member->user->date_of_birth?->format('Y-m-d')],
            ),
        ];
    }

    /**
     * The member summary's `progress` (the portal's and the member app's), in the programme's terms (release 8). On
     * points it is exactly what it always was (LoyaltyMember::getProgressToNextTier(): `percentage`, `points_needed`,
     * `next_tier`), with `by` and `needed` beside it; on visits or spend the same three keys follow the measure
     * (tierProgress()) — `points_needed` then holds the visits, or the spend in whole units, still to go, for the
     * member app's compiled screens, which read only that key — and `needed` is exact.
     *
     * @return array{percentage: float|int, points_needed: int, next_tier: ?LoyaltyTier, by: string, needed: int|float}
     */
    private function summaryProgress(LoyaltyMember $member): array
    {
        $by = $this->progressBy((int) $member->organization_id);
        if ($by === 'points') {
            $progress = $member->getProgressToNextTier();

            return $progress + ['by' => 'points', 'needed' => (int) $progress['points_needed']];
        }
        $p = $this->tierProgress($member);
        $next = $p['next_tier'] ? $this->underOrg((int) $member->organization_id, fn () => LoyaltyTier::query()->find($p['next_tier']['id'])) : null;

        return [
            'percentage'    => $next ? $p['percent'] : 100,
            'points_needed' => $next ? (int) ceil((float) $p['needed']) : 0,
            'next_tier'     => $next,
            'by'            => $by,
            'needed'        => $next ? $p['needed'] : 0,
        ];
    }

    /**
     * Expire points using bucket-based strategy.
     *
     * Runs in console (hourly cron) with no tenant binding, so we iterate
     * org-by-org and bind current_organization_id around each org's work.
     * PointExpiryBucket has no organization_id of its own — it's scoped
     * via member_id IN (the org's members). The member fetch goes through
     * the bound tenant context so BelongsToOrganization/TenantScope return
     * real LoyaltyMember rows (not null). Without this binding, the old
     * implementation crashed because $bucket->member was null for every
     * bucket and decrement() / PointsTransaction::create() blew up.
     */
    public function expirePoints(): int
    {
        $expired = 0;

        $priorOrgId  = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $priorOrgObj = app()->bound('current_organization') ? app('current_organization') : null;

        try {
            Organization::query()->orderBy('id')->chunkById(50, function ($orgs) use (&$expired) {
                foreach ($orgs as $org) {
                    app()->instance('current_organization_id', $org->id);
                    app()->instance('current_organization', $org);

                    try {
                        $expired += $this->expirePointsForOrg($org);
                    } catch (\Throwable $e) {
                        Log::warning('expirePoints failed for org ' . $org->id . ': ' . $e->getMessage());
                    } finally {
                        app()->forgetInstance('current_organization_id');
                        app()->forgetInstance('current_organization');
                    }
                }
            });
        } finally {
            // Restore prior bound state (if any) so callers that DO have a
            // tenant context don't see it wiped after this method returns.
            if ($priorOrgId !== null) {
                app()->instance('current_organization_id', $priorOrgId);
            }
            if ($priorOrgObj !== null) {
                app()->instance('current_organization', $priorOrgObj);
            }
        }

        return $expired;
    }

    /**
     * Per-org bucket sweep. Caller MUST have bound current_organization_id
     * to $org->id before invoking this — that's what makes LoyaltyMember
     * lookups return real rows instead of null via TenantScope's fail-closed
     * 1=0 clause.
     */
    private function expirePointsForOrg(Organization $org): int
    {
        $expired = 0;

        // Collect this org's member ids in the bound tenant context. We do NOT
        // ->with('member') on the bucket query — the buckets table has no
        // organization_id, and loading the member relationship across thousands
        // of buckets in one go bypasses any per-batch consistency anyway. We
        // fetch members fresh in the inner loop.
        $memberIds = LoyaltyMember::where('organization_id', $org->id)->pluck('id');
        if ($memberIds->isEmpty()) {
            return 0;
        }

        // A bucket without a date never expires (release 7: the venue's expiry is 0, "never").
        $buckets = PointExpiryBucket::whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->where('is_expired', false)
            ->where('remaining_points', '>', 0)
            ->whereIn('member_id', $memberIds)
            ->get();

        foreach ($buckets as $bucket) {
            DB::transaction(function () use ($bucket, $org, &$expired) {
                $member = LoyaltyMember::find($bucket->member_id);
                if (!$member) {
                    // Bucket points at a member that isn't visible — skip rather
                    // than crash. Could only happen if the member row was hard-
                    // deleted while this bucket survived.
                    return;
                }

                // Never debit more than the member actually holds.
                //
                // `remaining_points` is a claim about the balance, not the
                // balance itself, and any drift between them landed here as
                // a negative balance shown to the customer as "-350 points".
                // The column is a signed bigint with no CHECK, so nothing
                // downstream would have stopped it. Clamping keeps the ledger
                // truthful and surfaces the drift instead of compounding it.
                $available = max(0, (int) $member->current_points);
                $points = min((int) $bucket->remaining_points, $available);

                if ($points < (int) $bucket->remaining_points) {
                    Log::warning('expirePoints: bucket exceeded member balance', [
                        'member_id'        => $member->id,
                        'bucket_id'        => $bucket->id,
                        'bucket_remaining' => (int) $bucket->remaining_points,
                        'member_balance'   => (int) $member->current_points,
                        'shortfall'        => (int) $bucket->remaining_points - $points,
                    ]);
                }

                // Still retire the bucket — it is past its date either way,
                // and leaving it live would re-report the same shortfall
                // every hour.
                if ($points <= 0) {
                    $bucket->update(['remaining_points' => 0, 'is_expired' => true]);
                    return;
                }

                $member->decrement('current_points', $points);
                $bucket->update(['remaining_points' => 0, 'is_expired' => true]);

                PointsTransaction::create([
                    'organization_id' => $member->organization_id ?? $org->id,
                    'member_id'       => $member->id,
                    'type'            => 'expire',
                    'points'          => -$points,
                    'balance_after'   => $member->fresh()->current_points,
                    'description'     => 'Points expired per program terms',
                    'expiry_bucket_id'=> $bucket->id,
                    'idempotency_key' => 'exp_' . $bucket->id,
                    'reason_code'     => 'expiry',
                    'approval_status' => 'auto_approved',
                    'source_type'     => 'system',
                ]);

                DomainEvent::record('PointsExpired', $member, [
                    'points'    => $points,
                    'bucket_id' => $bucket->id,
                ]);

                $expired += $points;
            });
        }

        return $expired;
    }

    /**
     * Get point liability summary (outstanding redeemable points).
     */
    public function getPointLiability(): array
    {
        $rate = LoyaltyTier::avg('points_to_currency_rate') ?: 0.01;

        $totalOutstanding = LoyaltyMember::where('is_active', true)->sum('current_points');

        $ymSql = match (DB::getDriverName()) {
            'pgsql'  => "TO_CHAR(expires_at, 'YYYY-MM')",
            'sqlite' => "strftime('%Y-%m', expires_at)",
            default  => "DATE_FORMAT(expires_at, '%Y-%m')",
        };

        // Points that never expire (no date, release 7) are outstanding but in no month of the schedule.
        $live = fn () => PointExpiryBucket::where('is_expired', false)->where('remaining_points', '>', 0);
        $expirySchedule = $live()->whereNotNull('expires_at')
            ->selectRaw("{$ymSql} as month, SUM(remaining_points) as points")
            ->groupBy('month')
            ->orderBy('month')
            ->pluck('points', 'month');

        return [
            'total_outstanding_points'    => $totalOutstanding,
            'estimated_liability_currency'=> round($totalOutstanding * $rate, 2),
            'currency_rate'               => $rate,
            'expiry_schedule_by_month'    => $expirySchedule,
            'never_expiring_points'       => (int) $live()->whereNull('expires_at')->sum('remaining_points'),
        ];
    }

    /**
     * Check if a manual award requires approval based on thresholds.
     */
}
