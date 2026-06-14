<?php

namespace Tests\Unit\Services;

use App\Models\ChatConversation;
use App\Services\EngagementFeedService;
use PHPUnit\Framework\TestCase;

/**
 * Locks EngagementFeedService::scoreHotLead() — the rule-based
 * hot-lead heuristic that powers the "Hot leads" filter on the
 * Engagement Hub feed.
 *
 * Why this matters: agents triage by this score. False-positives
 * flood the filter and bury real opportunities; false-negatives
 * silently drop conversion opportunities. The rule set per
 * ENGAGEMENT_HUB_PLAN.md is small but the interaction matrix is
 * wide — locking each branch independently catches regressions
 * that an end-to-end test would miss.
 *
 * The rule (with hasContact as the gate):
 *   - hasContact = false → ALWAYS false (anonymous visitors never hot)
 *   - hasContact = true → hot when ANY of:
 *       * isOnline
 *       * currentPage contains /book OR /rooms OR /services
 *       * conversation status in {active, waiting}
 *       * conversation intent_tag === 'booking_inquiry'
 *       * visitCount >= 2 (returning visitor)
 *       * messagesCount >= 3 (engaged conversation)
 *
 * Pure unit test — instantiates a bare ChatConversation Eloquent
 * model only to set status/intent_tag for those branches. No DB
 * touch, no facade, no app() boot. Wall time < 10ms.
 */
class EngagementFeedServiceScoreHotLeadTest extends TestCase
{
    public function test_no_contact_means_never_hot_regardless_of_other_signals(): void
    {
        // The gate: anonymous visitors are never hot, even if every
        // other signal would otherwise fire. Without this guard the
        // filter would flood with random browsing visitors who
        // happen to be on /book.
        $convo = new ChatConversation();
        $convo->status = 'active';
        $convo->intent_tag = 'booking_inquiry';

        $hot = EngagementFeedService::scoreHotLead(
            isOnline:      true,
            hasContact:    false,                  // ← the gate
            currentPage:   '/book/now',
            visitCount:    10,
            messagesCount: 20,
            conversation:  $convo,
        );

        $this->assertFalse($hot,
            'No captured contact → must NOT be hot even with every other signal.');
    }

    public function test_online_with_contact_is_hot(): void
    {
        // The simplest branch: contact + currently online → hot.
        // "They're here right now, we have their email" is the
        // strongest engagement signal.
        $hot = EngagementFeedService::scoreHotLead(
            isOnline:      true,
            hasContact:    true,
            currentPage:   null,
            visitCount:    1,
            messagesCount: 0,
            conversation:  null,
        );

        $this->assertTrue($hot);
    }

    /**
     * @testWith ["/book"]
     *           ["/book/forrest-cabin"]
     *           ["/rooms"]
     *           ["/rooms/beach-suite"]
     *           ["/services"]
     *           ["/services/spa-package"]
     */
    public function test_booking_path_pages_make_lead_hot(string $page): void
    {
        // Visitor on a booking-funnel page = high intent. The
        // substring match must accept both root-only and detail-page
        // URLs (the substring `/book` covers /book and /book/anything).
        $hot = EngagementFeedService::scoreHotLead(
            isOnline:      false,                 // offline
            hasContact:    true,
            currentPage:   $page,
            visitCount:    1,
            messagesCount: 0,
            conversation:  null,
        );

        $this->assertTrue($hot,
            "Booking-path page '{$page}' must mark lead as hot.");
    }

    /**
     * @testWith ["/about"]
     *           ["/contact"]
     *           ["/blog/welcome-post"]
     *           ["/"]
     */
    public function test_non_booking_pages_do_not_trigger_booking_path_signal(string $page): void
    {
        // Non-funnel pages must NOT match the booking-path heuristic.
        // Otherwise every visitor on /about would surface as hot.
        $hot = EngagementFeedService::scoreHotLead(
            isOnline:      false,
            hasContact:    true,
            currentPage:   $page,
            visitCount:    1,
            messagesCount: 0,
            conversation:  null,
        );

        $this->assertFalse($hot,
            "Non-booking page '{$page}' must not trigger the booking-path heuristic.");
    }

    public function test_active_conversation_makes_lead_hot(): void
    {
        // Active chat = guest currently typing with us. Strong
        // proximity signal even when no other heuristic fires.
        $convo = new ChatConversation();
        $convo->status = 'active';

        $hot = EngagementFeedService::scoreHotLead(
            isOnline:      false,
            hasContact:    true,
            currentPage:   null,
            visitCount:    1,
            messagesCount: 1,
            conversation:  $convo,
        );

        $this->assertTrue($hot);
    }

    public function test_waiting_conversation_makes_lead_hot(): void
    {
        // Waiting = AI handed off + nobody picked up yet. Highest
        // intervention priority — agents MUST see these surfaced.
        $convo = new ChatConversation();
        $convo->status = 'waiting';

        $hot = EngagementFeedService::scoreHotLead(
            isOnline:      false,
            hasContact:    true,
            currentPage:   null,
            visitCount:    1,
            messagesCount: 1,
            conversation:  $convo,
        );

        $this->assertTrue($hot);
    }

