<?php

namespace App\Services;

use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Models\PointsTransaction;
use App\Models\RewardRedemption;
use Carbon\Carbon;

/**
 * Daily loyalty digest payload.
 *
 * One method (buildSummary) builds the full email payload for an
 * org. Pulled by SendLoyaltyDigest command per opted-in admin.
 * Mirrors the engagement digest pattern so the cron / dedupe /
 * opt-in plumbing matches what staff already understand.
 *
 * Numbers are all "yesterday in the org's timezone" so a GM in
 * Tokyo sees their day, not UTC.
 */
class LoyaltyDigestService
{
    public function __construct(protected AnalyticsService $analytics) {}

    /**
     * @return array{
     *   org_name: string,
     *   date_label: string,
     *   timezone: string,
     *   new_members: int,
     *   points_earned: int,
     *   points_redeemed: int,
     *   reward_redemptions: int,
     *   pending_redemptions: int,
     *   tier_upgrades_30d: int,
     *   tier_downgrades_30d: int,
     *   at_risk_top: array,
     *   at_risk_count: int,
     * }
     */
    public function buildSummary(int $orgId, Carbon $orgNow): array
    {
        $tz = $orgNow->timezoneName;
        $startOfYesterday = $orgNow->copy()->subDay()->startOfDay()->utc();
        $endOfYesterday   = $orgNow->copy()->subDay()->endOfDay()->utc();

        $org = Organization::withoutGlobalScopes()->find($orgId);

        // Yesterday's headline numbers — all org-scoped explicitly so
        // the cron's withoutGlobalScopes upstream stays safe.
        $newMembers = LoyaltyMember::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->whereBetween('joined_at', [$startOfYesterday, $endOfYesterday])
            ->count();

        $pointsEarned = (int) PointsTransaction::withoutGlobalScopes()
            ->whereHas('member', fn ($q) => $q->where('organization_id', $orgId))
            ->whereBetween('created_at', [$startOfYesterday, $endOfYesterday])
            ->where('points', '>', 0)
            ->sum('points');

        $pointsRedeemed = (int) abs(PointsTransaction::withoutGlobalScopes()
            ->whereHas('member', fn ($q) => $q->where('organization_id', $orgId))
            ->whereBetween('created_at', [$startOfYesterday, $endOfYesterday])
            ->where('type', 'redeem')
            ->sum('points'));

        $rewardRedemptions = RewardRedemption::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->whereBetween('created_at', [$startOfYesterday, $endOfYesterday])
            ->count();

        $pendingRedemptions = RewardRedemption::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('status', RewardRedemption::STATUS_PENDING)
            ->count();

        // Rolling 30-day tier movement for trend context.
        $tierMovement = $this->analytics->getTierMovement(30);

        // Top 5 at-risk so the GM can hit "send a win-back offer"
        // without leaving the email.
        $atRisk = $this->analytics->getAtRiskMembers(60, 5);
        $atRiskCount = LoyaltyMember::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->where('is_active', true)
            ->whereNotNull('last_activity_at')
            ->where('last_activity_at', '<', now()->subDays(60))
            ->whereHas('pointsTransactions', fn ($q) => $q->where('points', '>', 0))
            ->count();

        return [
            'org_name'             => (string) ($org?->name ?? 'Your hotel'),
            'date_label'           => $orgNow->copy()->subDay()->translatedFormat('l, j F Y'),
            'timezone'             => $tz,
            'new_members'          => $newMembers,
            'points_earned'        => $pointsEarned,
            'points_redeemed'      => $pointsRedeemed,
            'reward_redemptions'   => $rewardRedemptions,
            'pending_redemptions'  => $pendingRedemptions,
            'tier_upgrades_30d'    => (int) ($tierMovement['upgrades'] ?? 0),
            'tier_downgrades_30d'  => (int) ($tierMovement['downgrades'] ?? 0),
            'at_risk_top'          => $atRisk,
            'at_risk_count'        => $atRiskCount,
        ];
    }

    public function orgNow(Organization $org): Carbon
    {
        $tz = $org->timezone ?: 'UTC';
        try {
            return now()->copy()->setTimezone($tz);
        } catch (\Throwable $e) {
            return now()->copy();
        }
    }
}
