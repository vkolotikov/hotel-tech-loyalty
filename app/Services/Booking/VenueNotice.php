<?php

namespace App\Services\Booking;

use App\Services\Portal\AppointmentClock;
use Carbon\CarbonImmutable;

/**
 * A booking's notice ("not sooner than N minutes from now") on the venue's
 * own clock. The scheduler's own lead filter compares a slot's wall-clock
 * digits with the true UTC now; callers switch it off with
 * SCHEDULER_LEAD_OFF and filter here, as the member portal already does.
 */
final class VenueNotice
{
    /** Two days back: further than any venue's UTC offset can move a slot (the portal's value). */
    public const SCHEDULER_LEAD_OFF = -2 * 24 * 60;

    /**
     * The slots whose true start is at least $leadMinutes from now and which
     * exist on the venue's clock (not the hour a daylight-saving change
     * skips). Each slot comes back exactly as the scheduler made it.
     */
    public static function filter(array $slots, int $orgId, int $leadMinutes): array
    {
        $zone = AppointmentClock::zoneFor($orgId);
        $earliest = CarbonImmutable::now()->addMinutes($leadMinutes);

        return array_values(array_filter($slots, fn (array $slot) => AppointmentClock::existsLocally($slot['start'], $zone)
            && !AppointmentClock::toInstant($slot['start'], $zone)->lessThan($earliest)));
    }

    /** A stored start (the venue's wall-clock digits) → the true instant. */
    public static function instant(\DateTimeInterface|string $stored, int $orgId): CarbonImmutable
    {
        return AppointmentClock::toInstant($stored, AppointmentClock::zoneFor($orgId));
    }
}
