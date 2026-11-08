<?php

namespace App\Services\Time;

/**
 * Fits work into a day (HexaTech Time Planner, 2026-11-09): who does each task and when. A proposal only — nothing is
 * written until a person applies it (PlanApplier).
 *
 * The rules (plan()):
 * - Tasks go in order: high priority first, then the oldest due, then the longest, then the oldest row.
 * - A task that already has an owner stays theirs; a task nobody owns goes to the person it suits best among those in
 *   scope who have an account, work that day and may take its type (Team::mayTake) — a name without an account (an
 *   outside cleaner) keeps what a person gives them, and is never handed work by a plan: the task types and tasks they are marked for
 *   (`planner_employee_prefs`), what they have finished of that type (Experience), how much of their day is still free,
 *   and not a manager while someone else can. Someone with room within their capacity is chosen before anyone without.
 * - Each task takes the earliest gap in its person's hours that holds it, after what is already timed that day, after
 *   their break (kept around midday) and, today, after now. Starts fall on five-minute marks.
 *
 * merge() takes an AI's proposals first, each checked against the same facts — a task in scope, a person in scope who
 * may take it, a start inside their hours, after now and clear of everything else — and moved to the person's next
 * free gap, or handed to the rules, when it is not; the rules then place whatever the AI left out.
 */
final class DayPlanner
{
    private const STEP = 5;

    /** @var array<string, list<array{0: int, 1: int}>> busy ranges per person, minutes from midnight */
    private array $busy = [];

    /** @var array<string, int> minutes planned per person */
    private array $load = [];

    /** @var array<string, int> high-priority tasks per person */
    private array $high = [];

    /** @var array<string, array<string, mixed>> */
    private array $people = [];

    /** @var array<string, array{start: int, end: int, capacity: int, works: bool}> */
    private array $windows = [];

    private int $cutoff = 0;

    /**
     * @param  array<string, mixed>  $board  DayBoard::build()
     * @param  list<array<string, mixed>>  $candidates  TaskView rows to place, each with `from` (day|unassigned|pool|overdue)
     * @param  array<string, mixed>  $experience  Experience::byPerson()
     * @param  array{scope: list<string>, assign_others: bool}  $options
     * @return array{proposals: list<array<string, mixed>>, unplaced: list<array{task_id: int, title: string, reason: string}>}
     */
    public function plan(array $board, array $candidates, array $experience, array $options): array
    {
        return $this->merge($board, $candidates, [], $experience, $options);
    }

    /**
     * @param  list<array<string, mixed>>  $ai  [{task_id, person?, start_time, duration_minutes?, note?}]
     * @return array{proposals: list<array<string, mixed>>, unplaced: list<array{task_id: int, title: string, reason: string}>}
     */
    public function merge(array $board, array $candidates, array $ai, array $experience, array $options): array
    {
        $this->prepare($board, $candidates, $options);
        $byId = [];
        foreach ($candidates as $c) {
            $byId[(int) $c['id']] = $c;
        }

        $proposals = [];
        $done = [];
        foreach ($ai as $p) {
            $id = (int) ($p['task_id'] ?? 0);
            if (!isset($byId[$id]) || isset($done[$id])) {
                continue;
            }
            $task = $byId[$id];
            $person = $this->checkedPerson($task, $p['person'] ?? null, $options);
            if ($person === null) {
                continue;
            }
            $minutes = max(5, min(720, (int) ($p['duration_minutes'] ?? 0) ?: $task['minutes']));
            $wanted = WorkWindow::isClock($p['start_time'] ?? null) ? WorkWindow::toMinutes($p['start_time']) : null;
            $start = $wanted === null ? null : $this->fit($person, $minutes, $wanted);
            if ($start === null) {
                continue;
            }
            $proposals[] = $this->take($task, $person, $start, $minutes, ['ai'], 'ai', trim(mb_substr((string) ($p['note'] ?? ''), 0, 240)), $experience);
            $done[$id] = true;
        }

        $rest = array_values(array_filter($candidates, fn ($c) => !isset($done[(int) $c['id']])));
        usort($rest, fn ($a, $b) => [$a['priority_rank'], $a['task_date'] ?? '9999-12-31', -$a['minutes'], $a['id']]
            <=> [$b['priority_rank'], $b['task_date'] ?? '9999-12-31', -$b['minutes'], $b['id']]);

        $unplaced = [];
        foreach ($rest as $task) {
            $owner = $task['owner'] && isset($this->people[$task['owner']]) ? $task['owner'] : null;
            if ($owner !== null) {
                if (!$this->windows[$owner]['works']) {
                    $unplaced[] = ['task_id' => (int) $task['id'], 'title' => $task['title'], 'reason' => 'not_working'];
                    continue;
                }
                $start = $this->fit($owner, $task['minutes'], null);
                if ($start === null) {
                    $unplaced[] = ['task_id' => (int) $task['id'], 'title' => $task['title'], 'reason' => 'no_room'];
                    continue;
                }
                $reasons = ['keeps_owner'];
                if ($this->load[$owner] + $task['minutes'] > $this->windows[$owner]['capacity']) {
                    $reasons[] = 'over_capacity';
                }
                $proposals[] = $this->take($task, $owner, $start, $task['minutes'], $reasons, 'rules', '', $experience);
                continue;
            }
            if ($task['owner'] !== null && !$options['assign_others']) {
                $unplaced[] = ['task_id' => (int) $task['id'], 'title' => $task['title'], 'reason' => 'not_yours'];
                continue;
            }

            $choice = $this->choose($task, $experience, true) ?? $this->choose($task, $experience, false);
            if ($choice === null) {
                $unplaced[] = ['task_id' => (int) $task['id'], 'title' => $task['title'], 'reason' => 'no_one'];
                continue;
            }
            [$key, $start, $reasons] = $choice;
            $proposals[] = $this->take($task, $key, $start, $task['minutes'], $reasons, 'rules', '', $experience);
        }

        usort($proposals, fn ($a, $b) => [$a['person'], $a['start_time']] <=> [$b['person'], $b['start_time']]);

        return ['proposals' => $proposals, 'unplaced' => $unplaced];
    }

