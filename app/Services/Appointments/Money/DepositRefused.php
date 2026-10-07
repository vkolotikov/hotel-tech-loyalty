<?php

namespace App\Services\Appointments\Money;

/**
 * The booking page's confirm refuses a booking whose deposit is missing
 * (`deposit_required`) or is not this booking's (`deposit_mismatch`).
 * A \DomainException, so confirm()'s catch of the scheduler's
 * \RuntimeException ("slot taken") never takes it for one.
 */
final class DepositRefused extends \DomainException
{
    public function __construct(public readonly string $reason, string $message)
    {
        parent::__construct($message);
    }
}
