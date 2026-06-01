<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Composite index on (organization_id, source_updated_at) to support the
 * incremental sync pass in BookingEngineService::syncReservationsFromPms,
 * which filters by "modified >= N" each cron tick. Without this index the
 * query does a full table scan per tenant; at scale (50k+ rows per org)
 * the 5-min cron starts overlapping its own next tick.
 *
 * Postgres CREATE INDEX IF NOT EXISTS is metadata + concurrent-by-default
 * for B-tree; safe to add online on any size table.
 */
return new class extends Migration {
    public function up(): void
    {
        if (!Schema::hasTable('booking_mirror')) {
            return;
        }

        DB::statement(<<<'SQL'
            CREATE INDEX IF NOT EXISTS booking_mirror_org_modified_idx
                ON booking_mirror (organization_id, source_updated_at)
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS booking_mirror_org_modified_idx');
    }
};
