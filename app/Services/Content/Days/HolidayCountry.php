<?php

namespace App\Services\Content\Days;

use App\Models\ContentPlannerProfile;
use App\Models\Organization;
use App\Services\Appointments\VenueClock;

/**
 * Which country's public holidays a brand sees (spec 2026-10-16 §3.3): its own choice (`none` = no holidays), else a
 * guess — the organisation's country when it is one of the nine, else the venue time zone's own country (or a legacy
 * zone name's) when it is one of the nine; UTC and every other zone guess nothing.
 */
final class HolidayCountry
{
    /** Legacy zone names that carry no country of their own (PHP answers "??"): the country each stands for. */
    private const LEGACY = ['GB' => 'GB', 'GB-Eire' => 'GB', 'Europe/Belfast' => 'GB', 'Eire' => 'IE'];

    public static function guess(Organization $org): ?string
    {
        $country = strtoupper(trim((string) $org->country));
        // People type "UK"; the ISO code is GB.
        $country = $country === 'UK' ? 'GB' : $country;
        if (in_array($country, PublicHolidays::COUNTRIES, true)) {
            return $country;
        }

        // Owner ruling (Plan 4A-2): the zone's own country, so every zone of the nine countries counts (America/Boise,
        // Atlantic/Canary, Europe/Busingen …), and a legacy name stands for its country.
        $zone = VenueClock::zone((int) $org->id);
        try {
            $location = (new \DateTimeZone($zone))->getLocation();
        } catch (\Exception) {
            $location = false;
        }
        $code = is_array($location) ? (string) ($location['country_code'] ?? '') : '';
        if ($code === '' || $code === '??') {
            $code = str_starts_with($zone, 'US/') ? 'US' : (self::LEGACY[$zone] ?? '');
        }

        return in_array($code, PublicHolidays::COUNTRIES, true) ? $code : null;
    }

    public static function for(Organization $org, ?ContentPlannerProfile $profile): ?string
    {
        $chosen = $profile?->holiday_country;
        if ($chosen === 'none') {
            return null;
        }
        if (in_array($chosen, PublicHolidays::COUNTRIES, true)) {
            return $chosen;
        }

        return self::guess($org);
    }
}
