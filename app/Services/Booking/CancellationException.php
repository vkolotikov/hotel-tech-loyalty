<?php

namespace App\Services\Booking;

/** A cancellation the portal cannot make, with the code and status it answers. */
final class CancellationException extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message, public readonly int $status)
    {
        parent::__construct($message);
    }
}
