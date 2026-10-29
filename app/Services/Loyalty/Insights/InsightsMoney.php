<?php

namespace App\Services\Loyalty\Insights;

use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\Organization;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Scopes\BrandScope;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\Appointments\VenueClock;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Support\Collection;

/**
 * The money members bring (release 4 part E): paid stays and paid appointments booked by members in the period, in
 * the venue's currency (PortalBootstrap::currency(), what the bootstrap and the portal show), per bucket of the
 * Insights period, and beside it what every booking of the period brought, so the members' share can be read.
 *
 * Definitions (pinned by tests/Feature/LoyaltyWorkspace/InsightsMoneyTest.php):
 *  - Booked in the period: when the booking was made, on the venue's clock — a stay's `source_created_at` (the
 *    channel's own time) else `created_at`, an appointment's `created_at`. Not the day of the visit.
 *  - A member's booking: it names a member of this organisation (`member_id`), or its guest is linked to one
 *    (`guests.member_id`) — the two links staff see. A booking that only shares a member's email is not counted.
 *  - Paid, a stay: what was paid less what went back (`price_paid` − `refunded_amount`), when above zero; a mock-mode
 *    stay is test data and never counts. Its currency is the booking snapshot, falling back to `booking_currency`
 *    only for legacy rows without a snapshot.
 *  - Paid, an appointment: what was taken less what went back, AppointmentMoney's own figures (online, at the desk,
 *    deposits), as the Appointments Insights' "taken"; when above zero. Its currency is its own.
 *  - In the venue's currency only: a paid booking in another currency is counted in `other_currency` and added
 *    nowhere (amounts are never converted).
 *  - Every brand of the organisation, only this organisation. Stays are read through the Smoobu scope as staff read
 *    them (a venue that switched Smoobu off sees none here, as on its booking screens).
 *
 * Portable SQL: the rows of the period stream past one at a time (`cursor()`), each placed in its bucket in PHP, as
 * LoyaltyInsights does; who booked is an EXISTS on the row, never a list of member ids. Amounts are summed in cents.
 */
final class InsightsMoney
{
    private const SERVICE_COLUMNS = [
        'id', 'organization_id', 'status', 'start_at', 'cancelled_at', 'total_amount', 'currency', 'payment_status',
        'stripe_payment_intent_id', 'refunded_amount', 'meta', 'created_at',
    ];

    /** @return array<string, mixed> */
    public static function for(int $orgId, string $choice, ?InsightsPeriod $reportPeriod = null, ?int $tierId = null): array
    {
        $zone = VenueClock::zone($orgId);
        $period = $reportPeriod ?? InsightsPeriod::of($choice, VenueClock::today($orgId), $zone);
        $org = Organization::withoutGlobalScopes()->findOrFail($orgId);
        $currency = PortalBootstrap::currency($org);

        $c = [
            'stays'    => $period->zeros(),
            'services' => $period->zeros(),
            'counts'   => ['stays' => 0, 'services' => 0],
            'all'      => 0,
            'other'    => 0,
        ];
        self::stays($orgId, $period, $currency, $c, $tierId);
        self::services($orgId, $period, $currency, $c, $tierId);

        $stays = array_sum($c['stays']);
        $services = array_sum($c['services']);
        $members = $stays + $services;

        return [
            'period'         => $period->choice,
            'bucket'         => $period->bucket,
            'from'           => $period->from,
            'to'             => $period->to,
            'timezone'       => $zone,
            'currency'       => $currency,
            'members'        => [
                'stays'    => ['bookings' => $c['counts']['stays'], 'amount' => self::money($stays)],
                'services' => ['bookings' => $c['counts']['services'], 'amount' => self::money($services)],
                'total'    => self::money($members),
            ],
            'all'            => ['total' => self::money($c['all'])],
            'share'          => $c['all'] > 0 ? round($members / $c['all'] * 100, 1) : null,
            'other_currency' => ['bookings' => $c['other']],
            'series'         => array_map(fn (string $key, int $i) => [
                'key' => $key, 'stays' => self::money($c['stays'][$i]), 'services' => self::money($c['services'][$i]),
            ], $period->keys, array_keys($period->keys)),
        ];
    }

