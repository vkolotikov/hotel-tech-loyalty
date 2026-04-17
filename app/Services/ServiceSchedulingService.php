<?php

namespace App\Services;

use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use App\Models\ServiceMasterSchedule;
use App\Models\ServiceMasterTimeOff;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Generates available booking slots from master weekly schedules
 * minus existing bookings, time-off, and required buffer.
 */
class ServiceSchedulingService
{
    /**
     * Default slot granularity in minutes. Can be overridden per-org via settings.
     */
    public function defaultSlotStep(): int
    {
        return 15;
    }

    /**
     * Compute the effective duration (service + buffer) for the given service/master pair.
     */
    public function effectiveDuration(Service $service, ?ServiceMaster $master): int
    {
        $duration = (int) $service->duration_minutes;

        if ($master) {
            $pivot = $master->services()->where('services.id', $service->id)->first()?->pivot;
            if ($pivot && $pivot->duration_override_minutes) {
                $duration = (int) $pivot->duration_override_minutes;
            }
        }

        return $duration + (int) ($service->buffer_after_minutes ?? 0);
    }

    /**
     * Compute the effective price for the given service/master pair.
     */
    public function effectivePrice(Service $service, ?ServiceMaster $master): float
    {
        if ($master) {
            $pivot = $master->services()->where('services.id', $service->id)->first()?->pivot;
            if ($pivot && $pivot->price_override !== null) {
                return (float) $pivot->price_override;
            }
        }
        return (float) $service->price;
    }

    /**
     * Returns available slots (start times) for a service on a given date.
     *
     * If $masterId is null, slots are aggregated across all masters that perform
     * the service — a slot is "available" if at least one master can take it.
     *
     * Each slot in the result has: start (ISO8601), end (ISO8601), masters (list of IDs that can take it).
     */
    public function availableSlots(
        Service $service,
        string $date,
        ?int $masterId = null,
        ?int $stepMinutes = null,
        int $leadMinutes = 60,
    ): array {
        $step = $stepMinutes ?: $this->defaultSlotStep();
        $day = CarbonImmutable::parse($date)->startOfDay();
        $now = CarbonImmutable::now();
        $earliest = $now->addMinutes($leadMinutes);

        $masters = $this->mastersForService($service, $masterId);
        if ($masters->isEmpty()) return [];

        $slotMap = []; // key: start-iso → ['start','end','duration_minutes','masters' => [ids...]]

        foreach ($masters as $master) {
            $effDuration = $this->effectiveDuration($service, $master);
            $windows = $this->workingWindowsForDate($master, $day);
            if (empty($windows)) continue;

            // Pre-load conflicting bookings for this master on this day
            $existing = ServiceBooking::where('service_master_id', $master->id)
                ->whereIn('status', ['pending', 'confirmed', 'in_progress'])
                ->whereDate('start_at', $day->toDateString())
                ->orderBy('start_at')
                ->get(['start_at', 'end_at']);

            foreach ($windows as $window) {
                /** @var CarbonImmutable $winStart */
                $winStart = $window['start'];
                /** @var CarbonImmutable $winEnd */
                $winEnd = $window['end'];

                $cursor = $winStart;
                while ($cursor->copy()->addMinutes($effDuration)->lte($winEnd)) {
                    $slotEnd = $cursor->copy()->addMinutes($effDuration);

                    if ($cursor->lt($earliest)) {
                        $cursor = $cursor->addMinutes($step);
                        continue;
                    }

                    $conflict = $existing->first(function ($b) use ($cursor, $slotEnd) {
                        $bs = Carbon::parse($b->start_at);
                        $be = Carbon::parse($b->end_at);
                        return $cursor->lt($be) && $slotEnd->gt($bs);
                    });

                    if (!$conflict) {
                        $key = $cursor->toIso8601String();
                        if (!isset($slotMap[$key])) {
                            $slotMap[$key] = [
                                'start'            => $key,
                                'end'              => $slotEnd->toIso8601String(),
                                'duration_minutes' => $effDuration,
                                'time_label'       => $cursor->format('H:i'),
                                'masters'          => [],
                            ];
                        }
                        $slotMap[$key]['masters'][] = $master->id;
                    }

                    $cursor = $cursor->addMinutes($step);
                }
            }
        }

        ksort($slotMap);
        return array_values($slotMap);
    }

