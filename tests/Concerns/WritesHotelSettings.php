<?php

namespace Tests\Concerns;

use App\Models\HotelSetting;

/**
 * A `hotel_settings` row as production stores one.
 *
 * Production's `type` and `group` columns are NOT NULL (the sqlite tables of
 * the tests leave them nullable), so a row written with a key and a value
 * alone is one the real schema refuses. settingRow() fills what the row does
 * not name the way the settings screen does for a key it has no template for
 * (SettingsController::update()): a `*_enabled` flag is a boolean, anything
 * else a string; a secret and an integration's `*_enabled` flag live in the
 * integrations group, `booking_*` in booking, `mail_*` in email, the rest in
 * general. What the row names wins,
 * so a test that reads `type` or `group` sets it itself.
 */
trait WritesHotelSettings
{
    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    protected function settingRow(array $row): array
    {
        $key = strtolower((string) ($row['key'] ?? ''));

        $row['type'] ??= str_ends_with($key, '_enabled') ? 'boolean' : 'string';
        $integrationFlag = str_ends_with($key, '_enabled')
            && !preg_match('/^(push|email|welcome|inbox|rating|lead|gdpr|dark)_/', $key);
        $row['group'] ??= match (true) {
            in_array($key, HotelSetting::ENCRYPTED_KEYS, true), $integrationFlag => 'integrations',
            str_starts_with($key, 'booking_') => 'booking',
            str_starts_with($key, 'mail_') => 'email',
            default => 'general',
        };

        return $row;
    }
}
