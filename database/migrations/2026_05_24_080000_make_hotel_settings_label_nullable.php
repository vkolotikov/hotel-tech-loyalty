<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // System-internal settings (booking_units, cached PMS payloads, apartment
    // maps, etc.) are written by sync jobs that have no use for a human label
    // — these writes were silently failing on fresh orgs with a 23502 NOT NULL
    // violation, which is why the Smoobu apartment refresh threw, booking_units
    // never got populated, and the widget rendered "all rooms available" for
    // every date. `label` was always a UI hint for admin-edited settings;
    // making it nullable is the correct shape.
    public function up(): void
    {
        Schema::table('hotel_settings', function (Blueprint $table) {
            $table->string('label')->nullable()->change();
        });
    }

    public function down(): void
    {
        // No reverse — backfilling label values for every system-written row
        // would be lossy and the constraint never carried real meaning.
    }
};
