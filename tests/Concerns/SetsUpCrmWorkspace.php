<?php

namespace Tests\Concerns;

use App\Models\Brand;
use App\Models\Organization;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Everything a HexaTech CRM test needs (2026-11-07): the chat, knowledge and CRM tables in sqlite, wide enough for every
 * column the workspace's own endpoints read or write (each guarded by hasTable, as the other suites' helpers are); an
 * organisation (Harbour Clinic) with its default brand, a manager and a staff member; a fixed clock, Wednesday
 * 4 November 2026, 10:00 UTC, in the venue's zone Europe/Riga (12:00 there).
 *
 * A test class uses `DatabaseTransactions` and this trait and calls setUpCrmWorkspace() from setUp().
 */
trait SetsUpCrmWorkspace
{
    use SetsUpMinimalSchema, MakesAdminCaller;

    protected Organization $org;
    protected int $brandId;
    protected User $manager;
    protected User $staffMember;

    protected function setUpCrmWorkspace(): void
    {
        $this->buildCrmWorkspaceTables();

        $this->travelTo(CarbonImmutable::parse('2026-11-04 10:00:00'));

        $this->org = Organization::create(['name' => 'Harbour Clinic', 'slug' => 'org-' . uniqid('', true), 'industry' => 'medical', 'timezone' => 'Europe/Riga']);
        app()->instance('current_organization_id', $this->org->id);
        $this->brandId = (int) Brand::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('is_default', true)->value('id');

        $this->manager = $this->staffUser($this->org);
        $this->staffMember = $this->staffUser($this->org, ['role' => 'staff']);
        $this->org->forceFill(['plan_features' => ['chatbot' => 'true', 'engagement' => 'true']])->save();

        // VenueClock memoises the venue's zone per request; a test is many.
        app()->forgetScopedInstances();
    }

