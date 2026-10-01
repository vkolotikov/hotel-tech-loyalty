<?php

namespace App\Services\Booking\Setup;

use App\Models\ServiceMaster;
use App\Models\ServiceMasterSchedule;
use Illuminate\Validation\ValidationException;

/**
 * A person's week: one row per working window, `day_of_week` 0 = Sunday (the
 * scheduler's own reading). Validated the same way for the full admin and
 * the workspace: `HH:MM` 00:00–24:00, the end after the start, no overlap
 * between active windows of one day, at most six windows a day. No
 * overnight windows: the scheduler works one day at a time.
 */
final class WeeklyHours
{
    public const MAX_WINDOWS_PER_DAY = 6;

    private const TIME = '/^(?:([01]\d|2[0-3]):([0-5]\d)|(24):(00))(?::00)?$/';

    /**
     * @param  array<int, array<string, mixed>> $rows
     * @return list<array{day_of_week:int, start_time:string, end_time:string, is_active:bool}>
     * @throws ValidationException naming the first bad row as "$field.$i"
     */
    public static function normalise(array $rows, string $field = 'schedules'): array
    {
        $out = [];
        $perDay = [];
        foreach (array_values($rows) as $i => $row) {
            $key = "$field.$i";
            $day = filter_var($row['day_of_week'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 6]]);
            if ($day === false) {
                throw ValidationException::withMessages([$key => ['Choose a day of the week.']]);
            }
            $start = self::parse((string) ($row['start_time'] ?? ''));
            $end = self::parse((string) ($row['end_time'] ?? ''));
            if ($start === null || $end === null || $start >= 1440) {
                throw ValidationException::withMessages([$key => ['Choose a time between 00:00 and 24:00.']]);
            }
            if ($end <= $start) {
                throw ValidationException::withMessages([$key => ['The end must be after the start.']]);
            }
            $active = !array_key_exists('is_active', $row) || filter_var($row['is_active'], FILTER_VALIDATE_BOOL);
            $out[] = ['day_of_week' => $day, 'start_time' => self::stored($start), 'end_time' => self::stored($end), 'is_active' => $active];
            if ($active) {
                $perDay[$day][] = [$start, $end, $i];
            }
        }

        foreach ($perDay as $windows) {
            usort($windows, fn ($a, $b) => $a[0] <=> $b[0]);
            foreach ($windows as $n => [$start, , $i]) {
                if ($n >= self::MAX_WINDOWS_PER_DAY) {
                    throw ValidationException::withMessages(["$field.$i" => ['At most ' . self::MAX_WINDOWS_PER_DAY . ' windows a day.']]);
                }
                if ($n > 0 && $start < $windows[$n - 1][1]) {
                    throw ValidationException::withMessages(["$field.$i" => ['These hours overlap another window on the same day.']]);
                }
            }
        }

        return $out;
    }

    /** Replace the person's whole week (the caller holds the transaction). */
    public static function replace(ServiceMaster $master, array $normalised): void
    {
        ServiceMasterSchedule::where('service_master_id', $master->id)->delete();
        foreach ($normalised as $row) {
            ServiceMasterSchedule::create($row + ['service_master_id' => $master->id]);
        }
    }

    /** @return array<int, list<array{0:int, 1:int}>> active windows per weekday, in minutes */
    public static function windowsByDay(array $normalised): array
    {
        $byDay = [];
        foreach ($normalised as $row) {
            if ($row['is_active']) {
                $byDay[$row['day_of_week']][] = [self::minutesOf($row['start_time']), self::minutesOf($row['end_time'])];
            }
        }

        return $byDay;
    }

    public static function minutesOf(string $time): int
    {
        return self::parse($time) ?? throw new \InvalidArgumentException("Not a time: $time");
    }

    private static function parse(string $time): ?int
    {
        if (!preg_match(self::TIME, $time, $m)) {
            return null;
        }

        return ($m[1] !== '' ? (int) $m[1] * 60 + (int) $m[2] : 1440);
    }

    private static function stored(int $minutes): string
    {
        return sprintf('%02d:%02d:00', intdiv($minutes, 60), $minutes % 60);
    }
}
