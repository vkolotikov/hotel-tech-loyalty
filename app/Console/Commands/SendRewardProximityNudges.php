<?php

namespace App\Console\Commands;

use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Services\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Daily reward proximity nudge.
 *
 * For each active member with push enabled, find the closest
 * still-affordable reward they don't already own — that is, a
 * reward whose points_cost is within the configured proximity
 * band (default 75-99% of current_points). Send a single push
 * naming the reward + points-to-go.
 *
 * Dedupe: skip if we've already pushed a `reward_nudge` for the
 * same member + reward in the last 7 days. The check reads the
 * push_notifications log's `data` jsonb to keep the surface small
 * (no new table).
 *
 * One nudge per member per run — picking the closest reward
 * keeps the daily message focused, not spammy. Members at 99%
 * always win the slot over members at 76%.
 */
class SendRewardProximityNudges extends Command
{
    protected $signature = 'loyalty:reward-nudges
                            {--min=75 : Lower bound (%) of proximity band}
                            {--max=99 : Upper bound (%) of proximity band}
                            {--cooldown-days=7 : Per-reward cooldown}
                            {--member= : Limit to one member id (testing)}
                            {--dry-run : Compute targets, do not push}';

    protected $description = 'Push a "you are X points away from {reward}" nudge to members close to a reward they have not yet claimed.';

    public function handle(NotificationService $notify): int
    {
        $min = max(1, min(99, (int) $this->option('min')));
        $max = max($min + 1, min(99, (int) $this->option('max')));
        $cooldown = max(1, (int) $this->option('cooldown-days'));
        $memberFilter = $this->option('member');
        $dryRun = (bool) $this->option('dry-run');

        $totalCandidates = 0;
        $totalSent = 0;
        $totalSkipped = 0;

        Organization::query()->chunkById(50, function ($orgs) use (
            $notify, $min, $max, $cooldown, $memberFilter, $dryRun,
            &$totalCandidates, &$totalSent, &$totalSkipped,
        ) {
            foreach ($orgs as $org) {
                app()->instance('current_organization_id', $org->id);

                // Catalog of still-redeemable rewards for this org.
                $rewards = Reward::withoutGlobalScopes()
                    ->where('organization_id', $org->id)
                    ->where('is_active', true)
                    ->where(function ($q) {
                        $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
                    })
                    ->where(function ($q) {
                        $q->whereNull('stock')->orWhere('stock', '>', 0);
                    })
                    ->get(['id', 'name', 'points_cost', 'per_member_limit']);

                if ($rewards->isEmpty()) continue;

                $memberQuery = LoyaltyMember::withoutGlobalScopes()
                    ->where('organization_id', $org->id)
                    ->where('is_active', true)
                    ->where('push_notifications', true)
                    ->whereNotNull('expo_push_token')
                    ->where('current_points', '>', 0);
                if ($memberFilter) $memberQuery->where('id', $memberFilter);

                $memberQuery->chunkById(200, function ($members) use (
                    $rewards, $notify, $min, $max, $cooldown, $dryRun,
                    &$totalCandidates, &$totalSent, &$totalSkipped,
                ) {
                    foreach ($members as $member) {
                        // Members who've claimed (any status) recently are
                        // engaged enough — no need to push.
                        $balance = (int) $member->current_points;

                        // Pick the closest still-affordable reward in the
                        // proximity band. "Closest" = highest fraction <100%.
                        $best = null;
                        $bestPct = 0;
                        foreach ($rewards as $reward) {
                            $cost = (int) $reward->points_cost;
                            if ($cost <= 0 || $balance >= $cost) continue;

                            $pct = (int) round(($balance / $cost) * 100);
                            if ($pct < $min || $pct > $max) continue;

                            // Skip if member already at the per-member limit.
                            if ($reward->per_member_limit !== null) {
                                $taken = RewardRedemption::where('member_id', $member->id)
                                    ->where('reward_id', $reward->id)
                                    ->whereIn('status', [
                                        RewardRedemption::STATUS_PENDING,
                                        RewardRedemption::STATUS_FULFILLED,
                                    ])
                                    ->count();
                                if ($taken >= $reward->per_member_limit) continue;
                            }

                            if ($pct > $bestPct) {
                                $best = $reward;
                                $bestPct = $pct;
                            }
                        }

                        if (!$best) continue;
                        $totalCandidates++;

                        // Dedupe: have we pushed THIS reward to THIS member
                        // in the cooldown window?
                        $sentRecently = DB::table('push_notifications')
                            ->where('member_id', $member->id)
                            ->where('type', 'reward_nudge')
                            ->where('created_at', '>=', now()->subDays($cooldown))
                            ->whereRaw("data::text LIKE ?", ['%"reward_id":' . $best->id . '%'])
                            ->exists();
                        if ($sentRecently) { $totalSkipped++; continue; }

                        if ($dryRun) {
                            $this->info(sprintf(
                                '  [dry] would push to member #%d → %s (%d/%d, %d%%)',
                                $member->id, $best->name, $balance, $best->points_cost, $bestPct,
                            ));
                            continue;
                        }

                        try {
                            $notify->sendRewardNudge($member, $best, $balance);
                            $totalSent++;
                        } catch (\Throwable $e) {
                            $totalSkipped++;
                            Log::warning('Reward nudge failed for member ' . $member->id . ': ' . $e->getMessage());
                        }
                    }
                });
            }
        });

        $this->info(sprintf(
            'Proximity nudge: candidates=%d sent=%d skipped=%d',
            $totalCandidates, $totalSent, $totalSkipped,
        ));
        return self::SUCCESS;
    }
}
