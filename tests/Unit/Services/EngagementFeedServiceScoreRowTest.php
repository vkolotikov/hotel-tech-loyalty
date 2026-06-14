<?php

namespace Tests\Unit\Services;

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Services\EngagementFeedService;
use Carbon\Carbon;
use Tests\TestCase;

/**
 * Locks EngagementFeedService::scoreRow — the priority-score
 * function that orders the Engagement Hub feed. Sister tests to
 * EngagementFeedServiceScoreHotLeadTest.
 *
 * The score ladder per ENGAGEMENT_HUB_PLAN.md:
 *
 *   Base scores (highest wins):
 *     1000  online + unread visitor message      (hottest signal)
 *      700  online + active chat + AI replying
 *      500  online + has captured contact
 *      300  has captured contact + last seen ≤ 1h ago
 *      100  online + anonymous
 *        0  none of the above
 *
 *   Boosts (additive on top of base):
 *     +200  conversation waiting > 5 min for human reply
 *     +250  is hot lead (Phase 3 lift)
 *      +50  any activity in last 24h (RECENT_ACTIVITY_HOURS)
 *
 * Why score order matters: agents triage top-down. A regression
 * that swaps the 1000 / 700 / 500 ladder would silently bury hot
 * online-with-unread visitors below ordinary captured contacts —
 * direct revenue impact.
 *
 * Pure unit test — uses no DB, no facade, no app() boot.
 * ChatConversation + ChatMessage instantiated as bare Eloquent
 * models to set the fields scoreRow reads.
 */
class EngagementFeedServiceScoreRowTest extends TestCase
{
    private function emptyConversation(string $status = 'resolved'): ChatConversation
    {
        $c = new ChatConversation();
        $c->status = $status;
        $c->ai_enabled = false;
        $c->assigned_to = null;
        $c->last_message_at = null;
        return $c;
    }

    public function test_no_signals_returns_zero(): void
    {
        // The base-score floor. A row with no engagement signals
        // returns 0 — it should sink to the bottom of the feed.
        $score = EngagementFeedService::scoreRow(
            isOnline:         false,
            hasContact:       false,
            hasUnreadVisitor: false,
            hasActiveChat:    false,
            isLead:           false,
            lastSeenAt:       null,
            conversation:     null,
            lastMessage:      null,
        );

        $this->assertSame(0, $score);
    }

    public function test_online_with_unread_visitor_returns_1000(): void
    {
        // The hottest signal. Online RIGHT NOW + has unread message
        // waiting → 1000. This MUST be the top of the ladder so
        // unanswered live visitors get triaged first.
        $score = EngagementFeedService::scoreRow(
            isOnline:         true,
            hasContact:       false,
            hasUnreadVisitor: true,
            hasActiveChat:    false,
            isLead:           false,
            lastSeenAt:       null,
            conversation:     null,
            lastMessage:      null,
        );

        $this->assertSame(1000, $score);
    }

    public function test_online_active_chat_ai_enabled_returns_700(): void
    {
        // AI is replying to an active chat — second-highest base.
        // The signal: "AI is handling this, but staff should watch
        // in case it needs handoff."
        $convo = $this->emptyConversation('active');
        $convo->ai_enabled = true;

        $score = EngagementFeedService::scoreRow(
            isOnline:         true,
            hasContact:       false,
            hasUnreadVisitor: false,
            hasActiveChat:    true,
            isLead:           false,
            lastSeenAt:       null,
            conversation:     $convo,
            lastMessage:      null,
        );

        $this->assertSame(700, $score);
    }

    public function test_online_with_contact_returns_500(): void
    {
        // Online + we know who they are = 500. Below unread-active
        // (no chat in progress) and below AI-handling-active (no
        // active chat), but above all offline cases.
        $score = EngagementFeedService::scoreRow(
            isOnline:         true,
            hasContact:       true,
            hasUnreadVisitor: false,
            hasActiveChat:    false,
            isLead:           false,
            lastSeenAt:       null,
            conversation:     null,
            lastMessage:      null,
        );

        $this->assertSame(500, $score);
    }

