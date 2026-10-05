<?php

namespace App\Services\Appointments\Messages;

use App\Models\HotelSetting;

/**
 * The venue's client-message settings (Part D spec §5.5), all off until a
 * manager switches them on in Setup: whether staff changes email the client
 * by default, how many hours before a visit the reminder goes (0 = none),
 * and the language for a client whose own is not known. Read without the
 * tenant scope or the settings cache, so the reminder command and the
 * delivery job read them the same way a request does.
 */
final class MessageSettings
{
    public const STAFF_DEFAULT = 'client_messages_staff_default';

    public const REMINDER_HOURS = 'client_messages_reminder_hours';

    public const LANGUAGE = 'client_messages_language';

    public const REMINDER_CHOICES = [0, 2, 24, 48];

    public const LANGUAGES = ['en', 'ru', 'de', 'fr', 'es'];

    /** @return array{staff_default: bool, reminder_hours: int, language: string} */
    public static function read(int $orgId): array
    {
        $values = HotelSetting::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->whereIn('key', [self::STAFF_DEFAULT, self::REMINDER_HOURS, self::LANGUAGE])
            ->pluck('value', 'key');

        $hours = (int) ($values[self::REMINDER_HOURS] ?? 0);
        $language = strtolower(trim((string) ($values[self::LANGUAGE] ?? 'en')));

        return [
            'staff_default'  => filter_var($values[self::STAFF_DEFAULT] ?? 'false', FILTER_VALIDATE_BOOL),
            'reminder_hours' => in_array($hours, self::REMINDER_CHOICES, true) ? $hours : 0,
            'language'       => in_array($language, self::LANGUAGES, true) ? $language : 'en',
        ];
    }
}
