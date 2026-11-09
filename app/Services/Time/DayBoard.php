<?php

namespace App\Services\Time;

use App\Models\PlannerTask;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;

/**
 * One day of the planner, person by person (HexaTech Time Planner, 2026-11-09): each person's hours that day, what is
 * planned for them, how full their day is, and what looks wrong — the facts the Today and Plan pages show and the
 * AI's plan and review start from. Reads only.
 *
 * - A person's capacity is their own hours less their break where their profile sets hours, else the organisation's
 *   window less their break, at most the standard working day (`planner_work_hours_per_day`); 0 on a day off, and 0
 *   for a name without an account, whose hours the planner does not know.
 * - Planned minutes count every task of the day, done or not (TaskView::minutes); `tracked` is the time clocked.
 * - Signals are codes with the people and tasks they name; the workspace words them. None is a figure of its own:
 *   each is a comparison of the numbers beside it.
 */
final class DayBoard
{
    /** A run of back-to-back work this long (gaps under 15 minutes) earns a "no break" signal. */
    public const NO_BREAK_MINUTES = 300;

    /** Overdue work is looked for this many days back. */
    public const OVERDUE_DAYS = 30;

    public function __construct(private readonly Team $team, private readonly PlannerCatalogue $catalogue)
    {
    }

    /**
     * @param  list<string>|null  $onlyKeys  people to include (null: everyone)
     * @return array<string, mixed>
     */
    public function build(int $orgId, string $date, ?array $onlyKeys = null): array
    {
        $day = CarbonImmutable::createFromFormat('!Y-m-d', $date, 'UTC');
        $weekday = (int) $day->isoWeekday();
        $today = VenueClock::today($orgId);
        $isToday = $date === $today;
        $now = VenueClock::now($orgId);
        $nowMinutes = $isToday ? $now->hour * 60 + $now->minute : null;
        $orgWindow = WorkWindow::resolve();
        $standard = $this->catalogue->minutesPerDay();

        $tasks = PlannerTask::query()->with('subtasks')->whereDate('task_date', $date)->orderBy('start_time')->orderBy('id')->get();
        $overdue = $isToday
            ? PlannerTask::query()->whereDate('task_date', '<', $date)->whereDate('task_date', '>=', $day->subDays(self::OVERDUE_DAYS)->toDateString())
                ->where('completed', false)->where(fn ($q) => $q->whereNull('status')->orWhere('status', '!=', 'done'))
                ->orderBy('task_date')->limit(200)->get()
            : collect();
        $pool = PlannerTask::query()->whereNull('task_date')->whereNull('assigned_to_user_id')
            ->where(fn ($q) => $q->whereNull('employee_name')->orWhere('employee_name', ''))
            ->where('completed', false)->get(['id', 'task_group', 'pool_horizon', 'pool_due_date', 'priority']);
        $poolForDay = $pool->filter(fn (PlannerTask $t) => $t->pool_horizon === 'week'
            || ($t->pool_horizon === 'day' && $t->pool_due_date && $t->pool_due_date->toDateString() <= $date)
            || TaskView::priorityRank($t->priority) === 0);

        $lanes = [];
        foreach ($this->team->people() as $person) {
            $lanes[$person['key']] = ['person' => $person, 'tasks' => []];
        }
        $unassigned = [];
        $overdueByOwner = [];
        foreach ($tasks as $t) {
            $owner = $this->team->ownerKey($t);
            if ($owner === null) {
                $unassigned[] = TaskView::of($t, null, $today);
                continue;
            }
            $lanes[$owner] ??= ['person' => $this->stranger($owner, $t), 'tasks' => []];
            $lanes[$owner]['tasks'][] = TaskView::of($t, $owner, $today);
        }
        foreach ($overdue as $t) {
            $owner = $this->team->ownerKey($t) ?? '';
            $overdueByOwner[$owner][] = TaskView::of($t, $owner ?: null, $today);
        }

        $people = [];
        $signals = [];
        foreach ($lanes as $key => $lane) {
            if ($onlyKeys !== null && !in_array($key, $onlyKeys, true)) {
                continue;
            }
            $person = $lane['person'];
            $window = WorkWindow::forPerson($orgWindow, $person['profile'], $weekday);
            $ownHours = $person['profile']['work_start'] !== null || $person['profile']['work_end'] !== null;
            $capacity = $window['works'] ? ($ownHours ? $window['capacity'] : min($window['capacity'], $standard)) : 0;
            // A name without an account (an outside cleaner) has no hours the planner knows: no capacity, no load.
            if (!$person['has_account']) {
                $capacity = 0;
            }
            $list = $lane['tasks'];
            if (!$window['works'] && $list === [] && !$person['has_account']) {
                continue;
            }
            $planned = array_sum(array_map(fn ($t) => $t['minutes'], $list));
            $done = array_sum(array_map(fn ($t) => $t['done'] ? $t['minutes'] : 0, $list));
            $tracked = array_sum(array_map(fn ($t) => (int) $t['actual_minutes'], $list));
            $open = array_values(array_filter($list, fn ($t) => !$t['done']));
            $personSignals = $this->signalsFor($key, $person, $window, $capacity, $planned, $list, $nowMinutes);
            $late = $overdueByOwner[$key] ?? [];
            if ($late !== []) {
                $personSignals[] = ['code' => 'overdue', 'person' => $key, 'value' => count($late)];
            }
            $signals = array_merge($signals, $personSignals);

            $people[] = [
                'key'             => $key,
                'user_id'         => $person['user_id'],
                'name'            => $person['name'],
                'role'            => $person['role'],
                'manager'         => $person['manager'],
                'listed'          => $person['listed'] ?? true,
                'has_account'     => $person['has_account'],
                'skills'          => $person['profile']['skills'],
                'knowledge'       => $person['profile']['knowledge'],
                'prefers'         => $person['prefers'],
                'works'           => $window['works'],
                'window'          => ['start' => WorkWindow::toClock($window['start']), 'end' => WorkWindow::toClock($window['end'])],
                'break_minutes'   => $window['break_minutes'],
                'capacity_minutes'=> $capacity,
                'planned_minutes' => $planned,
                'done_minutes'    => $done,
                'tracked_minutes' => $tracked,
                'load_pct'        => $capacity > 0 ? (int) round($planned / $capacity * 100) : null,
                'open_count'      => count($open),
                'done_count'      => count($list) - count($open),
                'unscheduled'     => count(array_filter($open, fn ($t) => $t['start_time'] === null)),
                'tasks'           => $list,
                'overdue'         => array_slice($late, 0, 50),
            ];
        }

        $unassignedOpen = array_values(array_filter($unassigned, fn ($t) => !$t['done']));
        if ($unassignedOpen !== []) {
            $signals[] = ['code' => 'unassigned', 'value' => count($unassignedOpen)];
        }
        foreach ($tasks as $t) {
            if (!TaskView::isDone($t) && TaskView::priorityRank($t->priority) === 0 && TaskView::clock($t->start_time) === null) {
                $signals[] = ['code' => 'unscheduled_high', 'task' => (int) $t->id, 'person' => $this->team->ownerKey($t)];
            }
        }
        $hasSpareWork = $unassignedOpen !== [] || $poolForDay->isNotEmpty();
        foreach ($people as $p) {
            if ($hasSpareWork && $p['works'] && $p['capacity_minutes'] > 0 && $p['has_account']
                && $p['planned_minutes'] < $p['capacity_minutes'] * 0.5) {
                $signals[] = ['code' => 'light_day', 'person' => $p['key'], 'value' => $p['planned_minutes'], 'limit' => $p['capacity_minutes']];
            }
        }

        $capacity = array_sum(array_column($people, 'capacity_minutes'));
        $planned = array_sum(array_column($people, 'planned_minutes'));

        return [
            'date'       => $date,
            'weekday'    => $weekday,
            'today'      => $today,
            'is_today'   => $isToday,
            'now'        => $nowMinutes !== null ? WorkWindow::toClock($nowMinutes) : null,
            'window'     => ['start' => WorkWindow::toClock($orgWindow['start']), 'end' => WorkWindow::toClock($orgWindow['end'])],
            'people'     => $people,
            'unassigned' => $unassigned,
            'pool'       => ['open' => $pool->count(), 'for_day' => $poolForDay->count()],
            'totals'     => [
                'tasks'            => $tasks->count(),
                'done'             => $tasks->filter(fn (PlannerTask $t) => TaskView::isDone($t))->count(),
                'planned_minutes'  => $planned + array_sum(array_map(fn ($t) => $t['minutes'], $unassigned)),
                'capacity_minutes' => $capacity,
                'load_pct'         => $capacity > 0 ? (int) round($planned / $capacity * 100) : null,
                'unassigned'       => count($unassignedOpen),
                'overdue'          => $overdue->count(),
            ],
            'signals'    => $signals,
        ];
    }

