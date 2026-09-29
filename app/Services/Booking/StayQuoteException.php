<?php

namespace App\Services\Booking;

/** A stay the portal cannot quote or book, with the code and status the portal answers. */
final class StayQuoteException extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message, public readonly int $status)
    {
        parent::__construct($message);
    }
}
