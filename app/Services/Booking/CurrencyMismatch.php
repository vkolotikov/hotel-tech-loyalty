<?php

namespace App\Services\Booking;

/** No implicit FX: a quote may add or authorize only amounts in its own currency. */
final class CurrencyMismatch extends \InvalidArgumentException
{
    public function __construct()
    {
        parent::__construct('These prices use different currencies. Please contact the venue to correct its booking and payment settings.');
    }

    public static function assertSame(?string $actual, string $expected): void
    {
        if (trim((string) $actual) !== '' && strtoupper(trim($actual)) !== strtoupper(trim($expected))) {
            throw new self();
        }
    }
}
