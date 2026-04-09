<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * P1 perf: composite indexes for the hot reservation lookup paths.
 *
 * - reservations(organization_id, status):  every admin list/filter/dashboard
 *   KPI scopes by tenant + status. The single-column status index doesn't
 *   help under the global tenant scope because the planner has to scan all
 *   tenants and filter, then re-narrow by status.
 *
 * - reservations(check_in, status):  the booking calendar + arrival reports
 *   constantly do "today's arrivals where status = Confirmed" — a date range
 *   plus a status equality. Composite index lets PG seek directly.
 *
 * Visitor table already has the composites it needs (org+last_seen, org+is_lead),
 * so no visitor index changes here despite what the audit suggested — verified
 * against the create-visitors migration.
 */
return new class extends Migration {
    public function up(): void
    {
        $this->addCompositeIndexSafe('reservations', ['organization_id', 'status'], 'reservations_org_status_index');
        $this->addCompositeIndexSafe('reservations', ['check_in', 'status'],         'reservations_checkin_status_index');
    }

    public function down(): void
    {
        $this->dropNamedIndexSafe('reservations', 'reservations_org_status_index');
        $this->dropNamedIndexSafe('reservations', 'reservations_checkin_status_index');
    }

    private function addCompositeIndexSafe(string $table, array $columns, string $name): void
    {
        if (!Schema::hasTable($table)) return;
        foreach ($columns as $col) {
            if (!Schema::hasColumn($table, $col)) return;
        }
        try {
            Schema::table($table, fn (Blueprint $t) => $t->index($columns, $name));
        } catch (\Throwable) {
            // Index likely already exists
        }
    }

    private function dropNamedIndexSafe(string $table, string $name): void
    {
        try {
            Schema::table($table, fn (Blueprint $t) => $t->dropIndex($name));
        } catch (\Throwable) {}
    }
};
