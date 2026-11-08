<?php

namespace App\Services\Time;

use App\Models\PlannerTask;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * How the team's time went over a period (HexaTech Time Planner, 2026-11-09), worked out in PHP from the planner's own
 * rows so it reads the same on PostgreSQL and on the tests' SQLite. Reads only.
 *
 * Definitions (the full admin's Stats where it has one):
 * - done: `completed` or status `done`; on time: finished on or before its day in the venue's zone (`completed_at`);
 *   a done task without `completed_at` (finished before that column existed) is neither on time nor late;
 * - planned minutes: TaskView::minutes; tracked minutes: what Start / Pause / Finish clocked (`actual_minutes`);
 * - estimate accuracy: tracked ÷ planned over the tasks that have both (100 % = as planned, above = took longer);
 * - capacity: each person's capacity on each day of the period (DayBoard's rule), so load is planned ÷ capacity;
 * - the previous period is the one of the same length just before, for the figures' trend.
 */
final class TimeInsights
{
    public const MAX_DAYS = 92;

    public function __construct(private readonly Team $team, private readonly PlannerCatalogue $catalogue)
    {
    }

    /** @return array<string, mixed> */
    public function for(int $orgId, string $from, string $to, ?string $personKey = null): array
    {
        $start = CarbonImmutable::createFromFormat('!Y-m-d', $from, 'UTC');
        $end = CarbonImmutable::createFromFormat('!Y-m-d', $to, 'UTC');
        if ($end->lt($start)) {
            [$start, $end] = [$end, $start];
        }
        if ($start->diffInDays($end) >= self::MAX_DAYS) {
            $start = $end->subDays(self::MAX_DAYS - 1);
        }
        $days = (int) $start->diffInDays($end) + 1;
        $zone = VenueClock::zone($orgId);
        $today = VenueClock::today($orgId);

        $rows = $this->rows($start->toDateString(), $end->toDateString(), $personKey);
        $previous = $this->rows($start->subDays($days)->toDateString(), $start->subDay()->toDateString(), $personKey);

        $orgWindow = WorkWindow::resolve();
        $standard = $this->catalogue->minutesPerDay();
        $people = [];
        foreach ($this->team->people() as $p) {
            if ($personKey !== null && $p['key'] !== $personKey) {
                continue;
            }
            $capacity = 0;
            $ownHours = $p['profile']['work_start'] !== null || $p['profile']['work_end'] !== null;
            for ($d = $start; $d->lte($end); $d = $d->addDay()) {
                $w = WorkWindow::forPerson($orgWindow, $p['profile'], (int) $d->isoWeekday());
                $capacity += $w['works'] ? ($ownHours ? $w['capacity'] : min($w['capacity'], $standard)) : 0;
            }
            $people[$p['key']] = ['key' => $p['key'], 'name' => $p['name'], 'user_id' => $p['user_id'], 'capacity_minutes' => $capacity] + $this->blank();
        }

        $groups = [];
        $weekdays = [];
        for ($i = 1; $i <= 7; $i++) {
            $weekdays[$i] = ['weekday' => $i, 'tasks' => 0, 'done' => 0, 'minutes' => 0];
        }
        $hours = [];
        $byDay = [];
        for ($d = $start; $d->lte($end); $d = $d->addDay()) {
            $byDay[$d->toDateString()] = ['date' => $d->toDateString(), 'tasks' => 0, 'done' => 0, 'planned_minutes' => 0, 'done_minutes' => 0];
        }
        foreach ($rows as $t) {
            $fact = $this->fact($t, $zone, $today);
            $key = $this->team->ownerKey($t);
            if ($key !== null) {
                $people[$key] ??= ['key' => $key, 'name' => trim((string) $t->employee_name) ?: '—', 'user_id' => $t->assigned_to_user_id, 'capacity_minutes' => 0] + $this->blank();
                $this->add($people[$key], $fact);
            }
            $g = $t->task_group ?: '';
            $groups[$g] ??= ['task_group' => $g !== '' ? $g : null] + $this->blank();
            $this->add($groups[$g], $fact);
            $wd = (int) $t->task_date->isoWeekday();
            $weekdays[$wd]['tasks']++;
            $weekdays[$wd]['done'] += $fact['done'] ? 1 : 0;
            $weekdays[$wd]['minutes'] += $fact['minutes'];
            if ($clock = TaskView::clock($t->start_time)) {
                $h = (int) substr($clock, 0, 2);
                $hours[$h] = ($hours[$h] ?? 0) + 1;
            }
            $date = $t->task_date->toDateString();
            if (isset($byDay[$date])) {
                $byDay[$date]['tasks']++;
                $byDay[$date]['done'] += $fact['done'] ? 1 : 0;
                $byDay[$date]['planned_minutes'] += $fact['minutes'];
                $byDay[$date]['done_minutes'] += $fact['done'] ? $fact['minutes'] : 0;
            }
        }

        $people = array_map(fn ($p) => $this->finish($p) + ['load_pct' => $p['capacity_minutes'] > 0 ? (int) round($p['planned_minutes'] / $p['capacity_minutes'] * 100) : null], array_values($people));
        usort($people, fn ($a, $b) => $b['planned_minutes'] <=> $a['planned_minutes'] ?: strcasecmp($a['name'], $b['name']));
        $groups = array_map(fn ($g) => $this->finish($g), array_values($groups));
        usort($groups, fn ($a, $b) => $b['planned_minutes'] <=> $a['planned_minutes']);
        ksort($hours);

        $totals = $this->totals($rows, $zone, $today);
        $totals['capacity_minutes'] = array_sum(array_column($people, 'capacity_minutes'));
        $totals['load_pct'] = $totals['capacity_minutes'] > 0 ? (int) round($totals['planned_minutes'] / $totals['capacity_minutes'] * 100) : null;
        $pool = $this->pool();

        return [
            'from'     => $start->toDateString(),
            'to'       => $end->toDateString(),
            'days'     => $days,
            'person'   => $personKey,
            'totals'   => $totals,
            'previous' => $this->totals($previous, $zone, $today),
            'people'   => $people,
            'groups'   => $groups,
            'weekdays' => array_values($weekdays),
            'hours'    => array_map(fn ($h, $n) => ['hour' => $h, 'tasks' => $n], array_keys($hours), array_values($hours)),
            'by_day'   => array_values($byDay),
            'pool'     => $pool,
            'signals'  => $this->signals($totals, $people, $groups, $pool),
        ];
    }

