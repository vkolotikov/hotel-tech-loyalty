<?php

namespace App\Services\Time;

use App\Models\CrmSetting;

/**
 * What a manager teaches the planner's AI (HexaTech Time Planner, 2026-11-14, the AI assistant: "some education before
 * AI about our employees, about the tasks, what they do, about the roles, about the knowledge of them"). Three planner
 * settings, kept beside the planner's other `crm_settings` rows and written only through the workspace's own
 * `PUT admin/time/settings/{key}` (a manager's), cleaned here:
 *
 * - `planner_ai_context` — the business in a manager's words: `about` (what the business does, how the team works),
 *   `rules` (house rules the plans must keep: "rooms ready by 15:00", "never two people off on a Saturday") and `goals`
 *   (what to optimise: fairness, speed, training);
 * - `planner_type_notes` — per task type (a `planner_groups` name): `notes` (what the work involves, what it needs),
 *   `typical_minutes` (how long it takes, a manager's figure), `best_time` (morning, midday, afternoon, evening, any);
 * - `planner_task_notes` — per task (a `planner_channels` key): `notes` and `typical_minutes`.
 *
 * People's own side (job title, level, knowledge, strengths, what they develop) is their planner profile
 * (PlannerProfiles). The AI reads all of it (forAi()); the rules read `typical_minutes` (typical()).
 */
final class Knowledge
{
    public const CONTEXT = 'planner_ai_context';

    public const TYPE_NOTES = 'planner_type_notes';

    public const TASK_NOTES = 'planner_task_notes';

    public const KEYS = [self::CONTEXT, self::TYPE_NOTES, self::TASK_NOTES];

    public const BEST_TIMES = ['morning', 'midday', 'afternoon', 'evening', 'any'];

    private const TEXT_MAX = 2000;

    private const NOTE_MAX = 600;

    private const ENTRIES_MAX = 200;

    /** @var array<string, mixed>|null */
    private ?array $raw = null;

    /** @return array<string, mixed> */
    private function raw(): array
    {
        return $this->raw ??= CrmSetting::query()->whereIn('key', self::KEYS)->pluck('value', 'key')->all();
    }

    /** @return array<mixed> */
    private static function decode(mixed $value): array
    {
        if (is_string($value)) {
            $value = json_decode($value, true);
        }

        return is_array($value) ? $value : [];
    }

    /** @return array{about: string, rules: string, goals: string} */
    public function context(): array
    {
        return self::cleanContext(self::decode($this->raw()[self::CONTEXT] ?? null));
    }

    /** @return array<string, array{notes: string, typical_minutes: ?int, best_time: ?string}> */
    public function typeNotes(): array
    {
        return self::cleanTypeNotes(self::decode($this->raw()[self::TYPE_NOTES] ?? null));
    }

    /** @return array<string, array{notes: string, typical_minutes: ?int}> */
    public function taskNotes(): array
    {
        return self::cleanTaskNotes(self::decode($this->raw()[self::TASK_NOTES] ?? null));
    }

    /** A manager's typical length for such a task: the task's own, else its type's; null when neither is set. */
    public function typical(?string $group, ?string $category): ?int
    {
        $task = $category ? ($this->taskNotes()[$category]['typical_minutes'] ?? null) : null;

        return $task ?? ($group ? ($this->typeNotes()[$group]['typical_minutes'] ?? null) : null);
    }

    /**
     * What the AI is told, compactly (only what is filled in).
     *
     * @return array<string, mixed>
     */
    public function forAi(): array
    {
        $context = array_filter($this->context(), fn ($v) => $v !== '');
        $types = array_map(fn (array $n) => array_filter($n, fn ($v) => $v !== '' && $v !== null), $this->typeNotes());
        $tasks = array_map(fn (array $n) => array_filter($n, fn ($v) => $v !== '' && $v !== null), $this->taskNotes());

        return array_filter([
            'business'   => $context ?: null,
            'task_types' => array_filter($types) ?: null,
            'tasks'      => array_filter($tasks) ?: null,
        ]);
    }

    /* ─── Cleaning what a manager (or the AI's draft a manager accepted) sends ─── */

    /** @param array<mixed> $raw @return array{about: string, rules: string, goals: string} */
    public static function cleanContext(array $raw): array
    {
        $text = fn (string $k, int $max) => mb_substr(trim(is_string($raw[$k] ?? null) ? $raw[$k] : ''), 0, $max);

        return ['about' => $text('about', self::TEXT_MAX), 'rules' => $text('rules', self::TEXT_MAX), 'goals' => $text('goals', 1000)];
    }

    /** @param array<mixed> $raw @return array<string, array{notes: string, typical_minutes: ?int, best_time: ?string}> */
    public static function cleanTypeNotes(array $raw): array
    {
        $out = [];
        foreach (array_slice($raw, 0, self::ENTRIES_MAX, true) as $name => $note) {
            $name = mb_substr(trim((string) $name), 0, 80);
            if ($name === '' || !is_array($note)) {
                continue;
            }
            $entry = [
                'notes'           => mb_substr(trim(is_string($note['notes'] ?? null) ? $note['notes'] : ''), 0, self::NOTE_MAX),
                'typical_minutes' => self::minutes($note['typical_minutes'] ?? null),
                'best_time'       => in_array($note['best_time'] ?? null, self::BEST_TIMES, true) ? $note['best_time'] : null,
            ];
            if ($entry['notes'] !== '' || $entry['typical_minutes'] !== null || $entry['best_time'] !== null) {
                $out[$name] = $entry;
            }
        }

        return $out;
    }

    /** @param array<mixed> $raw @return array<string, array{notes: string, typical_minutes: ?int}> */
    public static function cleanTaskNotes(array $raw): array
    {
        $out = [];
        foreach (array_slice($raw, 0, self::ENTRIES_MAX, true) as $key => $note) {
            $key = mb_substr(trim((string) $key), 0, 120);
            if ($key === '' || !is_array($note)) {
                continue;
            }
            $entry = [
                'notes'           => mb_substr(trim(is_string($note['notes'] ?? null) ? $note['notes'] : ''), 0, self::NOTE_MAX),
                'typical_minutes' => self::minutes($note['typical_minutes'] ?? null),
            ];
            if ($entry['notes'] !== '' || $entry['typical_minutes'] !== null) {
                $out[$key] = $entry;
            }
        }

        return $out;
    }

    /** A length a planner can use: whole minutes from 5 to 720, else none. */
    public static function minutes(mixed $value): ?int
    {
        if (!is_numeric($value)) {
            return null;
        }
        $m = (int) round((float) $value);

        return $m >= 5 && $m <= 720 ? $m : null;
    }
}
