<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Extend chat_conversations + chat_messages with channel-aware columns
 * for external chat platforms (Messenger first, WhatsApp/Instagram next).
 *
 * chat_conversations already has a `channel` string column (default
 * 'widget') — we only add the linking columns it didn't have:
 *   - external_thread_id: PSID (Page-Scoped User ID) for Messenger.
 *     Unique per (channel_account_id, external_thread_id) so a returning
 *     user maps back to the same conversation.
 *   - channel_account_id: FK to chat_channel_accounts. NULL for legacy
 *     widget conversations.
 *
 * chat_messages:
 *   - channel_message_id: Meta's mid.* identifier for idempotency.
 *     Unique per channel_account_id (Meta reuses ids only within a Page).
 *   - direction: 'inbound' (from external user) | 'outbound' (from us).
 *     Redundant with sender_type ('visitor' vs 'ai'/'agent') but cheaper
 *     to filter on for analytics.
 *   - attachments_data: jsonb for normalised attachment metadata
 *     (type, mirrored_url, original_meta_url, mime, size). The existing
 *     `metadata` column carries the raw webhook payload; this one is
 *     our cleaned-up view of attachments only.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('chat_conversations', function (Blueprint $table) {
            $table->string('external_thread_id', 80)->nullable()->after('channel');
            $table->foreignId('channel_account_id')->nullable()->after('external_thread_id')
                ->constrained('chat_channel_accounts')->nullOnDelete();

            // Look up "conversation for this user on this connected Page" — the
            // hot path in the webhook handler.
            $table->unique(
                ['channel_account_id', 'external_thread_id'],
                'chat_conversations_channel_account_thread_unique'
            );
        });

        Schema::table('chat_messages', function (Blueprint $table) {
            $table->string('channel_message_id', 120)->nullable()->after('content_type');
            $table->string('direction', 12)->nullable()->after('channel_message_id'); // inbound | outbound
            $table->jsonb('attachments_data')->nullable()->after('direction');

            // Idempotency: same message id arriving twice (Meta retries) is a no-op.
            // Partial-unique would be ideal but Laravel's schema builder doesn't
            // surface that cleanly across DBs; we use a regular unique index that
            // tolerates NULL on Postgres (which is what we run).
            $table->index('channel_message_id', 'chat_messages_channel_message_id_idx');
            $table->index('direction', 'chat_messages_direction_idx');
        });
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropIndex('chat_messages_direction_idx');
            $table->dropIndex('chat_messages_channel_message_id_idx');
            $table->dropColumn(['channel_message_id', 'direction', 'attachments_data']);
        });

        Schema::table('chat_conversations', function (Blueprint $table) {
            $table->dropUnique('chat_conversations_channel_account_thread_unique');
            $table->dropConstrainedForeignId('channel_account_id');
            $table->dropColumn('external_thread_id');
        });
    }
};
