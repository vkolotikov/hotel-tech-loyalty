<?php

namespace App\Services\Time;

use App\Models\PlannerTask;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;

/**
 * What the planner learns from the weeks behind it (HexaTech Time Planner, 2026-11-14, the AI assistant: "analyze the
 * data from the previous weeks and suggest how long each task could be and who do better and the worst"). Read-only
 * figures, the server's alone — the workspace and the AI only word them:
 *
 * - durations(): per task type and per task, how long the work was planned for and how long it really took (the
 *   clocked time, `actual_minutes`, where someone timed it), the suggested length (the real median with at least
 *   MIN_SAMPLES clocked, else the planned one, on five-minute marks), how far reality drifts from the plan, and the
 *   manager's own typical length (Knowledge) beside it;
 * - people(): per person, how much they finished, on time, how close their real time is to the plan, and per task type
 *   how they compare with the team (on time, and speed — the team's median real time over theirs, so above 1 is faster);
 *   `strengths` and `support` name the types where they stand out either way, with at least MIN_SAMPLES behind it.
 *   Comparing people is a manager's (the controllers answer a staff member only their own row).
 *
 * size() gives a task without a length of its own the length to plan with: the manager's typical one, else the learned
 * one, else TaskView::DEFAULT_MINUTES.
 */
final class Learning
{
    public const WEEKS = 8;

    public const MAX_WEEKS = 26;

    public const MIN_SAMPLES = 3;

    /** @var array<string, array<string, mixed>> per organisation and weeks */
    private array $memo = [];

    public function __construct(private readonly Team $team, private readonly Knowledge $knowledge, private readonly PlannerCatalogue $catalogue)
    {
    }

    /**
     * Everything at once (one read of the tasks).
     *
     * @return array{from: string, to: string, weeks: int, totals: array<string, mixed>, types: list<array<string, mixed>>, tasks: list<array<string, mixed>>, people: list<array<string, mixed>>, leaders: list<array<string, mixed>>}
     */
    public function for(int $orgId, int $weeks = self::WEEKS): array
    {
        $weeks = max(1, min(self::MAX_WEEKS, $weeks));
        $memoKey = $orgId . ':' . $weeks;
        if (isset($this->memo[$memoKey])) {
            return $this->memo[$memoKey];
        }

        $zone = VenueClock::zone($orgId);
        $today = VenueClock::today($orgId);
        $from = CarbonImmutable::createFromFormat('!Y-m-d', $today, 'UTC')->subDays($weeks * 7)->toDateString();
        $facts = PlannerTask::query()
            ->whereDate('task_date', '>=', $from)->whereDate('task_date', '<=', $today)
            ->limit(20000)
            ->get(['id', 'task_date', 'task_group', 'task_category', 'title', 'duration_minutes', 'start_time', 'end_time',
                'actual_minutes', 'completed_at', 'assigned_to_user_id', 'employee_name', 'completed', 'status'])
            ->map(function (PlannerTask $t) use ($zone, $today) {
                $done = TaskView::isDone($t);
                $date = TaskView::date($t);

                return [
                    'owner'    => $this->team->ownerKey($t),
                    'group'    => $t->task_group ?: null,
                    'category' => $t->task_category ?: null,
                    'done'     => $done,
                    'on_time'  => $done && $t->completed_at && $date !== null
                        && $t->completed_at->copy()->setTimezone($zone)->toDateString() <= $date,
                    'late'     => !$done && $date !== null && $date < $today,
                    'planned'  => TaskView::minutes($t),
                    'real'     => $done && $t->actual_minutes !== null && (int) $t->actual_minutes > 0 ? (int) $t->actual_minutes : null,
                ];
            })->all();

        $done = array_values(array_filter($facts, fn ($f) => $f['done']));
        $types = $this->durationRows($done, 'group', fn (string $name) => $name);
        $labels = collect($this->catalogue->channels())->pluck('label', 'key')->all();
        $tasks = $this->durationRows($done, 'category', fn (string $key) => $labels[$key] ?? $key);
        [$people, $leaders] = $this->peopleRows($facts);

        $clocked = array_filter($done, fn ($f) => $f['real'] !== null);
        $plannedOfClocked = array_sum(array_column($clocked, 'planned'));

        return $this->memo[$memoKey] = [
            'from'    => $from,
            'to'      => $today,
            'weeks'   => $weeks,
            'totals'  => [
                'tasks'        => count($facts),
                'done'         => count($done),
                'on_time_pct'  => self::pct(count(array_filter($done, fn ($f) => $f['on_time'])), count($done)),
                'late_open'    => count(array_filter($facts, fn ($f) => $f['late'])),
                'clocked'      => count($clocked),
                'clocked_pct'  => self::pct(count($clocked), count($done)),
                // Real time over planned time, for the tasks someone timed: 120 means the work took a fifth longer.
                'accuracy_pct' => $plannedOfClocked > 0 ? (int) round(array_sum(array_column($clocked, 'real')) / $plannedOfClocked * 100) : null,
            ],
            'types'   => $types,
            'tasks'   => $tasks,
            'people'  => $people,
            'leaders' => $leaders,
        ];
    }

