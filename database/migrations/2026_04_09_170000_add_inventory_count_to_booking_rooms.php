<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add inventory_count to booking_rooms so DB-only manual rooms can prevent
 * double-bookings (one bookable unit per inventory slot per night).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('booking_rooms', function (Blueprint $table) {
            $table->unsignedSmallInteger('inventory_count')->default(1)->after('base_price');
        });
    }

    public function down(): void
    {
        Schema::table('booking_rooms', function (Blueprint $table) {
            $table->dropColumn('inventory_count');
        });
    }
};
