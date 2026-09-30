<?php

namespace App\Services\Appointments;

use App\Models\ServiceBooking;

/**
 * The client saved against a version of the appointment that someone has
 * changed since. The controller answers 409 `stale` with the current
 * appointment so the panel can show what changed.
 */
final class StaleAppointment extends \DomainException
{
    public function __construct(public readonly ServiceBooking $booking)
    {
        parent::__construct('This appointment was changed by someone else. Review the current details and try again.');
    }

    /** Throws when $revision is not the booking's current one. Call it under the row lock. */
    public static function unless(ServiceBooking $booking, string $revision): void
    {
        if (!hash_equals(AppointmentPresenter::revision($booking), $revision)) {
            throw new self($booking);
        }
    }

    public function report(): void
    {
    }
}
