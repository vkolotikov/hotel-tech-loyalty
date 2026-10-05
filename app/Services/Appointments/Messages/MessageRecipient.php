<?php

namespace App\Services\Appointments\Messages;

use App\Models\Guest;
use App\Models\ServiceBooking;

/** Who a client message goes to: the booking's own address, else the client record's, else nobody. */
final class MessageRecipient
{
    public static function for(ServiceBooking $booking): ?string
    {
        $candidates = [$booking->customer_email];
        if ($booking->guest_id) {
            $candidates[] = Guest::withoutGlobalScopes()->whereKey($booking->guest_id)->value('email');
        }

        foreach ($candidates as $candidate) {
            $email = trim((string) $candidate);
            if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return $email;
            }
        }

        return null;
    }
}