    /** @param array{scope: list<string>, assign_others: bool} $options */
    private function prepare(array $board, array $candidates, array $options): void
    {
        $this->busy = $this->load = $this->high = $this->people = $this->windows = [];
        $placing = array_flip(array_map(fn ($c) => (int) $c['id'], $candidates));
        $now = $board['now'] !== null ? WorkWindow::toMinutes($board['now']) : 0;
        $this->cutoff = (int) (ceil($now / 15) * 15);

        foreach ($board['people'] as $p) {
            if (!in_array($p['key'], $options['scope'], true)) {
                continue;
            }
            $this->people[$p['key']] = $p;
            $this->windows[$p['key']] = [
                'start'    => WorkWindow::toMinutes($p['window']['start']),
                'end'      => WorkWindow::toMinutes($p['window']['end']),
                'capacity' => (int) $p['capacity_minutes'],
                'works'    => (bool) $p['works'],
            ];
            $busy = [];
            $load = 0;
            $high = 0;
            foreach ($p['tasks'] as $t) {
                if (isset($placing[(int) $t['id']])) {
                    continue;
                }
                $load += $t['minutes'];
                if (!$t['done'] && $t['priority_rank'] === 0) {
                    $high++;
                }
                if ($t['start_time'] !== null) {
                    $s = WorkWindow::toMinutes($t['start_time']);
                    $busy[] = [$s, $s + $t['minutes']];
                }
            }
            $break = (int) $p['break_minutes'];
            if ($break > 0) {
                $w = $this->windows[$p['key']];
                $noon = 12 * 60;
                $at = ($noon >= $w['start'] && $noon + $break <= $w['end'])
                    ? $noon
                    : (int) (round((($w['start'] + $w['end']) / 2) / 30) * 30);
                $busy[] = [$at, $at + $break];
            }
            usort($busy, fn ($a, $b) => $a[0] <=> $b[0]);
            $this->busy[$p['key']] = $busy;
            $this->load[$p['key']] = $load;
            $this->high[$p['key']] = $high;
        }
    }

    /** The person an AI named for a task, when the facts allow it; else the task's owner, else null (the rules decide). */
    private function checkedPerson(array $task, mixed $named, array $options): ?string
    {
        $owner = $task['owner'] && isset($this->people[$task['owner']]) ? $task['owner'] : null;
        $named = is_string($named) && isset($this->people[$named]) ? $named : null;
        if ($owner !== null && ($named === null || $named === $owner || !$options['assign_others'])) {
            return $this->windows[$owner]['works'] ? $owner : null;
        }
        if ($owner === null && $task['owner'] !== null && !$options['assign_others']) {
            return null;
        }
        if ($named === null || !$this->windows[$named]['works'] || !$this->people[$named]['has_account'] || !Team::mayTake($this->people[$named], $task['task_group'])) {
            return null;
        }

        return $named;
    }

