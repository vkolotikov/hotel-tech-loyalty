<?php

namespace Tests\Feature\Widget;

use App\Models\AiConversation;
use App\Models\ChatWidgetConfig;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Reopening the chat must not wipe the assistant's memory.
 *
 * The widget calls /init every time the panel opens — not once per visitor —
 * and init used to write `messages => []` through an updateOrCreate. So a
 * visitor who closed the panel and reopened it, or simply moved to another
 * page, kept their visible transcript (which comes from ChatConversation) while
 * the assistant lost every turn of it. sendMessage builds its context from
 * exactly the column init was blanking, so the bot would re-introduce itself
 * and re-ask questions the visitor could still read directly above the input.
 *
 * The tenant guard is asserted alongside it because the two are easy to break
 * together: the fix keeps a session's history, and that is only safe while a
 * session id from another organisation cannot be resumed.
 */
class WidgetSessionMemoryTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpWidgetSchema();
    }

    protected function tearDown(): void
    {
        foreach (['current_organization_id', 'current_brand_id'] as $b) {
            if (app()->bound($b)) {
                app()->forgetInstance($b);
            }
        }
        parent::tearDown();
    }

    private function setUpWidgetSchema(): void
    {
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
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('visitor_id')->nullable();
                $t->string('session_id', 64)->nullable();
                $t->string('status', 16)->default('active');
                $t->boolean('ai_enabled')->default(true);
                $t->string('visitor_name')->nullable();
                $t->string('visitor_email')->nullable();
                $t->string('visitor_phone')->nullable();
                $t->string('visitor_ip', 64)->nullable();
                $t->string('visitor_user_agent')->nullable();
                $t->text('page_url')->nullable();
                $t->string('channel', 32)->nullable();
                $t->boolean('rating_requested')->default(false);
                $t->integer('rating')->nullable();
                $t->integer('messages_count')->default(0);
                $t->boolean('lead_captured')->default(false);
                $t->timestamp('last_message_at')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('chat_messages')) {
            Schema::create('chat_messages', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('conversation_id');
                $t->string('sender_type', 16);
                $t->string('direction', 16)->nullable();
                $t->text('content')->nullable();
                $t->timestamps();
            });
        }

        if (!Schema::hasTable('chat_widget_configs')) {
            Schema::create('chat_widget_configs', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('widget_key', 64);
                $t->boolean('is_active')->default(true);
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

    /** @return array{0:int,1:string} [orgId, widgetKey] */
    private function makeWidget(): array
    {
        $org = OrganizationFactory::new()->create();
        $key = 'wk-' . $org->id;

        ChatWidgetConfig::withoutGlobalScopes()->create([
            'organization_id' => $org->id,
            'widget_key'      => $key,
            'is_active'       => true,
        ]);

        return [(int) $org->id, $key];
    }

    public function test_reopening_the_widget_keeps_the_assistants_memory(): void
    {
        [$orgId, $key] = $this->makeWidget();

        $first = $this->postJson("/api/v1/widget/{$key}/init", []);
        $first->assertOk();
        $sessionId = $first->json('session_id');
        $this->assertNotEmpty($sessionId);

        // Stand in for a conversation having happened.
        $conv = AiConversation::withoutGlobalScopes()->where('session_id', $sessionId)->firstOrFail();
        $conv->messages = [
            ['role' => 'user', 'content' => 'Do you have parking?'],
            ['role' => 'assistant', 'content' => 'Yes, free on site.'],
        ];
        $conv->save();

        // The visitor closes the panel and reopens it — init runs again.
        $this->postJson("/api/v1/widget/{$key}/init", ['session_id' => $sessionId])->assertOk();

        $after = AiConversation::withoutGlobalScopes()->where('session_id', $sessionId)->firstOrFail();

        $this->assertCount(2, $after->messages ?? [],
            'Re-init wiped the transcript the assistant reasons from, so the bot forgets a conversation the visitor can still read on screen.');
        $this->assertSame('Do you have parking?', $after->messages[0]['content']);
    }

    public function test_a_session_id_from_another_org_is_never_resumed(): void
    {
        // The memory fix is only safe while this holds: if a foreign session
        // could be resumed, preserving its history would hand one venue's
        // conversation to another's widget.
        [, $keyA] = $this->makeWidget();
        [, $keyB] = $this->makeWidget();

        $sessionA = $this->postJson("/api/v1/widget/{$keyA}/init", [])->json('session_id');

        $resumed = $this->postJson("/api/v1/widget/{$keyB}/init", ['session_id' => $sessionA]);
        $resumed->assertOk();

        $this->assertNotSame($sessionA, $resumed->json('session_id'),
            "Widget B must mint a fresh session rather than adopt widget A's.");
    }
}
