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
 * - `job_title`, `level` (LEVELS), `strengths` and `develop` (what they are learning or should grow in): the rest of what
 *   a manager teaches the planner's AI about a person (2026-11-14, the AI assistant); the AI reads them, nothing else.
 * - `buddy` (2026-11-28): the character a person chose for themselves (Buddies::KINDS, or `none`), the one field a
 *   person writes for their own profile (`chooseBuddy`); a manager's save of the rest leaves it alone.
 *
 * Which tasks fit a person best stays the full admin's `crm_settings.planner_employee_prefs` (by name), which the
 * workspace writes through `crm-settings` as the full admin does.
 */
final class PlannerProfiles
{
    public const KNOWLEDGE_MAX = 1000;

    public const NOTE_MAX = 600;

    public const TITLE_MAX = 80;

    /** How experienced a person is in their work, as their manager rates it (no level = not said). */
    public const LEVELS = ['trainee', 'junior', 'experienced', 'senior', 'lead'];

    /**
     * @return array{skills: ?list<string>, knowledge: string, work_start: ?string, work_end: ?string, work_days: ?list<int>, break_minutes: int, job_title: string, level: ?string, strengths: string, develop: string, buddy: ?string}
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
            'job_title'     => mb_substr(trim((string) ($profile['job_title'] ?? '')), 0, self::TITLE_MAX),
            'level'         => in_array($profile['level'] ?? null, self::LEVELS, true) ? $profile['level'] : null,
            'strengths'     => mb_substr((string) ($profile['strengths'] ?? ''), 0, self::NOTE_MAX),
            'develop'       => mb_substr((string) ($profile['develop'] ?? ''), 0, self::NOTE_MAX),
            // The person's own choice of character, or null for someone who never chose (Buddies).
            'buddy'         => Buddies::choice($profile['buddy'] ?? null),
        ];
    }

    /** A blank profile, for a name without an account. */
    public static function blank(): array
    {
        return ['skills' => null, 'knowledge' => '', 'work_start' => null, 'work_end' => null, 'work_days' => null, 'break_minutes' => 0,
            'job_title' => '', 'level' => null, 'strengths' => '', 'develop' => '', 'buddy' => null];
    }

    /**
     * Saves the fields present in $data (validated by the controller); a field left out keeps its value.
     *
     * @param  array{knowledge?: ?string, work_start?: ?string, work_end?: ?string, work_days?: ?list<int>, break_minutes?: ?int, job_title?: ?string, level?: ?string, strengths?: ?string, develop?: ?string}  $data
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
                'job_title'     => array_key_exists('job_title', $data) ? mb_substr(trim((string) $data['job_title']), 0, self::TITLE_MAX) : $current['job_title'],
                'level'         => array_key_exists('level', $data) ? (in_array($data['level'], self::LEVELS, true) ? $data['level'] : null) : $current['level'],
                'strengths'     => array_key_exists('strengths', $data) ? mb_substr(trim((string) $data['strengths']), 0, self::NOTE_MAX) : $current['strengths'],
                'develop'       => array_key_exists('develop', $data) ? mb_substr(trim((string) $data['develop']), 0, self::NOTE_MAX) : $current['develop'],
                // The person's own (chooseBuddy): a manager's save of the rest never changes or loses it.
                'buddy'         => $current['buddy'],
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

    /**
     * A person's own choice of character (Buddies::KINDS, or `none`): the rest of their profile stays as it is.
     * Nothing else of a profile is a person's own to write.
     */
    public function chooseBuddy(int $userId, string $buddy): Staff
    {
        return DB::transaction(function () use ($userId, $buddy) {
            $staff = Staff::query()->where('user_id', $userId)->where('is_active', true)->lockForUpdate()->first()
                ?? throw TimeRefused::notFound();
            $choice = Buddies::choice($buddy) ?? throw new TimeRefused('invalid', 'There is no such character.', 422);

            $profile = self::of($staff);
            // Skills are a column of their own (the full admin's Team endpoint writes them), never part of the profile.
            unset($profile['skills']);
            $profile['buddy'] = $choice;
            $staff->forceFill(['planner_profile' => $profile])->save();

            return $staff->fresh();
        });
    }
}
