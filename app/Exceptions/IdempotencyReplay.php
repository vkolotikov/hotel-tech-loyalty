<?php

namespace App\Exceptions;

/**
 * Sentinel exception thrown from inside the booking confirm transaction
 * when an in-flight idempotency-key collision is detected (i.e. another
 * concurrent request already won the race). The outer catch unwraps the
 * cached response from `$response` and returns it to the caller.
 *
 * Using an exception (rather than a status-code return value) lets us
 * abort the surrounding transaction cleanly — any partial DB writes
 * roll back automatically before the outer catch sees the response.
 */
class IdempotencyReplay extends \RuntimeException
{
    public function __construct(public readonly array $response)
    {
        parent::__construct('Idempotency key replay');
    }
}