    public function test_resolved_conversation_does_not_make_lead_hot_by_itself(): void
    {
        // Resolved = already closed. No active intervention needed
        // — must NOT contribute to hotness on its own.
        $convo = new ChatConversation();
        $convo->status = 'resolved';

        $hot = EngagementFeedService::scoreHotLead(
            isOnline:      false,
            hasContact:    true,
            currentPage:   null,
            visitCount:    1,
            messagesCount: 1,
            conversation:  $convo,
        );

        $this->assertFalse($hot,
            'Resolved conversation alone must not flag the row as hot.');
    }

    public function test_booking_inquiry_intent_tag_makes_lead_hot(): void
    {
        // AI classified the conversation as a booking inquiry —
        // direct revenue signal. Hot regardless of online state or
        // visit count.
        $convo = new ChatConversation();
        $convo->status = 'resolved';                // even resolved
        $convo->intent_tag = 'booking_inquiry';

        $hot = EngagementFeedService::scoreHotLead(
            isOnline:      false,
            hasContact:    true,
            currentPage:   null,
            visitCount:    1,
            messagesCount: 1,
            conversation:  $convo,
        );

        $this->assertTrue($hot);
    }

    /**
     * @testWith ["info_request"]
     *           ["complaint"]
     *           ["support"]
     *           ["spam"]
     *           ["other"]
     */
    public function test_non_booking_intents_do_not_trigger_intent_signal(string $intent): void
    {
        // Only booking_inquiry counts for the intent-tag heuristic.
        // Otherwise the filter would surface complaints, support
        // tickets, and spam alongside actual revenue opportunities.
        $convo = new ChatConversation();
        $convo->status = 'resolved';
        $convo->intent_tag = $intent;

        $hot = EngagementFeedService::scoreHotLead(
            isOnline:      false,
            hasContact:    true,
            currentPage:   null,
            visitCount:    1,
            messagesCount: 1,
            conversation:  $convo,
        );

        $this->assertFalse($hot,
            "Intent '{$intent}' must NOT trigger the booking_inquiry heuristic.");
    }

    public function test_returning_visitor_two_visits_marks_lead_hot(): void
    {
        // Visit count = 2 boundary: first time is noise, second time
        // is intent. Threshold per ENGAGEMENT_HUB_PLAN.md.
        $hot = EngagementFeedService::scoreHotLead(
            isOnline:      false,
            hasContact:    true,
            currentPage:   null,
            visitCount:    2,
            messagesCount: 0,
            conversation:  null,
        );

        $this->assertTrue($hot,
            'Visit count = 2 (the threshold) must mark lead as hot.');
    }

    public function test_single_visit_does_not_mark_lead_hot_by_visit_count(): void
    {
        // First visit alone is not hot — needs another signal. The
        // off-by-one guard: must be >= 2, not > 2.
        $hot = EngagementFeedService::scoreHotLead(
            isOnline:      false,
            hasContact:    true,
            currentPage:   null,
            visitCount:    1,
            messagesCount: 0,
            conversation:  null,
        );

        $this->assertFalse($hot,
            'Visit count = 1 must not be hot by visit-count alone.');
    }

    public function test_three_messages_marks_lead_hot(): void
    {
        // Messages count = 3 boundary: deeply engaged conversation.
        // 1-2 messages is noise; 3+ shows the visitor invested time.
        $hot = EngagementFeedService::scoreHotLead(
            isOnline:      false,
            hasContact:    true,
            currentPage:   null,
            visitCount:    1,
            messagesCount: 3,
            conversation:  null,
        );

        $this->assertTrue($hot);
    }

    public function test_two_messages_does_not_mark_lead_hot_by_message_count(): void
    {
        // Boundary check: 2 messages is below the threshold. Defends
        // against off-by-one drift (the rule is `>= 3`, not `> 2`
        // or `> 3`).
        $hot = EngagementFeedService::scoreHotLead(
            isOnline:      false,
            hasContact:    true,
            currentPage:   null,
            visitCount:    1,
            messagesCount: 2,
            conversation:  null,
        );

        $this->assertFalse($hot,
            'Messages count = 2 must NOT be hot (threshold is 3).');
    }

    public function test_contact_with_no_other_signals_is_NOT_hot(): void
    {
        // Defensive: just having a captured contact email alone is
        // NOT enough. Otherwise every member in the database would
        // light up as "hot" the moment they were captured —
        // overwhelming the filter.
        $hot = EngagementFeedService::scoreHotLead(
            isOnline:      false,
            hasContact:    true,
            currentPage:   null,
            visitCount:    1,
            messagesCount: 0,
            conversation:  null,
        );

        $this->assertFalse($hot,
            'Captured contact alone must NOT flag as hot — the OR-chain needs at least one signal.');
    }
}
