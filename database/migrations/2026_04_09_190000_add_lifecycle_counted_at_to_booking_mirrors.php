<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('booking_mirror', function (Blueprint $table) {
            // Set when the mirror has been counted toward the linked guest's
            // lifecycle (total_stays / first_stay_date / lifecycle_status).
            // Lets PMS re-syncs reach the same row repeatedly without
            // double-incrementing the guest's stay counters.
            $table->timestamp('lifecycle_counted_at')->nullable()->after('synced_at');
        });
    }

    public function down(): void
    {
        Schema::table('booking_mirror', function (Blueprint $table) {
            $table->dropColumn('lifecycle_counted_at');
        });
    }
};
