<?php

namespace App\Services\Time;

use App\Models\PlannerTask;
use Carbon\CarbonImmutable;

/**
 * Plans a week (HexaTech Time Planner, 2026-11-14, the AI assistant: "AI could help to use the tasks [of the pool] and
 * add to employees regarding the day"): which day and which person each piece of open work goes to, then each day's
 * times. A proposal only — nothing is written until a person applies it (PlanApplier, a date per line).
 *
 * What it places, for the people in scope, from today (or the week's Monday, when later) to the week's Sunday:
 * - the week's days' own open tasks without a time (they keep their day; DayPlanner gives them a time and, for the
 *   day's unassigned work when planning the team, a person);
 * - with `include_backlog`, the people's own undated tasks; with `include_pool`, the open pool their skills allow; with
 *   `include_overdue`, their open work of the last 30 days — each to a day and, the pool's, to a person.
 *
 * Each task is planned with its own length, else the manager's typical one, else the learned one (Learning::sized()).
 * The AI's lines come first, each checked: a day in the week, on or before the task's due day, a person in scope with
 * an account who works that day, may take its type and has the room; whatever fails goes to the rules. The rules:
 * overdue, then high priority, then the earliest due, then the longest — a task due by a day (or overdue, or high)
 * takes the earliest day someone suitable has room; any other spreads to the day and person with the most room, after
 * fit (preferred work, shown experience, not a manager while someone else can).
 */
final class WeekPlanner
{
    public const MAX_TASKS = 120;

    /** @var array<string, array<string, int>> free minutes per day and person */
    private array $free = [];

    /** @var array<string, array<string, int>> free minutes per day and person before the plan */
    private array $freeBefore = [];

    /** @var array<string, array<string, mixed>> DayBoard per day */
    private array $boards = [];

    public function __construct(
        private readonly DayBoard $dayBoard,
        private readonly DayPlanner $dayPlanner,
        private readonly Team $team,
        private readonly Learning $learning,
    ) {
    }

    /** The days a week from $start plans: from the later of its Monday and today, to its Sunday. @return list<string> */
    public static function days(string $start, string $today): array
    {
        $monday = CarbonImmutable::createFromFormat('!Y-m-d', $start, 'UTC')->startOfWeek(CarbonImmutable::MONDAY);
        $out = [];
        for ($i = 0; $i < 7; $i++) {
            $d = $monday->addDays($i)->toDateString();
            if ($d >= $today) {
                $out[] = $d;
            }
        }

        return $out;
    }

