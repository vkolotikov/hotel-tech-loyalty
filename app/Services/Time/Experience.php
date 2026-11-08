<?php

namespace App\Services\Time;

use App\Models\PlannerTask;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;

/**
 * What each person has shown they can do (HexaTech Time Planner, 2026-11-09): from the tasks they finished in the
 * last DAYS days, by task type — how many, how many on or before their day, and how long they took (the clocked time
 * where someone timed the task, else its planned length). Beside a person's declared skills and knowledge
 * (PlannerProfiles) this is the planner's measured knowledge of them; the rules plan and the AI both read it.
 *
 * Also how long a kind of task usually takes (estimate()), from the same finished tasks.
 */
final class Experience
{
    public const DAYS = 90;

    /** A finished task is "on time" when it was finished on or before its day, in the venue's zone. */
    public function __construct(private readonly Team $team)
    {
    }

    /** @return \Illuminate\Support\Collection<int, PlannerTask> */
    private function finished(int $orgId, int $days)
    {
        $today = VenueClock::today($orgId);
        $from = CarbonImmutable::createFromFormat('!Y-m-d', $today, 'UTC')->subDays($days)->toDateString();

        return PlannerTask::query()
            ->whereDate('task_date', '>=', $from)->whereDate('task_date', '<=', $today)
            ->where(fn ($q) => $q->where('completed', true)->orWhere('status', 'done'))
            ->limit(20000)
            ->get(['id', 'task_date', 'task_group', 'task_category', 'title', 'duration_minutes', 'start_time', 'end_time',
                'actual_minutes', 'completed_at', 'assigned_to_user_id', 'employee_name', 'completed', 'status']);
    }

    /**
     * @return array<string, array{done: int, on_time: int, groups: array<string, array{done: int, on_time: int, avg_minutes: int}>}>
     */
    public function byPerson(int $orgId, int $days = self::DAYS): array
    {
        $zone = VenueClock::zone($orgId);
        $acc = [];
        foreach ($this->finished($orgId, $days) as $t) {
            $key = $this->team->ownerKey($t);
            if ($key === null) {
                continue;
            }
            $group = $t->task_group ?: '—';
            $onTime = $t->completed_at && $t->task_date
                && $t->completed_at->copy()->setTimezone($zone)->toDateString() <= $t->task_date->toDateString();
            $minutes = $t->actual_minutes !== null ? (int) $t->actual_minutes : TaskView::minutes($t);
            $acc[$key] ??= ['done' => 0, 'on_time' => 0, 'groups' => []];
            $acc[$key]['done']++;
            $acc[$key]['on_time'] += $onTime ? 1 : 0;
            $acc[$key]['groups'][$group] ??= ['done' => 0, 'on_time' => 0, 'minutes' => 0];
            $acc[$key]['groups'][$group]['done']++;
            $acc[$key]['groups'][$group]['on_time'] += $onTime ? 1 : 0;
            $acc[$key]['groups'][$group]['minutes'] += $minutes;
        }
        foreach ($acc as &$person) {
            foreach ($person['groups'] as &$g) {
                $g['avg_minutes'] = (int) round($g['minutes'] / max(1, $g['done']));
                unset($g['minutes']);
            }
            unset($g);
            arsort($person['groups']);
        }
        unset($person);

        return $acc;
    }

    /**
     * How long a task like this usually takes: the median of the finished tasks with the same task label, else the
     * same type, from clocked time where there is some. Null with fewer than three to go by.
     *
     * @return array{minutes: int, samples: int, basis: string}|null
     */
    public function estimate(int $orgId, ?string $group, ?string $category, ?string $title = null): ?array
    {
        $finished = $this->finished($orgId, self::DAYS);
        $label = mb_strtolower(trim((string) ($category ?: '')));
        $titleKey = mb_strtolower(trim((string) $title));
        $tries = [
            'title'    => $titleKey !== '' ? $finished->filter(fn (PlannerTask $t) => mb_strtolower(trim((string) $t->title)) === $titleKey) : collect(),
            'category' => $label !== '' ? $finished->filter(fn (PlannerTask $t) => mb_strtolower(trim((string) $t->task_category)) === $label) : collect(),
            'group'    => $group ? $finished->filter(fn (PlannerTask $t) => $t->task_group === $group) : collect(),
        ];
        foreach ($tries as $basis => $rows) {
            if ($rows->count() < 3) {
                continue;
            }
            $minutes = $rows->map(fn (PlannerTask $t) => $t->actual_minutes !== null ? (int) $t->actual_minutes : TaskView::minutes($t))
                ->filter(fn (int $m) => $m > 0)->sort()->values();
            if ($minutes->count() < 3) {
                continue;
            }
            $mid = intdiv($minutes->count(), 2);
            $median = $minutes->count() % 2 ? $minutes[$mid] : (int) round(($minutes[$mid - 1] + $minutes[$mid]) / 2);

            return ['minutes' => max(5, (int) (round($median / 5) * 5)), 'samples' => $minutes->count(), 'basis' => $basis];
        }

        return null;
    }
}
