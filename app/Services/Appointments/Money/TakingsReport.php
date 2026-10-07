<?php

namespace App\Services\Appointments\Money;

use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Scopes\BrandScope;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;

/**
 * One day's takings on the venue's clock (Part E §7): money in and out at
 * the desk and through Stripe refunds made here, by method, and — for
 * reference — what this day's appointments were paid online by card.
 */
final class TakingsReport
{
    public const METHODS = ['cash', 'card_desk', 'transfer', 'other', 'online_card'];

    public static function for(int $orgId, string $date): array
    {
        $zone = VenueClock::zone($orgId);
        $from = CarbonImmutable::createFromFormat('!Y-m-d', $date, $zone);
        $to = $from->addDay();

        $rows = ServiceBookingPayment::with(['actor', 'booking'])
            ->where('created_at', '>=', $from->utc()->format('Y-m-d H:i:s'))
            ->where('created_at', '<', $to->utc()->format('Y-m-d H:i:s'))
            ->orderBy('id')->get();

        $totals = [];
        foreach ($rows as $r) {
            $cur = (string) $r->currency;
            $totals[$cur] ??= array_fill_keys(self::METHODS, ['in' => 0.0, 'out' => 0.0]);
            $side = $r->kind === 'payment' ? 'in' : 'out';
            $totals[$cur][$r->method][$side] = round($totals[$cur][$r->method][$side] + (float) $r->amount, 2);
        }

        $online = [];
        $paid = ServiceBooking::query()->withoutGlobalScope(BrandScope::class)
            ->where('start_at', '>=', $from->format('Y-m-d') . ' 00:00:00')
            ->where('start_at', '<', $to->format('Y-m-d') . ' 00:00:00')
            ->whereIn('payment_status', ['paid', 'partially_refunded', 'refunded'])->get()
            // Card money Stripe took: a card booking paid at the desk, or a booking-page deposit, is in the ledger rows above instead.
            ->filter(fn (ServiceBooking $b) => AppointmentMoney::cardPaid($b) && Deposits::of($b) === null);
        foreach ($paid as $b) {
            $cur = strtoupper((string) ($b->currency ?: 'EUR'));
            $online[$cur] = round(($online[$cur] ?? 0) + (float) $b->total_amount, 2);
        }

        return [
            'date'   => $date,
            'totals' => $totals,
            'rows'   => $rows->map(fn (ServiceBookingPayment $r) => $r->toApi() + [
                'reference' => $r->booking?->booking_reference,
                'client'    => $r->booking?->customer_name,
            ])->values()->all(),
            'online' => $online,
        ];
    }
}