    /**
     * Returns dates in [start, end] that have at least one available slot.
     * Used for the public widget calendar to grey out fully-booked / closed days.
     */
    public function availableDates(Service $service, string $start, string $end, ?int $masterId = null): array
    {
        $startDate = CarbonImmutable::parse($start)->startOfDay();
        $endDate = CarbonImmutable::parse($end)->startOfDay();
        $masters = $this->mastersForService($service, $masterId);
        if ($masters->isEmpty()) return [];

        $available = [];
        $cursor = $startDate;
        while ($cursor->lte($endDate)) {
            foreach ($masters as $master) {
                if (!empty($this->workingWindowsForDate($master, $cursor))) {
                    $available[] = $cursor->toDateString();
                    break;
                }
            }
            $cursor = $cursor->addDay();
        }

        return $available;
    }

    /**
     * Throws if the requested slot is no longer available (used during confirm).
     * If masterId is null, picks the first master that can take it.
     */
    public function reserveSlot(Service $service, ?int $masterId, string $startAt): array
    {
        $start = CarbonImmutable::parse($startAt);
        $masters = $this->mastersForService($service, $masterId);

        foreach ($masters as $master) {
            $effDuration = $this->effectiveDuration($service, $master);
            $end = $start->copy()->addMinutes($effDuration);

            $windows = $this->workingWindowsForDate($master, $start->startOfDay());
            $insideWindow = false;
            foreach ($windows as $window) {
                if ($start->gte($window['start']) && $end->lte($window['end'])) {
                    $insideWindow = true;
                    break;
                }
            }
            if (!$insideWindow) continue;

            $conflict = ServiceBooking::where('service_master_id', $master->id)
                ->whereIn('status', ['pending', 'confirmed', 'in_progress'])
                ->where('start_at', '<', $end)
                ->where('end_at', '>', $start)
                ->exists();

            if (!$conflict) {
                return [
                    'master'           => $master,
                    'start'            => $start,
                    'end'              => $end,
                    'duration_minutes' => $effDuration,
                    'price'            => $this->effectivePrice($service, $master),
                ];
            }
        }

        throw new \RuntimeException('This time slot is no longer available. Please choose another.');
    }

    // ─── Internals ────────────────────────────────────────────────────────────

    /**
     * Returns active masters that perform the service.
     * If $masterId is provided, returns only that master (or empty if not assigned).
     */
    private function mastersForService(Service $service, ?int $masterId): Collection
    {
        $query = $service->masters()->where('service_masters.is_active', true);
        if ($masterId) {
            $query->where('service_masters.id', $masterId);
        }
        return $query->get();
    }

    /**
     * Returns working windows (start/end CarbonImmutable) for a master on a date,
     * applying the recurring weekly schedule then subtracting time-off ranges.
     */
    private function workingWindowsForDate(ServiceMaster $master, CarbonImmutable $date): array
    {
        $dow = (int) $date->dayOfWeek; // 0=Sunday in Carbon

        $schedules = ServiceMasterSchedule::where('service_master_id', $master->id)
            ->where('day_of_week', $dow)
            ->where('is_active', true)
            ->get();

        if ($schedules->isEmpty()) return [];

        $windows = [];
        foreach ($schedules as $sch) {
            $start = $date->setTimeFromTimeString((string) $sch->start_time);
            $end = $date->setTimeFromTimeString((string) $sch->end_time);
            if ($end->lte($start)) continue;
            $windows[] = ['start' => $start, 'end' => $end];
        }

        // Subtract time-off
        $timeOff = ServiceMasterTimeOff::where('service_master_id', $master->id)
            ->whereDate('date', $date->toDateString())
            ->get();

        foreach ($timeOff as $off) {
            // Full day off
            if (!$off->start_time && !$off->end_time) {
                return [];
            }
            $offStart = $date->setTimeFromTimeString((string) $off->start_time);
            $offEnd = $off->end_time
                ? $date->setTimeFromTimeString((string) $off->end_time)
                : $date->endOfDay();

            $windows = $this->subtractRange($windows, $offStart, $offEnd);
        }

        return $windows;
    }

    /**
     * Subtract a [start,end] range from a list of windows, returning the remainder.
     */
    private function subtractRange(array $windows, CarbonImmutable $cutStart, CarbonImmutable $cutEnd): array
    {
        $out = [];
        foreach ($windows as $w) {
            $ws = $w['start'];
            $we = $w['end'];

            if ($cutEnd->lte($ws) || $cutStart->gte($we)) {
                $out[] = $w;
                continue;
            }
            if ($cutStart->gt($ws)) {
                $out[] = ['start' => $ws, 'end' => $cutStart];
            }
            if ($cutEnd->lt($we)) {
                $out[] = ['start' => $cutEnd, 'end' => $we];
            }
        }
        return $out;
    }
}
