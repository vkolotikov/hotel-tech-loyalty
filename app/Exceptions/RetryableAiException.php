<?php

namespace App\Exceptions;

/**
 * Thrown by DispatchesAiChat when a provider returns a retryable status code
 * (429, 500, 529, 503). Carries the suggested delay so the retry loop can
 * respect rate-limit headers.
 */
class RetryableAiException extends \RuntimeException
{
    public function __construct(
        string $message,
        int $code = 0,
        public readonly int $retryDelay = 1,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, $code, $previous);
    }
}
