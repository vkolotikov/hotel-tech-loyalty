<?php

namespace App\Services\Appointments\Insights;

use Carbon\CarbonImmutable;

/**
 * The one group an appointment falls into for Insights (Part G spec §4.2), by
 * what it is now. Pure. Every time is an instant: the start on the venue's
 * clock, the moment it was cancelled, now. A clock change therefore moves
 * nothing, and the window is counted in real hours.
 */
final class VisitGroup
{
    public const DONE = 'done';
    public const NO_SHOW = 'no_show';
    public const UNMARKED = 'unmarked';
    public const LATE_CANCEL = 'late_cancel';
    public const EARLY_CANCEL = 'early_cancel';
    public const AHEAD = 'ahead';

    public const ALL = [self::DONE, self::NO_SHOW, self::UNMARKED, self::LATE_CANCEL, self::EARLY_CANCEL, self::AHEAD];

    /** The appointments the venue had to keep time for: every rate is out of these (spec §4.3). */
    public const DUE = [self::DONE, self::NO_SHOW, self::UNMARKED, self::LATE_CANCEL];

    private const LIVE = ['pending', 'confirmed', 'in_progress'];

    public static function of(string $status, CarbonImmutable $start, ?CarbonImmutable $cancelledAt, CarbonImmutable $now, int $cancelHours): ?string
    {
        if (in_array($status, self::LIVE, true)) {
            return $start->greaterThan($now) ? self::AHEAD : self::UNMARKED;
        }

        return match ($status) {
            'completed' => self::DONE,
            'no_show'   => self::NO_SHOW,
            // Late once the free-cancellation deadline had passed; a cancellation with no time recorded blames no one.
            'cancelled' => $cancelledAt !== null && $cancelledAt->greaterThan($start->utc()->subHours(max(0, $cancelHours)))
                ? self::LATE_CANCEL
                : self::EARLY_CANCEL,
            default     => null,
        };
    }
}
