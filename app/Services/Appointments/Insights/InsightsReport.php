<?php

namespace App\Services\Appointments\Insights;

use App\Models\HotelSetting;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Models\ServiceMaster;
use App\Scopes\BrandScope;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\Portal\AppointmentClock;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * How the venue is doing over a period and the one before (Part G spec §4–§5):
 * counts by group, money per currency, rows by service and by person, and
 * where bookings come from. The whole organisation, every brand, as on
 * Takings. Counted in PHP, the same way on SQLite and on Postgres, while the
 * appointments stream past one at a time: a year of a busy venue is never
 * held in memory, and the number of queries is fixed whatever the period holds.
 */
final class InsightsReport
{
    /** Part E went live: desk payments are recorded from this venue date on. */
    public const DESK_LEDGER_SINCE = '2026-10-05';

    public const DESK_SOURCES = ['admin', 'phone', 'walk_in'];

    private const COLUMNS = [
        'id', 'organization_id', 'status', 'start_at', 'cancelled_at', 'service_id', 'service_master_id', 'source',
        'total_amount', 'currency', 'payment_status', 'stripe_payment_intent_id', 'refunded_amount', 'meta', 'created_at',
    ];

    /** @return array<string, mixed> */
    public static function for(int $orgId, InsightsPeriod $period, CarbonImmutable $now): array
    {
        $zone = AppointmentClock::zoneFor($orgId);
        $hours = max(0, (int) HotelSetting::getValue('services_cancel_hours', 24));
        $previous = $period->previous();

        $current = self::count($orgId, $period, $zone, $now, $hours);
        $before = self::count($orgId, $previous, $zone, $now, $hours);
        $services = Service::withoutGlobalScopes()->where('organization_id', $orgId)
            ->whereIn('id', array_keys($current['service_ids'] + $before['service_ids']))->pluck('name', 'id')->all();
        $people = ServiceMaster::withoutGlobalScopes()->where('organization_id', $orgId)
            ->whereIn('id', array_keys($current['person_ids'] + $before['person_ids']))->pluck('name', 'id')->all();

        return [
            'period'            => $period->toApi(),
            'previous'          => $previous->toApi(),
            // The moment the groups were worked out with, on the venue's clock (polish G5).
            'now'               => $now->setTimezone($zone)->format('Y-m-d\TH:i'),
            'cancel_hours'      => $hours,
            'desk_ledger_since' => self::DESK_LEDGER_SINCE,
            'current'           => self::finish($current, $services, $people),
            'before'            => self::finish($before, $services, $people),
        ];
    }

    private static function inPeriod(int $orgId, InsightsPeriod $period): Builder
    {
        return ServiceBooking::query()->withoutGlobalScope(BrandScope::class)
            ->where('organization_id', $orgId)
            ->where('start_at', '>=', $period->from . ' 00:00:00')
            ->where('start_at', '<', $period->dayAfter() . ' 00:00:00');
    }

    /**
     * One period in two queries: its ledger rows (a few) as a map, then its
     * appointments one at a time, each counted as it goes past.
     *
     * @return array<string, mixed>
     */
    private static function count(int $orgId, InsightsPeriod $period, string $zone, CarbonImmutable $now, int $hours): array
    {
        $ledger = ServiceBookingPayment::withoutGlobalScopes()->where('organization_id', $orgId)
            ->whereIn('service_booking_id', self::inPeriod($orgId, $period)->select('id'))
            ->orderByDesc('id')->get()->groupBy('service_booking_id');

        $c = [
            'groups'      => array_fill_keys(VisitGroup::ALL, 0),
            'money'       => [],
            'by_service'  => [],
            'by_person'   => [],
            'sources'     => ['online' => 0, 'desk' => 0, 'other' => 0],
            'service_ids' => [],
            'person_ids'  => [],
        ];

        foreach (self::inPeriod($orgId, $period)->orderBy('id')->select(self::COLUMNS)->cursor() as $b) {
            /** @var ServiceBooking $b */
            $group = VisitGroup::of(
                (string) $b->status,
                AppointmentClock::toInstant($b->start_at, $zone),
                $b->cancelled_at ? CarbonImmutable::instance($b->cancelled_at) : null,
                $now,
                $hours,
            );
            if ($group === null) {
                continue;
            }

            $c['groups'][$group]++;
            $c['sources'][self::sourceGroup($b->source)]++;

            $a = AppointmentMoney::amountsFrom($b, $ledger->get($b->id, collect()));
            $cur = (string) $a['currency'];
            $taken = round($a['paid_in'] - $a['paid_back'], 2);
            // A currency is listed for a visit done or money taken: a booked-ahead or cancelled booking in another
            // currency with nothing on it would draw an empty line in every money tile.
            if ($group === VisitGroup::DONE || $taken != 0.0) {
                $c['money'][$cur] ??= ['done' => 0, 'value_done' => 0.0, 'taken' => 0.0, 'owed_done' => 0.0];
                $c['money'][$cur]['taken'] = round($c['money'][$cur]['taken'] + $taken, 2);
            }
            if ($group === VisitGroup::DONE) {
                $c['money'][$cur]['done']++;
                $c['money'][$cur]['value_done'] = round($c['money'][$cur]['value_done'] + $a['total'], 2);
                $c['money'][$cur]['owed_done'] = round($c['money'][$cur]['owed_done'] + $a['owed'], 2);
            }

            $serviceId = $b->service_id === null ? null : (int) $b->service_id;
            $personId = $b->service_master_id === null ? null : (int) $b->service_master_id;
            if ($serviceId !== null) {
                $c['service_ids'][$serviceId] = true;
            }
            if ($personId !== null) {
                $c['person_ids'][$personId] = true;
            }
            self::tally($c['by_service'], $serviceId, $group, $cur, (float) $a['total']);
            self::tally($c['by_person'], $personId, $group, $cur, (float) $a['total']);
        }

        return $c;
    }

