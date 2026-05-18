<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * External-source attribution columns on inquiries.
 *
 * Used by the new POST /v1/integrations/leads endpoint that lets external
 * systems (e.g. the FDS Card Builder) push leads in via a Sanctum personal
 * access token. The columns let us:
 *
 *   - Tag where the lead came from (external_source) and dedupe per-org
 *     replays (external_id) so the integration is safely retry-able.
 *   - Deep-link back to the source system for staff who want context.
 *   - Stamp the original submission time separately from our created_at,
 *     since external systems may queue leads before pushing.
 *   - Carry the customer's quoted currency on the lead — useful when the
 *     org bills in EUR but the lead is in GBP / USD.
 *
 * Idempotency is enforced by a partial unique index on
 *   (organization_id, external_source, external_id)
 *   WHERE external_source IS NOT NULL AND external_id IS NOT NULL
 *
 * — so legacy inquiries (no external attribution) are untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inquiries', function (Blueprint $t) {
            if (!Schema::hasColumn('inquiries', 'external_source')) {
                $t->string('external_source', 50)->nullable()->index();
            }
            if (!Schema::hasColumn('inquiries', 'external_id')) {
                $t->string('external_id', 255)->nullable();
            }
            if (!Schema::hasColumn('inquiries', 'external_url')) {
                $t->text('external_url')->nullable();
            }
            if (!Schema::hasColumn('inquiries', 'external_submitted_at')) {
                $t->timestamp('external_submitted_at')->nullable();
            }
            if (!Schema::hasColumn('inquiries', 'currency')) {
                $t->string('currency', 3)->nullable();
            }
        });

        // Partial unique index — Postgres only. Skipped on other drivers
        // (SQLite test runner doesn't support partial unique constraints
        // with the same syntax; the controller's own pre-check covers
        // dev / test).
        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'pgsql') {
            DB::statement(<<<'SQL'
                CREATE UNIQUE INDEX IF NOT EXISTS inquiries_external_attribution_unique
                ON inquiries (organization_id, external_source, external_id)
                WHERE external_source IS NOT NULL AND external_id IS NOT NULL
            SQL);
        }
    }

    public function down(): void
    {
        $driver = Schema::getConnection()->getDriverName();
        if ($driver === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS inquiries_external_attribution_unique');
        }

        Schema::table('inquiries', function (Blueprint $t) {
            foreach (['external_source', 'external_id', 'external_url', 'external_submitted_at', 'currency'] as $col) {
                if (Schema::hasColumn('inquiries', $col)) {
                    $t->dropColumn($col);
                }
            }
        });
    }
};
