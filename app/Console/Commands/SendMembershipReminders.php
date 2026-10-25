<?php

namespace App\Console\Commands;

use App\Models\LoyaltyMember;
use App\Services\Loyalty\Members\MembershipValidity;
use App\Services\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * "Your membership ends on {date}" (release 8, spec 2026-10-25 §3): for every organisation with a membership that ends
 * within MembershipValidity::REMIND_DAYS on its own venue clock, an inbox message and a push to each active member whose
 * end date is between the venue's today and two weeks on, once per end date (`membership_reminded_for`, written before
 * the message goes). Run daily (routes/console.php); a second run the same day, or two at once, reminds nobody twice. A
 * renewed membership (a new end date) is reminded again before its new end.
 */
class SendMembershipReminders extends Command
{
    protected $signature = 'loyalty:membership-reminders {--org= : Only this organisation id}';

    protected $description = 'Remind HexaTech Loyalty members, two weeks ahead, that their membership ends (once per end date).';

    public function handle(MembershipValidity $validity, NotificationService $notify): int
    {
        $orgs = LoyaltyMember::withoutGlobalScopes()->whereNotNull('membership_valid_until')
            ->when($this->option('org'), fn ($q, $org) => $q->where('organization_id', (int) $org))
            ->distinct()->orderBy('organization_id')->pluck('organization_id');

        $total = 0;
        foreach ($orgs as $orgId) {
            $orgId = (int) $orgId;
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
