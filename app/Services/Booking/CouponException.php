<?php

namespace App\Services\Booking;

class CouponException extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message)
    {
        parent::__construct("{$errorCode}: {$message}");
    }

    /** The sentence without the code prefix, for API bodies. */
    public function sentence(): string
    {
        return substr($this->getMessage(), strlen($this->errorCode) + 2);
    }
}
