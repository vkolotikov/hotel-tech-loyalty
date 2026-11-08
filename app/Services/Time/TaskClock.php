<?php

namespace App\Services\Time;

use App\Models\PlannerTask;
use Illuminate\Support\Facades\DB;

/**
 * The time a person really spends on a task (HexaTech Time Planner, 2026-11-09): Start, Pause and Finish. The one
 * writer of `planner_tasks.started_at` and `actual_minutes`, beside PlannerTask's own saving() hook, which stops a
 * running clock whenever a task becomes done on any screen.
 *
 * A clock runs while `started_at` is set; Pause adds the minutes it ran to `actual_minutes`; Finish does the same and
 * marks the task done (the full admin's own `done` state: `completed` and `status`). A clock left running longer than
 * MAX_RUN_MINUTES counts that much — a forgotten clock never books a whole week. Any staff member may time any task,
 * as anyone may tick one done in the full admin.
 */
final class TaskClock
{
    /** One run of the clock counts at most twelve hours. */
    public const MAX_RUN_MINUTES = 720;

    /** Whole minutes from $since until now, at least 0 and at most MAX_RUN_MINUTES. */
    public static function minutesSince(\DateTimeInterface $since): int
    {
        $seconds = now()->getTimestamp() - $since->getTimestamp();

        return max(0, min(self::MAX_RUN_MINUTES, intdiv(max(0, $seconds) + 30, 60)));
    }

    public function start(int $taskId): PlannerTask
    {
        return DB::transaction(function () use ($taskId) {
            $task = PlannerTask::query()->lockForUpdate()->find($taskId) ?? throw TimeRefused::notFound();
            if ($task->completed || $task->status === 'done') {
                throw new TimeRefused('task_done', 'This task is already done.', 409);
            }
            if ($task->started_at === null) {
                $task->forceFill(['started_at' => now(), 'status' => 'in_progress'])->save();
            }

            return $task->fresh(['subtasks']);
        });
    }

    public function pause(int $taskId): PlannerTask
    {
        return DB::transaction(function () use ($taskId) {
            $task = PlannerTask::query()->lockForUpdate()->find($taskId) ?? throw TimeRefused::notFound();
            if ($task->started_at !== null) {
                $task->forceFill([
                    'actual_minutes' => (int) $task->actual_minutes + self::minutesSince($task->started_at),
                    'started_at'     => null,
                ])->save();
            }

            return $task->fresh(['subtasks']);
        });
    }

    /** Done, with the clock's minutes added (the model's saving() hook adds them and stops the clock). */
    public function finish(int $taskId): PlannerTask
    {
        return DB::transaction(function () use ($taskId) {
            $task = PlannerTask::query()->lockForUpdate()->find($taskId) ?? throw TimeRefused::notFound();
            if (!$task->completed || $task->status !== 'done') {
                $task->forceFill(['completed' => true, 'status' => 'done'])->save();
            }

            return $task->fresh(['subtasks']);
        });
    }
}
