<?php

namespace App\Services\Booking;

use App\Models\Service;
use App\Models\ServiceExtra;
use App\Services\ServiceSchedulingService;
use Carbon\CarbonImmutable;

/**
 * The list price of a service booking before any member discount: the
 * scheduler's reservation check (master, duration, price override) plus
 * the extras with their per-person maths and lead-time guard. The widget
 * and the portal both price through here so they can never disagree.
 *
 * Deliberately not `final`: the portal controller's tests need a
 * ServiceQuoteBuilder double bound in the container to prove that a
 * failure unrelated to slot availability is not reported as one, and
 * Mockery cannot mock a final class under a type-hinted parameter.
 */
class ServiceQuoteBuilder
{
    public function __construct(private readonly ServiceSchedulingService $scheduler)
    {
    }

    /**
     * @param array<int, array{id:int, quantity?:int}> $extras
     * @return array{master:\App\Models\ServiceMaster, start:CarbonImmutable, end:CarbonImmutable, duration_minutes:int, service_price:float, extras:array, extras_total:float, list_total:float, currency:string}
     * @throws SlotTakenException  the slot is taken (scheduler's own message);
     *                              a \PDOException from reserveSlot() (a real
     *                              database failure, not a taken slot) is
     *                              re-thrown as itself, never wrapped
     * @throws ExtraLeadTimeException
     */
    public function build(Service $service, ?int $masterId, string $startAt, int $partySize = 1, array $extras = []): array
    {
        try {
            $slot = $this->scheduler->reserveSlot($service, $masterId, $startAt);
        } catch (\RuntimeException $e) {
            if ($e instanceof \PDOException) {
                throw $e;
            }
            throw new SlotTakenException($e->getMessage(), 0, $e);
        }
        $start = CarbonImmutable::parse($slot['start']);
        $lines = $this->extraLines($extras, $partySize, $start);
        $extrasTotal = round((float) array_sum(array_column($lines, 'line_total')), 2);
        $servicePrice = round((float) $slot['price'], 2);

        return [
            'master'           => $slot['master'],
            'start'            => $start,
            'end'              => CarbonImmutable::parse($slot['end']),
            'duration_minutes' => (int) $slot['duration_minutes'],
            'service_price'    => $servicePrice,
            'extras'           => $lines,
            'extras_total'     => $extrasTotal,
            'list_total'       => round($servicePrice + $extrasTotal, 2),
            'currency'         => $service->currency ?: 'EUR',
        ];
    }

    /**
     * @param array<int, array{id:int, quantity?:int}> $extras
     * @return array<int, array{id:int, name:string, unit_price:float, quantity:int, line_total:float}>
     */
    private function extraLines(array $extras, int $partySize, CarbonImmutable $start): array
    {
        if ($extras === []) {
            return [];
        }

        $ids = array_map(fn ($e) => (int) $e['id'], $extras);
        $rows = ServiceExtra::whereIn('id', $ids)->where('is_active', true)->get()->keyBy('id');

        $lines = [];
        foreach ($extras as $e) {
            $row = $rows->get((int) $e['id']);
            if (!$row) {
                continue;
            }

            if ($row->lead_time_hours && $start->lessThan(CarbonImmutable::now()->addHours((int) $row->lead_time_hours))) {
                throw new ExtraLeadTimeException("\"{$row->name}\" requires at least {$row->lead_time_hours}h notice. Please remove it or pick a later slot.");
            }

            $qty = max(1, (int) ($e['quantity'] ?? 1));
            $units = $row->price_type === 'per_person' ? $qty * max(1, $partySize) : $qty;
            $lines[] = [
                'id'         => $row->id,
                'name'       => $row->name,
                'unit_price' => round((float) $row->price, 2),
                'quantity'   => $qty,
                'line_total' => round((float) $row->price * $units, 2),
            ];
        }

        return $lines;
    }
}
