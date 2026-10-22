<?php

namespace App\Services\Loyalty\Campaigns;

use App\Services\Appointments\VenueClock;
use App\Services\Loyalty\LoyaltyRefused;
use Carbon\CarbonImmutable;

/**
 * Send later, for email campaigns, push messages and SMS alike (HexaTech Loyalty release 4 §5). A manager picks a time
 * on the venue's clock (`YYYY-MM-DDTHH:mm`, no offset, as the appointments workspace takes times); it is stored as the
 * instant it names (UTC) and answered both ways. `php artisan loyalty:send-scheduled` starts each one that is due,
 * every minute, through its kind's own start service (CampaignStart, PushStart, SmsStart) with one conditional update
 * (`scheduled` → `sending`), so it starts once however often the command runs. It goes to whoever is eligible at that
 * moment; there is no confirmed count then. While it waits it can be moved or taken back to a draft.
 *
 * A scheduled one that cannot start when it is due (nobody eligible then, over the limit, its segment gone or broken,
 * the content incomplete, SMS without Twilio) is marked failed with the reason's code (FAILED_PREFIX in an email
 * campaign's `error_message`, `data.schedule_problem` on a push message, the code itself on an SMS campaign).
 */
final class SendLater
{
    public const STATUS = 'scheduled';

    /** The earliest a time may be: two minutes on, so the minute's run cannot miss it while it is being saved. */
    public const MIN_LEAD_MINUTES = 2;

    /** The latest: a year ahead. */
    public const MAX_AHEAD_DAYS = 365;

    /** How an email campaign's `error_message` names why a scheduled send did not start (the code follows). */
    public const FAILED_PREFIX = 'Scheduled send did not start: ';

    /**
     * The instant a wall-clock time on the venue's clock names, in UTC.
     *
     * @throws LoyaltyRefused `bad_time` (422) with `reason`: `format` (not `YYYY-MM-DDTHH:mm`, or no such day),
     *   `not_on_clock` (the venue's clock skips it: a daylight-saving change), `past` (less than two minutes from
     *   now), `too_far` (more than a year ahead)
     */
    public static function instantOf(string $wall, int $orgId): CarbonImmutable
    {
        $digits = VenueClock::parse(trim($wall));
        if ($digits === null) {
            throw self::bad('format');
        }
        if (!VenueClock::exists($digits, $orgId)) {
            throw self::bad('not_on_clock');
        }
        $instant = CarbonImmutable::createFromFormat('!Y-m-d H:i', $digits->format('Y-m-d H:i'), VenueClock::zone($orgId))->utc();
        if ($instant->lt(CarbonImmutable::now()->addMinutes(self::MIN_LEAD_MINUTES))) {
            throw self::bad('past');
        }
        if ($instant->gt(CarbonImmutable::now()->addDays(self::MAX_AHEAD_DAYS))) {
            throw self::bad('too_far');
        }

        return $instant;
    }

    /** A stored instant as the venue's wall clock (`YYYY-MM-DDTHH:mm`), for the page and for moving it. */
    public static function wallOf(?\DateTimeInterface $instant, int $orgId): ?string
    {
        return $instant === null ? null : CarbonImmutable::instance($instant)->setTimezone(VenueClock::zone($orgId))->format(VenueClock::WALL);
    }

    /** The reason code an email campaign's `error_message` carries, or null when it is not a scheduled send's. */
    public static function problemIn(?string $errorMessage): ?string
    {
        $text = (string) $errorMessage;

        return str_starts_with($text, self::FAILED_PREFIX) ? substr($text, strlen(self::FAILED_PREFIX)) : null;
    }

    public static function notScheduled(string $status): LoyaltyRefused
    {
        return new LoyaltyRefused('not_scheduled', 'This is not waiting to be sent.', 409, ['status' => $status]);
    }

    private static function bad(string $reason): LoyaltyRefused
    {
        return new LoyaltyRefused('bad_time', 'Choose another time.', 422, ['reason' => $reason]);
    }
}
