<?php

namespace Tests\Feature\ChatGptTools;

use App\Http\Middleware\Plugin\AuthenticatePluginToken;
use App\Http\Middleware\Plugin\CheckPluginSubscription;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\URL;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

class LeadWorkflowTest extends TestCase
{
    use SetsUpMinimalSchema;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        Mail::fake();
        config(['chatgpt.enabled' => true, 'chatgpt.organization_ids' => [1], 'chatgpt.all_organizations' => false,
            'chatgpt.url' => 'http://localhost', 'app.url' => 'http://localhost']);
        URL::forceRootUrl('http://localhost');
        $this->setUpCrmPresetSchema();
        $this->setUpBookingRefundSchema(); // Includes the production audit-log columns.
        Schema::table('organizations', fn ($t) => $t->timestamp('saas_deleted_at')->nullable());
        Schema::table('inquiries', function ($t) {
            $t->unsignedBigInteger('guest_id')->nullable();
            $t->unsignedBigInteger('property_id')->nullable();
            foreach (['event_name', 'notes', 'special_requests', 'next_task_notes', 'custom_data', 'currency'] as $field) {
                $t->text($field)->nullable();
            }
        });
        Schema::create('staff', function ($t) {
            $t->id(); $t->unsignedBigInteger('organization_id'); $t->unsignedBigInteger('user_id'); $t->boolean('is_active')->default(true);
        });
        Schema::create('brand_user', function ($t) {
            $t->unsignedBigInteger('brand_id'); $t->unsignedBigInteger('user_id');
        });
        Schema::create('visitors', function ($t) {
            $t->id(); $t->unsignedBigInteger('organization_id'); $t->unsignedBigInteger('brand_id')->nullable(); $t->unsignedBigInteger('guest_id');
        });
        Schema::create('chat_conversations', function ($t) {
            $t->id(); $t->unsignedBigInteger('organization_id'); $t->unsignedBigInteger('brand_id')->nullable();
            $t->unsignedBigInteger('visitor_id')->nullable(); $t->unsignedBigInteger('inquiry_id')->nullable();
            $t->string('channel')->default('web'); $t->string('status')->default('open');
            $t->timestamp('last_message_at')->nullable(); $t->timestamps();
        });
        Schema::create('chat_messages', function ($t) {
            $t->id(); $t->unsignedBigInteger('organization_id'); $t->unsignedBigInteger('conversation_id');
            $t->string('sender_type'); $t->text('content'); $t->string('content_type')->default('text');
            $t->string('attachment_type')->nullable(); $t->boolean('is_read')->default(false); $t->timestamps();
        });
        Schema::create('activities', function ($t) {
            $t->id(); $t->unsignedBigInteger('organization_id'); $t->unsignedBigInteger('brand_id')->nullable();
            $t->unsignedBigInteger('inquiry_id'); $t->unsignedBigInteger('guest_id')->nullable();
            $t->string('type'); $t->string('direction')->nullable(); $t->string('subject')->nullable();
            $t->text('body')->nullable(); $t->text('metadata')->nullable(); $t->unsignedBigInteger('created_by')->nullable();
            $t->timestamp('occurred_at')->nullable(); $t->timestamps();
        });
        Schema::create('inquiry_attachments', function ($t) {
            $t->id(); $t->unsignedBigInteger('organization_id'); $t->unsignedBigInteger('inquiry_id');
            $t->string('filename'); $t->string('mime_type')->nullable(); $t->integer('size_bytes')->nullable();
            $t->text('note')->nullable(); $t->text('url')->nullable(); $t->timestamps();
        });
        DB::table('organizations')->insert([['id' => 1, 'name' => 'Workspace'], ['id' => 2, 'name' => 'Foreign']]);
        DB::table('users')->insert(['id' => 1, 'organization_id' => 1, 'name' => 'Staff', 'email' => 'staff@example.test', 'user_type' => 'staff']);
        DB::table('staff')->insert(['organization_id' => 1, 'user_id' => 1]);
        DB::table('brands')->insert([['id' => 1, 'organization_id' => 1, 'name' => 'Cards'], ['id' => 2, 'organization_id' => 1, 'name' => 'Other brand']]);
        DB::table('brand_user')->insert(['user_id' => 1, 'brand_id' => 1]);
        DB::table('guests')->insert(['id' => 1, 'organization_id' => 1, 'full_name' => 'Sample Customer', 'email' => 'customer@example.test']);
        DB::table('pipelines')->insert(['id' => 1, 'organization_id' => 1, 'brand_id' => 1, 'name' => 'Sales']);
        foreach (['New' => 'open', 'Preparing proposal' => 'open', 'Order won' => 'won', 'Not proceeding' => 'lost'] as $name => $kind) {
            DB::table('pipeline_stages')->insert(['organization_id' => 1, 'pipeline_id' => 1, 'name' => $name, 'kind' => $kind]);
        }
        DB::table('inquiry_lost_reasons')->insert(['id' => 1, 'organization_id' => 1, 'label' => 'Budget']);
        DB::table('inquiry_lost_reasons')->insert(['id' => 2, 'organization_id' => 2, 'label' => 'FOREIGN_REASON']);
        $this->lead(1);
        $this->actingAs(User::findOrFail(1));
        app()->instance('current_organization_id', 1);
        $this->withoutMiddleware([AuthenticatePluginToken::class, CheckPluginSubscription::class]);
    }

    public function test_reads_requirements_proposal_text_and_configured_fields_without_private_metadata(): void
    {
        DB::table('inquiries')->where('id', 1)->update(['notes' => 'Customer wants 200 PVC cards',
            'special_requests' => 'Delivery next month', 'custom_data' => '{"quantity":200,"token":"DO_NOT_EXPOSE"}']);
        DB::table('custom_fields')->insert(['organization_id' => 1, 'entity' => 'inquiry', 'key' => 'quantity', 'label' => 'Quantity', 'type' => 'number', 'is_active' => true]);
        DB::table('inquiry_attachments')->insert(['organization_id' => 1, 'inquiry_id' => 1, 'filename' => 'Proposal.pdf', 'url' => 'https://private.test/SECRET_URL']);
        DB::table('activities')->insert(['id' => 1, 'organization_id' => 1, 'inquiry_id' => 1, 'type' => 'email', 'body' => '<p>Previous proposal: 200 cards</p>']);
        $this->callTool('get_lead', ['lead_id' => 1])->assertOk()->assertJsonPath('result.isError', false)
            ->assertJsonPath('result.structuredContent.lead.notes.text', 'Customer wants 200 PVC cards')
            ->assertJsonPath('result.structuredContent.lead.custom_fields.0.value.text', '200')
            ->assertJsonPath('result.structuredContent.attachments.0.content_available', false)
            ->assertDontSee('DO_NOT_EXPOSE')->assertDontSee('SECRET_URL')->assertDontSee('FOREIGN_REASON');
        $this->callTool('list_lead_activities', ['lead_id' => 1])->assertJsonPath('result.structuredContent.activities.0.body.text', 'Previous proposal: 200 cards');
        Mail::assertNothingSent();
    }

    public function test_direct_and_legacy_chat_links_are_bounded_and_exclude_other_leads_brands_and_tenants(): void
    {
        DB::table('visitors')->insert(['id' => 1, 'organization_id' => 1, 'brand_id' => 1, 'guest_id' => 1]);
        foreach ([1 => [], 2 => ['inquiry_id' => null], 3 => ['organization_id' => 2],
            4 => ['brand_id' => 2], 5 => ['inquiry_id' => 999]] as $id => $extra) {
            DB::table('chat_conversations')->insert(array_merge(['id' => $id, 'organization_id' => 1, 'brand_id' => 1, 'inquiry_id' => 1, 'visitor_id' => 1], $extra));
        }
        app()->instance('current_brand_id', 2);
        $page = $this->callTool('list_lead_conversations', ['lead_id' => 1, 'limit' => 1]);
        $page->assertJsonPath('result.structuredContent.conversations.0.id', 2)
            ->assertJsonPath('result.structuredContent.conversations.0.association', 'customer_history')
            ->assertJsonPath('result.structuredContent.next_before_id', 2);
        $this->callTool('list_lead_conversations', ['lead_id' => 1, 'before_id' => 2])->assertJsonPath('result.structuredContent.conversations.0.id', 1)
            ->assertJsonPath('result.structuredContent.conversations.0.association', 'this_lead')
            ->assertJsonPath('result.structuredContent.next_before_id', null);
        foreach ([3, 4, 5] as $id) {
            $this->callTool('get_lead_conversation', ['lead_id' => 1, 'conversation_id' => $id])->assertJsonPath('result.isError', true);
        }
    }

    public function test_messages_paginate_without_marking_read_or_exposing_internal_or_foreign_rows(): void
    {
        DB::table('chat_conversations')->insert(['id' => 1, 'organization_id' => 1, 'brand_id' => 1, 'inquiry_id' => 1]);
        foreach ([['visitor', 'Need embossed cards', 1], ['ai', 'We can discuss options', 1],
            ['system', 'PRIVATE_PROMPT', 1], ['visitor', 'FOREIGN_MESSAGE', 2], ['agent', str_repeat('a', 6001), 1]] as $row) {
            DB::table('chat_messages')->insert(['organization_id' => $row[2], 'conversation_id' => 1, 'sender_type' => $row[0], 'content' => $row[1]]);
        }
        $this->callTool('get_lead_conversation', ['lead_id' => 1, 'conversation_id' => 1, 'limit' => 1])
            ->assertJsonPath('result.structuredContent.messages.0.content.text', 'Need embossed cards')->assertJsonPath('result.structuredContent.next_after_id', 1);
        $this->callTool('get_lead_conversation', ['lead_id' => 1, 'conversation_id' => 1, 'after_id' => 1])
            ->assertJsonCount(2, 'result.structuredContent.messages')->assertJsonPath('result.structuredContent.messages.1.content.truncated', true)
            ->assertJsonPath('result.structuredContent.next_after_id', null)->assertDontSee('PRIVATE_PROMPT')->assertDontSee('FOREIGN_MESSAGE');
        $this->assertSame(0, DB::table('chat_messages')->where('is_read', true)->count());
        Mail::assertNothingSent();
    }

    public function test_activity_pagination_filters_corrupt_related_rows_and_marks_truncation(): void
    {
        foreach ([1 => [], 2 => [], 3 => ['organization_id' => 2], 4 => ['brand_id' => 2]] as $id => $extra) {
            DB::table('activities')->insert(array_merge(['id' => $id, 'organization_id' => 1, 'brand_id' => 1, 'inquiry_id' => 1,
                'type' => 'note', 'body' => str_repeat('a', 12001)], $extra));
        }
        $this->callTool('list_lead_activities', ['lead_id' => 1, 'limit' => 1])
            ->assertJsonPath('result.structuredContent.activities.0.id', 2)->assertJsonPath('result.structuredContent.activities.0.body.truncated', true)
            ->assertJsonPath('result.structuredContent.next_before_id', 2);
        $this->callTool('list_lead_activities', ['lead_id' => 1, 'before_id' => 2])->assertJsonCount(1, 'result.structuredContent.activities')
            ->assertJsonPath('result.structuredContent.next_before_id', null);
    }

    public function test_status_and_stage_change_together_once_with_staff_audit_and_no_email(): void
    {
        $args = $this->statusArgs(2);
        $this->callTool('update_lead_status', $args)->assertJsonPath('result.isError', false)->assertJsonPath('result.structuredContent.replayed', false);
        $this->assertDatabaseHas('inquiries', ['id' => 1, 'status' => 'Preparing proposal', 'pipeline_stage_id' => 2]);
        $this->callTool('update_lead_status', $args)->assertJsonPath('result.structuredContent.replayed', true);
        $this->assertSame(1, DB::table('activities')->count());
        $this->assertDatabaseHas('activities', ['created_by' => 1, 'type' => 'status_change', 'brand_id' => 1]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'chatgpt.lead_status_changed', 'causer_id' => 1, 'subject_id' => 1]);
        $this->callTool('update_lead_status', [...$args, 'stage_id' => 3])->assertJsonPath('result.isError', true)->assertSee('different status-change arguments');
        Mail::assertNothingSent();
    }

    public function test_replay_reports_later_status_without_reapplying_the_old_operation(): void
    {
        $args = $this->statusArgs(2);
        $this->callTool('update_lead_status', $args)->assertJsonPath('result.isError', false);
        DB::table('inquiries')->where('id', 1)->update(['status' => 'Later manual change']);
        $this->callTool('update_lead_status', $args)->assertJsonPath('result.structuredContent.replayed', true)
            ->assertJsonPath('result.structuredContent.status_at_operation', 'Preparing proposal')
            ->assertJsonPath('result.structuredContent.current_status', 'Later manual change');
        $this->assertSame(1, DB::table('activities')->count());
    }

    public function test_stale_revision_rejects_even_a_notes_edit_and_has_no_partial_write(): void
    {
        $args = $this->statusArgs(2);
        DB::table('inquiries')->where('id', 1)->update(['notes' => 'Another staff member changed requirements']);
        $this->callTool('update_lead_status', $args)->assertJsonPath('result.isError', true)->assertSee('changed since it was read');
        $this->assertDatabaseHas('inquiries', ['id' => 1, 'status' => 'New']);
        $this->assertSame(0, DB::table('activities')->count());
    }

    public function test_lost_requires_local_active_reason_and_reopening_clears_it(): void
    {
        foreach ([[], ['lost_reason_id' => 2], ['lost_reason_id' => 999]] as $extra) {
            $this->callTool('update_lead_status', [...$this->statusArgs(4), ...$extra])->assertJsonPath('result.isError', true);
        }
        $this->callTool('update_lead_status', [...$this->statusArgs(4), 'lost_reason_id' => 1])->assertJsonPath('result.isError', false);
        $this->assertDatabaseHas('inquiries', ['id' => 1, 'status' => 'Lost', 'lost_reason_id' => 1]);
        $args = [...$this->statusArgs(2), 'request_id' => 'a1605a6c-935b-4b49-9b98-46c184e58b36'];
        $this->callTool('update_lead_status', $args)->assertJsonPath('result.isError', false);
        $this->assertDatabaseHas('inquiries', ['id' => 1, 'status' => 'Preparing proposal', 'lost_reason_id' => null]);
    }

    public function test_won_keeps_crm_semantics_and_property_conversion_requires_portal(): void
    {
        DB::table('inquiries')->where('id', 1)->update(['property_id' => 10]);
        $this->callTool('get_lead', ['lead_id' => 1])->assertJsonPath('result.structuredContent.status_options.2.available_in_plugin', false);
        $this->callTool('update_lead_status', $this->statusArgs(3))->assertJsonPath('result.isError', true)->assertSee('reservation conversion');
        DB::table('inquiries')->where('id', 1)->update(['property_id' => null]);
        $this->callTool('update_lead_status', $this->statusArgs(3))->assertJsonPath('result.isError', false);
        $this->assertDatabaseHas('inquiries', ['id' => 1, 'status' => 'Confirmed', 'pipeline_stage_id' => 3]);
    }

    public function test_unassigned_chatbot_lead_uses_unique_default_only_when_status_is_requested(): void
    {
        DB::table('pipelines')->where('id', 1)->update(['brand_id' => null, 'is_default' => true]);
        DB::table('inquiries')->where('id', 1)->update(['pipeline_id' => null, 'pipeline_stage_id' => null]);
        $args = $this->statusArgs(2);
        $this->assertDatabaseHas('inquiries', ['id' => 1, 'pipeline_id' => null]);
        $this->callTool('update_lead_status', $args)->assertJsonPath('result.isError', false);
        $this->assertDatabaseHas('inquiries', ['id' => 1, 'pipeline_id' => 1, 'pipeline_stage_id' => 2]);
    }

    public function test_ambiguous_defaults_and_changed_stage_configuration_cannot_be_guessed(): void
    {
        $args = $this->statusArgs(2);
        DB::table('pipeline_stages')->where('id', 2)->update(['kind' => 'won']);
        $this->callTool('update_lead_status', $args)->assertJsonPath('result.isError', true)->assertSee('changed since it was read');
        DB::table('inquiries')->where('id', 1)->update(['pipeline_id' => null]);
        DB::table('pipelines')->where('id', 1)->update(['is_default' => true]);
        DB::table('pipelines')->insert(['id' => 2, 'organization_id' => 1, 'brand_id' => 1, 'name' => 'Duplicate default', 'is_default' => true]);
        $this->callTool('get_lead', ['lead_id' => 1])->assertJsonCount(0, 'result.structuredContent.status_options');
        $this->callTool('update_lead_status', $this->statusArgs(2))->assertJsonPath('result.isError', true);
    }

    public function test_failure_to_write_audit_rolls_back_status_and_timeline(): void
    {
        AuditLog::creating(fn () => throw new \RuntimeException('Synthetic audit storage failure'));
        try {
            $this->callTool('update_lead_status', $this->statusArgs(2))->assertJsonPath('result.isError', true);
            $this->assertDatabaseHas('inquiries', ['id' => 1, 'status' => 'New', 'pipeline_stage_id' => 1]);
            $this->assertSame(0, DB::table('activities')->count());
        } finally {
            AuditLog::flushEventListeners();
        }
    }

    public function test_all_new_tools_fail_closed_for_other_brands_tenants_and_inactive_staff(): void
    {
        $args = $this->statusArgs(2);
        foreach (['brand_id' => 2, 'organization_id' => 2] as $column => $value) {
            $this->lead(2, [$column => $value]);
            foreach (['get_lead', 'list_lead_activities', 'list_lead_conversations', 'get_lead_conversation', 'update_lead_status'] as $tool) {
                $input = match ($tool) {
                    'update_lead_status' => [...$args, 'lead_id' => 2],
                    'get_lead_conversation' => ['lead_id' => 2, 'conversation_id' => 1],
                    default => ['lead_id' => 2],
                };
                $this->callTool($tool, $input)->assertJsonPath('result.isError', true);
            }
            DB::table('inquiries')->where('id', 2)->delete();
        }
        DB::table('staff')->update(['is_active' => false]);
        $this->callTool('get_lead', ['lead_id' => 1])->assertJsonPath('result.isError', true);
        $this->callTool('update_lead_status', $args)->assertJsonPath('result.isError', true);
        $this->assertSame(0, DB::table('audit_logs')->count());
    }

    public function test_unavailable_pipeline_and_bad_inputs_are_clear_errors(): void
    {
        foreach ([['stage_id' => 999], ['organization_id' => 2], ['expected_revision' => 'bad'], ['lost_reason_id' => 1], ['request_id' => 'bad']] as $extra) {
            $this->callTool('update_lead_status', [...$this->statusArgs(2), ...$extra])->assertJsonPath('result.isError', true)
                ->assertDontSee('HexaTech could not complete this request');
        }
        DB::table('pipelines')->where('id', 1)->update(['organization_id' => 2]);
        $this->callTool('get_lead', ['lead_id' => 1])->assertJsonCount(0, 'result.structuredContent.status_options');
        $this->callTool('update_lead_status', $this->statusArgs(2))->assertJsonPath('result.isError', true);
    }

    private function lead(int $id, array $extra = []): void
    {
        DB::table('inquiries')->insert(array_merge(['id' => $id, 'organization_id' => 1, 'brand_id' => 1,
            'guest_id' => 1, 'pipeline_id' => 1, 'pipeline_stage_id' => 1, 'status' => 'New'], $extra));
    }

    private function statusArgs(int $stage): array
    {
        $response = $this->callTool('get_lead', ['lead_id' => 1]);
        $response->assertJsonPath('result.isError', false);

        return ['lead_id' => 1, 'stage_id' => $stage,
            'expected_revision' => $response->json('result.structuredContent.revision'),
            'request_id' => 'a1605a6c-935b-4b49-9b98-46c184e58b35'];
    }

    private function callTool(string $name, array $arguments)
    {
        return $this->postJson('/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/call',
            'params' => ['name' => $name, 'arguments' => (object) $arguments]]);
    }
}
