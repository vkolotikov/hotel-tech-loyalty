<?php

namespace App\Services\Booking\Setup;

use App\Models\ServiceMaster;
use App\Models\ServiceMasterTimeOff;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Time off entered as a range and stored the way the scheduler reads it: one
 * row per day, all day (no times) or the same from–to on every day. A day
 * that already has an all-day entry for the person is skipped — they are off
 * anyway — so a range never doubles it.
 */
final class TimeOffSetup
{
    public const MAX_RANGE_DAYS = 366;

    public static function rules(): array
    {
        return [
            'from'       => 'required|date_format:Y-m-d',
            'to'         => 'nullable|date_format:Y-m-d|after_or_equal:from',
            'start_time' => 'nullable|required_with:end_time|date_format:H:i',
            'end_time'   => 'nullable|required_with:start_time|date_format:H:i|after:start_time',
            'reason'     => 'nullable|string|max:200',
        ];
    }

    /** @return list<array{date:string, start_time:?string, end_time:?string}> */
    public static function plan(ServiceMaster $master, array $data): array
    {
        $from = CarbonImmutable::createFromFormat('!Y-m-d', $data['from'], 'UTC');
        $to = CarbonImmutable::createFromFormat('!Y-m-d', $data['to'] ?? $data['from'], 'UTC');
        if ($from->diffInDays($to) > self::MAX_RANGE_DAYS) {
            throw ValidationException::withMessages(['to' => ['Time off can cover at most a year at a time.']]);
        }

        $offAllDay = ServiceMasterTimeOff::where('service_master_id', $master->id)
            ->whereNull('start_time')->whereNull('end_time')
            ->whereDate('date', '>=', $from->toDateString())
            ->whereDate('date', '<=', $to->toDateString())
            ->pluck('date')
            ->map(fn ($date) => substr((string) $date, 0, 10))
            ->all();

        $start = isset($data['start_time']) ? $data['start_time'] . ':00' : null;
        $end = isset($data['end_time']) ? $data['end_time'] . ':00' : null;
        $rows = [];
        for ($day = $from; $day->lte($to); $day = $day->addDay()) {
            if (!in_array($day->toDateString(), $offAllDay, true)) {
                $rows[] = ['date' => $day->toDateString(), 'start_time' => $start, 'end_time' => $end];
            }
        }

        return $rows;
    }

    /** @param list<array{date:string, start_time:?string, end_time:?string}> $rows */
    public static function add(ServiceMaster $master, array $rows, ?string $reason): Collection
    {
        return collect($rows)->map(fn (array $row) => ServiceMasterTimeOff::create($row + [
            'service_master_id' => $master->id,
            'reason'            => $reason,
        ]));
    }
}
