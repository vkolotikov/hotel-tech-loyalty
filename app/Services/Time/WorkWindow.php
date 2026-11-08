<?php

namespace App\Services\Time;

use App\Models\CrmSetting;
use Illuminate\Support\Facades\Log;

/**
 * The working day the planner fits work into (moved here from PlannerController on 2026-11-09, unchanged, so the full
 * admin's auto-plan, free slots and staff suggestions and HexaTech Time Planner read one rule).
 *
 * Precedence for the organisation's window:
 *   1. an explicit `work_start` / `work_end` (HH:MM) in the request;
 *   2. the organisation's `crm_settings.business_hours_profile` row ({start, end}, HH:MM, re-validated);
 *   3. 09:00 / 18:00.
 * Without a bound organisation (a console or queue caller) step 2 is skipped, so a misconfiguration cannot retime it.
 *
 * A person's own day (forPerson) starts from the organisation's window and takes their planner profile's hours, days
 * and break where they set them (PlannerProfiles).
 */
final class WorkWindow
{
    public const DEFAULT_START = '09:00';

    public const DEFAULT_END = '18:00';

    private const HHMM = '/^\d{2}:\d{2}$/';

    public static function toMinutes(string $hhmm): int
    {
        [$h, $m] = array_pad(explode(':', $hhmm), 2, '0');

        return ((int) $h) * 60 + ((int) $m);
    }

    public static function toClock(int $minutes): string
    {
        $minutes = max(0, min(24 * 60 - 1, $minutes));

        return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
    }

    public static function isClock(mixed $value): bool
    {
        return is_string($value) && preg_match(self::HHMM, $value) === 1 && self::toMinutes($value) < 24 * 60 && (int) substr($value, 3, 2) < 60;
    }

    /**
     * The organisation's window, in minutes from midnight.
     *
     * @param  array{work_start?: ?string, work_end?: ?string}  $data
     * @return array{start: int, end: int}
     */
    public static function resolve(array $data = []): array
    {
        $requestStart = $data['work_start'] ?? null;
        $requestEnd   = $data['work_end']   ?? null;

        if (!app()->bound('current_organization_id') || !app('current_organization_id')) {
            return [
                'start' => self::toMinutes($requestStart ?: self::DEFAULT_START),
                'end'   => self::toMinutes($requestEnd   ?: self::DEFAULT_END),
            ];
        }

        $profileStart = null;
        $profileEnd   = null;
        try {
            $row = CrmSetting::where('key', 'business_hours_profile')->first();
            $val = $row?->value;
            if (is_array($val)) {
                $rawStart = is_string($val['start'] ?? null) ? $val['start'] : null;
                $rawEnd   = is_string($val['end']   ?? null) ? $val['end']   : null;
                $profileStart = ($rawStart !== null && preg_match(self::HHMM, $rawStart)) ? $rawStart : null;
                $profileEnd   = ($rawEnd   !== null && preg_match(self::HHMM, $rawEnd))   ? $rawEnd   : null;

                if (($rawStart !== null && $profileStart === null) || ($rawEnd !== null && $profileEnd === null)) {
                    Log::warning('planner.work_window.profile_malformed', [
                        'org_id' => app('current_organization_id'),
                        'value'  => $val,
                    ]);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('planner.work_window.profile_lookup_failed', [
                'org_id' => app('current_organization_id'),
                'error'  => $e->getMessage(),
            ]);
        }

        return [
            'start' => self::toMinutes($requestStart ?: $profileStart ?: self::DEFAULT_START),
            'end'   => self::toMinutes($requestEnd   ?: $profileEnd   ?: self::DEFAULT_END),
        ];
    }

    /**
     * A person's day on a weekday (1 = Monday … 7 = Sunday): their own hours where set, else the organisation's; whether
     * they work that day (their days where set, else every day); their break; and the minutes they can be planned for.
     *
     * @param  array{start: int, end: int}  $organisation
     * @param  array{work_start?: ?string, work_end?: ?string, work_days?: ?list<int>, break_minutes?: int}  $profile
     * @return array{start: int, end: int, works: bool, break_minutes: int, capacity: int}
     */
    public static function forPerson(array $organisation, array $profile, int $weekday): array
    {
        $start = self::isClock($profile['work_start'] ?? null) ? self::toMinutes($profile['work_start']) : $organisation['start'];
        $end = self::isClock($profile['work_end'] ?? null) ? self::toMinutes($profile['work_end']) : $organisation['end'];
        if ($end <= $start) {
            [$start, $end] = [$organisation['start'], $organisation['end']];
        }
        $days = $profile['work_days'] ?? null;
        $works = !is_array($days) || $days === [] || in_array($weekday, array_map('intval', $days), true);
        $break = max(0, min(180, (int) ($profile['break_minutes'] ?? 0)));
        $capacity = $works ? max(0, $end - $start - $break) : 0;

        return ['start' => $start, 'end' => $end, 'works' => $works, 'break_minutes' => $break, 'capacity' => $capacity];
    }
}
