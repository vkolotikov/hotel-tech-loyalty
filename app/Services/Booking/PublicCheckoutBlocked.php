<?php

namespace App\Services\Booking;

final class PublicCheckoutBlocked extends \RuntimeException
{
    public function __construct(public readonly string $publicCode, string $message)
    {
        parent::__construct($message);
    }
}
