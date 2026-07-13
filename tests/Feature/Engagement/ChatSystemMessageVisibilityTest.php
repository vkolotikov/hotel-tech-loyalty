<?php

namespace Tests\Feature\Engagement;

use App\Http\Controllers\Api\V1\Widget\WidgetChatController;
use App\Models\ChatConversation;
use App\Models\ChatMessage;
use App\Models\ChatWidgetConfig;
use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the 2026-07 chat-noise fixes — the customer-visible
 * "Auto-resolved after 4h of inactivity" spam wall.
 *
 * The failure loop being locked out:
 *
 *   1. chat:reap resolves an idle conversation + appends a `system`
 *      ChatMessage ("Auto-resolved after 4h of inactivity").
 *   2. The visitor returns; widget init blindly stomped
 *      status='active' + last_message_at=now() on the SAME
 *      conversation — with zero new messages.
 *   3. 4h later the reaper resolved it AGAIN → another system row.
 *   4. Widget history + poll rendered system rows as chat bubbles →
 *      the visitor saw a screen-high wall of "Auto-resolved…".
 *
 * Contract:
 *   - system messages never reach the widget (history NOR poll)
 *   - widget init preserves status + last_message_at on resume
 *   - a visitor's real message still reactivates (resolved→waiting,
 *     covered by the message-path code; asserted here via reap
 *     re-running on genuinely-stale rows only)
 */
class ChatSystemMessageVisibilityTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    private const WIDGET_KEY = 'wk_test_system_visibility';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpChatSchema();

        $org = Organization::create(['name' => 'Chat Test Org', 'slug' => 'chat-test-' . uniqid()]);
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        ChatWidgetConfig::create([
            'organization_id' => $this->orgId,
            'widget_key'      => self::WIDGET_KEY,
            'is_active'       => true,
            'welcome_message' => 'Hi!',
        ]);
    }

    private function setUpChatSchema(): void
    {
        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->softDeletes();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('visitors')) {
            Schema::create('visitors', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('visitor_key', 64)->nullable();
                $t->string('visitor_ip', 64)->nullable();
                $t->text('user_agent')->nullable();
                $t->string('country', 4)->nullable();
                $t->string('city')->nullable();
                $t->text('referrer')->nullable();
                $t->text('current_page')->nullable();
                $t->text('current_page_title')->nullable();
                $t->timestamp('first_seen_at')->nullable();
                $t->timestamp('last_seen_at')->nullable();
                $t->integer('visit_count')->default(0);
                $t->integer('page_views_count')->default(0);
                $t->integer('messages_count')->default(0);
                $t->boolean('is_lead')->default(false);
                $t->unsignedBigInteger('guest_id')->nullable();
                $t->string('display_name')->nullable();
                $t->string('email')->nullable();
                $t->string('phone')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('chat_conversations')) {
            Schema::create('chat_conversations', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('status', 16)->default('active');
                $t->boolean('ai_enabled')->default(true);
                $t->unsignedBigInteger('assigned_to')->nullable();
                $t->string('visitor_name')->nullable();
                $t->string('visitor_email')->nullable();
                $t->timestamp('last_message_at')->nullable();
                $t->timestamps();
            });
        }
        // Columns the widget init / poll / reaper paths touch that the
        // shared engagement schema doesn't carry.
        $extraConvCols = [
            ['session_id', 'string'], ['brand_id', 'unsignedBigInteger'],
            ['visitor_id', 'unsignedBigInteger'], ['visitor_phone', 'string'],
            ['visitor_ip', 'string'], ['visitor_user_agent', 'string'],
            ['page_url', 'text'], ['channel', 'string'],
            ['rating_requested', 'boolean'], ['messages_count', 'integer'],
            ['agent_typing_until', 'timestamp'], ['active_agent_name', 'string'],
            ['active_agent_avatar', 'string'], ['intent_tag', 'string'],
            ['lead_captured', 'boolean'], ['inquiry_id', 'unsignedBigInteger'],
        ];
        Schema::table('chat_conversations', function ($t) use ($extraConvCols) {
            foreach ($extraConvCols as [$col, $type]) {
                if (Schema::hasColumn('chat_conversations', $col)) continue;
                $t->{$type}($col)->nullable();
            }
        });
        if (!Schema::hasTable('chat_messages')) {
            Schema::create('chat_messages', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('conversation_id');
                $t->string('sender_type', 16);
                $t->unsignedBigInteger('sender_user_id')->nullable();
                $t->string('direction', 16)->nullable();
                $t->text('content')->nullable();
                $t->string('content_type', 32)->nullable();
                $t->boolean('is_read')->default(false);
                $t->text('metadata')->nullable();
                $t->string('client_id', 64)->nullable();
                $t->text('attachment_url')->nullable();
                $t->string('attachment_type', 32)->nullable();
                $t->unsignedBigInteger('attachment_size')->nullable();
                $t->timestamps();
                $t->index('conversation_id');
            });
        }
        if (!Schema::hasTable('chat_widget_configs')) {
            Schema::create('chat_widget_configs', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('widget_key', 64);
                $t->boolean('is_active')->default(true);
                $t->text('welcome_message')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('ai_conversations')) {
            Schema::create('ai_conversations', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('member_id')->nullable();
                $t->string('session_id', 64)->nullable();
                $t->text('messages')->nullable();
                $t->integer('tokens_used')->nullable();
                $t->string('model', 64)->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
    }

    private function makeConversation(array $overrides = []): ChatConversation
    {
        return ChatConversation::create(array_merge([
            'organization_id' => $this->orgId,
            'session_id'      => 'sess-' . uniqid(),
            'status'          => 'active',
            'channel'         => 'widget',
            'messages_count'  => 0,
            'last_message_at' => now(),
        ], $overrides));
    }

    private function widgetRequest(array $input): Request
    {
        $request = Request::create('/widget', 'POST', $input);
        $request->headers->set('User-Agent', 'PHPUnit');
        return $request;
    }

    /* ─── reaper ───────────────────────────────────────────────────── */

    public function test_reap_resolves_stale_conversation_and_appends_one_system_row(): void
    {
        $conv = $this->makeConversation(['last_message_at' => now()->subHours(6)]);

        $this->artisan('chat:reap')->assertSuccessful();

        $conv->refresh();
        $this->assertSame('resolved', $conv->status);
        $this->assertSame(1, ChatMessage::where('conversation_id', $conv->id)->where('sender_type', 'system')->count());

        // Second run must be a no-op — resolved rows are out of scope,
        // so the system-note count cannot grow.
        $this->artisan('chat:reap')->assertSuccessful();
        $this->assertSame(1, ChatMessage::where('conversation_id', $conv->id)->where('sender_type', 'system')->count());
    }

    /* ─── widget poll ──────────────────────────────────────────────── */

    public function test_poll_delivers_agent_and_ai_but_never_system_messages(): void
    {
        $conv = $this->makeConversation();
        foreach ([
            ['sender_type' => 'agent',   'content' => 'Hello from a human'],
            ['sender_type' => 'ai',      'content' => 'Hello from the bot'],
            ['sender_type' => 'system',  'content' => 'Auto-resolved after 4h of inactivity'],
            ['sender_type' => 'visitor', 'content' => 'My own message'],
        ] as $m) {
            ChatMessage::create($m + [
                'organization_id' => $this->orgId,
                'conversation_id' => $conv->id,
                'direction'       => 'outbound',
            ]);
        }

        $response = app(WidgetChatController::class)->poll(
            $this->widgetRequest(['session_id' => $conv->session_id]),
            self::WIDGET_KEY,
        );

        $payload  = $response->getData(true);
        $contents = array_column($payload['messages'], 'content');
        $this->assertContains('Hello from a human', $contents);
        $this->assertContains('Hello from the bot', $contents);
        $this->assertNotContains('Auto-resolved after 4h of inactivity', $contents);
        $this->assertNotContains('My own message', $contents); // visitor echo guard unchanged
    }

    /* ─── widget init ──────────────────────────────────────────────── */

    public function test_init_resume_preserves_resolved_status_and_hides_system_history(): void
    {
        $resolvedAt = now()->subDays(2)->startOfSecond();
        $conv = $this->makeConversation([
            'status'          => 'resolved',
            'last_message_at' => $resolvedAt,
        ]);
        ChatMessage::create([
            'organization_id' => $this->orgId,
            'conversation_id' => $conv->id,
            'sender_type'     => 'ai',
            'direction'       => 'outbound',
            'content'         => 'Real reply',
        ]);
        ChatMessage::create([
            'organization_id' => $this->orgId,
            'conversation_id' => $conv->id,
            'sender_type'     => 'system',
            'direction'       => 'outbound',
            'content'         => 'Auto-resolved after 4h of inactivity',
        ]);

        $response = app(WidgetChatController::class)->initSession(
            $this->widgetRequest(['session_id' => $conv->session_id, 'page_url' => 'https://hotel.example/rooms']),
            self::WIDGET_KEY,
        );

        $payload = $response->getData(true);
        $this->assertSame($conv->session_id, $payload['session_id']);

        // History rehydrates the real exchange, never the ops notes.
        $contents = array_column($payload['messages'], 'content');
        $this->assertContains('Real reply', $contents);
        $this->assertNotContains('Auto-resolved after 4h of inactivity', $contents);

        // The resume must NOT reactivate the conversation or fake message
        // recency — that was the reap→reopen→reap loop. Metadata still
        // refreshes (page_url).
        $conv->refresh();
        $this->assertSame('resolved', $conv->status);
        $this->assertSame(
            $resolvedAt->toIso8601String(),
            $conv->last_message_at?->toIso8601String(),
        );
        $this->assertSame('https://hotel.example/rooms', $conv->page_url);
    }

    public function test_init_new_session_still_creates_active_conversation(): void
    {
        $response = app(WidgetChatController::class)->initSession(
            $this->widgetRequest([]),
            self::WIDGET_KEY,
        );

        $payload = $response->getData(true);
        $conv = ChatConversation::where('session_id', $payload['session_id'])->first();
        $this->assertNotNull($conv);
        $this->assertSame('active', $conv->status);
        $this->assertNotNull($conv->last_message_at);
    }
}
