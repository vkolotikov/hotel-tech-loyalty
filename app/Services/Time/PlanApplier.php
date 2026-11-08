<?php

namespace App\Services\Time;

use App\Models\PlannerTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Writes the plan a person accepted (HexaTech Time Planner, 2026-11-09): for each line, the task's day, start, length
 * and owner. One transaction; each task is read again under a row lock, and a line is skipped — never forced — when:
 *
 * - `changed`: the task was edited since the plan was made (its `updated_at` differs from the plan's `seen`);
 * - `done`: it was finished meanwhile;
 * - `not_yours`: a staff member's plan names someone else, or a task someone else owns (planning others is a
 *   manager's, TimeAccess);
 * - `no_person`: the person is not on the team any more;
 * - `not_allowed`: the person may not take the task's type from the pool (their skills, Team::mayTake);
 * - `not_found`: the task is not this organisation's.
 *
 * The owner is written as the full admin's claim writes it: the account and the name.
 */
final class PlanApplier
{
    public function __construct(private readonly Team $team)
    {
    }

    /**
     * @param  list<array{task_id: int, person: string, start_time: string, duration_minutes: int, seen?: ?string}>  $lines
     * @return array{applied: int, skipped: list<array{task_id: int, reason: string}>}
     */
    public function apply(User $by, bool $manager, string $date, array $lines): array
    {
        $me = 'u' . $by->id;
        $applied = 0;
        $skipped = [];

        DB::transaction(function () use ($lines, $date, $manager, $me, &$applied, &$skipped) {
            foreach ($lines as $line) {
                $id = (int) $line['task_id'];
                $task = PlannerTask::query()->lockForUpdate()->find($id);
                if (!$task) {
                    $skipped[] = ['task_id' => $id, 'reason' => 'not_found'];
                    continue;
                }
                if (($line['seen'] ?? null) !== null && $task->updated_at?->toIso8601String() !== $line['seen']) {
                    $skipped[] = ['task_id' => $id, 'reason' => 'changed'];
                    continue;
                }
                if (TaskView::isDone($task)) {
                    $skipped[] = ['task_id' => $id, 'reason' => 'done'];
                    continue;
                }
                $person = $this->team->find((string) $line['person']);
                if ($person === null) {
                    $skipped[] = ['task_id' => $id, 'reason' => 'no_person'];
                    continue;
                }
                $owner = $this->team->ownerKey($task);
                if (!$manager && ($person['key'] !== $me || ($owner !== null && $owner !== $me))) {
                    $skipped[] = ['task_id' => $id, 'reason' => 'not_yours'];
                    continue;
                }
                if ($owner !== $person['key'] && !Team::mayTake($person, $task->task_group)) {
                    $skipped[] = ['task_id' => $id, 'reason' => 'not_allowed'];
                    continue;
                }

                $start = WorkWindow::toMinutes($line['start_time']);
                $minutes = max(5, min(720, (int) $line['duration_minutes']));
                $task->update([
                    'task_date'        => $date,
                    'start_time'       => WorkWindow::toClock($start),
                    'end_time'         => WorkWindow::toClock(min(24 * 60 - 1, $start + $minutes)),
                    'duration_minutes' => $minutes,
                ] + Team::assignment($person));
                $applied++;
            }
        });

        return ['applied' => $applied, 'skipped' => $skipped];
    }
}
