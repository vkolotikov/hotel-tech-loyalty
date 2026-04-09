<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the next round of admin-controllable chatbot features:
 *  - Widget: assistant avatar URL, branding text override, input hint
 *    text, and an organization-level agent_status (online/away/offline)
 *    so visitors can see whether a human is around.
 *  - Conversations: per-conversation ai_enabled toggle so an agent
 *    monitoring an inbox thread can mute the AI and take over.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_widget_configs', function (Blueprint $table) {
            $table->string('assistant_avatar_url', 500)->nullable()->after('launcher_icon');
            $table->string('branding_text', 120)->nullable()->after('show_branding');
            $table->string('input_hint_text', 120)->nullable()->after('input_placeholder');
            $table->string('agent_status', 16)->default('online')->after('is_active');
        });

        Schema::table('chat_conversations', function (Blueprint $table) {
            $table->boolean('ai_enabled')->default(true)->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('chat_widget_configs', function (Blueprint $table) {
            $table->dropColumn(['assistant_avatar_url', 'branding_text', 'input_hint_text', 'agent_status']);
        });

        Schema::table('chat_conversations', function (Blueprint $table) {
            $table->dropColumn('ai_enabled');
        });
    }
};
