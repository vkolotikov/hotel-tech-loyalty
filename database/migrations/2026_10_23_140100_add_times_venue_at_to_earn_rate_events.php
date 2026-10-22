<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HexaTech Loyalty release 4 (R4-6): when a boost's times were last saved as the venue's wall clock.
 *
 * Before release 4 the full admin's boost form sent the time it showed without an offset and the server stored it as
 * if it were UTC, so a boost made there at 18:00 in Riga started at 21:00 Riga time. Every save from either side now
 * reads such a time as the venue's clock and sets this column; a boost without it was last saved before the fix and
 * the workspace's Program asks for its times to be checked. One nullable column, no backfill: a boost saved before
 * cannot be told apart by who saved it.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('earn_rate_events') && !Schema::hasColumn('earn_rate_events', 'times_venue_at')) {
            Schema::table('earn_rate_events', fn (Blueprint $t) => $t->timestamp('times_venue_at')->nullable());
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('earn_rate_events') && Schema::hasColumn('earn_rate_events', 'times_venue_at')) {
            Schema::table('earn_rate_events', fn (Blueprint $t) => $t->dropColumn('times_venue_at'));
        }
    }
};