    /** @param array<string, mixed> $c */
    private static function stays(int $orgId, InsightsPeriod $period, string $currency, array &$c, ?int $tierId = null): void
    {
        $stayCurrency = strtoupper((string) HotelSetting::getValue('booking_currency', 'EUR'));
        $booked = 'COALESCE(booking_mirror.source_created_at, booking_mirror.created_at)';
        $paid = 'COALESCE(booking_mirror.price_paid, 0) - COALESCE(booking_mirror.refunded_amount, 0)';

        $rows = BookingMirror::query()
            ->where('booking_mirror.organization_id', $orgId)
            ->whereRaw("{$booked} >= ? AND {$booked} < ?", [$period->startUtc(), $period->endUtc()])
            ->whereRaw("{$paid} > 0")
            ->whereRaw("COALESCE(booking_mirror.payment_method, '') <> 'mock'")
            ->addSelect('booking_mirror.raw_json')
            ->selectRaw("{$booked} AS booked_at, {$paid} AS paid, CASE WHEN " . self::byMember('booking_mirror', $tierId) . ' THEN 1 ELSE 0 END AS by_member', [$orgId, $orgId, $orgId])
            ->toBase()->cursor();

        foreach ($rows as $row) {
            $i = $period->indexOf((string) $row->booked_at);
            if ($i === null) {
                continue;
            }
            $snapshot = json_decode((string) ($row->raw_json ?? ''), true);
            $bookedCurrency = strtoupper(trim((string) ($snapshot['currency'] ?? ''))) ?: $stayCurrency;
            self::add($c, 'stays', $i, $bookedCurrency === $currency, (int) $row->by_member === 1, self::cents($row->paid));
        }
    }

    /** @param array<string, mixed> $c */
    private static function services(int $orgId, InsightsPeriod $period, string $currency, array &$c, ?int $tierId = null): void
    {
        $inPeriod = fn () => ServiceBooking::query()->withoutGlobalScope(BrandScope::class)
            ->where('service_bookings.organization_id', $orgId)
            ->where('service_bookings.created_at', '>=', $period->startUtc())
            ->where('service_bookings.created_at', '<', $period->endUtc());

        /** @var Collection<int, Collection<int, ServiceBookingPayment>> $ledger */
        $ledger = ServiceBookingPayment::withoutGlobalScopes()->where('organization_id', $orgId)
            ->whereIn('service_booking_id', $inPeriod()->select('service_bookings.id'))
            ->orderByDesc('id')->get()->groupBy('service_booking_id');

        $rows = $inPeriod()->orderBy('service_bookings.id')
            ->select(array_map(fn (string $col) => "service_bookings.{$col}", self::SERVICE_COLUMNS))
            ->selectRaw('CASE WHEN ' . self::byMember('service_bookings', $tierId) . ' THEN 1 ELSE 0 END AS by_member', [$orgId, $orgId, $orgId])
            ->cursor();

        foreach ($rows as $b) {
            /** @var ServiceBooking $b */
            $i = $period->indexOf($b->getRawOriginal('created_at'));
            if ($i === null) {
                continue;
            }
            $a = AppointmentMoney::amountsFrom($b, $ledger->get($b->id, collect()));
            $taken = self::cents($a['paid_in'] - $a['paid_back']);
            self::add($c, 'services', $i, strtoupper((string) $a['currency']) === $currency, (int) $b->getAttribute('by_member') === 1, $taken);
        }
    }

    /** One paid booking: into the members' figures and the whole, in the venue's currency; else counted apart. */
    private static function add(array &$c, string $kind, int $bucket, bool $sameCurrency, bool $byMember, int $cents): void
    {
        if ($cents <= 0) {
            return;
        }
        if (!$sameCurrency) {
            $c['other'] += $byMember ? 1 : 0;

            return;
        }
        $c['all'] += $cents;
        if ($byMember) {
            $c[$kind][$bucket] += $cents;
            $c['counts'][$kind]++;
        }
    }

    /**
     * The row names a member of this organisation, or its guest is linked to one (three bindings: the organisation).
     */
    private static function byMember(string $table, ?int $tierId = null): string
    {
        // An integer from the validated, tenant-owned tier selection; bindings above remain the three tenant IDs.
        $direct = $tierId === null ? '' : ' AND bm.tier_id = ' . (int) $tierId;
        $guest = $tierId === null ? '' : ' AND bgm.tier_id = ' . (int) $tierId;
        return "(EXISTS (SELECT 1 FROM loyalty_members bm WHERE bm.id = {$table}.member_id AND bm.organization_id = ?{$direct})"
            . " OR EXISTS (SELECT 1 FROM guests bg JOIN loyalty_members bgm ON bgm.id = bg.member_id"
            . " WHERE bg.id = {$table}.guest_id AND bg.organization_id = ? AND bgm.organization_id = ?{$guest}))";
    }

    private static function cents(mixed $amount): int
    {
        return (int) round((float) $amount * 100);
    }

    private static function money(int $cents): float
    {
        return round($cents / 100, 2);
    }
}
