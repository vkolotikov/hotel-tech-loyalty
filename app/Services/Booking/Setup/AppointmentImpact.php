<?php

namespace App\Services\Booking\Setup;

use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use App\Scopes\BrandScope;
use App\Services\Appointments\VenueClock;
use Illuminate\Database\Eloquent\Builder;

/**
 * The upcoming appointments a setup change would leave outside the person's
 * hours (owner decision 2026-10-01: warn, list, still allow). "Upcoming" is
 * from the venue's own "now" on, pending, confirmed or in progress, in every
 * brand. Times compare as stored: the venue's wall-clock digits.
 */
final class AppointmentImpact
{
    public const LIST_LIMIT = 50;

    private const ACTIVE = ['pending', 'confirmed', 'in_progress'];

    /** @param list<array{day_of_week:int, start_time:string, end_time:string, is_active:bool}> $week */
    public function forWeek(ServiceMaster $master, array $week): array
    {
        $byDay = WeeklyHours::windowsByDay($week);

        return $this->collect($this->upcoming()->where('service_master_id', $master->id), function (ServiceBooking $b) use ($byDay) {
            [$day, $start, $end] = self::span($b);
            foreach ($byDay[$day] ?? [] as [$from, $to]) {
                if ($start >= $from && $end <= $to) {
                    return false;
                }
            }

            return true;
        });
    }

    /** @param list<array{date:string, start_time:?string, end_time:?string}> $entries */
    public function forTimeOff(ServiceMaster $master, array $entries): array
    {
        return $this->collect($this->upcoming()->where('service_master_id', $master->id), function (ServiceBooking $b) use ($entries) {
            $date = substr((string) VenueClock::wall($b->start_at), 0, 10);
            [, $start, $end] = self::span($b);
            foreach ($entries as $entry) {
                if ($entry['date'] !== $date) {
                    continue;
                }
                $from = $entry['start_time'] === null ? 0 : WeeklyHours::minutesOf($entry['start_time']);
                $to = $entry['end_time'] === null ? 1440 : WeeklyHours::minutesOf($entry['end_time']);
                if ($start < $to && $end > $from) {
                    return true;
                }
            }

            return false;
        });
    }

    public function forMaster(ServiceMaster $master): array
    {
        return $this->collect($this->upcoming()->where('service_master_id', $master->id), fn () => true);
    }

    public function forService(Service $service): array
    {
        return $this->collect($this->upcoming()->where('service_id', $service->id), fn () => true);
    }

    public function forMasterService(ServiceMaster $master, int $serviceId): array
    {
        return $this->collect($this->upcoming()->where('service_master_id', $master->id)->where('service_id', $serviceId), fn () => true);
    }

    /** @return array{affected: list<array<string, mixed>>, total: int} */
    public static function none(): array
    {
        return ['affected' => [], 'total' => 0];
    }

    /** Two disjoint sets (different people, or different services of one person) as one answer. */
    public static function merge(array $a, array $b): array
    {
        $affected = array_merge($a['affected'], $b['affected']);
        usort($affected, fn ($x, $y) => strcmp($x['start'], $y['start']));

        return ['affected' => array_slice($affected, 0, self::LIST_LIMIT), 'total' => $a['total'] + $b['total']];
    }

    private function upcoming(): Builder
    {
        $orgId = (int) app('current_organization_id');

        return ServiceBooking::query()
            ->withoutGlobalScope(BrandScope::class)
            ->with(['service:id,name', 'master:id,name'])
            ->whereIn('status', self::ACTIVE)
            ->where('start_at', '>=', VenueClock::now($orgId)->format('Y-m-d H:i:s'))
            ->orderBy('start_at');
    }

    /** @return array{affected: list<array<string, mixed>>, total: int} */
    private function collect(Builder $query, callable $stranded): array
    {
        $hits = $query->get()->filter($stranded)->values();

        return [
            'affected' => $hits->take(self::LIST_LIMIT)->map(fn (ServiceBooking $b) => [
                'id'          => (int) $b->id,
                'start'       => VenueClock::wall($b->start_at),
                'end'         => VenueClock::wall($b->end_at),
                'client'      => (string) $b->customer_name,
                'service'     => $b->service?->name,
                'team_member' => $b->master?->name,
            ])->all(),
            'total' => $hits->count(),
        ];
    }

    /** @return array{0:int, 1:int, 2:int} weekday (0 = Sunday), start and end in minutes of the start's day */
    private static function span(ServiceBooking $b): array
    {
        $start = VenueClock::parse((string) VenueClock::wall($b->start_at));
        $end = VenueClock::parse((string) VenueClock::wall($b->end_at));
        $from = $start->hour * 60 + $start->minute;

        return [(int) $start->dayOfWeek, $from, $from + intdiv($end->getTimestamp() - $start->getTimestamp(), 60)];
    }
}