    public function test_offline_recent_contact_within_1h_returns_300(): void
    {
        // Offline but JUST visited (≤ 1h ago) + we have contact.
        // Worth keeping near the top for re-engagement.
        $score = EngagementFeedService::scoreRow(
            isOnline:         false,
            hasContact:       true,
            hasUnreadVisitor: false,
            hasActiveChat:    false,
            isLead:           false,
            lastSeenAt:       Carbon::now()->subMinutes(30),
            conversation:     null,
            lastMessage:      null,
        );

        // Recent activity (30 min ago) is within the 24h boost
        // window too — adds 50 on top.
        $this->assertSame(350, $score,
            'Recent-contact base (300) + recent-activity boost (50) = 350.');
    }

    public function test_offline_contact_more_than_1h_ago_drops_below_300(): void
    {
        // The "≤ 1h ago" boundary: a 2-hour-old last_seen_at does
        // NOT yield the 300 base — drops to 0 (or just the 24h
        // activity boost of 50).
        $score = EngagementFeedService::scoreRow(
            isOnline:         false,
            hasContact:       true,
            hasUnreadVisitor: false,
            hasActiveChat:    false,
            isLead:           false,
            lastSeenAt:       Carbon::now()->subHours(2),
            conversation:     null,
            lastMessage:      null,
        );

        // Still gets the 24h activity boost (50).
        $this->assertSame(50, $score,
            '2-hour-old contact: no 300 base, but 24h activity boost = 50.');
    }

    public function test_online_anonymous_returns_100(): void
    {
        // The lowest tier of online: visitor is here but we have no
        // contact info on them. Still surfaces above pure-cold rows.
        $score = EngagementFeedService::scoreRow(
            isOnline:         true,
            hasContact:       false,
            hasUnreadVisitor: false,
            hasActiveChat:    false,
            isLead:           false,
            lastSeenAt:       null,
            conversation:     null,
            lastMessage:      null,
        );

        $this->assertSame(100, $score);
    }

    public function test_human_waiting_more_than_5_min_adds_200_boost(): void
    {
        // The +200 attention-needed boost: a conversation with
        // (status=active) + (no assignee) + (last message from
        // visitor) + (last message > 5 min ago) is a guest waiting
        // for a human reply that nobody's picked up.
        $convo = $this->emptyConversation('active');
        $convo->assigned_to = null;
        $convo->last_message_at = Carbon::now()->subMinutes(10);

        $msg = new ChatMessage();
        $msg->sender_type = 'visitor';

        $score = EngagementFeedService::scoreRow(
            isOnline:         false,
            hasContact:       true,
            hasUnreadVisitor: false,
            hasActiveChat:    false,
            isLead:           false,
            lastSeenAt:       null,
            conversation:     $convo,
            lastMessage:      $msg,
        );

        // Base is 0 (offline + no last_seen). Boost = +200.
        $this->assertSame(200, $score);
    }

    public function test_human_waiting_boost_NOT_applied_when_assignee_present(): void
    {
        // The boost only fires when assigned_to is empty — once an
        // agent owns the conversation, the row doesn't need an
        // extra attention bump.
        $convo = $this->emptyConversation('active');
        $convo->assigned_to = 42; // someone's on it
        $convo->last_message_at = Carbon::now()->subMinutes(10);

        $msg = new ChatMessage();
        $msg->sender_type = 'visitor';

        $score = EngagementFeedService::scoreRow(
            isOnline:         false,
            hasContact:       true,
            hasUnreadVisitor: false,
            hasActiveChat:    false,
            isLead:           false,
            lastSeenAt:       null,
            conversation:     $convo,
            lastMessage:      $msg,
        );

        $this->assertSame(0, $score,
            'Assigned conversation must NOT receive the +200 boost.');
    }

    public function test_human_waiting_boost_NOT_applied_when_last_message_was_admin(): void
    {
        // We only boost when the VISITOR is waiting. If the last
        // message was from staff/AI, we're not "waiting on
        // ourselves" — no boost.
        $convo = $this->emptyConversation('active');
        $convo->assigned_to = null;
        $convo->last_message_at = Carbon::now()->subMinutes(10);

        $msg = new ChatMessage();
        $msg->sender_type = 'agent'; // staff replied last

        $score = EngagementFeedService::scoreRow(
            isOnline:         false,
            hasContact:       true,
            hasUnreadVisitor: false,
            hasActiveChat:    false,
            isLead:           false,
            lastSeenAt:       null,
            conversation:     $convo,
            lastMessage:      $msg,
        );

        $this->assertSame(0, $score,
            'Last message from agent must NOT trigger the human-waiting boost.');
    }

