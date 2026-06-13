<?php

namespace App\Enums;

/**
 * The seven canonical conversation intent tags emitted by
 * EngagementAiService and stored on `chat_conversations.intent_tag`.
 *
 * Before this enum, the list was duplicated 4× across the codebase —
 * EngagementAiService (7 items), EngagementFeedService (5 of 7 in
 * filter list, switch cases for the others), InquiryAiService (a
 * DIFFERENT 6-item list adding 'group' and 'event' — those are CRM
 * lead categories, not conversation intents, see InquiryCategory),
 * and intentMeta.ts on the frontend. Adding a new intent silently
 * failed validation depending on the call path.
 *
 * See AUDIT-2026-06-13-ADDENDUM.md maintainability finding
 * (conversation INTENT_TAG list duplicated 4×).
 *
 * Single source of truth — TS mirror in `frontend/src/lib/intentMeta.ts`.
 */
enum ConversationIntent: string
{
    case BookingInquiry = 'booking_inquiry';
    case InfoRequest    = 'info_request';
    case Complaint      = 'complaint';
    case Cancellation   = 'cancellation';
    case Support        = 'support';
    case Spam           = 'spam';
    case Other          = 'other';

    /** All values as string[]. Useful for whereIn / validation in:. */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /** Normalise an arbitrary input to a known value or 'other'. */
    public static function normalise(?string $value): self
    {
        if ($value === null || $value === '') return self::Other;
        return self::tryFrom($value) ?? self::Other;
    }
}
