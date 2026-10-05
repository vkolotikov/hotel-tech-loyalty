<?php

namespace App\Services\Booking\Setup;

use App\Models\HotelSetting;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Services\Appointments\Messages\MessageSettings;
use App\Services\Appointments\VenueClock;
use App\Services\Booking\BookingCapability;

/**
 * The six steps from a new venue to its first appointment, each read from
 * the record that makes it true. Steps 1–4 are what "bookable" already
 * means (BookingCapability); "online" is optional.
 */
final class SetupChecklist
{
    public const STEPS = ['timezone', 'service', 'performer', 'hours', 'online', 'messages', 'first_appointment'];

    public const OPTIONAL = ['online', 'messages'];

    public function __construct(private readonly BookingCapability $capability)
    {
    }

    /** @return array{steps: list<array{key:string, done:bool, optional:bool}>, complete: bool} */
    public function for(int $orgId, ?int $brandId): array
    {
        $messages = MessageSettings::read($orgId);
        $done = [
            'timezone'          => VenueClock::isNamed($orgId),
            'service'           => Service::where('is_active', true)->exists(),
            'performer'         => Service::where('is_active', true)->whereHas('masters', fn ($q) => $q->where('service_masters.is_active', true))->exists(),
            'hours'             => $this->capability->appointmentsBookable($orgId, $brandId),
            'online'            => HotelSetting::getValue(BookingRules::LINK_COPIED) !== null || ServiceBooking::where('source', 'widget')->exists(),
            'messages'          => $messages['staff_default'] || $messages['reminder_hours'] > 0,
            'first_appointment' => ServiceBooking::query()->exists(),
        ];

        $steps = array_map(fn (string $key) => ['key' => $key, 'done' => $done[$key], 'optional' => in_array($key, self::OPTIONAL, true)], self::STEPS);

        return [
            'steps'    => $steps,
            'complete' => collect($steps)->every(fn (array $step) => $step['done'] || $step['optional']),
        ];
    }
}
