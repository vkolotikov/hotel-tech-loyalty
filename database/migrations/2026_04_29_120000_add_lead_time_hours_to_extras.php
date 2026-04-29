<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lead-time field on both extras tables.
 *
 * Some extras need preparation (e.g. a champagne breakfast needs to be
 * ordered the day before; aromatherapy oil needs to be sourced 48h
 * ahead). With no lead time configured the booking widget would happily
 * sell those extras for next-day stays even though the hotel can't
 * deliver. The booking widget reads `lead_time_hours` and hides any
 * extra whose lead time exceeds (check_in − now); the server validates
 * the same on the quote/confirm path so a manipulated request can't
 * sneak an under-prepared extra through.
 *
 * Hours (not days) so a hotel can express "needs 4 hours notice" for
 * smaller add-ons; max 168 (one week) at the controller layer.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('booking_extras', function (Blueprint $table) {
            $table->unsignedSmallInteger('lead_time_hours')->default(0)->after('price_type');
        });

        Schema::table('service_extras', function (Blueprint $table) {
            $table->unsignedSmallInteger('lead_time_hours')->default(0)->after('duration_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('booking_extras', function (Blueprint $table) {
            $table->dropColumn('lead_time_hours');
        });

        Schema::table('service_extras', function (Blueprint $table) {
            $table->dropColumn('lead_time_hours');
        });
    }
};
