<?php

namespace App\Services\Content;

use App\Models\Organization;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\Setup\BookingRules;
use App\Services\PlanLimitGuard;

/** Content uses the account's saved venue zone; reading never guesses or saves one. */
final class ContentSettings
{
    public function read(Organization $org): array
    {
        $usage = app(PlanLimitGuard::class)->usage(PlanLimitGuard::KEY_PROPERTIES);

        return [
            'timezone' => VenueClock::zone((int) $org->id),
            'timezone_named' => VenueClock::isNamed((int) $org->id),
            'timezones' => BookingRules::zones(),
            'locations_limit' => $usage['limit'],
            'locations_used' => $usage['count'],
        ];
    }

    public function write(Organization $org, string $timezone): array
    {
        // The shared writer flushes settings and request clock caches. No stored wall clocks move.
        app(BookingRules::class)->write($org, ['timezone' => $timezone]);

        return $this->read($org);
    }
}
