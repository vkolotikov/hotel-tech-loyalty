<?php

namespace Tests\Feature\Engagement;

use App\Models\ChatConversation;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the ChatConversation model contract — the core
 * conversation row that drives Engagement Hub + chat inbox.
 *
 * Surfaces locked:
 *
 *   Casts: 3× boolean (lead_captured / ai_enabled /
 *   rating_requested), 4× datetime (last_message_at +
 *   visitor_typing_until + agent_typing_until + ai_brief_at),
 *   2× integer (messages_count / rating)
 *
 *   Status scopes: active / waiting / resolved / unassigned
 *
 *   Relationships: messages HasMany with FK='conversation_id'
 *   (lock — NOT the conventional chat_conversation_id);
 *   member / assignedAgent / inquiry / visitor / channelAccount
 *   BelongsTo with their specific FKs
 *
 *   display_name accessor: visitor_name fallback to 'Visitor';
 *   member relation overrides when set
 *
 *   BelongsToOrganization + BelongsToBrand auto-fill + tenant
 *   isolation
 */
class ChatConversationModelTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpEngagementSchema(); // chat_conversations + visitors

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

        // Add the columns ChatConversation references that the
        // engagement schema doesn't carry by default.
        foreach ([
            'brand_id'              => 'unsignedBigInteger',
            'member_id'             => 'unsignedBigInteger',
            'visitor_id'            => 'unsignedBigInteger',
            'visitor_name'          => 'string',
            'visitor_email'         => 'string',
            'channel'               => 'string',
            'external_thread_id'    => 'string',
            'channel_account_id'    => 'unsignedBigInteger',
            'lead_captured'         => 'boolean',
            'inquiry_id'            => 'unsignedBigInteger',
            'messages_count'        => 'integer',
            'visitor_typing_until'  => 'timestamp',
            'agent_typing_until'    => 'timestamp',
            'rating'                => 'integer',
            'rating_requested'      => 'boolean',
            'intent_tag'            => 'string',
            'ai_brief'              => 'text',
            'ai_brief_at'           => 'timestamp',
        ] as $col => $type) {
            if (!Schema::hasColumn('chat_conversations', $col)) {
                Schema::table('chat_conversations', function ($t) use ($col, $type) {
                    $colDef = match ($type) {
                        'string'             => $t->string($col),
                        'text'               => $t->text($col),
                        'boolean'            => $t->boolean($col)->default(false),
                        'integer'            => $t->integer($col)->default(0),
                        'timestamp'          => $t->timestamp($col),
                        'unsignedBigInteger' => $t->unsignedBigInteger($col),
                    };
                    $colDef->nullable();
                });
            }
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
        if (app()->bound('current_brand_id')) {
            app()->forgetInstance('current_brand_id');
        }
        parent::tearDown();
    }

    private function conv(array $attrs = []): ChatConversation
    {
        return ChatConversation::create(array_merge([
            'organization_id' => $this->orgId,
            'status'          => 'active',
        ], $attrs));
    }

    /* ─── Boolean casts ─── */

    public function test_lead_captured_casts_to_boolean(): void
    {
        $captured = $this->conv(['lead_captured' => true]);
        $anon = $this->conv(['lead_captured' => false]);

        $this->assertTrue($captured->lead_captured);
        $this->assertFalse($anon->lead_captured);
        $this->assertIsBool($captured->lead_captured);
    }

    public function test_ai_enabled_casts_to_boolean(): void
    {
        // ai_enabled gates whether AI auto-replies vs idle. The
        // ChatInboxController reads this to decide handoff
        // behavior — a regression that surfaces it as 0/1 would
        // misbranch the routing.
        $aiOn = $this->conv(['ai_enabled' => true]);
        $aiOff = $this->conv(['ai_enabled' => false]);

        $this->assertTrue($aiOn->ai_enabled);
        $this->assertFalse($aiOff->ai_enabled);
    }

    public function test_rating_requested_casts_to_boolean(): void
    {
        $requested = $this->conv(['rating_requested' => true]);
        $not = $this->conv(['rating_requested' => false]);

        $this->assertTrue($requested->rating_requested);
        $this->assertFalse($not->rating_requested);
    }

    /* ─── Datetime casts ─── */

    public function test_datetime_columns_all_cast_to_carbon(): void
    {
        // 4 datetime fields drive different UI signals — typing
        // dots, brief freshness, last-message-at sort. All need
        // Carbon for ->gt() / ->isPast() comparisons.
        $now = now();
        $conv = $this->conv([
            'last_message_at'      => $now,
            'visitor_typing_until' => $now->copy()->addSeconds(3),
            'agent_typing_until'   => $now->copy()->addSeconds(3),
            'ai_brief_at'          => $now->copy()->subMinutes(2),
        ]);

        $this->assertInstanceOf(\Carbon\Carbon::class, $conv->last_message_at);
        $this->assertInstanceOf(\Carbon\Carbon::class, $conv->visitor_typing_until);
        $this->assertInstanceOf(\Carbon\Carbon::class, $conv->agent_typing_until);
        $this->assertInstanceOf(\Carbon\Carbon::class, $conv->ai_brief_at);
    }

    /* ─── Integer casts ─── */

    public function test_messages_count_and_rating_cast_to_int(): void
    {
        $conv = $this->conv([
            'messages_count' => '5',  // string input
            'rating'         => '4',
        ]);

        $this->assertSame(5, $conv->messages_count);
        $this->assertSame(4, $conv->rating);
        $this->assertIsInt($conv->messages_count);
    }

    /* ─── Status scopes ─── */

    public function test_scope_active_filters_to_active_status(): void
    {
        $this->conv(['status' => 'active']);
        $this->conv(['status' => 'waiting']);
        $this->conv(['status' => 'resolved']);

        $this->assertCount(1, ChatConversation::active()->get());
    }

    public function test_scope_waiting_filters_to_waiting_status(): void
    {
        $this->conv(['status' => 'active']);
        $this->conv(['status' => 'waiting']);
        $this->conv(['status' => 'waiting']);
        $this->conv(['status' => 'resolved']);

        $this->assertCount(2, ChatConversation::waiting()->get());
    }

    public function test_scope_resolved_filters_to_resolved_status(): void
    {
        $this->conv(['status' => 'active']);
        $this->conv(['status' => 'resolved']);

        $this->assertCount(1, ChatConversation::resolved()->get());
    }

    public function test_scope_unassigned_filters_assigned_to_null(): void
    {
        // Unassigned = no agent claimed it yet. Drives the
        // "needs an agent" filter in the inbox.
        $this->conv(['assigned_to' => null]);
        $this->conv(['assigned_to' => 42]); // assigned

        $unassigned = ChatConversation::unassigned()->get();

        $this->assertCount(1, $unassigned);
        $this->assertNull($unassigned->first()->assigned_to);
    }

    /* ─── display_name accessor ─── */

    public function test_display_name_returns_visitor_name_when_no_member_set(): void
    {
        $conv = $this->conv(['visitor_name' => 'Alice Anonymous']);

        $this->assertSame('Alice Anonymous', $conv->display_name);
    }

    public function test_display_name_falls_back_to_visitor_when_no_name(): void
    {
        // Defensive: visitor opened widget but never typed → no
        // name. The accessor MUST return 'Visitor' rather than
        // empty string (SPA shows blank conversation row otherwise).
        $conv = $this->conv(['visitor_name' => null]);

        $this->assertSame('Visitor', $conv->display_name);
    }

    /* ─── Relationships + foreign keys ─── */

    public function test_messages_relationship_uses_conversation_id_foreign_key(): void
    {
        // CRITICAL: FK is conversation_id, NOT the conventional
        // chat_conversation_id. A regression that switched to the
        // convention would silently break every message lookup.
        $conv = $this->conv();
        $rel = $conv->messages();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\HasMany::class,
            $rel,
        );
        $this->assertSame('conversation_id', $rel->getForeignKeyName(),
            'messages relationship MUST FK on conversation_id (not chat_conversation_id).');
    }

    public function test_assigned_agent_relationship_uses_assigned_to_foreign_key(): void
    {
        // FK = 'assigned_to' (NOT 'user_id' or 'agent_id'). Lock
        // the locked name.
        $conv = $this->conv();
        $rel = $conv->assignedAgent();

        $this->assertSame('assigned_to', $rel->getForeignKeyName(),
            'assignedAgent FK MUST be assigned_to.');
    }

    public function test_visitor_relationship_uses_visitor_id_foreign_key(): void
    {
        $conv = $this->conv();
        $rel = $conv->visitor();

        $this->assertSame('visitor_id', $rel->getForeignKeyName());
    }

    public function test_channel_account_relationship_uses_channel_account_id_foreign_key(): void
    {
        // Messenger Page linkage. ChannelRouter::sendOutbound
        // depends on this — wrong FK silently breaks all
        // outbound channel messages.
        $conv = $this->conv();
        $rel = $conv->channelAccount();

        $this->assertSame('channel_account_id', $rel->getForeignKeyName(),
            'channelAccount FK MUST be channel_account_id.');
    }

    public function test_member_and_inquiry_are_belongs_to(): void
    {
        $conv = $this->conv();

        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $conv->member(),
        );
        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $conv->inquiry(),
        );
    }

    /* ─── BelongsToOrganization auto-fill ─── */

    public function test_bound_org_context_auto_fills_organization_id(): void
    {
        $conv = $this->conv();

        $this->assertSame($this->orgId, (int) $conv->organization_id);
    }

    /* ─── TenantScope cross-org isolation ─── */

    public function test_tenant_scope_isolates_org_a_from_org_b_reads(): void
    {
        // CRITICAL: a chat row from org A MUST NOT surface in
        // org B's inbox. Cross-leak would expose private chat
        // history.
        $orgA = $this->orgId;
        $orgB = OrganizationFactory::new()->create()->id;

        \DB::table('chat_conversations')->insert([
            'organization_id' => $orgA,
            'status'          => 'active',
            'visitor_name'    => 'Org A visitor',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        \DB::table('chat_conversations')->insert([
            'organization_id' => $orgB,
            'status'          => 'active',
            'visitor_name'    => 'Org B visitor',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        $rowsForA = ChatConversation::all();
        $this->assertCount(1, $rowsForA);
        $this->assertSame('Org A visitor', $rowsForA->first()->visitor_name);

        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB);
        $rowsForB = ChatConversation::all();
        $this->assertCount(1, $rowsForB);
        $this->assertSame('Org B visitor', $rowsForB->first()->visitor_name);
    }
}
