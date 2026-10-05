<?php

namespace App\Services\Appointments\Messages;

use App\Models\Guest;
use App\Models\LoyaltyMember;
use App\Models\ServiceBooking;
use App\Models\User;

/**
 * The language of a client message (Part D spec §4): the member's own app
 * language, else the client record's (typed by staff: a code, a code with a
 * region, an English name or the language's own name), else the venue's.
 */
final class MessageLocale
{
    private const NAMES = [
        'english' => 'en', 'russian' => 'ru', 'german' => 'de', 'french' => 'fr', 'spanish' => 'es',
        'русский' => 'ru', 'deutsch' => 'de', 'français' => 'fr', 'francais' => 'fr', 'español' => 'es', 'espanol' => 'es',
    ];

    public static function normalise(?string $raw): ?string
    {
        $value = mb_strtolower(trim((string) $raw));
        if ($value === '') {
            return null;
        }
        if (isset(self::NAMES[$value])) {
            return self::NAMES[$value];
        }
        if (preg_match('/^([a-z]{2})(?:[-_][a-z]{2,4})?$/', $value, $m) && in_array($m[1], MessageSettings::LANGUAGES, true)) {
            return $m[1];
        }

        return null;
    }

    public static function for(ServiceBooking $booking, string $venueLanguage): string
    {
        if ($booking->member_id) {
            $userId = LoyaltyMember::withoutGlobalScopes()->whereKey($booking->member_id)->value('user_id');
            $code = $userId ? self::normalise(User::withoutGlobalScopes()->whereKey($userId)->value('language')) : null;
            if ($code !== null) {
                return $code;
            }
        }
        if ($booking->guest_id) {
            $code = self::normalise(Guest::withoutGlobalScopes()->whereKey($booking->guest_id)->value('preferred_language'));
            if ($code !== null) {
                return $code;
            }
        }

        return self::normalise($venueLanguage) ?? 'en';
    }
}