    /**
     * Once both periods are counted: names, the denominator, the main currency and the rows.
     *
     * @param array<string, mixed> $c
     * @param array<int, string> $services
     * @param array<int, string> $people
     * @return array<string, mixed>
     */
    private static function finish(array $c, array $services, array $people): array
    {
        $main = self::mainCurrency($c['money']);

        return [
            'groups'        => $c['groups'],
            'due'           => array_sum(array_intersect_key($c['groups'], array_flip(VisitGroup::DUE))),
            'money'         => (object) $c['money'],
            'main_currency' => $main,
            'by_service'    => self::rows($c['by_service'], $services, $main),
            'by_person'     => self::rows($c['by_person'], $people, $main),
            'sources'       => $c['sources'],
        ];
    }

    /** @param array<string, array<string, mixed>> $rows */
    private static function tally(array &$rows, ?int $id, string $group, string $cur, float $total): void
    {
        $key = $id === null ? 'none' : (string) $id;
        $rows[$key] ??= ['id' => $id, 'name' => null, 'due' => 0, 'done' => 0, 'no_show' => 0, 'late_cancel' => 0, 'value_done' => []];
        if (in_array($group, VisitGroup::DUE, true)) {
            $rows[$key]['due']++;
        }
        if (in_array($group, [VisitGroup::DONE, VisitGroup::NO_SHOW, VisitGroup::LATE_CANCEL], true)) {
            $rows[$key][$group]++;
        }
        if ($group === VisitGroup::DONE) {
            $rows[$key]['value_done'][$cur] = round(($rows[$key]['value_done'][$cur] ?? 0) + $total, 2);
        }
    }

    /**
     * Rows with bookings due, named, by value in the main currency, then bookings due, then name.
     *
     * @param array<string, array<string, mixed>> $rows
     * @param array<int, string> $names
     * @return list<array<string, mixed>>
     */
    private static function rows(array $rows, array $names, ?string $main): array
    {
        $kept = [];
        foreach ($rows as $r) {
            if ($r['due'] === 0) {
                continue;
            }
            $r['name'] = $r['id'] === null ? null : ($names[$r['id']] ?? null);
            $kept[] = $r;
        }
        // No main currency when nothing was done: a null array offset is deprecated in PHP 8.5 (polish G4).
        $value = fn (array $r) => $main === null ? 0 : ($r['value_done'][$main] ?? 0);
        usort($kept, fn (array $x, array $y) => [$value($y), $y['due'], (string) $x['name']] <=> [$value($x), $x['due'], (string) $y['name']]);

        return array_map(function (array $r) {
            ksort($r['value_done']);
            $r['value_done'] = (object) $r['value_done'];

            return $r;
        }, $kept);
    }

    /** The currency with the most visits done (ties: alphabetical); null when nothing was done. */
    private static function mainCurrency(array $money): ?string
    {
        $done = array_filter(array_map(fn (array $m) => $m['done'], $money));
        if ($done === []) {
            return null;
        }
        ksort($done);
        arsort($done);

        return (string) array_key_first($done);
    }

    private static function sourceGroup(?string $source): string
    {
        $s = strtolower(trim((string) $source));

        return $s === '' ? 'other' : (in_array($s, self::DESK_SOURCES, true) ? 'desk' : 'online');
    }
}
