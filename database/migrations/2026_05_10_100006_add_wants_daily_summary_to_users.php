<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Engagement Hub Phase 4 v3 — opt-in flag for the daily summary email.
 *
 * Default false — admins explicitly opt in via Settings → Profile.
 * Members are unaffected (they're filtered out at the cron level since
 * the summary is staff-only). The flag is per-user, not per-org, so
 * different staff in the same org can choose independently.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('users')) return;

        Schema::table('users', function (Blueprint $blueprint) {
            if (!Schema::hasColumn('users', 'wants_daily_summary')) {
                $blueprint->boolean('wants_daily_summary')->default(false)->after('user_type');
            }
            // Tracks the last successful send so the hourly cron only emails
            // once per local day per user, even when the cron fires multiple
            // times in the org's "8am" hour.
            if (!Schema::hasColumn('users', 'daily_summary_last_sent_at')) {
                $blueprint->timestamp('daily_summary_last_sent_at')->nullable()->after('wants_daily_summary');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('users')) return;

        Schema::table('users', function (Blueprint $blueprint) {
            if (Schema::hasColumn('users', 'daily_summary_last_sent_at')) {
                $blueprint->dropColumn('daily_summary_last_sent_at');
            }
            if (Schema::hasColumn('users', 'wants_daily_summary')) {
                $blueprint->dropColumn('wants_daily_summary');
            }
        });
    }
};