    /** @return Collection<int, PlannerTask> */
    private function rows(string $from, string $to, ?string $personKey): Collection
    {
        $rows = PlannerTask::query()->whereDate('task_date', '>=', $from)->whereDate('task_date', '<=', $to)->limit(50000)
            ->get(['id', 'task_date', 'start_time', 'end_time', 'duration_minutes', 'actual_minutes', 'completed', 'status',
                'completed_at', 'task_group', 'assigned_to_user_id', 'employee_name']);

        return $personKey === null ? $rows : $rows->filter(fn (PlannerTask $t) => $this->team->ownerKey($t) === $personKey)->values();
    }

    /** @return array{done: bool, on_time: ?bool, minutes: int, tracked: ?int, overdue: bool} */
    private function fact(PlannerTask $t, string $zone, string $today): array
    {
        $done = TaskView::isDone($t);
        $onTime = $done && $t->completed_at
            ? $t->completed_at->copy()->setTimezone($zone)->toDateString() <= $t->task_date->toDateString()
            : null;

        return [
            'done'    => $done,
            'on_time' => $onTime,
            'minutes' => TaskView::minutes($t),
            'tracked' => $t->actual_minutes !== null ? (int) $t->actual_minutes : null,
            'overdue' => !$done && $t->task_date->toDateString() < $today,
        ];
    }

    /** @return array<string, int> */
    private function blank(): array
    {
        return ['tasks' => 0, 'done' => 0, 'on_time' => 0, 'late' => 0, 'overdue' => 0, 'planned_minutes' => 0, 'done_minutes' => 0,
            'tracked_minutes' => 0, 'tracked_tasks' => 0, 'tracked_planned' => 0];
    }

