<?php

namespace Tests\Feature\Member;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * The members' Contact-the-venue chat (`/v1/member/chat/{id}/messages`) is the member's own conversation only
 * (security review, 2026-11-04). A caller without a membership — a staff token — used to match every website visitor's
 * chat of the venue (`member_id = null`), to read it and to write in it as the visitor.
 */
class MemberChatAccessTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace;

    private int $visitorChat;
    private int $adasChat;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltyWorkspace();
        $this->setUpEngagementSchema();
        Schema::table('chat_conversations', function ($t) {
            foreach (['member_id' => 'unsignedBigInteger', 'visitor_phone' => 'string', 'channel' => 'string'] as $col => $type) {
                if (!Schema::hasColumn('chat_conversations', $col)) {
                    $t->{$type}($col)->nullable();
                }
            }
        });
        if (!Schema::hasTable('chat_messages')) {
            Schema::create('chat_messages', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('conversation_id');
                $t->string('sender_type', 16);
                $t->unsignedBigInteger('sender_user_id')->nullable();
                $t->text('content')->nullable();
                $t->boolean('is_read')->default(false);
                $t->timestamps();
            });
        }

        $this->visitorChat = DB::table('chat_conversations')->insertGetId(['organization_id' => $this->org->id, 'member_id' => null,
            'status' => 'active', 'visitor_name' => 'Website Visitor', 'visitor_email' => 'visitor@example.test', 'created_at' => now(), 'updated_at' => now()]);
        $this->adasChat = DB::table('chat_conversations')->insertGetId(['organization_id' => $this->org->id, 'member_id' => $this->ada->id,
            'status' => 'active', 'visitor_name' => 'Ada Lovelace', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('chat_messages')->insert(['organization_id' => $this->org->id, 'conversation_id' => $this->visitorChat, 'sender_type' => 'visitor',
            'content' => 'My card number is private', 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_a_caller_without_a_membership_reaches_no_conversation(): void
    {
        $this->actingAs($this->staffMember, 'sanctum')->getJson("/api/v1/member/chat/{$this->visitorChat}/messages")->assertNotFound();
        $this->actingAs($this->staffMember, 'sanctum')->postJson("/api/v1/member/chat/{$this->visitorChat}/messages", ['content' => 'As the visitor'])
            ->assertNotFound();

        $this->assertSame(1, DB::table('chat_messages')->where('conversation_id', $this->visitorChat)->count());
    }

    public function test_a_member_reaches_only_their_own_conversation(): void
    {
        $this->actingAs($this->ada->user, 'sanctum')->getJson("/api/v1/member/chat/{$this->visitorChat}/messages")->assertNotFound();
        $this->actingAs($this->ada->user, 'sanctum')->getJson("/api/v1/member/chat/{$this->adasChat}/messages")->assertOk();
    }
}
