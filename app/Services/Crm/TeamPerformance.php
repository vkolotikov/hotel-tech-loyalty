<?php

namespace App\Services\Crm;

use App\Models\Inquiry;
use App\Models\Organization;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

final class TeamPerformance
{
    public function __construct(private OpenLeadValue $valuation) {}

    /** @param Builder<Inquiry> $visible */
    public function portfolio(Builder $visible, Organization $org, CarbonImmutable $now): array
    {
        // The open pipeline and its follow-ups use the same scope as Leads and Today.
        $open = (clone $visible)->whereNotIn('status', ['Confirmed', 'Lost']);
        $today = $now->toDateString();
        $due = (clone $open)->where('next_task_completed', false)->where('next_task_due', '<=', $today)
            ->groupBy('next_task_due')->toBase()->selectRaw('next_task_due, count(*) as leads')->pluck('leads', 'next_task_due');
        $dueToday = (int) $due->get($today, 0);

        return ['total' => (clone $visible)->count(), 'total_value' => $this->value($visible, $org),
            'open' => (clone $open)->count(), 'open_value' => $this->value($open, $org),
            'overdue' => (int) $due->sum() - $dueToday, 'due_today' => $dueToday, 'countries' => LeadCountries::for($visible)];
    }

    /** @param Builder<Inquiry> $visible */
    public function period(Builder $visible, Organization $org, CarbonImmutable $start, CarbonImmutable $now, bool $month): array
    {
        $orgId = (int) $org->id;
        $days = [];
        for ($day = $start; $day->lte($now); $day = $day->addDay()) {
            $key = $day->toDateString();
            $days[$key] = ['date' => $key, 'leads' => 0, 'wins' => 0];
        }
        $range = [$start->utc(), $now->utc()];
        $arrivals = (clone $visible)->whereBetween('created_at', $range);
        $leads = (clone $arrivals)->toBase()->select('created_at')->cursor();
        foreach ($leads as $lead) {
            $days[CarbonImmutable::parse($lead->created_at, 'UTC')->setTimezone($now->timezone)->toDateString()]['leads']++;
        }
        // Only a dated win is a win in a particular interval. Later edits or fulfilment dates cannot date an old sale.
        $wins = DB::table('activities as a')->joinSub((clone $visible)->select(['id', 'brand_id']), 'i', 'i.id', '=', 'a.inquiry_id')
            ->where('a.organization_id', $orgId)->where(fn ($q) => $q->whereNull('a.brand_id')->orWhereColumn('a.brand_id', 'i.brand_id'))
            ->where('a.type', 'status_change')->where('a.metadata->kind', 'won')->whereNotNull('a.occurred_at')
            ->groupBy('a.inquiry_id')->selectRaw('a.inquiry_id, MIN(a.occurred_at) AS won_at');
        $recorded = DB::query()->fromSub(clone $wins, 'wins')->whereBetween('won_at', $range);
        foreach ((clone $recorded)->cursor() as $win) {
            $days[CarbonImmutable::parse($win->won_at, 'UTC')->setTimezone($now->timezone)->toDateString()]['wins']++;
        }
        $undated = (clone $visible)->where(fn ($q) => $q->where('status', 'Confirmed')->orWhereHas('pipelineStage', fn ($s) => $s->where('kind', 'won')))
            ->whereNotIn('id', DB::query()->fromSub($wins, 'wins')->select('inquiry_id'))->count();

        $previousStart = $month ? $start->subMonthNoOverflow() : $start->subWeek();
        $previousEnd = $month ? $now->subMonthNoOverflow() : $now->subWeek();
        if ($month && $previousStart->daysInMonth < $now->day) {
            $previousEnd = $previousStart->endOfMonth();
        }
        $previousRange = [$previousStart->utc(), $previousEnd->utc()];
        $priorLeads = (clone $visible)->whereBetween('created_at', $previousRange)->count();
        $priorWins = DB::query()->fromSub($wins, 'wins')->whereBetween('won_at', $previousRange)->count();
        $wonLeads = (clone $visible)->whereIn('id', $recorded->select('inquiry_id'));

        return ['days' => array_values($days), 'undated' => $undated, 'performance' => [
            'countries' => LeadCountries::for($arrivals), 'won_value' => $this->value($wonLeads, $org),
            'lead_change' => array_sum(array_column($days, 'leads')) - $priorLeads,
            'win_change' => array_sum(array_column($days, 'wins')) - $priorWins,
            'previous_from' => $previousStart->toDateString(), 'previous_through' => $previousEnd->toDateString(),
        ]];
    }

    /** @param Builder<Inquiry> $scope */
    private function value(Builder $scope, Organization $org): array
    {
        $value = $this->valuation->summary($scope, $org);
        $value['valued'] = array_sum(array_column(array_filter($value['groups'], fn ($group) => $group['included']), 'count'));

        return $value;
    }
}