    /** On the admin host, as an absolute address. */
    protected function crmApi(string $path): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/crm/' . ltrim($path, '/');
    }

    /** A full-admin endpoint the workspace calls (`/api/v1/admin/<path>`), on the admin host. */
    protected function adminApi(string $path): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/v1/admin/' . ltrim($path, '/');
    }

    protected function asManager(): static
    {
        return $this->actingAs($this->manager, 'sanctum');
    }

    protected function asStaffMember(): static
    {
        return $this->actingAs($this->staffMember, 'sanctum');
    }

    /** A website chat of this organisation, with its messages: [sender, text, minutes ago] oldest first. */
    protected function chat(array $attributes = [], array $messages = []): int
    {
        $id = DB::table('chat_conversations')->insertGetId($attributes + [
            'organization_id' => $this->org->id,
            'brand_id'        => $this->brandId,
            'status'          => 'active',
            'ai_enabled'      => true,
            'channel'         => 'widget',
            'messages_count'  => count($messages),
            'last_message_at' => now(),
            'created_at'      => now()->subHour(),
            'updated_at'      => now(),
        ]);
        foreach ($messages as [$sender, $text, $minutesAgo]) {
            DB::table('chat_messages')->insert([
                'organization_id' => $this->org->id,
                'conversation_id' => $id,
                'sender_type'     => $sender,
                'content'         => $text,
                'content_type'    => 'text',
                'is_read'         => false,
                'created_at'      => now()->subMinutes($minutesAgo),
            ]);
        }

        return $id;
    }

    /** A lead of this organisation for a new contact. */
    protected function lead(array $attributes = [], string $name = 'Ada Lovelace'): int
    {
        $guest = DB::table('guests')->insertGetId(['organization_id' => $this->org->id, 'full_name' => $name, 'email' => uniqid() . '@example.test', 'created_at' => now(), 'updated_at' => now()]);

        return DB::table('inquiries')->insertGetId($attributes + [
            'organization_id'     => $this->org->id,
            'brand_id'            => $this->brandId,
            'guest_id'            => $guest,
            'status'              => 'New',
            'source'              => 'website',
            'next_task_completed' => false,
            'created_at'          => now()->subDays(3),
            'updated_at'          => now(),
        ]);
    }

    protected function buildCrmWorkspaceTables(): void
    {
        $this->setUpMinimalSchema();

        foreach ([
            'settings'          => fn (Blueprint $t) => $t->text('settings')->nullable(),
            'timezone'          => fn (Blueprint $t) => $t->string('timezone', 64)->nullable(),
            'currency'          => fn (Blueprint $t) => $t->string('currency', 10)->nullable(),
            'entitled_products' => fn (Blueprint $t) => $t->text('entitled_products')->nullable(),
            'plan_slug'         => fn (Blueprint $t) => $t->string('plan_slug', 64)->nullable(),
        ] as $column => $add) {
            if (!Schema::hasColumn('organizations', $column)) {
                Schema::table('organizations', $add);
            }
        }

        if (!Schema::hasTable('brands')) {
            Schema::create('brands', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->string('logo_url')->nullable();
                $t->string('primary_color', 7)->nullable();
                $t->string('widget_token', 64)->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->softDeletes();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('hotel_settings')) {
            Schema::create('hotel_settings', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('key');
                $t->text('value')->nullable();
                $t->string('type', 32)->nullable();
                $t->string('group', 64)->nullable();
                $t->string('label')->nullable();
                $t->text('description')->nullable();
                $t->boolean('is_public')->default(false);
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('visitors')) {
            Schema::create('visitors', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('visitor_key', 64)->nullable();
                $t->boolean('is_lead')->default(false);
                $t->string('current_page')->nullable();
                $t->string('display_name')->nullable();
                $t->string('email')->nullable();
                $t->string('phone')->nullable();
                $t->timestamp('last_seen_at')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('chat_conversations')) {
            Schema::create('chat_conversations', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('visitor_id')->nullable();
                $t->string('visitor_name')->nullable();
                $t->string('visitor_email')->nullable();
                $t->string('visitor_phone')->nullable();
                $t->string('page_url')->nullable();
                $t->string('channel', 32)->nullable();
                $t->string('status', 16)->default('active');
                $t->boolean('ai_enabled')->default(true);
                $t->unsignedBigInteger('assigned_to')->nullable();
                $t->boolean('lead_captured')->default(false);
                $t->unsignedBigInteger('inquiry_id')->nullable();
                $t->integer('messages_count')->default(0);
                $t->timestamp('last_message_at')->nullable();
                $t->string('intent_tag', 32)->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('chat_messages')) {
            Schema::create('chat_messages', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('conversation_id');
                $t->string('sender_type', 16);
                $t->unsignedBigInteger('sender_user_id')->nullable();
                $t->text('content')->nullable();
                $t->string('content_type', 16)->default('text');
                $t->boolean('is_read')->default(false);
                $t->text('metadata')->nullable();
                // Production has created_at only.
                $t->timestamp('created_at')->nullable();
            });
        }
        if (!Schema::hasTable('chat_message_feedback')) {
            Schema::create('chat_message_feedback', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('message_id');
                $t->unsignedBigInteger('user_id');
                $t->string('rating', 8);
                $t->text('comment')->nullable();
                $t->text('suggested_answer')->nullable();
                $t->boolean('applied_to_training')->default(false);
                $t->timestamps();
            });
        }
        if (!Schema::hasColumn('chat_message_feedback', 'suggested_answer')) {
            Schema::table('chat_message_feedback', fn (Blueprint $t) => $t->text('suggested_answer')->nullable());
        }
        if (!Schema::hasTable('chat_widget_configs')) {
            Schema::create('chat_widget_configs', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('widget_key', 64);
                $t->string('api_key', 64)->nullable();
                $t->boolean('is_active')->default(true);
                $t->text('canned_responses')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('chatbot_behavior_configs')) {
            Schema::create('chatbot_behavior_configs', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('assistant_name')->nullable();
                $t->string('assistant_avatar')->nullable();
                $t->text('identity')->nullable();
                $t->text('goal')->nullable();
                $t->string('sales_style', 32)->nullable();
                $t->string('tone', 32)->nullable();
                $t->string('reply_length', 32)->nullable();
                $t->string('language', 10)->nullable();
                $t->text('core_rules')->nullable();
                $t->text('escalation_policy')->nullable();
                $t->text('fallback_message')->nullable();
                $t->text('custom_instructions')->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('chatbot_model_configs')) {
            Schema::create('chatbot_model_configs', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('provider', 32)->nullable();
                $t->string('model_name', 64)->nullable();
                $t->decimal('temperature', 3, 2)->nullable();
                $t->integer('max_tokens')->nullable();
                $t->decimal('top_p', 3, 2)->nullable();
                $t->decimal('frequency_penalty', 3, 2)->nullable();
                $t->decimal('presence_penalty', 3, 2)->nullable();
                $t->text('stop_sequences')->nullable();
                $t->string('reasoning_effort', 16)->nullable();
                $t->string('verbosity', 16)->nullable();
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('knowledge_categories')) {
            Schema::create('knowledge_categories', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->text('description')->nullable();
                $t->integer('priority')->default(0);
                $t->integer('sort_order')->default(0);
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('knowledge_items')) {
            Schema::create('knowledge_items', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('category_id')->nullable();
                $t->text('question');
                $t->text('answer');
                $t->text('keywords')->nullable();
                $t->integer('priority')->default(0);
                $t->integer('use_count')->default(0);
                $t->boolean('is_active')->default(true);
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('knowledge_documents')) {
            Schema::create('knowledge_documents', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('file_name')->nullable();
                $t->string('file_path')->nullable();
                $t->string('mime_type', 120)->nullable();
                $t->unsignedBigInteger('size_bytes')->nullable();
                $t->integer('chunks_count')->default(0);
                $t->string('processing_status', 32)->nullable();
                $t->text('extracted_text')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('inquiries')) {
            Schema::create('inquiries', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('guest_id')->nullable();
                $t->string('status', 32)->nullable();
                $t->string('source', 64)->nullable();
                $t->decimal('total_value', 12, 2)->nullable();
                $t->unsignedBigInteger('assigned_to')->nullable();
                $t->string('next_task_type', 32)->nullable();
                $t->date('next_task_due')->nullable();
                $t->text('next_task_notes')->nullable();
                $t->boolean('next_task_completed')->default(false);
                $t->unsignedBigInteger('pipeline_id')->nullable();
                $t->unsignedBigInteger('pipeline_stage_id')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('tasks')) {
            Schema::create('tasks', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('inquiry_id')->nullable();
                $t->unsignedBigInteger('guest_id')->nullable();
                $t->unsignedBigInteger('corporate_account_id')->nullable();
                $t->string('type', 32)->nullable();
                $t->string('title');
                $t->text('description')->nullable();
                $t->timestamp('due_at')->nullable();
                $t->unsignedBigInteger('assigned_to')->nullable();
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamp('completed_at')->nullable();
                $t->string('outcome')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('pipelines')) {
            Schema::create('pipelines', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->string('name');
                $t->string('slug')->nullable();
                $t->text('description')->nullable();
                $t->boolean('is_default')->default(false);
                $t->integer('sort_order')->default(0);
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('pipeline_stages')) {
            Schema::create('pipeline_stages', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('pipeline_id');
                $t->string('name');
                $t->string('slug')->nullable();
                $t->string('color', 16)->nullable();
                $t->string('kind', 16)->default('open');
                $t->integer('sort_order')->default(0);
                $t->integer('default_win_probability')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('audit_logs')) {
            Schema::create('audit_logs', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('user_id')->nullable();
                $t->string('causer_type')->nullable();
                $t->unsignedBigInteger('causer_id')->nullable();
                $t->string('action')->nullable();
                $t->string('subject_type')->nullable();
                $t->unsignedBigInteger('subject_id')->nullable();
                $t->text('description')->nullable();
                $t->text('old_values')->nullable();
                $t->text('new_values')->nullable();
                $t->string('ip_address')->nullable();
                $t->string('user_agent')->nullable();
                $t->timestamps();
            });
        }
        if (!Schema::hasTable('ai_usage_logs')) {
            Schema::create('ai_usage_logs', function (Blueprint $t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->unsignedBigInteger('user_id')->nullable();
                $t->string('model', 64);
                $t->string('kind', 16)->default('chat');
                $t->string('feature', 60)->nullable();
                $t->integer('input_tokens')->default(0);
                $t->integer('output_tokens')->default(0);
                $t->integer('cost_cents')->default(0);
                // Production has created_at only.
                $t->timestamp('created_at')->nullable();
            });
        }
    }
}
