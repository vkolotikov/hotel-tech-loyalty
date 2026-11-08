<?php

namespace App\Services\Time;

use App\Models\Staff;
use Illuminate\Support\Facades\DB;

/**
 * What the planner knows about a person (HexaTech Time Planner, 2026-11-09) — the one writer of `staff.planner_profile`:
 *
 * - `skills` (read here, written only by the full admin's `PUT team/{id}`, a manager's): the task types
 *   (`planner_groups` names) a person may take from the open pool. NULL = any type, the default; an empty list = none.
 *   The full admin's pool, claim and staff suggestions read the same column; managers always have NULL.
 * - `knowledge`: what the person knows, in their manager's words (languages, certificates, equipment, specialties).
 *   The AI reads it when it plans a day; nothing else does.
 * - `work_start` / `work_end` (HH:MM): their own hours, else the organisation's (WorkWindow).
 * - `work_days` (1 = Monday … 7 = Sunday): the days they work, else every day.
 * - `break_minutes`: kept free in the middle of their day.
 *
 * Which tasks fit a person best stays the full admin's `crm_settings.planner_employee_prefs` (by name), which the
 * workspace writes through `crm-settings` as the full admin does.
 */
final class PlannerProfiles
{
    public const KNOWLEDGE_MAX = 1000;

    /**
     * @return array{skills: ?list<string>, knowledge: string, work_start: ?string, work_end: ?string, work_days: ?list<int>, break_minutes: int}
     */
    public static function of(Staff $staff): array
    {
        $profile = is_array($staff->planner_profile) ? $staff->planner_profile : [];
        $skills = is_array($staff->planner_skills) ? array_values(array_map('strval', $staff->planner_skills)) : null;
        $days = is_array($profile['work_days'] ?? null)
            ? array_values(array_unique(array_filter(array_map('intval', $profile['work_days']), fn (int $d) => $d >= 1 && $d <= 7)))
            : null;
        if ($days !== null) {
            sort($days);
        }

        return [
            'skills'        => $skills,
            'knowledge'     => mb_substr((string) ($profile['knowledge'] ?? ''), 0, self::KNOWLEDGE_MAX),
            'work_start'    => WorkWindow::isClock($profile['work_start'] ?? null) ? $profile['work_start'] : null,
            'work_end'      => WorkWindow::isClock($profile['work_end'] ?? null) ? $profile['work_end'] : null,
            'work_days'     => $days === [] ? null : $days,
            'break_minutes' => max(0, min(180, (int) ($profile['break_minutes'] ?? 0))),
        ];
    }

    /**
     * Saves the fields present in $data (validated by the controller); a field left out keeps its value.
     *
     * @param  array{knowledge?: ?string, work_start?: ?string, work_end?: ?string, work_days?: ?list<int>, break_minutes?: ?int}  $data
     */
    public function write(int $userId, array $data): Staff
    {
        return DB::transaction(function () use ($userId, $data) {
            $staff = Staff::query()->where('user_id', $userId)->where('is_active', true)->lockForUpdate()->first()
                ?? throw TimeRefused::notFound();

            $current = self::of($staff);
            $profile = [
                'knowledge'     => array_key_exists('knowledge', $data) ? trim((string) $data['knowledge']) : $current['knowledge'],
                'work_start'    => array_key_exists('work_start', $data) ? ($data['work_start'] ?: null) : $current['work_start'],
                'work_end'      => array_key_exists('work_end', $data) ? ($data['work_end'] ?: null) : $current['work_end'],
                'work_days'     => array_key_exists('work_days', $data) ? ($data['work_days'] ?: null) : $current['work_days'],
                'break_minutes' => array_key_exists('break_minutes', $data) ? (int) ($data['break_minutes'] ?? 0) : $current['break_minutes'],
            ];
            if ($profile['work_start'] !== null && $profile['work_end'] !== null
                && WorkWindow::toMinutes($profile['work_end']) <= WorkWindow::toMinutes($profile['work_start'])) {
                throw new TimeRefused('invalid_hours', 'The day must end after it starts.', 422);
            }
            $profile['knowledge'] = mb_substr($profile['knowledge'], 0, self::KNOWLEDGE_MAX);
            if (is_array($profile['work_days'])) {
                $profile['work_days'] = array_values(array_unique(array_map('intval', $profile['work_days'])));
                sort($profile['work_days']);
            }

            $staff->forceFill(['planner_profile' => $profile])->save();

            return $staff->fresh();
        });
    }
}
