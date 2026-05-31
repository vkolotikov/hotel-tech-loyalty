<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Idempotency hardening for inbound external-channel messages (Messenger
 * first, WhatsApp/Instagram next).
 *
 * MessengerDispatcher::handleIncoming() does a cheap pre-check on
 * (channel_account_id, channel_message_id) before insert, but two
 * simultaneous Meta webhook deliveries can race past it. The catch
 * block in the dispatcher relies on a UniqueConstraintViolationException
 * to swallow the loser — which only fires if there's an actual unique
 * index for the database to enforce.
 *
 * Two parts:
 *
 *   1. Add chat_messages.channel_account_id (FK → chat_channel_accounts).
 *      The original add_channel_columns_to_chat_tables migration only put
 *      this on chat_conversations. We need it on chat_messages too so the
 *      dedup key is scoped to a specific connected Page — different Pages
 *      can technically reuse Meta mid namespaces, and we don't want a
 *      cross-tenant collision either.
 *
 *   2. Add a partial unique index across (channel_account_id, channel_message_id)
 *      WHERE both are NOT NULL. Legacy widget messages have both as NULL
 *      and must NOT collide with each other or with channel messages.
 *      Postgres partial-unique is the right primitive here.
 *
 * Pre-step: dedupe existing duplicates so the unique-index creation
 * doesn't fail on already-broken data. Keeps the smaller-id row (oldest
 * winner — matches the "first write wins" idempotency semantics).
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('chat_messages')) {
            return;
        }

        // 1. Add channel_account_id column if missing. Nullable + nullOnDelete
        // matches the chat_conversations.channel_account_id shape so legacy
        // widget rows keep working.
        if (!Schema::hasColumn('chat_messages', 'channel_account_id')) {
            Schema::table('chat_messages', function (Blueprint $table) {
                $table->foreignId('channel_account_id')->nullable()->after('channel_message_id')
                    ->constrained('chat_channel_accounts')->nullOnDelete();
                $table->index('channel_account_id', 'chat_messages_channel_account_id_idx');
            });
        }

        // 2. Pre-dedupe any duplicates that snuck in before the index existed
        // so CREATE UNIQUE INDEX doesn't reject on existing data.
        // Keeps the smaller id (the original winner) and deletes the rest.
        DB::statement(
            "DELETE FROM chat_messages a USING chat_messages b
             WHERE a.id > b.id
               AND a.channel_account_id = b.channel_account_id
               AND a.channel_message_id = b.channel_message_id
               AND a.channel_account_id IS NOT NULL
               AND a.channel_message_id IS NOT NULL"
        );

        // 3. Partial unique on (channel_account_id, channel_message_id).
        // Postgres-only syntax — Laravel's schema builder doesn't surface
        // partial unique cleanly. Idempotent guard via IF NOT EXISTS.
        DB::statement(
            "CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_channel_dedup_unique
               ON chat_messages (channel_account_id, channel_message_id)
               WHERE channel_message_id IS NOT NULL
                 AND channel_account_id IS NOT NULL"
        );
    }

    public function down(): void
    {
        DB::statement("DROP INDEX IF EXISTS chat_messages_channel_dedup_unique");

        if (Schema::hasTable('chat_messages') && Schema::hasColumn('chat_messages', 'channel_account_id')) {
            Schema::table('chat_messages', function (Blueprint $table) {
                $table->dropIndex('chat_messages_channel_account_id_idx');
                $table->dropConstrainedForeignId('channel_account_id');
            });
        }
    }
};
