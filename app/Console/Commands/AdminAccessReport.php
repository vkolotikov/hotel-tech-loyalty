<?php

namespace App\Console\Commands;

use App\Http\Middleware\AdminAccess;
use App\Support\AdminAccess\AccessRecorder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * What the admin access map refused, or would have refused in report mode
 * (Part C spec §5.4): one line per rule, method, reason and outcome, then
 * the totals. Read it before setting ADMIN_ACCESS_MODE=enforce: every
 * "would refuse" line a real page needs is a map fix first.
 */
class AdminAccessReport extends Command
{
    protected $signature = 'admin-access:report
                            {--days=7 : How many days back, today included}
                            {--org= : Only this organization id}';

    protected $description = 'Summarise what the admin access map refused, or would have refused in report mode.';

    public function handle(): int
    {
        $days = max(1, (int) $this->option('days'));
        $this->line(AdminAccess::enforcing()
            ? 'Mode: enforce (ADMIN_ACCESS_MODE=enforce): roles and deactivated accounts are refused.'
            : 'Mode: report (ADMIN_ACCESS_MODE is not "enforce"): roles and deactivated accounts are recorded and let through.');

        $query = DB::table(AccessRecorder::TABLE)->where('day', '>=', now()->subDays($days - 1)->toDateString());
        if ($this->option('org') !== null) {
            $query->where('organization_id', (int) $this->option('org'));
        }

        $lines = (clone $query)
            ->selectRaw('rule, method, reason, enforced, SUM(hits) AS hits, COUNT(DISTINCT user_id) AS people, COUNT(DISTINCT organization_id) AS orgs, MAX(last_seen_at) AS last_seen')
            ->groupBy('rule', 'method', 'reason', 'enforced')
            ->orderByDesc('hits')
            ->get();

        if ($lines->isEmpty()) {
            $this->line("Nothing refused or recorded in the last {$days} day(s).");

            return self::SUCCESS;
        }

        $this->table(
            ['rule', 'method', 'reason', 'outcome', 'calls', 'people', 'organizations', 'last seen'],
            $lines->map(fn ($l) => [
                $l->rule, $l->method, $l->reason, $l->enforced ? 'refused' : 'would refuse',
                (int) $l->hits, (int) $l->people, (int) $l->orgs, (string) $l->last_seen,
            ])->all(),
        );

        foreach (['Would refuse' => false, 'Refused' => true] as $label => $enforced) {
            $total = (clone $query)->where('enforced', $enforced)
                ->selectRaw('COALESCE(SUM(hits), 0) AS hits, COUNT(DISTINCT user_id) AS people, COUNT(DISTINCT organization_id) AS orgs')
                ->first();
            $this->line(sprintf('%s: %d call(s) by %d person(s) in %d organization(s).', $label, $total->hits, $total->people, $total->orgs));
        }

        return self::SUCCESS;
    }
}