    /**
     * @param  list<string>  $days  days() — at least one
     * @param  list<string>  $scope  person keys
     * @param  array{include_pool?: bool, include_backlog?: bool, include_overdue?: bool, assign_others: bool}  $options
     * @param  array<string, mixed>  $experience  Experience::byPerson()
     * @param  list<array<string, mixed>>  $ai  [{task_id, date, person, start_time?, note?}]
     * @return array{from: string, to: string, days: list<array<string, mixed>>, unplaced: list<array<string, mixed>>, tasks: list<array<string, mixed>>}
     */
    public function plan(int $orgId, array $days, string $today, array $scope, array $options, array $experience, array $ai = []): array
    {
        $this->boards = [];
        $this->free = [];
        foreach ($days as $d) {
            $this->boards[$d] = $this->dayBoard->build($orgId, $d, $scope);
            foreach ($this->boards[$d]['people'] as $p) {
                $this->free[$d][$p['key']] = $p['works'] && $p['has_account'] ? max(0, (int) $p['capacity_minutes'] - (int) $p['planned_minutes']) : 0;
            }
        }

        $this->freeBefore = $this->free;
        [$fixed, $flexible] = $this->candidates($orgId, $days, $today, $scope, $options);
        $byId = [];
        foreach ($flexible as $t) {
            $byId[(int) $t['id']] = $t;
        }

        // Day and person for the work without a day: the AI's lines first, each checked, then the rules.
        $assigned = [];
        $aiStarts = [];
        foreach ($ai as $line) {
            $id = (int) ($line['task_id'] ?? 0);
            $date = (string) ($line['date'] ?? '');
            $person = (string) ($line['person'] ?? '');
            if (!isset($byId[$id]) || isset($assigned[$id]) || !in_array($date, $days, true)) {
                continue;
            }
            $task = $byId[$id];
            if (!$this->dayAllowed($task, $date, $days) || !$this->mayGo($task, $date, $person, $options, true)) {
                continue;
            }
            $assigned[$id] = ['date' => $date, 'person' => $person, 'reasons' => ['ai'], 'note' => mb_substr(trim((string) ($line['note'] ?? '')), 0, 240), 'source' => 'ai'];
            $this->free[$date][$person] -= (int) $task['minutes'];
            if (WorkWindow::isClock($line['start_time'] ?? null)) {
                $aiStarts[$date][] = ['task_id' => $id, 'person' => $person, 'start_time' => $line['start_time'], 'note' => $assigned[$id]['note']];
            }
        }

        $unplaced = [];
        $rest = array_values(array_filter($flexible, fn ($t) => !isset($assigned[(int) $t['id']])));
        usort($rest, fn ($a, $b) => [($a['from'] === 'overdue') ? 0 : 1, $a['priority_rank'], $this->due($a, $days) ?? '9999-12-31', -$a['minutes'], $a['id']]
            <=> [($b['from'] === 'overdue') ? 0 : 1, $b['priority_rank'], $this->due($b, $days) ?? '9999-12-31', -$b['minutes'], $b['id']]);
        foreach ($rest as $task) {
            $choice = $this->choose($task, $days, $options, $experience, true) ?? $this->choose($task, $days, $options, $experience, false);
            if ($choice === null) {
                $unplaced[] = ['task_id' => (int) $task['id'], 'title' => $task['title'], 'reason' => $task['owner'] !== null ? 'no_room' : 'no_one', 'date' => null];
                continue;
            }
            [$date, $person, $reasons] = $choice;
            $assigned[(int) $task['id']] = ['date' => $date, 'person' => $person, 'reasons' => $reasons, 'note' => '', 'source' => 'rules'];
            $this->free[$date][$person] -= (int) $task['minutes'];
        }

        // Each day's times: its own untimed work and what was given to it, through the day planner.
        $out = [];
        foreach ($days as $d) {
            $mine = array_values(array_filter($fixed, fn ($t) => ($t['task_date'] ?? null) === $d));
            foreach ($flexible as $t) {
                $a = $assigned[(int) $t['id']] ?? null;
                if ($a !== null && $a['date'] === $d) {
                    // The day planner keeps a task with its owner: the week's choice is given as the owner here.
                    $mine[] = array_merge($t, ['owner' => $a['person'], 'week' => $a + ['owner_before' => $t['owner']]]);
                }
            }
            if ($mine === []) {
                $out[] = ['date' => $d, 'proposals' => [], 'people' => $this->dayPeople($d)];
                continue;
            }
            $result = $this->dayPlanner->merge($this->boards[$d], $mine, $aiStarts[$d] ?? [], $experience, ['scope' => $scope, 'assign_others' => $options['assign_others']]);
            $weekOf = [];
            foreach ($mine as $t) {
                if (isset($t['week'])) {
                    $weekOf[(int) $t['id']] = $t['week'];
                }
            }
            $proposals = array_map(function (array $p) use ($weekOf, $d) {
                $w = $weekOf[$p['task_id']] ?? null;
                if ($w !== null) {
                    // Not "keeps its owner": the week chose this person; the line says why, and what the task had before.
                    $p['reasons'] = array_values(array_unique(array_merge($w['reasons'], array_diff($p['reasons'], ['keeps_owner', 'ai', 'most_free']))));
                    $p['source'] = $w['source'];
                    $p['note'] = $w['note'] !== '' ? $w['note'] : $p['note'];
                    $p['previous']['person'] = $w['owner_before'];
                }

                return $p + ['date' => $d];
            }, $result['proposals']);
            foreach ($result['unplaced'] as $u) {
                $unplaced[] = $u + ['date' => $d];
            }
            $out[] = ['date' => $d, 'proposals' => $proposals, 'people' => $this->dayPeople($d)];
        }

        return [
            'from'     => $days[0],
            'to'       => $days[count($days) - 1],
            'days'     => $out,
            'unplaced' => $unplaced,
            'tasks'    => array_merge($fixed, $flexible),
        ];
    }

