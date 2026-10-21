<?php

namespace App\Services\Loyalty;

use Illuminate\Http\JsonResponse;

/**
 * HexaTech Loyalty says no, with a code the workspace turns into its own
 * words (spec 2026-10-21 §6.4). Thrown from anywhere under a loyalty
 * controller; Laravel's handler calls render(), so no controller needs to
 * catch it, and a transaction it is thrown inside rolls back.
 */
final class LoyaltyRefused extends \DomainException
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
}
