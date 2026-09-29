<?php

namespace App\Services\Portal;

use App\Models\Organization;
use Carbon\CarbonImmutable;

/**
 * An appointment's time, the one place the portal turns it into an instant.
 *
 * `service_bookings.start_at` / `end_at` hold the VENUE's wall clock in a
 * column without a time zone, and the scheduler (shared with the public
 * widget, admin and chat) builds and emits slots from the masters' hours in
 * the application zone: `"start":"2026-10-01T10:00:00+00:00","time_label":"10:00"`
 * means 10:00 on the venue's clock, whatever the `+00:00` says. Server-rendered
 * text prints the digits and is right; the portal, which shows instants in the
 * venue's zone and decides things against "now", must read the digits in the
 * venue's zone first. Nothing shared changes: the portal converts at its own
 * API boundary (toInstant()/iso() on the way out) and turns what the client
 * sends back into the stored form (fromClient() on the way in), so every value
 * that reaches the scheduler, the quote builder, a PaymentIntent's metadata or
 * a stored row is byte for byte what the public widget would have used.
 *
 * At a venue whose zone is UTC every method here is the identity.
 */
final class AppointmentClock
{
    /** Container key of the per-request memo (a scoped instance: Octane and the queue worker forget it between requests and jobs). */
    private const MEMO = 'portal.appointment_clock.zones';

    private const DIGITS = 'Y-m-d H:i:s';

    /**
     * The venue's zone for this organisation (PortalBootstrap::timezone),
     * memoised per organisation id so a list of bookings reads it once. The
     * memo lives as long as the container's scoped instances; a test that
     * changes an organisation's zone between two requests of one test case
     * must call `$this->app->forgetScopedInstances()` in between.
     */
    public static function zoneFor(int $organizationId): string
    {
        $app = app();
        if (!$app->bound(self::MEMO)) {
            $app->scoped(self::MEMO, fn () => new \ArrayObject());
        }
        /** @var \ArrayObject<int, string> $memo */
        $memo = $app->make(self::MEMO);

        if (!isset($memo[$organizationId])) {
            $org = Organization::withoutGlobalScopes()->find($organizationId);
            $memo[$organizationId] = $org ? PortalBootstrap::timezone($org) : self::fallbackZone();
        }

        return $memo[$organizationId];
    }

    /**
     * Stored wall-clock digits → the true instant, carrying the venue's
     * offset. Reads the DIGITS (`Y-m-d H:i:s`) of the value and creates them in
     * $zone; it never converts. Digits the venue's clock skips (a
     * daylight-saving change) come back moved forward — see existsLocally().
     */
    public static function toInstant(\DateTimeInterface|string $stored, string $zone): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!' . self::DIGITS, self::digits($stored), self::safeZone($zone));
    }

    /** ISO 8601 with the venue's offset, never `Z`: `2026-10-01T10:00:00+03:00`. */
    public static function iso(\DateTimeInterface|string $stored, string $zone): string
    {
        return self::toInstant($stored, $zone)->toIso8601String();
    }

    /** False when the digits do not exist on the venue's clock (the hour a daylight-saving change skips). */
    public static function existsLocally(\DateTimeInterface|string $stored, string $zone): bool
    {
        return self::toInstant($stored, $zone)->format(self::DIGITS) === self::digits($stored);
    }

    /**
     * What the client sent → the stored form the rest of the code expects,
     * byte for byte what the scheduler emits: the digits of the incoming
     * string, offset IGNORED, as `Y-m-d\TH:i:sP` in the application zone
     * (UTC: `…+00:00`). The portal sends the venue-offset string it was
     * given (`…T14:00:00+03:00`); an older tab that still sends the
     * `+00:00` form books the same slot regardless — either form comes
     * back unchanged, so an idempotency hash built from it still matches.
     */
    public static function fromClient(string $raw): string
    {
        return CarbonImmutable::createFromFormat('!' . self::DIGITS, self::digits($raw), date_default_timezone_get())->toIso8601String();
    }

    /** The wall-clock digits a value carries, whatever zone or offset it names. */
    private static function digits(\DateTimeInterface|string $value): string
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format(self::DIGITS);
        }
        $raw = trim($value);
        if (preg_match('/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/', $raw, $m)) {
            return sprintf('%s %s:%s:%s', $m[1], $m[2], $m[3], ($m[4] ?? '') !== '' ? $m[4] : '00');
        }

        // Anything else the `date` rule accepted (a bare date, say): its own digits.
        return CarbonImmutable::parse($raw)->format(self::DIGITS);
    }

    /** A value that does not name a zone (PortalBootstrap::namedZone(), the venue zone's own test) falls back as PortalBootstrap::timezone() does. */
    private static function safeZone(string $zone): string
    {
        return PortalBootstrap::namedZone($zone) ?? self::fallbackZone();
    }

    private static function fallbackZone(): string
    {
        return (string) config('app.timezone', 'UTC');
    }
}
