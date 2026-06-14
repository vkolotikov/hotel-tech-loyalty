<?php

namespace Tests\Feature\Engagement;

use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Services\EngagementAiService;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use ReflectionMethod;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the testable contract of EngagementAiService — the per-
 * conversation AI brief + intent tag for the Engagement Hub drawer
 * (May 2026 Phase 3 ship).
 *
 * Surfaces locked:
 *
 *   5-min cache semantics (parallel to InquiryAiService's 15-min):
 *     - Cached payload returns when ai_brief + ai_brief_at present
 *       AND <5min old
 *     - Empty ai_brief → cache MISS even when ai_brief_at fresh
 *     - Stale (>5min) ai_brief_at → cache MISS
 *     - No ai_brief_at → cache MISS
 *     - forceRefresh=true bypasses cache
 *
 *   Empty conversation handling:
 *     - Visitor opened the widget but never typed → returns the
 *       documented stub brief without an OpenAI call. Drawer
 *       renders the "nothing yet" UI cleanly.
 *
 *   normaliseIntent (the 7 canonical Engagement intents):
 *     - 7 documented intents pass through unchanged
 *     - Anything else → 'other' (defensive default — pre-fix the
 *       audit caught a value-collision with InquiryAiService's
 *       INTENTS that silently mis-classified leads)
 *     - Case-insensitive, trims whitespace
 *
 *   The 7 intents are: booking_inquiry, info_request, complaint,
 *   cancellation, support, spam, other. Backed by
 *   App\Enums\ConversationIntent and frontend's intentMeta.ts —
 *   editing this list requires syncing both halves.
 */
class EngagementAiServiceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private EngagementAiService $service;
    private ReflectionMethod $normIntent;
    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpEngagementSchema(); // chat_conversations + visitors

        // Organization::booted's created hook auto-inserts a default
        // brand for every new org. Without the brands table the hook
        // throws and OrganizationFactory::create() fails.
        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->string('logo_url')->nullable();
                $t->string('widget_token', 64)->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->softDeletes();
                $t->timestamps();
            });
        }

        // chat_conversations needs ai_brief + ai_brief_at + intent_tag
        // for the cache check. Engagement schema doesn't include them.
        // brand_id is required by ChatConversation's BelongsToBrand
        // auto-fill on creation (binds to current_brand_id or NULL).
        if (!Schema::hasColumn('chat_conversations', 'ai_brief')) {
            Schema::table('chat_conversations', function ($t) {
                $t->text('ai_brief')->nullable();
                $t->timestamp('ai_brief_at')->nullable();
                $t->string('intent_tag', 32)->nullable();
                $t->unsignedBigInteger('brand_id')->nullable();
            });
        }

        // chat_messages — gatherContext queries it. Minimal columns.
        if (!Schema::hasTable('chat_messages')) {
            Schema::create('chat_messages', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('conversation_id');
                $t->string('sender_type', 16); // visitor / agent / ai
                $t->text('content')->nullable();
                $t->timestamps();
                $t->index('conversation_id');
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        $this->service = new EngagementAiService();

        $this->normIntent = new ReflectionMethod($this->service, 'normaliseIntent');
        $this->normIntent->setAccessible(true);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    /** Build a minimally-fleshed chat conversation. */
    private function conversation(array $attrs = []): ChatConversation
    {
        return ChatConversation::create(array_merge([
            'organization_id' => $this->orgId,
            'status'          => 'active',
        ], $attrs));
    }

    /* ─── 5-min cache semantics ─── */

    public function test_fresh_cache_returns_cached_payload(): void
    {
        // <5 min old ai_brief_at + non-empty ai_brief → cache HIT.
        $conv = $this->conversation([
            'ai_brief'    => 'Visitor asked about availability for next weekend.',
            'ai_brief_at' => now()->subMinutes(2),
            'intent_tag'  => 'booking_inquiry',
        ]);

        $result = $this->service->briefForConversation($conv);

        $this->assertTrue($result['cached'],
            '<5min ai_brief_at + non-empty ai_brief MUST return cached:true.');
        $this->assertSame('Visitor asked about availability for next weekend.', $result['brief']);
        $this->assertSame('booking_inquiry', $result['intent_tag']);
        $this->assertNotEmpty($result['generated_at'],
            'generated_at MUST surface for the cached payload.');
    }

    public function test_empty_ai_brief_yields_cache_miss_even_when_fresh(): void
    {
        // Same CRITICAL guard as InquiryAiService: an empty brief
        // even within the 5-min window MUST regenerate.
        $conv = $this->conversation([
            'ai_brief'    => '',
            'ai_brief_at' => now()->subMinute(),
            'intent_tag'  => 'support',
        ]);

        // Seed a chat_message so gatherContext doesn't take the
        // "empty conversation" early-out path.
        ChatMessage::create([
            'organization_id' => $this->orgId,
            'conversation_id' => $conv->id,
            'sender_type'     => 'visitor',
            'content'         => 'Hi, do you have a room?',
        ]);

        $result = $this->service->briefForConversation($conv);

        $this->assertFalse($result['cached'],
            'Empty ai_brief MUST be cache MISS regardless of ai_brief_at freshness.');
    }

    public function test_stale_ai_brief_at_yields_cache_miss(): void
    {
        // 6 minutes > 5-min TTL → cache MISS.
        $conv = $this->conversation([
            'ai_brief'    => 'Aged-out brief.',
            'ai_brief_at' => now()->subMinutes(6),
        ]);

        ChatMessage::create([
            'organization_id' => $this->orgId,
            'conversation_id' => $conv->id,
            'sender_type'     => 'visitor',
            'content'         => 'still here',
        ]);

        $result = $this->service->briefForConversation($conv);

        $this->assertFalse($result['cached'],
            'Stale (>5min) ai_brief_at MUST yield cache MISS.');
    }

    public function test_no_ai_brief_at_yields_cache_miss(): void
    {
        // First-ever generation: no ai_brief_at → MISS.
        $conv = $this->conversation([
            'ai_brief'    => null,
            'ai_brief_at' => null,
        ]);

        ChatMessage::create([
            'organization_id' => $this->orgId,
            'conversation_id' => $conv->id,
            'sender_type'     => 'visitor',
            'content'         => 'hello?',
        ]);

        $result = $this->service->briefForConversation($conv);

        $this->assertFalse($result['cached']);
    }

    public function test_force_refresh_bypasses_otherwise_valid_cache(): void
    {
        // The 'Refresh brief' UI control MUST regenerate even when
        // the cache is fresh — agents need to be able to pull a
        // brand-new brief if the visitor just typed something new.
        $conv = $this->conversation([
            'ai_brief'    => 'Cached but force-refreshed.',
            'ai_brief_at' => now()->subSecond(),
        ]);

        ChatMessage::create([
            'organization_id' => $this->orgId,
            'conversation_id' => $conv->id,
            'sender_type'     => 'visitor',
            'content'         => 'updated info',
        ]);

        $result = $this->service->briefForConversation($conv, forceRefresh: true);

        $this->assertFalse($result['cached']);
    }

    /* ─── Empty conversation early-out ─── */

    public function test_empty_conversation_returns_stub_brief_without_openai_call(): void
    {
        // Visitor opened the widget but never typed. The service
        // MUST return a documented stub brief without spending an
        // OpenAI call — paying for empty-string summarisation
        // is wasted spend across millions of widget-open events.
        $conv = $this->conversation([
            'ai_brief'    => null,
            'ai_brief_at' => null,
            'intent_tag'  => null,
        ]);
        // NO chat_messages seeded — empty conversation.

        $result = $this->service->briefForConversation($conv);

        $this->assertStringContainsString('No messages yet', $result['brief'],
            'Empty conversation MUST return the documented stub brief.');
        $this->assertFalse($result['cached'],
            'Stub is not cached — caller knows it didn\'t come from a real generation.');
    }

    public function test_empty_conversation_preserves_prior_intent_tag(): void
    {
        // If the conversation has a prior intent_tag (from an
        // earlier session that did have messages), the empty-
        // conversation stub MUST preserve it — don't clobber
        // established classification.
        $conv = $this->conversation([
            'ai_brief'    => null,
            'ai_brief_at' => null,
            'intent_tag'  => 'booking_inquiry', // prior
        ]);

        $result = $this->service->briefForConversation($conv);

        $this->assertSame('booking_inquiry', $result['intent_tag'],
            'Empty-conversation stub MUST preserve prior intent_tag.');
    }

    /* ─── normaliseIntent: 7 canonical intents ─── */

    public function test_seven_documented_intents_pass_through(): void
    {
        // The 7 ConversationIntent enum values. Backed by
        // App\Enums\ConversationIntent + frontend intentMeta.ts.
        // Both halves MUST stay in sync — adding an 8th intent
        // needs simultaneous changes on both sides.
        $valid = [
            'booking_inquiry', 'info_request', 'complaint',
            'cancellation',    'support',      'spam', 'other',
        ];

        foreach ($valid as $intent) {
            $result = $this->normIntent->invoke($this->service, $intent);
            $this->assertSame($intent, $result,
                "Documented intent '{$intent}' MUST pass through.");
        }
    }

    public function test_unknown_intent_falls_back_to_other(): void
    {
        // CRITICAL: the audit caught a silent value-collision with
        // InquiryAiService's INTENTS taxonomy (different values,
        // same name). Unknown intents MUST land in 'other' so they
        // surface in the SPA's intent filter as a known bucket
        // instead of a phantom chip.
        $this->assertSame('other',
            $this->normIntent->invoke($this->service, 'group')); // valid for Inquiry, not Engagement
        $this->assertSame('other',
            $this->normIntent->invoke($this->service, 'urgent_lead'));
    }

    public function test_intent_normalisation_is_case_insensitive(): void
    {
        $this->assertSame('booking_inquiry',
            $this->normIntent->invoke($this->service, 'BOOKING_INQUIRY'));
        $this->assertSame('complaint',
            $this->normIntent->invoke($this->service, 'Complaint'));
    }

    public function test_intent_normalisation_trims_whitespace(): void
    {
        $this->assertSame('cancellation',
            $this->normIntent->invoke($this->service, '  cancellation  '));
    }

    public function test_null_and_empty_intent_falls_back_to_other(): void
    {
        $this->assertSame('other',
            $this->normIntent->invoke($this->service, null));
        $this->assertSame('other',
            $this->normIntent->invoke($this->service, ''));
    }

    public function test_intent_taxonomy_explicitly_excludes_inquiry_categories(): void
    {
        // Defense in depth: the InquiryAiService taxonomy includes
        // 'group' and 'event' which are NOT valid Engagement
        // intents. Lock the exclusion explicitly — pre-fix the
        // audit caught silent cross-contamination.
        $inquiryOnly = ['group', 'event'];

        foreach ($inquiryOnly as $intent) {
            $this->assertSame('other',
                $this->normIntent->invoke($this->service, $intent),
                "Inquiry-only category '{$intent}' MUST NOT classify as a valid Engagement intent.");
        }
    }
}
