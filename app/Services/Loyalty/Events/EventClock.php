<?php

namespace App\Services\Loyalty\Events;

use App\Models\LoyaltyEvent;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;

/**
 * Time for events (release 8, spec 2026-10-25 §4). `starts_at` and `ends_at` are the venue's wall clock, stored as
 * written in columns without a zone and never converted — as appointment times (VenueClock). They are compared, as
 * digits, with the venue's own "now" (VenueClock::now(), the venue's digits labelled UTC), in PHP and in SQL alike.
 *
 * Where an event is in its life, for the screens (`phase`): `draft`, `cancelled`, or for a published one `upcoming`
 * (not started), `on_now` (started, not ended) and `ended`. When check-in opens is AccessDecision's alone.
 */
final class EventClock
{
    /** The stored form of a wall-clock time. */
    public const DIGITS = 'Y-m-d H:i:s';

    public const DRAFT = 'draft';
    public const CANCELLED = 'cancelled';
    public const UPCOMING = 'upcoming';
    public const ON_NOW = 'on_now';
    public const ENDED = 'ended';

    /** The venue's wall clock now, in the stored form, to compare with `starts_at` / `ends_at`. */
    public static function now(int $orgId): string
    {
        return VenueClock::now($orgId)->format(self::DIGITS);
    }

    /** The venue's date today, `Y-m-d`. */
    public static function today(int $orgId): string
    {
        return VenueClock::today($orgId);
    }

    /** A stored time as its digits (`2026-10-05 18:00:00`), whatever form the driver hands back; any offset is ignored. */
    public static function digits(\DateTimeInterface|string|null $stored): ?string
    {
        $wall = VenueClock::wall($stored);

        return $wall === null ? null : str_replace('T', ' ', $wall) . ':00';
    }

    /** A stored time as the screens and the API take it: `2026-10-05T18:00`. */
    public static function wall(\DateTimeInterface|string|null $stored): ?string
    {
        return VenueClock::wall($stored);
    }

    /** `2026-10-05T18:00` → its stored digits, or null for anything that is not a real wall-clock time. */
    public static function stored(string $wall): ?string
    {
        return VenueClock::parse($wall)?->format(self::DIGITS);
    }

    /** The venue day an event belongs to: its start's date. */
    public static function day(LoyaltyEvent $event): string
    {
        return substr((string) self::digits($event->starts_at), 0, 10);
    }

    public static function hasStarted(LoyaltyEvent $event, ?string $now = null): bool
    {
        return (string) self::digits($event->starts_at) <= ($now ?? self::now((int) $event->organization_id));
    }

    public static function hasEnded(LoyaltyEvent $event, ?string $now = null): bool
    {
        return (string) self::digits($event->ends_at) <= ($now ?? self::now((int) $event->organization_id));
    }

    public static function phase(LoyaltyEvent $event, ?string $now = null): string
    {
        if ($event->status === LoyaltyEvent::DRAFT) {
            return self::DRAFT;
        }
        if ($event->status === LoyaltyEvent::CANCELLED) {
            return self::CANCELLED;
        }
        $now ??= self::now((int) $event->organization_id);

        return match (true) {
            self::hasEnded($event, $now)   => self::ENDED,
            self::hasStarted($event, $now) => self::ON_NOW,
            default                        => self::UPCOMING,
        };
    }

    /** An instant (a check-in) as the venue's clock reads it: `19:02`. */
    /** An instant as the venue's wall clock (`YYYY-MM-DDTHH:mm`), or null — the day of a check-in at a multi-day event. */
    public static function wallOf(\DateTimeInterface|string|null $instant, int $orgId): ?string
    {
        if ($instant === null || $instant === '') {
            return null;
        }

        return CarbonImmutable::parse($instant)->setTimezone(VenueClock::zone($orgId))->format(VenueClock::WALL);
    }

    public static function timeOf(\DateTimeInterface|string|null $instant, int $orgId): ?string
    {
        if ($instant === null || $instant === '') {
            return null;
        }

        return CarbonImmutable::parse($instant)->setTimezone(VenueClock::zone($orgId))->format('H:i');
    }

    /** The day after `Y-m-d`, at midnight, in the stored form (the end of a venue day). */
    public static function dayAfter(string $day): string
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $day, 'UTC')->addDay()->format(self::DIGITS);
    }

    /** "Sat 7 Nov, 18:00–21:00" (or across days, "Sat 7 Nov 18:00 – Sun 8 Nov 02:00"), for the English notices. */
    public static function sayWhen(LoyaltyEvent $event): string
    {
        $start = CarbonImmutable::createFromFormat(self::DIGITS, (string) self::digits($event->starts_at), 'UTC');
        $end = CarbonImmutable::createFromFormat(self::DIGITS, (string) self::digits($event->ends_at), 'UTC');

        return $start->isSameDay($end)
            ? $start->format('D j M, H:i') . '–' . $end->format('H:i')
            : $start->format('D j M H:i') . ' – ' . $end->format('D j M H:i');
    }
}
