<?php

namespace App\Services\Booking;

final class PromotionException extends \InvalidArgumentException
{
    public function __construct(public readonly string $errorCode, string $message)
    {
        parent::__construct($message);
    }
}
