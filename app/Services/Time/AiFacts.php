<?php

namespace App\Services\Time;

/**
 * How the planner's AI is told about people and tasks (HexaTech Time Planner, 2026-11-14): one shape for the day plan,
 * the week plan, the assistant and the coach, so each reads a person and a task alike — and only what a manager wrote
 * or the server measured. Long texts are cut; empty fields are left out.
 */
final class AiFacts
{
    /**
     * @param  array<string, mixed>  $person  Team::people() row
     * @param  array<string, mixed>|null  $shown  Experience::byPerson() row
     * @return array<string, mixed>
     */
    public static function person(array $person, ?array $shown = null): array
    {
        $profile = $person['profile'] ?? [];

        return array_filter([
            'person'       => $person['key'],
            'name'         => $person['name'],
            'manager'      => (bool) ($person['manager'] ?? false),
            'has_account'  => (bool) ($person['has_account'] ?? false),
            'job_title'    => ($profile['job_title'] ?? '') ?: null,
            'level'        => $profile['level'] ?? null,
            'skills'       => $profile['skills'] ?? 'any',
            'prefers'      => array_filter($person['prefers'] ?? []) ?: null,
            'knowledge'    => self::cut($profile['knowledge'] ?? '', 600),
            'strengths'    => self::cut($profile['strengths'] ?? '', 400),
            'develop'      => self::cut($profile['develop'] ?? '', 400),
            'own_hours'    => ($profile['work_start'] ?? null) && ($profile['work_end'] ?? null) ? $profile['work_start'] . '-' . $profile['work_end'] : null,
            'work_days'    => $profile['work_days'] ?? null,
            'break_minutes' => ($profile['break_minutes'] ?? 0) ?: null,
            'experience'   => $shown ? collect($shown['groups'] ?? [])->take(8)
                ->map(fn ($g) => "{$g['done']} done, " . ($g['done'] > 0 ? (int) round($g['on_time'] / $g['done'] * 100) : 0) . "% on time, ~{$g['avg_minutes']} min")->all() : null,
        ], fn ($v) => $v !== null && $v !== '' && $v !== []);
    }

    /**
     * @param  array<string, mixed>  $task  TaskView row (with `from` and `sized` when a planner added them)
     * @return array<string, mixed>
     */
    public static function task(array $task): array
    {
        return array_filter([
            'task_id'  => $task['id'],
            'title'    => mb_substr((string) $task['title'], 0, 120),
            'type'     => $task['task_group'] ?? null,
            'task'     => $task['task_category'] ?? null,
            'priority' => $task['priority'] ?? null,
            'minutes'  => $task['minutes'] ?? null,
            // Where the length came from when the task had none: the manager's typical one, or the learned one.
            'length_from' => isset($task['sized']) && $task['sized'] !== 'own' ? $task['sized'] : null,
            'owner'    => $task['owner'] ?? null,
            'from'     => $task['from'] ?? null,
            'date'     => $task['task_date'] ?? null,
            'time'     => ($task['start_time'] ?? null) ? $task['start_time'] . '-' . ($task['end_time'] ?? '') : null,
            'due'      => $task['pool_due_date'] ?? null,
            'horizon'  => $task['pool_horizon'] ?? null,
            'done'     => !empty($task['done']) ? true : null,
            'notes'    => self::cut($task['description'] ?? '', 160),
        ], fn ($v) => $v !== null && $v !== '');
    }

    private static function cut(mixed $text, int $max): ?string
    {
        $text = trim((string) $text);

        return $text === '' ? null : mb_substr($text, 0, $max);
    }
}