    /**
     * The length to plan a task with when it has none of its own: the manager's typical one (`typical`), else the learned
     * one for its task, else its type (`learned`), else the default (`default`).
     *
     * @return array{minutes: int, basis: string}
     */
    public function size(int $orgId, ?string $group, ?string $category): array
    {
        $typical = $this->knowledge->typical($group, $category);
        if ($typical !== null) {
            return ['minutes' => $typical, 'basis' => 'typical'];
        }
        $all = $this->for($orgId);
        foreach ([['tasks', $category], ['types', $group]] as [$list, $key]) {
            if ($key === null || $key === '') {
                continue;
            }
            foreach ($all[$list] as $row) {
                if ($row['key'] === $key && $row['samples'] >= self::MIN_SAMPLES && $row['suggested'] !== null) {
                    return ['minutes' => $row['suggested'], 'basis' => 'learned'];
                }
            }
        }

        return ['minutes' => TaskView::DEFAULT_MINUTES, 'basis' => 'default'];
    }

    /**
     * Candidates (TaskView rows) with a length to plan with: a task's own length stays (`sized: own`); one without gets
     * size()'s, and says where it came from.
     *
     * @param  list<array<string, mixed>>  $candidates
     * @return list<array<string, mixed>>
     */
    public function sized(int $orgId, array $candidates): array
    {
        return array_map(function (array $t) use ($orgId) {
            $own = (int) ($t['duration_minutes'] ?? 0) > 0 || ($t['start_time'] ?? null) !== null;
            if ($own) {
                return $t + ['sized' => 'own'];
            }
            $size = $this->size($orgId, $t['task_group'] ?? null, $t['task_category'] ?? null);

            return array_merge($t, ['minutes' => $size['minutes'], 'sized' => $size['basis']]);
        }, $candidates);
    }

    /**
     * @param  list<array<string, mixed>>  $done
     * @return list<array<string, mixed>>
     */
    private function durationRows(array $done, string $field, callable $label): array
    {
        $by = [];
        foreach ($done as $f) {
            if ($f[$field] !== null) {
                $by[$f[$field]][] = $f;
            }
        }
        $notes = $field === 'group' ? $this->knowledge->typeNotes() : $this->knowledge->taskNotes();
        $rows = [];
        foreach ($by as $key => $list) {
            $planned = self::median(array_column($list, 'planned'));
            $realList = array_values(array_filter(array_column($list, 'real'), fn ($m) => $m !== null));
            $real = count($realList) >= self::MIN_SAMPLES ? self::median($realList) : null;
            $suggested = $real ?? $planned;
            $drift = $real !== null && $planned ? (int) round($real / $planned * 100) : null;
            $typical = $notes[$key]['typical_minutes'] ?? null;
            $rows[] = [
                'key'            => (string) $key,
                'name'           => (string) $label((string) $key),
                'samples'        => count($list),
                'clocked'        => count($realList),
                'planned_median' => $planned,
                'real_median'    => $real,
                'suggested'      => $suggested === null ? null : max(5, (int) (round($suggested / 5) * 5)),
                'drift_pct'      => $drift,
                'typical'        => $typical,
                // What the figures say to do: plan it longer, shorter, or write the length down at last.
                'advice'         => match (true) {
                    count($list) < self::MIN_SAMPLES            => 'few',
                    $drift !== null && $drift >= 120           => 'longer',
                    $drift !== null && $drift <= 80            => 'shorter',
                    $typical === null                          => 'set_typical',
                    default                                    => 'ok',
                },
            ];
        }
        usort($rows, fn ($a, $b) => [$b['samples'], $a['name']] <=> [$a['samples'], $b['name']]);

        return array_slice($rows, 0, 60);
    }