    /** The facts the AI plans a week from. @return array<string, mixed> */
    public function facts(int $orgId, array $days, string $today, array $scope, array $options, array $experience, Knowledge $knowledge): array
    {
        $this->boards = [];
        $this->free = [];
        foreach ($days as $d) {
            $this->boards[$d] = $this->dayBoard->build($orgId, $d, $scope);
            foreach ($this->boards[$d]['people'] as $p) {
                $this->free[$d][$p['key']] = $p['works'] && $p['has_account'] ? max(0, (int) $p['capacity_minutes'] - (int) $p['planned_minutes']) : 0;
            }
        }
        [$fixed, $flexible] = $this->candidates($orgId, $days, $today, $scope, $options);

        return [
            'business'      => $knowledge->forAi() ?: null,
            'days'          => array_map(fn ($d) => [
                'date'    => $d,
                'weekday' => CarbonImmutable::createFromFormat('!Y-m-d', $d, 'UTC')->englishDayOfWeek,
                'people'  => array_map(fn ($p) => ['person' => $p['key'], 'works' => $p['works'], 'hours' => $p['window']['start'] . '-' . $p['window']['end'],
                    'free_minutes' => $this->free[$d][$p['key']] ?? 0, 'planned_minutes' => $p['planned_minutes']], $this->boards[$d]['people']),
            ], $days),
            'assign_others' => $options['assign_others'],
            'people'        => array_values(array_filter(array_map(fn ($k) => ($p = $this->team->find($k)) ? AiFacts::person($p, $experience[$k] ?? null) : null, $scope))),
            'already_on_days' => array_map(fn ($t) => AiFacts::task($t), $fixed),
            'to_place'      => array_map(fn ($t) => AiFacts::task($t) + ['due_by' => $this->due($t, $days)], $flexible),
        ];
    }

    /**
     * The work to place: the days' own untimed tasks (fixed to their day) and the work without a day (flexible).
     *
     * @return array{0: list<array<string, mixed>>, 1: list<array<string, mixed>>}
     */
    private function candidates(int $orgId, array $days, string $today, array $scope, array $options): array
    {
        $fixed = [];
        foreach ($days as $d) {
            foreach ($this->boards[$d]['people'] as $p) {
                foreach ($p['tasks'] as $t) {
                    if (!$t['done'] && !$t['running'] && $t['start_time'] === null) {
                        $fixed[] = $t + ['from' => 'day'];
                    }
                }
            }
            if ($options['assign_others']) {
                foreach ($this->boards[$d]['unassigned'] as $t) {
                    if (!$t['done'] && $t['start_time'] === null) {
                        $fixed[] = $t + ['from' => 'unassigned'];
                    }
                }
            }
        }

        $flexible = [];
        $open = fn ($q) => $q->where('completed', false)->where(fn ($s) => $s->whereNull('status')->orWhere('status', '!=', 'done'));
        if ($options['include_backlog'] ?? false) {
            foreach (PlannerTask::query()->with('subtasks')->whereNull('task_date')->where($open)->orderBy('created_at')->limit(300)->get() as $t) {
                $owner = $this->team->ownerKey($t);
                if ($owner !== null && in_array($owner, $scope, true)) {
                    $flexible[] = TaskView::of($t, $owner, $today) + ['from' => 'backlog'];
                }
            }
        }
        if ($options['include_pool'] ?? false) {
            $people = array_values(array_filter(array_map(fn ($k) => $this->team->find($k), $scope), fn ($p) => $p && $p['has_account']));
            $pool = PlannerTask::query()->with('subtasks')->whereNull('task_date')->whereNull('assigned_to_user_id')
                ->where(fn ($q) => $q->whereNull('employee_name')->orWhere('employee_name', ''))->where($open)
                ->orderByDesc('created_at')->limit(300)->get()
                ->filter(fn (PlannerTask $t) => collect($people)->contains(fn ($p) => Team::mayTake($p, $t->task_group)));
            foreach ($pool as $t) {
                $flexible[] = TaskView::of($t, null, $today) + ['from' => 'pool'];
            }
        }
        if ($options['include_overdue'] ?? false) {
            $since = CarbonImmutable::createFromFormat('!Y-m-d', $today, 'UTC')->subDays(DayBoard::OVERDUE_DAYS)->toDateString();
            $late = PlannerTask::query()->with('subtasks')->whereDate('task_date', '<', $today)->whereDate('task_date', '>=', $since)
                ->where($open)->orderBy('task_date')->limit(300)->get();
            foreach ($late as $t) {
                $owner = $this->team->ownerKey($t);
                if (($owner !== null && in_array($owner, $scope, true)) || ($owner === null && $options['assign_others'])) {
                    $flexible[] = TaskView::of($t, $owner, $today) + ['from' => 'overdue'];
                }
            }
        }

        $seen = [];
        $keep = function (array $list) use (&$seen): array {
            $out = [];
            foreach ($list as $t) {
                if (!isset($seen[$t['id']])) {
                    $seen[$t['id']] = true;
                    $out[] = $t;
                }
            }

            return $out;
        };
        $fixed = $keep($fixed);
        $flexible = array_slice($keep($flexible), 0, max(0, self::MAX_TASKS - count($fixed)));

        return [$this->learning->sized($orgId, $fixed), $this->learning->sized($orgId, $flexible)];
    }