    private function add(array &$acc, array $fact): void
    {
        $acc['tasks']++;
        $acc['planned_minutes'] += $fact['minutes'];
        if ($fact['done']) {
            $acc['done']++;
            $acc['done_minutes'] += $fact['minutes'];
        }
        if ($fact['on_time'] === true) {
            $acc['on_time']++;
        } elseif ($fact['on_time'] === false) {
            $acc['late']++;
        }
        if ($fact['overdue']) {
            $acc['overdue']++;
        }
        if ($fact['tracked'] !== null) {
            $acc['tracked_minutes'] += $fact['tracked'];
            $acc['tracked_tasks']++;
            $acc['tracked_planned'] += $fact['minutes'];
        }
    }

    /** @return array<string, mixed> */
    private function finish(array $acc): array
    {
        $acc['completion_pct'] = $acc['tasks'] > 0 ? (int) round($acc['done'] / $acc['tasks'] * 100) : null;
        $judged = $acc['on_time'] + $acc['late'];
        $acc['on_time_pct'] = $judged > 0 ? (int) round($acc['on_time'] / $judged * 100) : null;
        $acc['accuracy_pct'] = $acc['tracked_planned'] > 0 ? (int) round($acc['tracked_minutes'] / $acc['tracked_planned'] * 100) : null;
        unset($acc['tracked_planned']);

        return $acc;
    }

    /** @param Collection<int, PlannerTask> $rows */
    private function totals(Collection $rows, string $zone, string $today): array
    {
        $acc = $this->blank();
        foreach ($rows as $t) {
            $this->add($acc, $this->fact($t, $zone, $today));
        }

        return $this->finish($acc);
    }

    /** The open pool now (no day, nobody's), by how long it has waited. @return array<string, mixed> */
    private function pool(): array
    {
        $rows = PlannerTask::query()->whereNull('task_date')->whereNull('assigned_to_user_id')
            ->where(fn ($q) => $q->whereNull('employee_name')->orWhere('employee_name', ''))
            ->where('completed', false)->get(['id', 'created_at']);
        $now = now();
        $buckets = ['d0' => 0, 'd1' => 0, 'd3' => 0, 'd7' => 0];
        foreach ($rows as $t) {
            $age = $t->created_at ? $t->created_at->diffInHours($now) / 24 : 0;
            $buckets[$age < 1 ? 'd0' : ($age < 3 ? 'd1' : ($age < 7 ? 'd3' : 'd7'))]++;
        }

        return ['open' => $rows->count()] + $buckets + ['oldest' => $rows->min('created_at')?->toIso8601String()];
    }

    /** @return list<array<string, mixed>> */
    private function signals(array $totals, array $people, array $groups, array $pool): array
    {
        $out = [];
        if ($totals['tasks'] >= 10 && $totals['completion_pct'] !== null && $totals['completion_pct'] < 60) {
            $out[] = ['code' => 'low_completion', 'value' => $totals['completion_pct']];
        }
        foreach ($people as $p) {
            if ($p['load_pct'] !== null && $p['load_pct'] > 100) {
                $out[] = ['code' => 'overloaded', 'person' => $p['key'], 'value' => $p['load_pct']];
            } elseif ($p['load_pct'] !== null && $p['capacity_minutes'] >= 8 * 60 && $p['load_pct'] < 40) {
                $out[] = ['code' => 'underused', 'person' => $p['key'], 'value' => $p['load_pct']];
            }
            if ($p['on_time'] + $p['late'] >= 5 && $p['on_time_pct'] !== null && $p['on_time_pct'] < 60) {
                $out[] = ['code' => 'often_late', 'person' => $p['key'], 'value' => $p['on_time_pct']];
            }
        }
        foreach ($groups as $g) {
            if ($g['tracked_tasks'] >= 3 && $g['accuracy_pct'] !== null && $g['accuracy_pct'] >= 130) {
                $out[] = ['code' => 'takes_longer', 'group' => $g['task_group'], 'value' => $g['accuracy_pct']];
            } elseif ($g['tracked_tasks'] >= 3 && $g['accuracy_pct'] !== null && $g['accuracy_pct'] <= 70) {
                $out[] = ['code' => 'takes_less', 'group' => $g['task_group'], 'value' => $g['accuracy_pct']];
            }
        }
        if ($pool['d7'] > 0) {
            $out[] = ['code' => 'pool_waiting', 'value' => $pool['d7']];
        }
        if ($totals['overdue'] > 0) {
            $out[] = ['code' => 'overdue_open', 'value' => $totals['overdue']];
        }

        return $out;
    }
}
