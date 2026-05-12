<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-user opt-in for the daily loyalty digest email.
 *
 * Mirrors the engagement-digest pattern (wants_daily_summary +
 * daily_summary_last_sent_at) but lives on its own pair of columns
 * so admins can opt into loyalty without opting into engagement and
 * vice versa.
 *
 * Default off — admins explicitly toggle on from /analytics.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            if (!Schema::hasColumn('users', 'wants_loyalty_digest')) {
                $t->boolean('wants_loyalty_digest')->default(false);
            }
            if (!Schema::hasColumn('users', 'loyalty_digest_last_sent_at')) {
                $t->timestamp('loyalty_digest_last_sent_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $t) {
            if (Schema::hasColumn('users', 'loyalty_digest_last_sent_at')) {
                $t->dropColumn('loyalty_digest_last_sent_at');
            }
            if (Schema::hasColumn('users', 'wants_loyalty_digest')) {
                $t->dropColumn('wants_loyalty_digest');
            }
        });
    }
};