    /**
     * @param  list<array<string, mixed>>  $facts
     * @return array{0: list<array<string, mixed>>, 1: list<array<string, mixed>>}
     */
    private function peopleRows(array $facts): array
    {
        // The team per type: on time and real minutes, the yardsticks a person is read against.
        $team = [];
        foreach ($facts as $f) {
            if ($f['done'] && $f['group'] !== null) {
                $team[$f['group']]['done'] = ($team[$f['group']]['done'] ?? 0) + 1;
                $team[$f['group']]['on_time'] = ($team[$f['group']]['on_time'] ?? 0) + ($f['on_time'] ? 1 : 0);
                if ($f['real'] !== null) {
                    $team[$f['group']]['real'][] = $f['real'];
                }
            }
        }
        $teamPct = fn (string $g) => self::pct($team[$g]['on_time'] ?? 0, $team[$g]['done'] ?? 0);
        $teamReal = fn (string $g) => count($team[$g]['real'] ?? []) >= self::MIN_SAMPLES ? self::median($team[$g]['real']) : null;

        $byPerson = [];
        foreach ($facts as $f) {
            if ($f['owner'] !== null) {
                $byPerson[$f['owner']][] = $f;
            }
        }

        $rows = [];
        $perType = [];
        foreach ($this->team->people() as $p) {
            $list = $byPerson[$p['key']] ?? [];
            if ($list === []) {
                continue;
            }
            $done = array_values(array_filter($list, fn ($f) => $f['done']));
            $clocked = array_values(array_filter($done, fn ($f) => $f['real'] !== null));
            $plannedClocked = array_sum(array_column($clocked, 'planned'));
            $dueByNow = array_filter($list, fn ($f) => $f['done'] || $f['late']);

            $types = [];
            $groups = [];
            foreach ($done as $f) {
                if ($f['group'] !== null) {
                    $groups[$f['group']][] = $f;
                }
            }
            foreach ($groups as $g => $gl) {
                $real = array_values(array_filter(array_column($gl, 'real'), fn ($m) => $m !== null));
                $mine = count($real) >= self::MIN_SAMPLES ? self::median($real) : null;
                $theirs = $teamReal((string) $g);
                $speed = $mine && $theirs ? round($theirs / $mine, 2) : null;
                $onTime = self::pct(count(array_filter($gl, fn ($f) => $f['on_time'])), count($gl));
                $row = ['type' => (string) $g, 'done' => count($gl), 'on_time_pct' => $onTime, 'team_on_time_pct' => $teamPct((string) $g),
                    'median_minutes' => $mine, 'team_median_minutes' => $theirs, 'speed' => $speed];
                $types[] = $row;
                if (count($gl) >= self::MIN_SAMPLES) {
                    $perType[(string) $g][] = ['person' => $p['key'], 'name' => $p['name']] + $row;
                }
            }
            usort($types, fn ($a, $b) => $b['done'] <=> $a['done']);

            $stands = fn (array $t, bool $up) => $t['done'] >= self::MIN_SAMPLES && (
                $up ? (($t['on_time_pct'] ?? 0) >= ($t['team_on_time_pct'] ?? 100) + 10 || ($t['speed'] !== null && $t['speed'] >= 1.15))
                    : (($t['on_time_pct'] ?? 100) <= ($t['team_on_time_pct'] ?? 0) - 15 || ($t['speed'] !== null && $t['speed'] <= 0.85)));

            $rows[] = [
                'person'         => $p['key'],
                'name'           => $p['name'],
                'has_account'    => $p['has_account'],
                'tasks'          => count($list),
                'done'           => count($done),
                'on_time_pct'    => self::pct(count(array_filter($done, fn ($f) => $f['on_time'])), count($done)),
                'completion_pct' => self::pct(count($done), count($dueByNow)),
                'late_open'      => count(array_filter($list, fn ($f) => $f['late'])),
                'clocked'        => count($clocked),
                'accuracy_pct'   => $plannedClocked > 0 ? (int) round(array_sum(array_column($clocked, 'real')) / $plannedClocked * 100) : null,
                'types'          => array_slice($types, 0, 12),
                'strengths'      => array_values(array_map(fn ($t) => $t['type'], array_filter($types, fn ($t) => $stands($t, true)))),
                'support'        => array_values(array_map(fn ($t) => $t['type'], array_filter($types, fn ($t) => $stands($t, false)))),
            ];
        }
        usort($rows, fn ($a, $b) => [$b['done'], $a['name']] <=> [$a['done'], $b['name']]);

        // Per type, with two or more people to compare: who does it best (on time, then speed) and who least.
        $leaders = [];
        foreach ($perType as $type => $list) {
            if (count($list) < 2) {
                continue;
            }
            usort($list, fn ($a, $b) => [$b['on_time_pct'] ?? -1, $b['speed'] ?? 0, $b['done']] <=> [$a['on_time_pct'] ?? -1, $a['speed'] ?? 0, $a['done']]);
            $strip = fn (array $r) => ['person' => $r['person'], 'name' => $r['name'], 'done' => $r['done'], 'on_time_pct' => $r['on_time_pct'], 'speed' => $r['speed'], 'median_minutes' => $r['median_minutes']];
            $leaders[] = ['type' => $type, 'best' => $strip($list[0]), 'least' => $strip($list[count($list) - 1]), 'people' => count($list)];
        }
        usort($leaders, fn ($a, $b) => [$b['people'], $a['type']] <=> [$a['people'], $b['type']]);

        return [$rows, $leaders];
    }

    /** @param list<int|null> $values */
    private static function median(array $values): ?int
    {
        $values = array_values(array_filter($values, fn ($v) => $v !== null && $v > 0));
        if ($values === []) {
            return null;
        }
        sort($values);
        $mid = intdiv(count($values), 2);

        return count($values) % 2 ? (int) $values[$mid] : (int) round(($values[$mid - 1] + $values[$mid]) / 2);
    }

    private static function pct(int $part, int $whole): ?int
    {
        return $whole > 0 ? (int) round($part / $whole * 100) : null;
    }
}
