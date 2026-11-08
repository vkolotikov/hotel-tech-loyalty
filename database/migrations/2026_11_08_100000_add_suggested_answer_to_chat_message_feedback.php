<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Teaching the assistant is a manager's (2026-11-08): a staff member's corrected answer is no longer written to the
 * "AI Corrections" knowledge; it is kept on their own feedback row as a suggestion, for a manager to check in
 * HexaTech CRM's "Teach the assistant" (BotGaps). Nullable, so every existing row reads as "no suggestion".
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('chat_message_feedback') || Schema::hasColumn('chat_message_feedback', 'suggested_answer')) {
            return;
        }

        Schema::table('chat_message_feedback', function (Blueprint $table) {
            $table->text('suggested_answer')->nullable()->after('comment');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('chat_message_feedback', 'suggested_answer')) {
            Schema::table('chat_message_feedback', function (Blueprint $table) {
                $table->dropColumn('suggested_answer');
            });
        }
    }
};
