<?php

namespace App\Console\Commands;

use App\Models\LoyaltyMember;
use App\Services\Appointments\VenueClock;
use App\Services\Loyalty\Members\MembershipValidity;
use App\Services\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * "Your membership ends on {date}" (release 8, spec 2026-10-25 §3): for every organisation with a membership that ends
 * within MembershipValidity::REMIND_DAYS on its own venue clock, an inbox message and a push to each active member whose
 * end date is between the venue's today and two weeks on, once per end date (`membership_reminded_for`, written before
 * the message goes). A second run the same day, or two at once, reminds nobody twice. A renewed membership (a new end
 * date) is reminded again before its new end.
 *
 * Release 9: the schedule runs it every hour with `--at-venue-hour=9`, and each organisation is reminded only in the
 * hour its own clock reads 9 — a morning everywhere, never 01:30 in the Americas. Run by hand without the option, it
 * reminds every organisation at once.
 */
class SendMembershipReminders extends Command
{
    protected $signature = 'loyalty:membership-reminders {--org= : Only this organisation id} {--at-venue-hour= : Only organisations whose own clock reads this hour (0-23)}';

    protected $description = 'Remind HexaTech Loyalty members, two weeks ahead, that their membership ends (once per end date).';

    public function handle(MembershipValidity $validity, NotificationService $notify): int
    {
        $orgs = LoyaltyMember::withoutGlobalScopes()->whereNotNull('membership_valid_until')
            ->when($this->option('org'), fn ($q, $org) => $q->where('organization_id', (int) $org))
            ->distinct()->orderBy('organization_id')->pluck('organization_id');

        $hour = $this->venueHour();
        $total = 0;
        foreach ($orgs as $orgId) {
            $orgId = (int) $orgId;
            if ($hour !== null && (int) VenueClock::now($orgId)->format('G') !== $hour) {
                continue;
            }
            try {
                $sent = $this->underOrganization($orgId, fn () => $validity->remind($orgId, $notify));
            } catch (\Throwable $e) {
                Log::error('loyalty.membership_reminders_failed', ['org' => $orgId, 'error' => $e->getMessage()]);
                $this->error("organisation {$orgId}: failed");
                continue;
            }
            if ($sent > 0) {
                $this->line("organisation {$orgId}: {$sent} reminded");
            }
            $total += $sent;
        }
        if ($total > 0) {
            Log::info('loyalty membership reminders', ['reminded' => $total]);
        }
        $this->info("{$total} reminded");

        return self::SUCCESS;
    }

    /** The `--at-venue-hour` asked for, or null for every organisation now. */
    private function venueHour(): ?int
    {
        $raw = $this->option('at-venue-hour');

        return $raw === null || $raw === '' ? null : max(0, min(23, (int) $raw));
    }

    /** Run under the organisation's tenant binding, and put back whatever was bound before. */
    private function underOrganization(int $orgId, \Closure $work): int
    {
        $had = app()->bound('current_organization_id');
        $previous = $had ? app('current_organization_id') : null;
        app()->instance('current_organization_id', $orgId);
        try {
            return (int) $work();
        } finally {
            $had ? app()->instance('current_organization_id', $previous) : app()->forgetInstance('current_organization_id');
        }
    }
}
