<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 3 of Engagement Hub: store the intent classification + AI brief
 * directly on the conversation row so we only pay the OpenAI cost once
 * per conversation (5-min TTL on regeneration).
 *
 * `intent_tag` is one of: booking_inquiry, info_request, complaint,
 * cancellation, support, spam, other. NULL means "not yet classified" —
 * the EngagementHub UI shows no tag chip in that case.
 *
 * `ai_brief` is a 2-3 sentence summary aimed at the agent who's about to
 * help the visitor. Surfaces in the drawer's AI brief tab.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('chat_conversations')) {
            return;
        }

        Schema::table('chat_conversations', function (Blueprint $blueprint) {
            if (!Schema::hasColumn('chat_conversations', 'intent_tag')) {
                $blueprint->string('intent_tag', 32)->nullable()->after('rating_comment');
            }
            if (!Schema::hasColumn('chat_conversations', 'ai_brief')) {
                $blueprint->text('ai_brief')->nullable()->after('intent_tag');
            }
            if (!Schema::hasColumn('chat_conversations', 'ai_brief_at')) {
                $blueprint->timestamp('ai_brief_at')->nullable()->after('ai_brief');
            }
            // Index intent_tag — admins will filter by it on the engagement
            // feed and the chat-inbox page.
            $blueprint->index(['organization_id', 'intent_tag'], 'chat_conv_org_intent_idx');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('chat_conversations')) {
            return;
        }
        Schema::table('chat_conversations', function (Blueprint $blueprint) {
            try { $blueprint->dropIndex('chat_conv_org_intent_idx'); } catch (\Throwable $e) {}
            if (Schema::hasColumn('chat_conversations', 'ai_brief_at')) $blueprint->dropColumn('ai_brief_at');
            if (Schema::hasColumn('chat_conversations', 'ai_brief'))    $blueprint->dropColumn('ai_brief');
            if (Schema::hasColumn('chat_conversations', 'intent_tag'))  $blueprint->dropColumn('intent_tag');
        });
    }
};
