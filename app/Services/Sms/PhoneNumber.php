<?php

namespace App\Services\Sms;

/**
 * A member's phone number as an SMS can be sent to it: E.164, `+` and the country code and number, 7 to 15 digits in
 * all (HexaTech Loyalty release 4 §5). Members type numbers however they like ("+44 20 7946 0958", "0044 (20)
 * 7946-0958"), so spaces, dots, dashes, slashes and brackets are dropped and an international `00` reads as `+`. A
 * number without its country code ("020 7946 0958") cannot be made into one without guessing the country, and is
 * not sent to: the confirmation counts it apart, so the venue can ask those members for their full number.
 */
final class PhoneNumber
{
    /** Why a member's number cannot be texted: none at all, or one not in international form. */
    public const NONE = 'no_phone';
    public const NOT_INTERNATIONAL = 'bad_phone';

    /** The number in E.164, or null when there is none or it is not in international form. */
    public static function e164(?string $phone): ?string
    {
        $s = preg_replace('/[\s.\-\/()\x{00A0}]+/u', '', trim((string) $phone)) ?? '';
        if (str_starts_with($s, '00')) {
            $s = '+' . substr($s, 2);
        }

        return preg_match('/^\+[1-9]\d{6,14}$/', $s) === 1 ? $s : null;
    }

    /** Why this number cannot be texted (NONE, NOT_INTERNATIONAL), or null when it can. */
    public static function problem(?string $phone): ?string
    {
        if (trim((string) $phone) === '') {
            return self::NONE;
        }

        return self::e164($phone) === null ? self::NOT_INTERNATIONAL : null;
    }
}
