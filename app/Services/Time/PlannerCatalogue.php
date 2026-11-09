<?php

namespace App\Services\Time;

use App\Models\CrmSetting;

/**
 * The planner's own lists, read from the full admin's `crm_settings` rows and normalised once on the server
 * (HexaTech Time Planner, 2026-11-09), so the workspace keeps no copy of the parsing rules:
 *
 * - `planner_groups`: the task types — plain names (older rows) or {name, icon, color};
 * - `planner_channels`: the tasks each type offers — {key, label, icon, color, groups[]} (groups empty = every type);
 * - `planner_employee_prefs`: by person's name, the types and tasks that fit their knowledge best ({groups, tasks});
 * - `employees`: names the full admin's assign lists add to the team (people without an account);
 * - `planner_work_hours_per_day` / `planner_work_days_per_week`: the standard working time (8 and 5 when unset), the
 *   full admin's basis for payroll and here the planned day's default capacity.
 *
 * The same shapes the full admin's plannerMeta.ts reads (parsePlannerGroups, parsePlannerChannels, parseEmployeePrefs).
 */
final class PlannerCatalogue
{
    /** @var array<string, mixed>|null */
    private ?array $raw = null;

    /** @return array<string, mixed> */
    private function raw(): array
    {
        return $this->raw ??= CrmSetting::query()
            ->whereIn('key', ['planner_groups', 'planner_channels', 'planner_employee_prefs', 'employees', 'planner_work_hours_per_day', 'planner_work_days_per_week'])
            ->pluck('value', 'key')->all();
    }

    /** @return list<mixed> */
    private static function listOf(mixed $value): array
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_array($decoded) ? $decoded : null;
        }
        if (is_array($value) && !array_is_list($value)) {
            $value = array_values($value);
        }

        return is_array($value) ? $value : [];
    }

    /** @return list<array{name: string, icon: ?string, color: ?string}> */
    public function groups(): array
    {
        $out = [];
        foreach (self::listOf($this->raw()['planner_groups'] ?? null) as $entry) {
            if (is_string($entry) && trim($entry) !== '') {
                $out[] = ['name' => trim($entry), 'icon' => null, 'color' => null];
            } elseif (is_array($entry) && trim((string) ($entry['name'] ?? '')) !== '') {
                $out[] = [
                    'name'  => trim((string) $entry['name']),
                    'icon'  => is_string($entry['icon'] ?? null) && $entry['icon'] !== '' ? $entry['icon'] : null,
                    'color' => is_string($entry['color'] ?? null) && preg_match('/^#[0-9a-fA-F]{6}$/', $entry['color']) ? $entry['color'] : null,
                ];
            }
        }

        return array_values(array_reduce($out, function (array $carry, array $g) {
            $carry[mb_strtolower($g['name'])] ??= $g;

            return $carry;
        }, []));
    }

    /** @return list<string> */
    public function groupNames(): array
    {
        return array_map(fn (array $g) => $g['name'], $this->groups());
    }

    /** @return list<array{key: string, label: string, icon: string, color: string, groups: list<string>}> */
    public function channels(): array
    {
        $out = [];
        foreach (self::listOf($this->raw()['planner_channels'] ?? null) as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $key = trim((string) ($entry['key'] ?? ''));
            $label = trim((string) ($entry['label'] ?? ''));
            if ($key === '' || $label === '') {
                continue;
            }
            $out[] = [
                'key'    => $key,
                'label'  => $label,
                'icon'   => is_string($entry['icon'] ?? null) && $entry['icon'] !== '' ? $entry['icon'] : 'phone',
                'color'  => is_string($entry['color'] ?? null) && $entry['color'] !== '' ? $entry['color'] : '#94a3b8',
                'groups' => is_array($entry['groups'] ?? null) ? array_values(array_map('strval', $entry['groups'])) : [],
            ];
        }

        return $out;
    }

    /** @return array<string, array{groups: list<string>, tasks: list<string>}> */
    public function employeePrefs(): array
    {
        $raw = $this->raw()['planner_employee_prefs'] ?? null;
        if (is_string($raw)) {
            $raw = json_decode($raw, true);
        }
        if (!is_array($raw) || array_is_list($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $name => $value) {
            if (!is_array($value)) {
                continue;
            }
            $out[(string) $name] = [
                'groups' => is_array($value['groups'] ?? null) ? array_values(array_map('strval', $value['groups'])) : [],
                'tasks'  => is_array($value['tasks'] ?? null) ? array_values(array_map('strval', $value['tasks'])) : [],
            ];
        }

        return $out;
    }

    /** @return list<string> Names without an account the full admin lists beside the team. */
    public function extraEmployees(): array
    {
        return array_values(array_unique(array_filter(array_map(
            fn ($n) => is_string($n) ? trim($n) : '',
            self::listOf($this->raw()['employees'] ?? null),
        ), fn (string $n) => $n !== '')));
    }

    /** The standard working day in minutes (the setting is hours, in steps of half an hour). */
    public function minutesPerDay(): int
    {
        $raw = $this->raw()['planner_work_hours_per_day'] ?? null;
        $v = is_numeric($raw) ? (float) $raw : 0.0;

        return $v >= 1 && $v <= 24 ? (int) round($v * 60) : 8 * 60;
    }

    public function daysPerWeek(): int
    {
        $raw = $this->raw()['planner_work_days_per_week'] ?? null;
        $v = is_numeric($raw) ? (int) $raw : 0;

        return $v >= 1 && $v <= 7 ? $v : 5;
    }

    /** The organisation's own type for a name an AI or a person wrote, matched without case; null when it has none. */
    public function matchGroup(?string $name): ?string
    {
        $name = mb_strtolower(trim((string) $name));
        if ($name === '') {
            return null;
        }
        foreach ($this->groupNames() as $group) {
            if (mb_strtolower($group) === $name) {
                return $group;
            }
        }

        return null;
    }

    /**
     * The organisation's own task for a key or label written by an AI or a person, as the full admin stores it in
     * `planner_tasks.task_category` (the task's key); null when it has none.
     */
    public function matchChannel(?string $value): ?string
    {
        $value = mb_strtolower(trim((string) $value));
        if ($value === '') {
            return null;
        }
        foreach ($this->channels() as $channel) {
            if (mb_strtolower($channel['label']) === $value || mb_strtolower($channel['key']) === $value) {
                return $channel['key'];
            }
        }

        return null;
    }
}
