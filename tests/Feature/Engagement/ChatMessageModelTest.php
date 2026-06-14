<?php

namespace Tests\Feature\Engagement;

use App\Models\ChatMessage;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the ChatMessage model contract — single message row in a
 * chat conversation thread.
 *
 * Why this matters:
 *
 *   ChatMessage::DIRECTION_* constants drive the Phase 2 outbound
 *   send routing (ChannelRouter reads sender_type+direction to
 *   decide if a message goes out via the dispatcher). The 4
 *   scopes feed Engagement Hub's filter chips ('AI replies' / 'My
 *   replies' / 'From visitor' / 'Unread').
 *
 *   $timestamps = false is the load-bearing invariant: chat
 *   ordering depends on the controller-stamped created_at, NOT
 *   Eloquent's auto-set. Messenger webhook arrival vs Eloquent
 *   created_at can differ by seconds when batching — only the
 *   manual stamp preserves real conversation order.
 *
 * Contract:
 *
 *   - $timestamps = false (manual created_at; no updated_at column
 *     in fillable)
 *   - DIRECTION_INBOUND + DIRECTION_OUTBOUND constants locked
 *   - 4 scopes: fromVisitor / fromAi / fromAgent / unread
 *   - Casts: is_read bool, metadata + attachments_data array,
 *     created_at datetime
 *   - conversation BelongsTo (FK 'conversation_id' — NOT
 *     'chat_conversation_id')
 *   - senderUser BelongsTo (FK 'sender_user_id')
 *   - BelongsToOrganization + TenantScope isolation
 */
class ChatMessageModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpEngagementSchema();

        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->string('widget_token', 64)->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->softDeletes();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('chat_messages')) {
            Schema::create('chat_messages', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('conversation_id');
                $t->string('sender_type', 16);
                $t->unsignedBigInteger('sender_user_id')->nullable();
                $t->text('content')->nullable();
                $t->string('content_type', 32)->nullable();
                $t->boolean('is_read')->default(false);
                $t->text('metadata')->nullable();
                $t->string('client_id')->nullable();
                $t->string('attachment_url')->nullable();
                $t->string('attachment_type')->nullable();
                $t->integer('attachment_size')->nullable();
                $t->unsignedBigInteger('channel_account_id')->nullable();
                $t->string('channel_message_id')->nullable();
                $t->string('direction', 16)->nullable();
                $t->text('attachments_data')->nullable();
                // Manual created_at — \$timestamps = false on the
                // model; only the controller stamps this.
                $t->timestamp('created_at')->useCurrent();
                $t->index(['organization_id', 'conversation_id']);
            });
        }

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        parent::tearDown();
    }

    private function message(array $attrs = []): ChatMessage
    {
        return ChatMessage::create(array_merge([
            'organization_id' => $this->orgId,
            'conversation_id' => 1,
            'sender_type'     => 'visitor',
            'content'         => 'Test message',
            'created_at'      => now(),
        ], $attrs));
    }

    /* ─── $timestamps = false invariant ─── */

    public function test_timestamps_is_false_on_the_model(): void
    {
        // CRITICAL: chat ordering depends on the controller-stamped
        // created_at, NOT Eloquent's auto-set. Messenger webhook
        // arrival vs Eloquent created_at can differ by seconds when
        // batching — only the manual stamp preserves real
        // conversation order.
        $msg = new ChatMessage();

        $this->assertFalse($msg->usesTimestamps(),
            'CRITICAL: ChatMessage::$timestamps MUST be false. Chat ordering '
            . 'depends on controller-stamped created_at, not Eloquent auto-set.',
        );
    }

    public function test_no_updated_at_in_fillable(): void
    {
        // Defensive: with timestamps=false, updated_at is
        // never written. Lock that the model doesn't accept it
        // via fillable.
        $this->assertNotContains('updated_at', (new ChatMessage())->getFillable(),
            'updated_at MUST NOT be in fillable when timestamps=false.');
    }

    /* ─── Direction constants ─── */

    public function test_direction_constants_are_locked_canonical_strings(): void
    {
        // Lock the 2 documented direction values. ChannelRouter
        // reads sender_type+direction to decide outbound send;
        // a typo silently breaks outbound routing.
        $this->assertSame('inbound',  ChatMessage::DIRECTION_INBOUND);
        $this->assertSame('outbound', ChatMessage::DIRECTION_OUTBOUND);
    }

    /* ─── 4 query scopes ─── */

    public function test_scope_from_visitor_filters_sender_type_visitor(): void
    {
        // Drives 'From visitor' filter chip on the Engagement
        // feed + the Messenger inbound webhook handler.
        $this->message(['sender_type' => 'visitor']);
        $this->message(['sender_type' => 'ai']);
        $this->message(['sender_type' => 'agent']);

        $visitor = ChatMessage::fromVisitor()->get();
        $this->assertCount(1, $visitor);
        $this->assertSame('visitor', $visitor->first()->sender_type);
    }

    public function test_scope_from_ai_filters_sender_type_ai(): void
    {
        // 'AI replies' filter chip + the AI usage analytics on
        // /admin/ai-usage.
        $this->message(['sender_type' => 'visitor']);
        $this->message(['sender_type' => 'ai']);
        $this->message(['sender_type' => 'ai']);

        $ai = ChatMessage::fromAi()->get();
        $this->assertCount(2, $ai);
    }

    public function test_scope_from_agent_filters_sender_type_agent(): void
    {
        // 'My replies' filter chip on the agent console.
        $this->message(['sender_type' => 'agent']);
        $this->message(['sender_type' => 'visitor']);

        $this->assertCount(1, ChatMessage::fromAgent()->get());
    }

    public function test_scope_unread_filters_is_read_false(): void
    {
        // CRITICAL: drives the unread badge + the smart-priority
        // sort in Engagement feed. A regression that flipped the
        // predicate would silently re-mark every conversation as
        // unread.
        $this->message(['is_read' => false]);
        $this->message(['is_read' => true]);
        $this->message(['is_read' => false]);

        $unread = ChatMessage::unread()->get();
        $this->assertCount(2, $unread);
        foreach ($unread as $msg) {
            $this->assertFalse($msg->is_read);
        }
    }

    /* ─── Casts ─── */

    public function test_is_read_casts_to_boolean(): void
    {
        $unread = $this->message(['is_read' => false]);
        $read = $this->message(['is_read' => true]);

        $this->assertFalse($unread->is_read);
        $this->assertTrue($read->is_read);
        $this->assertIsBool($unread->is_read);
    }

    public function test_metadata_round_trips_through_array_cast(): void
    {
        // metadata carries raw webhook payload (Meta delivery
        // status, reactions, etc) for diag replay.
        $payload = [
            'meta_event' => 'message_reads',
            'reactions'  => ['❤️', '👍'],
            'platform'   => 'instagram',
        ];

        $msg = $this->message(['metadata' => $payload]);

        $this->assertSame($payload, $msg->fresh()->metadata);
    }

    public function test_attachments_data_round_trips_through_array_cast(): void
    {
        // attachments_data carries normalised attachment metadata
        // that outlives the raw webhook metadata blob (per source
        // docblock).
        $attachments = [
            ['type' => 'image', 'url' => 'https://example.com/a.jpg', 'width' => 1024],
            ['type' => 'video', 'url' => 'https://example.com/v.mp4'],
        ];

        $msg = $this->message(['attachments_data' => $attachments]);

        $this->assertSame($attachments, $msg->fresh()->attachments_data);
    }

    public function test_created_at_casts_to_carbon(): void
    {
        // Even with timestamps=false, the created_at column is
        // cast to Carbon. The Engagement feed's sort + diffForHumans
        // depend on this.
        $msg = $this->message(['created_at' => now()->subMinute()]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $msg->created_at);
    }

    /* ─── Relationships + FK locks ─── */

    public function test_conversation_relationship_uses_conversation_id_foreign_key(): void
    {
        // CRITICAL: FK is 'conversation_id', NOT the conventional
        // 'chat_conversation_id'. ChatConversation.messages uses
        // the same name (locked in W3) — both must stay in sync.
        $msg = $this->message();
        $rel = $msg->conversation();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $rel,
        );
        $this->assertSame('conversation_id', $rel->getForeignKeyName(),
            'conversation FK MUST be conversation_id (NOT chat_conversation_id).');
    }

    public function test_sender_user_relationship_uses_sender_user_id_foreign_key(): void
    {
        // senderUser is the staff member who sent an outbound
        // message (sender_type='agent'). Visitor messages have
        // null sender_user_id.
        $msg = $this->message();
        $rel = $msg->senderUser();

        $this->assertSame('sender_user_id', $rel->getForeignKeyName(),
            'senderUser FK MUST be sender_user_id.');
    }

    /* ─── BelongsToOrganization + TenantScope ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        // The widget webhook handler depends on this — incoming
        // messages don't carry org_id explicitly; trait fills from
        // resolved context.
        $msg = $this->message();

        $this->assertSame($this->orgId, (int) $msg->organization_id);
    }

    public function test_tenant_scope_isolates_chat_messages_cross_org(): void
    {
        // CRITICAL: chat content is tenant-private. Cross-leak
        // would expose customer conversations across orgs.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        $this->message(['content' => 'Org A msg']);
        \DB::table('chat_messages')->insert([
            'organization_id' => $orgB,
            'conversation_id' => 1,
            'sender_type'     => 'visitor',
            'content'         => 'Org B msg',
            'created_at'      => now(),
        ]);

        $aRows = ChatMessage::all();
        $this->assertCount(1, $aRows);
        $this->assertSame('Org A msg', $aRows->first()->content);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $bRows = ChatMessage::all();
        $this->assertCount(1, $bRows);
        $this->assertSame('Org B msg', $bRows->first()->content);
    }
}
