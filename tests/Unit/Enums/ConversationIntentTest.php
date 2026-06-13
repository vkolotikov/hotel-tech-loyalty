<?php

namespace Tests\Unit\Enums;

use App\Enums\ConversationIntent;
use PHPUnit\Framework\TestCase;

/**
 * Locks in the 7 canonical conversation intents + the normalisation
 * fallback to 'other' that EngagementAiService relies on.
 *
 * See AUDIT-2026-06-13-ADDENDUM.md maintainability finding — the list
 * was previously duplicated 4× across the codebase with at least one
 * site having a divergent set.
 */
class ConversationIntentTest extends TestCase
{
    public function test_seven_canonical_values(): void
    {
        $values = ConversationIntent::values();
        $this->assertCount(7, $values);
        $this->assertSame([
            'booking_inquiry',
            'info_request',
            'complaint',
            'cancellation',
            'support',
            'spam',
            'other',
        ], $values);
    }

    public function test_normalise_known_values(): void
    {
        $this->assertSame(ConversationIntent::BookingInquiry, ConversationIntent::normalise('booking_inquiry'));
        $this->assertSame(ConversationIntent::Complaint,      ConversationIntent::normalise('complaint'));
        $this->assertSame(ConversationIntent::Other,          ConversationIntent::normalise('other'));
    }

    public function test_normalise_unknown_falls_back_to_other(): void
    {
        $this->assertSame(ConversationIntent::Other, ConversationIntent::normalise(null));
        $this->assertSame(ConversationIntent::Other, ConversationIntent::normalise(''));
        $this->assertSame(ConversationIntent::Other, ConversationIntent::normalise('group'));   // belongs to InquiryCategory
        $this->assertSame(ConversationIntent::Other, ConversationIntent::normalise('BOOKING_INQUIRY')); // case-sensitive
        $this->assertSame(ConversationIntent::Other, ConversationIntent::normalise('pricing_question')); // proposed-but-not-shipped
    }
}
