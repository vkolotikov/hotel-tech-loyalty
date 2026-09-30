<?php

namespace App\Services\Appointments;

use Illuminate\Http\JsonResponse;

/**
 * The workspace says no, with a code the client can act on. Thrown from
 * anywhere under a workspace controller; Laravel's handler calls render()
 * before any registered callback, so no controller needs to catch it, and a
 * transaction it is thrown inside rolls back.
 *
 * A \DomainException, not a \RuntimeException: the scheduler signals "slot
 * taken" with a bare \RuntimeException and its callers catch exactly that.
 */
final class AppointmentRefused extends \DomainException
{
    /** @param array<string, mixed> $extra Merged into the answer beside `error` and `message`. */
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 422,
        public readonly array $extra = [],
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['error' => $this->errorCode, 'message' => $this->getMessage()] + $this->extra, $this->status);
    }

    /** An expected refusal, not an incident: keep it out of the error log. */
    public function report(): void
    {
    }
}
