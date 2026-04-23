<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Track when an org first started any trial. Used by AuthController::billingStartTrial
 * to prevent the same org from cycling through trials (one per plan) by switching
 * package — the plan slug changes, but trial_started_at stays set, so the second
 * "start trial" call denies cleanly with a "trial already used" error.
 *
 * Backfill: any org with trial_end set is treated as having already started a
 * trial, so existing accounts can't game the new check.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->timestamp('trial_started_at')->nullable()->after('trial_end');
        });

        // Backfill — anyone who already had a trial is now "trial used"
        \DB::table('organizations')
            ->whereNotNull('trial_end')
            ->whereNull('trial_started_at')
            ->update(['trial_started_at' => \DB::raw('COALESCE(created_at, NOW())')]);
    }

    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->dropColumn('trial_started_at');
        });
    }
};