    /** A lane for a task's owner who is not on the team list (switched off, or a name nobody has). */
    private function stranger(string $key, PlannerTask $t): array
    {
        return [
            'key' => $key, 'user_id' => str_starts_with($key, 'u') ? (int) substr($key, 1) : null, 'staff_id' => null,
            'name' => trim((string) $t->employee_name) ?: '—', 'role' => null, 'department' => null, 'manager' => false,
            'avatar_url' => null, 'has_account' => false, 'listed' => false,
            'profile' => ['skills' => null, 'knowledge' => '', 'work_start' => null, 'work_end' => null, 'work_days' => null, 'break_minutes' => 0],
            'prefers' => ['groups' => [], 'tasks' => []],
        ];
    }

    /**
     * @param  array{start: int, end: int, works: bool, break_minutes: int, capacity: int}  $window
     * @param  list<array<string, mixed>>  $list
     * @return list<array<string, mixed>>
     */
    private function signalsFor(string $key, array $person, array $window, int $capacity, int $planned, array $list, ?int $nowMinutes): array
    {
        $out = [];
        if (!$window['works'] && $list !== []) {
            $out[] = ['code' => 'not_working', 'person' => $key, 'value' => count($list)];
        }
        if ($window['works'] && $capacity > 0 && $planned > $capacity) {
            $out[] = ['code' => 'over_capacity', 'person' => $key, 'value' => $planned, 'limit' => $capacity];
        }
        $timed = array_values(array_filter($list, fn ($t) => $t['start_time'] !== null && !$t['done']));
        usort($timed, fn ($a, $b) => strcmp($a['start_time'], $b['start_time']));
        for ($i = 0; $i < count($timed); $i++) {
            $start = WorkWindow::toMinutes($timed[$i]['start_time']);
            $end = $start + $timed[$i]['minutes'];
            if ($window['works'] && ($start < $window['start'] || $end > $window['end'])) {
                $out[] = ['code' => 'outside_hours', 'person' => $key, 'task' => $timed[$i]['id']];
            }
            for ($j = $i + 1; $j < count($timed); $j++) {
                $other = WorkWindow::toMinutes($timed[$j]['start_time']);
                if ($other >= $end) {
                    break;
                }
                $out[] = ['code' => 'overlap', 'person' => $key, 'task' => $timed[$i]['id'], 'other' => $timed[$j]['id']];
            }
        }
        // The longest run of work with gaps under 15 minutes.
        $run = 0;
        $longest = 0;
        $runEnd = null;
        foreach ($timed as $t) {
            $start = WorkWindow::toMinutes($t['start_time']);
            $end = $start + $t['minutes'];
            if ($runEnd !== null && $start - $runEnd < 15) {
                $run += max(0, $end - max($start, $runEnd));
                $runEnd = max($runEnd, $end);
            } else {
                $run = $end - $start;
                $runEnd = $end;
            }
            $longest = max($longest, $run);
        }
        if ($longest >= self::NO_BREAK_MINUTES) {
            $out[] = ['code' => 'no_break', 'person' => $key, 'value' => $longest];
        }
        foreach ($list as $t) {
            if (!$t['done'] && $t['task_group'] && !Team::mayTake($person, $t['task_group'])) {
                $out[] = ['code' => 'skill_mismatch', 'person' => $key, 'task' => $t['id']];
            }
        }
        if ($nowMinutes !== null) {
            foreach ($timed as $t) {
                $end = WorkWindow::toMinutes($t['start_time']) + $t['minutes'];
                if ($end <= $nowMinutes && !$t['running']) {
                    $out[] = ['code' => 'slipped', 'person' => $key, 'task' => $t['id']];
                }
            }
        }

        return $out;
    }
}
