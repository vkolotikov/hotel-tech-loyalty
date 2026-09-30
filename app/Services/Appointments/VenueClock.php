<?php

namespace App\Services\Appointments;

use App\Services\Portal\AppointmentClock;
use Carbon\CarbonImmutable;

/**
 * Time for the appointments workspace.
 *
 * `service_bookings.start_at` / `end_at` hold the VENUE's wall clock in a
 * column without a zone, and the scheduler works in those digits. The
 * workspace never converts them: it prints them as `YYYY-MM-DDTHH:mm` with
 * no offset, and takes the same form back. The venue's zone is needed for
 * two things only — what "now" and "today" are at the venue, and whether a
 * wall-clock time exists there (a daylight-saving change skips an hour).
 */
final class VenueClock
{
    public const WALL = 'Y-m-d\TH:i';

    public static function zone(int $orgId): string
    {
        return AppointmentClock::zoneFor($orgId);
    }

    /** False when neither Settings nor the organisation names a zone other than UTC. */
    public static function isNamed(int $orgId): bool
    {
        return self::zone($orgId) !== 'UTC';
    }

    /** The venue's current wall clock, labelled UTC so it compares with stored digits. */
    public static function now(int $orgId): CarbonImmutable
    {
        $digits = CarbonImmutable::now(self::zone($orgId))->format('Y-m-d H:i:s');

        return CarbonImmutable::createFromFormat('!Y-m-d H:i:s', $digits, 'UTC');
    }

    /** The venue's date today, `Y-m-d`. */
    public static function today(int $orgId): string
    {
        return self::now($orgId)->format('Y-m-d');
    }

    /** Stored digits → `2026-10-06T10:00`. Any offset the value carries is ignored, never applied. */
    public static function wall(\DateTimeInterface|string|null $stored): ?string
    {
        if ($stored === null || $stored === '') {
            return null;
        }
        if ($stored instanceof \DateTimeInterface) {
            return $stored->format(self::WALL);
        }
        if (preg_match('/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/', trim($stored), $m)) {
            return $m[1] . 'T' . $m[2];
        }

        return CarbonImmutable::parse($stored)->format(self::WALL);
    }

    /** `2026-10-06T10:00` → the stored digits; null for anything else, including a date that does not exist. */
    public static function parse(string $wall): ?CarbonImmutable
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $wall)) {
            return null;
        }
        try {
            $parsed = CarbonImmutable::createFromFormat('!' . self::WALL, $wall, 'UTC');
        } catch (\Throwable) {
            return null;
        }

        // 31 February and 25:00 roll over instead of failing; the round trip catches both.
        return $parsed && $parsed->format(self::WALL) === $wall ? $parsed : null;
    }

    /** False for a time the venue's clock skips. */
    public static function exists(CarbonImmutable $wall, int $orgId): bool
    {
        return AppointmentClock::existsLocally($wall, self::zone($orgId));
    }
}