    /** The last day a task may go to within the plan: its pool due day, else none. Overdue work: the first day. */
    private function due(array $task, array $days): ?string
    {
        if (($task['from'] ?? '') === 'overdue') {
            return $days[0];
        }
        $due = $task['pool_due_date'] ?? null;
        if (!is_string($due) || $due === '') {
            return null;
        }

        return $due < $days[0] ? $days[0] : $due;
    }

    private function dayAllowed(array $task, string $date, array $days): bool
    {
        $due = $this->due($task, $days);

        return $due === null || $date <= $due || $due === $days[0];
    }

    /** Whether this person may take this task on this day: in scope, an account, working, its type, and (when asked) the room. */
    private function mayGo(array $task, string $date, string $person, array $options, bool $needRoom): bool
    {
        $lane = collect($this->boards[$date]['people'] ?? [])->firstWhere('key', $person);
        if ($lane === null || !$lane['works'] || !$lane['has_account']) {
            return false;
        }
        if ($task['owner'] !== null && $task['owner'] !== $person && !$options['assign_others']) {
            return false;
        }
        $found = $this->team->find($person);
        if ($task['owner'] !== $person && ($found === null || !Team::mayTake($found, $task['task_group'] ?? null))) {
            return false;
        }

        return !$needRoom || ($this->free[$date][$person] ?? 0) >= (int) $task['minutes'];
    }

    /**
     * The rules' day and person: work due by a day, overdue or high priority takes the earliest day with someone
     * suitable; other work the best fit with the most room across the week. With $withinRoom false, the least
     * overloaded choice (said as over capacity).
     *
     * @return array{0: string, 1: string, 2: list<string>}|null
     */
    private function choose(array $task, array $days, array $options, array $experience, bool $withinRoom): ?array
    {
        $due = $this->due($task, $days);
        $urgent = $due !== null || $task['priority_rank'] === 0;
        $owner = $task['owner'];
        $best = null;
        foreach ($days as $d) {
            if ($due !== null && $d > $due) {
                break;
            }
            // Work someone already has stays theirs (their backlog, their overdue work); only nobody's is shared out.
            $people = $owner !== null ? [$owner] : array_keys($this->free[$d] ?? []);
            $hasNonManager = collect($people)->contains(fn ($k) => ($p = $this->team->find($k)) && !$p['manager'] && $this->mayGo($task, $d, $k, $options, $withinRoom));
            foreach ($people as $key) {
                if (!$this->mayGo($task, $d, $key, $options, $withinRoom)) {
                    continue;
                }
                $p = $this->team->find($key);
                $reasons = [];
                $score = min(480, max(-480, $this->free[$d][$key] ?? 0)) / 8;
                if ($owner !== null && $key === $owner) {
                    $reasons[] = 'their_own';
                    $score += 200;
                }
                if ($task['task_group'] && in_array($task['task_group'], $p['prefers']['groups'] ?? [], true)) {
                    $reasons[] = 'prefers';
                    $score += 60;
                }
                if ($task['task_category'] && in_array($task['task_category'], $p['prefers']['tasks'] ?? [], true)) {
                    $reasons[] = 'prefers';
                    $score += 40;
                }
                $seen = $experience[$key]['groups'][$task['task_group'] ?: '—'] ?? null;
                if ($seen && $seen['done'] > 0 && $task['task_group']) {
                    $reasons[] = 'experience';
                    $score += min(60, $seen['done'] * 6) + ($seen['done'] >= 3 ? 30 * $seen['on_time'] / $seen['done'] : 0);
                }
                if ($p['manager'] && $hasNonManager) {
                    $score -= 40;
                }
                if (!$withinRoom) {
                    $reasons[] = 'over_capacity';
                }
                $reasons[] = $urgent ? 'earliest_day' : 'most_room';
                if ($best === null || $score > $best[3]) {
                    $best = [$d, $key, array_values(array_unique($reasons)), $score];
                }
            }
            // Urgent work takes the first day anyone suitable can do it.
            if ($urgent && $best !== null) {
                break;
            }
        }

        return $best === null ? null : [$best[0], $best[1], $best[2]];
    }

    /** @return list<array{person: string, name: string, works: bool, capacity_minutes: int, free_minutes: int}> */
    private function dayPeople(string $date): array
    {
        return array_map(fn ($p) => [
            'person' => $p['key'], 'name' => $p['name'], 'works' => $p['works'], 'capacity_minutes' => $p['capacity_minutes'],
            // Before this plan: the page adds the plan's lines itself, for the lines a person keeps.
            'free_minutes' => $this->freeBefore[$date][$p['key']] ?? 0,
        ], $this->boards[$date]['people']);
    }
}
