<?php

namespace App\Enums;

/**
 * The six CRM lead-category labels InquiryAiService classifies an
 * inquiry into. Distinct from ConversationIntent — these are CRM
 * categories the AI smart panel uses to colour the lead, NOT the live
 * conversation intent that drives Engagement Hub routing.
 *
 * Two list became conflated under the same `INTENTS` constant — see
 * AUDIT-2026-06-13-ADDENDUM.md maintainability finding (InquiryAiService
 * had a different 5-item list with `'group'` and `'event'`). Splitting
 * them keeps each enum semantically tight.
 */
enum InquiryCategory: string
{
    case BookingInquiry = 'booking_inquiry';
    case Group          = 'group';
    case Event          = 'event';
    case InfoRequest    = 'info_request';
    case Complaint      = 'complaint';
    case Other          = 'other';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public static function normalise(?string $value): self
    {
        if ($value === null || $value === '') return self::Other;
        return self::tryFrom($value) ?? self::Other;
    }
}
