<?php

namespace App\Services\Time;

use App\Models\PlannerTask;
use Carbon\CarbonInterface;

/**
 * One planner task as HexaTech Time Planner reads it (2026-11-09): the full admin's own row, plus what every screen
 * would otherwise work out for itself — its length in minutes, its end, whether it is done, overdue or timed now, its
 * subtasks' progress and its owner's key (Team::ownerKey).
 *
 * Times are the venue's wall clock, as the full admin stores them (`task_date` + `start_time`, no zone).
 */
final class TaskView
{
    /** A task with neither a duration nor an end counts 30 minutes, as the full admin's auto-plan does. */
    public const DEFAULT_MINUTES = 30;

    public static function isDone(PlannerTask $t): bool
    {
        return (bool) $t->completed || $t->status === 'done';
    }

    /** 0 = high, 1 = normal / medium (and anything unknown), 2 = low. */
    public static function priorityRank(?string $priority): int
    {
        return match (mb_strtolower(trim((string) $priority))) {
            'high', 'urgent' => 0,
            'low'            => 2,
            default          => 1,
        };
    }

    public static function clock(mixed $time): ?string
    {
        if ($time instanceof CarbonInterface) {
            return $time->format('H:i');
        }
        $time = trim((string) $time);

        return preg_match('/^(\d{2}):(\d{2})/', $time, $m) ? $m[1] . ':' . $m[2] : null;
    }

    public static function date(PlannerTask $t): ?string
    {
        return $t->task_date ? $t->task_date->toDateString() : null;
    }

    /** The task's length: its duration, else from its start to its end, else DEFAULT_MINUTES. */
    public static function minutes(PlannerTask $t): int
    {
        $duration = (int) $t->duration_minutes;
        if ($duration > 0) {
            return $duration;
        }
        $start = self::clock($t->start_time);
        $end = self::clock($t->end_time);
        if ($start && $end && WorkWindow::toMinutes($end) > WorkWindow::toMinutes($start)) {
            return WorkWindow::toMinutes($end) - WorkWindow::toMinutes($start);
        }

        return self::DEFAULT_MINUTES;
    }

    /** @return array<string, mixed> */
    public static function of(PlannerTask $t, ?string $ownerKey, string $today): array
    {
        $start = self::clock($t->start_time);
        $minutes = self::minutes($t);
        $done = self::isDone($t);
        $date = self::date($t);
        $subtasks = $t->relationLoaded('subtasks') ? $t->subtasks : collect();

        return [
            'id'               => (int) $t->id,
            'title'            => (string) $t->title,
            'description'      => $t->description,
            'task_date'        => $date,
            'start_time'       => $start,
            'end_time'         => $start ? WorkWindow::toClock(WorkWindow::toMinutes($start) + $minutes) : null,
            'duration_minutes' => $t->duration_minutes !== null ? (int) $t->duration_minutes : null,
            'minutes'          => $minutes,
            'status'           => $done ? 'done' : ((string) ($t->status ?: 'todo')),
            'done'             => $done,
            'priority'         => (string) ($t->priority ?: 'Normal'),
            'priority_rank'    => self::priorityRank($t->priority),
            'task_group'       => $t->task_group,
            'task_category'    => $t->task_category,
            'assigned_to_user_id' => $t->assigned_to_user_id !== null ? (int) $t->assigned_to_user_id : null,
            'employee_name'    => $t->employee_name,
            'owner'            => $ownerKey,
            'subtasks'         => $subtasks->map(fn ($s) => ['id' => (int) $s->id, 'title' => (string) $s->title, 'is_done' => (bool) $s->is_done])->values()->all(),
            'subtasks_done'    => $subtasks->where('is_done', true)->count(),
            'subtasks_total'   => $subtasks->count(),
            'running'          => $t->started_at !== null,
            'started_at'       => $t->started_at?->toIso8601String(),
            'actual_minutes'   => $t->actual_minutes !== null ? (int) $t->actual_minutes : null,
            'recurring'        => (bool) ($t->recurring || $t->recurring_parent_id),
            'pool_horizon'     => $t->pool_horizon,
            'pool_due_date'    => $t->pool_due_date ? $t->pool_due_date->toDateString() : null,
            'overdue'          => !$done && $date !== null && $date < $today,
            'updated_at'       => $t->updated_at?->toIso8601String(),
        ];
    }
}
