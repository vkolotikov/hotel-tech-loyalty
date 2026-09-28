<?php

namespace App\Services\Booking;

/**
 * Which side of the catalogue a booking is quoting for — a bookable
 * service, or a stay. Every discount source (tier benefit, offer, reward)
 * carries an `applies_to` that is either `all` or one of these values, so
 * a "stays only" perk never discounts a spa treatment.
 */
enum BookingScope: string
{
    case Services = 'services';
    case Stays = 'stays';

    /** A discount source with applies_to = all (or unset) admits every scope. */
    public function admits(?string $appliesTo): bool
    {
        return $appliesTo === null || $appliesTo === '' || $appliesTo === 'all' || $appliesTo === $this->value;
    }
}