    /** @return array{0: string, 1: int, 2: list<string>}|null */
    private function choose(array $task, array $experience, bool $withinCapacity): ?array
    {
        $best = null;
        $hasNonManager = false;
        foreach ($this->people as $key => $p) {
            if ($this->windows[$key]['works'] && $p['has_account'] && !$p['manager'] && Team::mayTake($p, $task['task_group'])) {
                $hasNonManager = true;
            }
        }
        foreach ($this->people as $key => $p) {
            $w = $this->windows[$key];
            if (!$w['works'] || !$p['has_account'] || !Team::mayTake($p, $task['task_group'])) {
                continue;
            }
            $free = $w['capacity'] - $this->load[$key];
            if ($withinCapacity && $free < $task['minutes']) {
                continue;
            }
            $start = $this->fit($key, $task['minutes'], null);
            if ($start === null) {
                continue;
            }
            $reasons = [];
            $score = min(240, max(-240, $free)) / 4;
            if (is_array($p['skills']) && $task['task_group'] && in_array($task['task_group'], $p['skills'], true)) {
                $reasons[] = 'skill';
                $score += 20;
            }
            if ($task['task_group'] && in_array($task['task_group'], $p['prefers']['groups'] ?? [], true)) {
                $reasons[] = 'prefers';
                $score += 60;
            }
            if ($task['task_category'] && in_array($task['task_category'], $p['prefers']['tasks'] ?? [], true)) {
                if (!in_array('prefers', $reasons, true)) {
                    $reasons[] = 'prefers';
                }
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
            $score -= ($this->high[$key] ?? 0) * ($task['priority_rank'] === 0 ? 20 : 5);
            if (!$withinCapacity) {
                $reasons[] = 'over_capacity';
            }
            if ($best === null || $score > $best[3] || ($score === $best[3] && strcmp($key, $best[0]) < 0)) {
                $best = [$key, $start, $reasons, $score];
            }
        }
        if ($best === null) {
            return null;
        }
        $best[2][] = 'most_free';

        return [$best[0], $best[1], array_values(array_unique($best[2]))];
    }

    /** The earliest start, at or after $from (else the day's start), where $minutes fit in the person's free time. */
    private function fit(string $key, int $minutes, ?int $from): ?int
    {
        $w = $this->windows[$key];
        $cursor = max($w['start'], $this->cutoff, $from ?? 0);
        $cursor = (int) (ceil($cursor / self::STEP) * self::STEP);
        foreach ($this->busy[$key] as [$s, $e]) {
            if ($cursor + $minutes <= $s) {
                break;
            }
            if ($e > $cursor) {
                $cursor = (int) (ceil($e / self::STEP) * self::STEP);
            }
        }

        return $cursor + $minutes <= $w['end'] ? $cursor : null;
    }

    /** @return array<string, mixed> */
    private function take(array $task, string $key, int $start, int $minutes, array $reasons, string $source, string $note, array $experience): array
    {
        $this->busy[$key][] = [$start, $start + $minutes];
        usort($this->busy[$key], fn ($a, $b) => $a[0] <=> $b[0]);
        $this->load[$key] += $minutes;
        if ($task['priority_rank'] === 0) {
            $this->high[$key] = ($this->high[$key] ?? 0) + 1;
        }
        $person = $this->people[$key];
        if (($task['from'] ?? 'day') === 'pool') {
            $reasons[] = 'from_pool';
        } elseif (($task['from'] ?? 'day') === 'overdue') {
            $reasons[] = 'from_overdue';
        }
        if ($task['priority_rank'] === 0) {
            $reasons[] = 'priority';
        }

        return [
            'task_id'          => (int) $task['id'],
            'title'            => $task['title'],
            'task_group'       => $task['task_group'],
            'priority'         => $task['priority'],
            'person'           => $key,
            'user_id'          => $person['user_id'],
            'employee_name'    => $person['name'],
            'start_time'       => WorkWindow::toClock($start),
            'end_time'         => WorkWindow::toClock($start + $minutes),
            'duration_minutes' => $minutes,
            'reasons'          => array_values(array_unique($reasons)),
            'note'             => $note,
            'source'           => $source,
            'from'             => $task['from'] ?? 'day',
            'previous'         => ['date' => $task['task_date'], 'start_time' => $task['start_time'], 'person' => $task['owner']],
            'seen'             => $task['updated_at'],
        ];
    }
}