    public function test_recent_activity_24h_boost_adds_50(): void
    {
        // Any activity within RECENT_ACTIVITY_HOURS (24) gets +50.
        // Lift over completely cold rows so a returning visitor
        // who hasn't filled out contact info still surfaces above
        // a never-active visitor.
        $score = EngagementFeedService::scoreRow(
            isOnline:         false,
            hasContact:       false,
            hasUnreadVisitor: false,
            hasActiveChat:    false,
            isLead:           false,
            lastSeenAt:       Carbon::now()->subHours(12),
            conversation:     null,
            lastMessage:      null,
        );

        $this->assertSame(50, $score);
    }

    public function test_recent_activity_boost_does_NOT_fire_past_24h(): void
    {
        // The boundary: an exactly-25h-old last_seen_at does not
        // get the boost (off-by-one guard).
        $score = EngagementFeedService::scoreRow(
            isOnline:         false,
            hasContact:       false,
            hasUnreadVisitor: false,
            hasActiveChat:    false,
            isLead:           false,
            lastSeenAt:       Carbon::now()->subHours(25),
            conversation:     null,
            lastMessage:      null,
        );

        $this->assertSame(0, $score);
    }

    public function test_hot_lead_flag_adds_250_boost(): void
    {
        // Phase 3 hot-lead lift — sizeable so hot leads surface
        // above ordinary rows even when offline.
        $score = EngagementFeedService::scoreRow(
            isOnline:         false,
            hasContact:       true,
            hasUnreadVisitor: false,
            hasActiveChat:    false,
            isLead:           true,
            lastSeenAt:       null,
            conversation:     null,
            lastMessage:      null,
            isHotLead:        true,
        );

        // No base score (offline + no recent activity), boost only.
        $this->assertSame(250, $score);
    }

    public function test_compound_signals_stack_correctly(): void
    {
        // Mega scenario: online + unread (1000 base) + human waiting
        // 5+ min (+200) + recent activity (+50) + hot lead (+250)
        // = 1500 expected.
        $convo = $this->emptyConversation('active');
        $convo->assigned_to = null;
        $convo->last_message_at = Carbon::now()->subMinutes(10);
        $msg = new ChatMessage();
        $msg->sender_type = 'visitor';

        $score = EngagementFeedService::scoreRow(
            isOnline:         true,
            hasContact:       true,
            hasUnreadVisitor: true,
            hasActiveChat:    true,
            isLead:           true,
            lastSeenAt:       Carbon::now()->subHours(1),
            conversation:     $convo,
            lastMessage:      $msg,
            isHotLead:        true,
        );

        $this->assertSame(1500, $score,
            '1000 (online+unread) + 200 (human waiting) + 50 (24h activity) + 250 (hot lead) = 1500.');
    }

    public function test_base_scores_are_strictly_ordered_high_to_low(): void
    {
        // The cross-tier ranking invariant: 1000 > 700 > 500 > 300
        // > 100 > 0. Without this, a regression that swaps two
        // scores would silently bury a hotter row beneath a cooler
        // one. Lock the strict ordering as a single assertion.
        $convoActiveAi = $this->emptyConversation('active');
        $convoActiveAi->ai_enabled = true;

        $unread     = EngagementFeedService::scoreRow(true, false, true,  false, false, null, null, null);
        $aiActive   = EngagementFeedService::scoreRow(true, false, false, true,  false, null, $convoActiveAi, null);
        $onlineCtct = EngagementFeedService::scoreRow(true, true,  false, false, false, null, null, null);
        $recentCtct = EngagementFeedService::scoreRow(false, true, false, false, false, Carbon::now()->subMinutes(5), null, null);
        $onlineAnon = EngagementFeedService::scoreRow(true, false, false, false, false, null, null, null);
        $nothing    = EngagementFeedService::scoreRow(false, false, false, false, false, null, null, null);

        // strict order — every base bucket strictly outranks the
        // next. The recent-contact case includes the +50 boost so
        // it tests at 350 > 100, still proves recent-contact wins.
        $this->assertGreaterThan($aiActive, $unread);
        $this->assertGreaterThan($onlineCtct, $aiActive);
        $this->assertGreaterThan($recentCtct, $onlineCtct);
        $this->assertGreaterThan($onlineAnon, $recentCtct);
        $this->assertGreaterThan($nothing, $onlineAnon);
    }
}
