<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            if (!Schema::hasColumn('chat_messages', 'organization_id')) {
                $table->foreignId('organization_id')
                    ->nullable()
                    ->after('id')
                    ->constrained()
                    ->cascadeOnDelete();
            }
        });

        // Backfill from parent conversation
        DB::statement('
            UPDATE chat_messages m
            SET organization_id = c.organization_id
            FROM chat_conversations c
            WHERE m.conversation_id = c.id
              AND m.organization_id IS NULL
        ');

        // Drop orphans (messages whose conversation was deleted but row lingered)
        DB::statement('DELETE FROM chat_messages WHERE organization_id IS NULL');

        // Enforce NOT NULL + add composite indexes
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->foreignId('organization_id')->nullable(false)->change();
            $table->index(['organization_id', 'conversation_id'], 'chat_messages_org_conv_idx');
        });

        // Phase-2 perf fix: composite (organization_id, status) on chat_conversations
        Schema::table('chat_conversations', function (Blueprint $table) {
            $indexes = collect(DB::select("
                SELECT indexname FROM pg_indexes
                WHERE tablename = 'chat_conversations'
            "))->pluck('indexname')->all();

            if (!in_array('chat_conversations_org_status_idx', $indexes)) {
                $table->index(['organization_id', 'status'], 'chat_conversations_org_status_idx');
            }
        });
    }

    public function down(): void
    {
        Schema::table('chat_conversations', function (Blueprint $table) {
            $table->dropIndex('chat_conversations_org_status_idx');
        });

        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropIndex('chat_messages_org_conv_idx');
            $table->dropForeign(['organization_id']);
            $table->dropColumn('organization_id');
        });
    }
};
