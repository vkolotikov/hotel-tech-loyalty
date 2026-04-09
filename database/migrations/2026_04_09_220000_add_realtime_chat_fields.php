<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Real-time chat plumbing:
 *  - chat_conversations: typing indicators (visitor + agent), business-hours
 *    snapshot of the agent name shown to the visitor when a human takes over.
 *  - chat_messages: client_id for client-side dedupe, attachment fields.
 *  - users: chat_avatar_url so agent replies can render with a real avatar.
 *  - chat_widget_configs: business_hours JSON, gdpr_consent_text,
 *    gdpr_consent_required, sound_enabled (admin notif sound).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_conversations', function (Blueprint $table) {
            $table->timestamp('visitor_typing_until')->nullable()->after('ai_enabled');
            $table->timestamp('agent_typing_until')->nullable()->after('visitor_typing_until');
            $table->string('active_agent_name', 120)->nullable()->after('assigned_to');
            $table->string('active_agent_avatar', 500)->nullable()->after('active_agent_name');
            $table->boolean('rating_requested')->default(false)->after('rating_comment');
        });

        Schema::table('chat_messages', function (Blueprint $table) {
            $table->string('client_id', 64)->nullable()->after('id');
            $table->string('attachment_url', 500)->nullable()->after('content');
            $table->string('attachment_type', 60)->nullable()->after('attachment_url');
            $table->integer('attachment_size')->nullable()->after('attachment_type');
            $table->index(['conversation_id', 'created_at']);
        });

        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'chat_avatar_url')) {
                $table->string('chat_avatar_url', 500)->nullable()->after('email');
            }
        });

        Schema::table('chat_widget_configs', function (Blueprint $table) {
            $table->jsonb('business_hours')->nullable()->after('agent_status');
            $table->string('timezone', 64)->nullable()->after('business_hours');
            $table->boolean('gdpr_consent_required')->default(false)->after('lead_capture_delay');
            $table->string('gdpr_consent_text', 500)->nullable()->after('gdpr_consent_required');
            $table->boolean('inbox_sound_enabled')->default(true)->after('gdpr_consent_text');
            $table->boolean('rating_prompt_enabled')->default(true)->after('inbox_sound_enabled');
            $table->string('rating_prompt_text', 200)->nullable()->after('rating_prompt_enabled');
            $table->jsonb('canned_responses')->nullable()->after('rating_prompt_text');
        });
    }

    public function down(): void
    {
        Schema::table('chat_conversations', function (Blueprint $table) {
            $table->dropColumn(['visitor_typing_until', 'agent_typing_until', 'active_agent_name', 'active_agent_avatar', 'rating_requested']);
        });

        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropIndex(['conversation_id', 'created_at']);
            $table->dropColumn(['client_id', 'attachment_url', 'attachment_type', 'attachment_size']);
        });

        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'chat_avatar_url')) {
                $table->dropColumn('chat_avatar_url');
            }
        });

        Schema::table('chat_widget_configs', function (Blueprint $table) {
            $table->dropColumn([
                'business_hours', 'timezone', 'gdpr_consent_required',
                'gdpr_consent_text', 'inbox_sound_enabled', 'rating_prompt_enabled',
                'rating_prompt_text', 'canned_responses',
            ]);
        });
    }
};
