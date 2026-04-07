<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\DomainEvent;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointExpiryBucket;
use App\Models\PointsTransaction;
use App\Models\TierAssessment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
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
                'approved_by'      => $approvalStatus === 'auto_approved' ? null : null,
                'approved_at'      => $approvalStatus === 'auto_approved' ? now() : null,
            ]);

            // Create expiry bucket for earned points
            $expiryMonths = (int) HotelSetting::getValue('points_expiry_months', 24);
            $bucket = PointExpiryBucket::create([
                'member_id'        => $member->id,
                'transaction_id'   => $transaction->id,
                'original_points'  => $points,
                'remaining_points' => $points,
                'earned_at'        => now()->toDateString(),
                'expires_at'       => now()->addMonths($expiryMonths)->toDateString(),
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
            // Consume from oldest expiry buckets first
            $remaining = $points;
            $buckets = $member->activeExpiryBuckets()->get();

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
    public function reverseTransaction(
        PointsTransaction $transaction,
        string            $reason,
        ?User             $staff = null,
    ): PointsTransaction {
        if ($transaction->is_reversed) {
            throw new \RuntimeException('Transaction already reversed.');
        }

        return DB::transaction(function () use ($transaction, $reason, $staff) {
            $transaction->update(['is_reversed' => true]);
            $member = $transaction->member;

            $reversePoints = -$transaction->points;
            $member->increment('current_points', $reversePoints);

            if ($transaction->qualifying_points != 0) {
                $member->increment('qualifying_points', -$transaction->qualifying_points);
            }
            if ($transaction->points > 0) {
                $member->decrement('lifetime_points', $transaction->points);
            }

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
     * Calculate points earned for a booking amount.
     */
    public function calculateEarnedPoints(LoyaltyMember $member, float $amount, ?int $outletId = null): int
    {
        $earnRate = $member->tier->earn_rate;

        // Check outlet override
        if ($outletId) {
            $outlet = \App\Models\Outlet::find($outletId);
            if ($outlet?->earn_rate_override) {
                $earnRate = $outlet->earn_rate_override;
            }
        }

        return (int) floor($amount * $earnRate);
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

        $isUpgrade = $appropriateTier->sort_order > $currentTier->sort_order;
        $isDowngrade = $appropriateTier->sort_order < $currentTier->sort_order;

        // Prevent downgrade if tier is locked (invitation tier, etc.)
        if ($isDowngrade && $member->tier_locked) {
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
        $windowStart = match ($currentTier->qualification_window ?? 'rolling_12') {
            'calendar_year'    => now()->startOfYear()->toDateString(),
            'anniversary_year' => $member->joined_at->copy()->addYears(now()->diffInYears($member->joined_at))->toDateString(),
            default            => now()->subYear()->toDateString(),
        };

        $member->update([
            'tier_id'             => $appropriateTier->id,
            'tier_effective_from' => now()->toDateString(),
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
            ['tier' => LoyaltyTier::find($oldTierId)->name]
        );

        DomainEvent::record('TierEvaluated', $member, [
            'old_tier_id' => $oldTierId,
            'new_tier_id' => $appropriateTier->id,
            'direction'   => $isUpgrade ? 'upgrade' : 'downgrade',
            'reason'      => $reason,
        ]);

        // Fire tier upgrade notification
        if ($isUpgrade) {
            try {
                app(NotificationService::class)->sendTierUpgradeNotification($member, $appropriateTier);
            } catch (\Throwable $e) {
                \Log::warning('Failed to send tier notification: ' . $e->getMessage());
            }
        }

        return true;
    }

    /**
     * Determine the appropriate tier for a member based on qualification model.
     */
    public function getTierForMember(LoyaltyMember $member): ?LoyaltyTier
    {
        $model = $member->tier_qualification_model ?? 'points';

        return match ($model) {
            'nights' => $this->getTierByNights($member->qualifying_nights),
            'stays'  => $this->getTierByStays($member->qualifying_stays),
            'spend'  => $this->getTierBySpend($member->qualifying_spend),
            'hybrid' => $this->getTierHybrid($member),
            default  => $this->getTierForPoints($member->lifetime_points),
        };
    }

    /**
     * Get the appropriate tier for a given points total.
     */
    public function getTierForPoints(int $lifetimePoints): ?LoyaltyTier
    {
        return LoyaltyTier::where('is_active', true)
            ->where('invitation_only', false)
            ->where('min_points', '<=', $lifetimePoints)
            ->where(function ($q) use ($lifetimePoints) {
                $q->whereNull('max_points')
                  ->orWhere('max_points', '>=', $lifetimePoints);
            })
            ->orderByDesc('min_points')
            ->first();
    }

    private function getTierByNights(int $nights): ?LoyaltyTier
    {
        return LoyaltyTier::where('is_active', true)
            ->where('invitation_only', false)
            ->whereNotNull('min_nights')
            ->where('min_nights', '<=', $nights)
            ->orderByDesc('min_nights')
            ->first();
    }

    private function getTierByStays(int $stays): ?LoyaltyTier
    {
        return LoyaltyTier::where('is_active', true)
            ->where('invitation_only', false)
            ->whereNotNull('min_stays')
            ->where('min_stays', '<=', $stays)
            ->orderByDesc('min_stays')
            ->first();
    }

    private function getTierBySpend(float $spend): ?LoyaltyTier
    {
        return LoyaltyTier::where('is_active', true)
            ->where('invitation_only', false)
            ->whereNotNull('min_spend')
            ->where('min_spend', '<=', $spend)
            ->orderByDesc('min_spend')
            ->first();
    }

    private function getTierHybrid(LoyaltyMember $member): ?LoyaltyTier
    {
        // Hybrid: qualify by ANY of the thresholds (most generous)
        return LoyaltyTier::where('is_active', true)
            ->where('invitation_only', false)
            ->where(function ($q) use ($member) {
                $q->where('min_points', '<=', $member->lifetime_points)
                  ->orWhere(fn($q2) => $q2->whereNotNull('min_nights')->where('min_nights', '<=', $member->qualifying_nights))
                  ->orWhere(fn($q2) => $q2->whereNotNull('min_stays')->where('min_stays', '<=', $member->qualifying_stays))
                  ->orWhere(fn($q2) => $q2->whereNotNull('min_spend')->where('min_spend', '<=', $member->qualifying_spend));
            })
            ->orderByDesc('sort_order')
            ->first();
    }

    /**
     * Get member dashboard summary data.
     */
    public function getMemberSummary(LoyaltyMember $member): array
    {
        $member->loadMissing(['tier', 'user', 'guests']);
        $progress = $member->getProgressToNextTier();
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
            'member_since'      => $member->joined_at->format('Y-m-d'),
            'created_at'        => $member->created_at?->toIso8601String(),
            'user'              => $member->user->only('id', 'name', 'email', 'phone', 'nationality', 'language', 'avatar_url'),
        ];
    }

    /**
     * Expire points using bucket-based strategy.
     */
    public function expirePoints(): int
    {
        $expired = 0;

        $buckets = PointExpiryBucket::where('expires_at', '<', now())
            ->where('is_expired', false)
            ->where('remaining_points', '>', 0)
            ->with('member')
            ->get();

        foreach ($buckets as $bucket) {
            DB::transaction(function () use ($bucket, &$expired) {
                $points = $bucket->remaining_points;
                $member = $bucket->member;

                $member->decrement('current_points', $points);
                $bucket->update(['remaining_points' => 0, 'is_expired' => true]);

                PointsTransaction::create([
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

        $ymSql = DB::getDriverName() === 'pgsql'
            ? "TO_CHAR(expires_at, 'YYYY-MM')"
            : "DATE_FORMAT(expires_at, '%Y-%m')";

        $expirySchedule = PointExpiryBucket::where('is_expired', false)
            ->where('remaining_points', '>', 0)
            ->selectRaw("{$ymSql} as month, SUM(remaining_points) as points")
            ->groupBy('month')
            ->orderBy('month')
            ->pluck('points', 'month');

        return [
            'total_outstanding_points'    => $totalOutstanding,
            'estimated_liability_currency'=> round($totalOutstanding * $rate, 2),
            'currency_rate'               => $rate,
            'expiry_schedule_by_month'    => $expirySchedule,
        ];
    }

    /**
     * Check if a manual award requires approval based on thresholds.
     */
    public function requiresApproval(int $points, ?User $staff = null): bool
    {
        $threshold = (int) HotelSetting::getValue('manual_award_approval_threshold', 500);
        return $points > $threshold;
    }
}
