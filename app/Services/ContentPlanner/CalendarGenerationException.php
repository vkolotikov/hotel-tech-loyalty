<?php

namespace App\Services\ContentPlanner;

use RuntimeException;
use Throwable;

final class CalendarGenerationException extends RuntimeException
{
    public function __construct(public readonly string $reason, string $message, ?Throwable $previous = null)
    {
        parent::__construct($message, 0, $previous);
    }
}
