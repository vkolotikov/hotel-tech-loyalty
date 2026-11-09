<?php

namespace App\Services\Time;

use Illuminate\Http\JsonResponse;

/**
 * HexaTech Time Planner says no, with a code the workspace turns into its own words (as CrmRefused). Thrown from
 * anywhere under a Time Planner controller; Laravel's handler calls render(), and a transaction it is thrown inside
 * rolls back.
 */
final class TimeRefused extends \DomainException
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

    public static function notFound(): self
    {
        return new self('not_found', 'Not found.', 404);
    }

    public static function managerOnly(): self
    {
        return new self('manager_only', 'Only a manager can do this.', 403);
    }
}
