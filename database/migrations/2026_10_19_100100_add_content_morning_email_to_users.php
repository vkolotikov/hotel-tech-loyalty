<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HexaTech Content's morning email (spec 2026-10-19 §4.5): each person's opt-in, off by default, and when it last
 * went — the loyalty digest's pair of columns, for this email.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            if (!Schema::hasColumn('users', 'wants_content_morning_email')) {
                $t->boolean('wants_content_morning_email')->default(false);
            }
            if (!Schema::hasColumn('users', 'content_morning_email_last_sent_at')) {
                $t->timestamp('content_morning_email_last_sent_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $t) {
            foreach (['content_morning_email_last_sent_at', 'wants_content_morning_email'] as $column) {
                if (Schema::hasColumn('users', $column)) {
                    $t->dropColumn($column);
                }
            }
        });
    }
};
