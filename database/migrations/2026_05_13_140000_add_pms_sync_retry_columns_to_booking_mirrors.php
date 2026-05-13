<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Track retry state for bookings that succeeded on Stripe but failed to
 * post to the PMS (Smoobu). The retry-pms-sync cron walks rows with
 * `internal_status='pending_pms_sync'`, attempts a fresh createReservation,
 * and increments `pms_sync_attempts` on each failure. After 5 attempts a
 * row flips to `pms_sync_failed` which surfaces in the admin dashboard.
 *
 * The local mirror remains the source of truth for the guest's booking
 * regardless of PMS state — they paid, they're booked. PMS state catching
 * up is an internal reconciliation problem, never a customer problem.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('booking_mirrors', function (Blueprint $t) {
            $t->unsignedSmallInteger('pms_sync_attempts')->default(0)->after('synced_at');
            $t->timestamp('pms_sync_last_attempt_at')->nullable()->after('pms_sync_attempts');
            $t->text('pms_sync_last_error')->nullable()->after('pms_sync_last_attempt_at');
            // Index narrowly — the retry cron only scans pending rows, not
            // the whole table. Without this index it would full-scan
            // booking_mirrors every 5 minutes.
            $t->index(['internal_status', 'pms_sync_attempts'], 'booking_mirrors_pms_retry_idx');
        });
    }

    public function down(): void
    {
        Schema::table('booking_mirrors', function (Blueprint $t) {
            $t->dropIndex('booking_mirrors_pms_retry_idx');
            $t->dropColumn(['pms_sync_attempts', 'pms_sync_last_attempt_at', 'pms_sync_last_error']);
        });
    }
};
