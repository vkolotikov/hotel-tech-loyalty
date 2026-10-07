<?php

namespace App\Services\Booking;

use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\ServiceBooking;
use App\Services\Appointments\Money\Deposits;
use App\Services\Portal\AppointmentClock;
use App\Services\Portal\PortalBootstrap;
use Carbon\CarbonImmutable;

/**
 * May the member cancel this booking themselves, and until when.
 *
 * One answer for the booking list, the booking sheet and the cancel
 * endpoint: the portal shows a Cancel button exactly when the endpoint
 * would accept it. A cancellation made here always returns the full
 * amount, so anything whose money is not simply "paid by the member to the
 * venue, untouched" — a refund already made, a dispute, a booking another
 * channel collects for — is the venue's to handle.
 *
 * The settings are read for the bound organisation (HotelSetting::getValue).
 */
final class CancellationPolicy
{
    public const ALREADY_CANCELLED = 'already_cancelled';
    public const NOT_CANCELLABLE = 'not_cancellable';
    public const OUTSIDE_POLICY = 'outside_policy';

    private const SERVICE_OPEN = ['pending', 'confirmed'];
    private const SERVICE_DEAD = ['cancelled', 'no_show'];
    private const STAY_OPEN = ['new', 'confirmed', 'pending_pms_sync'];
    private const STAY_DEAD = ['cancelled', 'no-show', 'no_show'];
    /** Bookings we wrote ourselves; every other channel collects and cancels for itself. */
    private const DIRECT_CHANNELS = ['Website', 'Member portal'];
    private const MONEY_TOUCHED = ['refunded', 'partially_refunded', 'disputed', 'channel_managed'];

    /** @return array{can_cancel: bool, deadline: ?CarbonImmutable, reason: ?string} */
    public static function forService(ServiceBooking $b, ?\DateTimeInterface $now = null): array
    {
        if (in_array((string) $b->status, self::SERVICE_DEAD, true)) {
            return self::no(self::ALREADY_CANCELLED);
        }
        if (!in_array((string) $b->status, self::SERVICE_OPEN, true) || !$b->start_at || in_array((string) $b->payment_status, self::MONEY_TOUCHED, true)) {
            return self::no(self::NOT_CANCELLABLE);
        }

        // A booking-page deposit booking keeps the window it was made on (Part H §5.2).
        $hours = Deposits::of($b)['cancel_hours'] ?? max(0, (int) HotelSetting::getValue('services_cancel_hours', 24));
        // start_at holds the venue's wall-clock digits: the true start is
        // those digits on the venue's clock, and "started" / the deadline are
        // measured from that moment.
        $start = AppointmentClock::toInstant($b->start_at, AppointmentClock::zoneFor((int) $b->organization_id));

        return self::until($start->subHours($hours), $now);
    }

    /** @return array{can_cancel: bool, deadline: ?CarbonImmutable, reason: ?string} */
    public static function forStay(BookingMirror $m, ?\DateTimeInterface $now = null): array
    {
        if (in_array((string) $m->internal_status, self::STAY_DEAD, true) || (string) $m->booking_state === 'cancelled') {
            return self::no(self::ALREADY_CANCELLED);
        }
        if (!in_array((string) $m->internal_status, self::STAY_OPEN, true)
            || !in_array((string) $m->channel_name, self::DIRECT_CHANNELS, true)
            || !empty($m->booking_group_id)
            || in_array((string) $m->payment_status, self::MONEY_TOUCHED, true)
            || !$m->arrival_date) {
            return self::no(self::NOT_CANCELLABLE);
        }

        ['zone' => $zone, 'check_in_time' => $defaultClock, 'hours' => $hours] = self::stayRules((int) $m->organization_id);
        $clock = self::clock($m->check_in_time) ?? $defaultClock;

        $arrival = CarbonImmutable::parse($m->arrival_date->toDateString() . ' ' . $clock . ':00', $zone);

        return self::until($arrival->subHours($hours), $now);
    }

    /** Container key of the per-request memo (a scoped instance, like AppointmentClock's). */
    private const STAY_MEMO = 'portal.cancellation_policy.stay_rules';

    /**
     * The venue's zone (AppointmentClock::zoneFor(), itself memoised), its
     * default check-in time and its cancellation hours, resolved once per
     * request and organisation — a booking list asks forStay() once per row.
     * The settings are the bound organisation's (HotelSetting::getValue), as
     * before. A test that changes these settings between two requests of one
     * test case must call `$this->app->forgetScopedInstances()` in between.
     *
     * @return array{zone: string, check_in_time: string, hours: int}
     */
    private static function stayRules(int $organizationId): array
    {
        $app = app();
        if (!$app->bound(self::STAY_MEMO)) {
            $app->scoped(self::STAY_MEMO, fn () => new \ArrayObject());
        }
        /** @var \ArrayObject<int, array{zone: string, check_in_time: string, hours: int}> $memo */
        $memo = $app->make(self::STAY_MEMO);

        if (!isset($memo[$organizationId])) {
            $memo[$organizationId] = [
                'zone'          => AppointmentClock::zoneFor($organizationId),
                'check_in_time' => PortalBootstrap::stayPolicies()['check_in_time'],
                'hours'         => max(0, (int) HotelSetting::getValue('booking_cancel_hours', 48)),
            ];
        }

        return $memo[$organizationId];
    }

    private static function until(CarbonImmutable $deadline, ?\DateTimeInterface $now): array
    {
        $now = $now ? CarbonImmutable::instance($now) : CarbonImmutable::now();

        return $now->lessThan($deadline)
            ? ['can_cancel' => true, 'deadline' => $deadline, 'reason' => null]
            : ['can_cancel' => false, 'deadline' => $deadline, 'reason' => self::OUTSIDE_POLICY];
    }

    private static function no(string $reason): array
    {
        return ['can_cancel' => false, 'deadline' => null, 'reason' => $reason];
    }

    /** The mirror's own check-in time ("15:00:00"), as "15:00"; null when it has none or it is midnight (the PMS's "not set"). */
    private static function clock(mixed $time): ?string
    {
        if (!is_string($time) || !preg_match('/^(\d{1,2}):(\d{2})/', $time, $m)) {
            return null;
        }
        $clock = sprintf('%02d:%02d', (int) $m[1], (int) $m[2]);

        return $clock === '00:00' ? null : $clock;
    }
}
