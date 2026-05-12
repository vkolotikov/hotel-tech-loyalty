<?php

namespace App\Console\Commands;

use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Models\User;
use App\Services\LoyaltyService;
use App\Services\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Daily birthday bonus sweep.
 *
 * For each org, awards the configured `birthday_bonus_points`
 * (default 500) to every active member whose User.date_of_birth
 * matches today's month + day. Iterates org-by-org so each org's
 * HotelSetting lookup happens once, not per member.
 *
 * Idempotency: idempotency_key = "birthday_{year}_{member_id}".
 * Re-running the cron in the same year is a no-op — LoyaltyService
 * checks the key before any DB writes. Means a 1-minute cron retry,
 * a clock skew, or running --force the next day doesn't double-pay.
 *
 * Only awards to members who have at least one prior earn
 * transaction. Filters out never-engaged signups that would
 * otherwise get a "happy birthday" the day after registering.
 *
 * Flags:
 *   --force     Bypass the prior-earn requirement (testing)
 *   --org=ID    Restrict to one org (testing)
 *   --member=ID Restrict to one member (testing)
 */
class SendBirthdayRewards extends Command
{
    protected $signature = 'loyalty:birthday-rewards
                            {--force : Skip the prior-earn requirement}
                            {--org= : Limit to one organization id}
                            {--member= : Limit to one member id}';

    protected $description = 'Award birthday bonus points to members whose birthday is today and push a celebratory notification.';

    public function handle(LoyaltyService $loyalty, NotificationService $notify): int
    {
        $today = now();
        $month = (int) $today->format('n');
        $day   = (int) $today->format('j');
        $year  = (int) $today->format('Y');

        $force = (bool) $this->option('force');
        $orgFilter = $this->option('org');
        $memberFilter = $this->option('member');

        $orgs = Organization::query();
        if ($orgFilter) $orgs->where('id', $orgFilter);

        $totalAwarded = 0;
        $totalSkipped = 0;

        $orgs->orderBy('id')->chunkById(50, function ($orgs) use (
            $loyalty, $notify, $month, $day, $year,
            $force, $memberFilter, &$totalAwarded, &$totalSkipped,
        ) {
            foreach ($orgs as $org) {
                app()->instance('current_organization_id', $org->id);
                $bonus = (int) HotelSetting::getValue('birthday_bonus_points', 500);
                if ($bonus <= 0) continue;

                $q = LoyaltyMember::withoutGlobalScopes()
                    ->where('organization_id', $org->id)
                    ->where('is_active', true)
                    ->whereHas('user', function ($qu) use ($month, $day) {
                        $driver = \DB::getDriverName();
                        if ($driver === 'pgsql') {
                            $qu->whereNotNull('date_of_birth')
                               ->whereRaw('EXTRACT(MONTH FROM date_of_birth) = ?', [$month])
                               ->whereRaw('EXTRACT(DAY FROM date_of_birth) = ?', [$day]);
                        } else {
                            $qu->whereNotNull('date_of_birth')
                               ->whereRaw('MONTH(date_of_birth) = ?', [$month])
                               ->whereRaw('DAY(date_of_birth) = ?', [$day]);
                        }
                    });
                if ($memberFilter) $q->where('id', $memberFilter);

                $q->with('user')->chunkById(100, function ($members) use (
                    $loyalty, $notify, $bonus, $year, $force, &$totalAwarded, &$totalSkipped,
                ) {
                    foreach ($members as $member) {
                        // Filter out never-engaged signups.
                        if (!$force) {
                            $hasEarn = $member->pointsTransactions()
                                ->where('points', '>', 0)
                                ->exists();
                            if (!$hasEarn) { $totalSkipped++; continue; }
                        }

                        try {
                            $loyalty->awardPoints(
                                $member,
                                $bonus,
                                'Birthday bonus',
                                'birthday',
                                null, null, null, null, null, null,
                                'birthday',
                                'system',
                                null,
                                'birthday_' . $year . '_' . $member->id,
                                false, // not qualifying for tier
                            );

                            try {
                                $notify->sendBirthdayBonus($member, $bonus);
                            } catch (\Throwable $e) {
                                // Push failure shouldn't reverse the award.
                                Log::warning('Birthday push failed for member ' . $member->id . ': ' . $e->getMessage());
                            }

                            $totalAwarded++;
                            $this->info("  🎂 awarded {$bonus} pts to member #{$member->id}");
                        } catch (\Throwable $e) {
                            Log::warning('Birthday award failed for member ' . $member->id . ': ' . $e->getMessage());
                            $totalSkipped++;
                        }
                    }
                });
            }
        });

        $this->info("Birthday sweep: awarded={$totalAwarded} skipped={$totalSkipped}");
        return self::SUCCESS;
    }
}
