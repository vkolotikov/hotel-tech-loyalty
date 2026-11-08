<?php

namespace App\Exceptions;

use App\Models\Organization;
use App\Services\AiUsageService;
use Illuminate\Http\JsonResponse;

/**
 * The chatbot set-up's AI helpers say no in our words (2026-11-08): `chatbot-config/test-chat`,
 * `chatbot-config/suggest-keywords` and `knowledge/extract-faqs`. Laravel's handler calls render(), so a controller or
 * service throws it and nothing has to catch it.
 *
 * - `ai_budget_used_up` (403): the month's AI allowance is spent (AiUsageService::budgetStatus), checked before the
 *   provider is asked — the same stop as the website widget and the CRM's drafts.
 * - `ai_failed` (502): the provider failed or answered nothing usable; its own text goes to the log only.
 */
final class AiHelperRefused extends \DomainException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status,
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['error' => $this->errorCode, 'message' => $this->getMessage()], $this->status);
    }

    /** An expected refusal, not an incident: the failure itself was logged where it happened. */
    public function report(): void
    {
    }

    /** Refuses before any provider call once the organisation's month of AI is used up. */
    public static function unlessAllowanceLeft(?Organization $org): void
    {
        if (app(AiUsageService::class)->budgetStatus($org)['status'] === 'over') {
            throw new self('ai_budget_used_up', "This month's AI allowance is used up. The AI helpers are back next month, or with a larger package.", 403);
        }
    }

    public static function failed(): self
    {
        return new self('ai_failed', 'The AI could not help just now. Please try again in a moment.', 502);
    }
}
