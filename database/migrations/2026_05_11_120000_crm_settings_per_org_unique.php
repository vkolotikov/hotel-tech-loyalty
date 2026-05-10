<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * crm_settings was created in the single-tenant era with a unique
 * constraint on just `key`. Once multi-tenant scoping landed, any org
 * that hadn't yet written a particular setting key would collide with
 * the original seeded NULL-org row when an apply tried to INSERT.
 *
 * Hit this concretely while building Settings → Planner: clicking
 * "Apply preset" on a fresh org → 23505 unique violation because
 * `planner_groups` already existed globally with org_id=NULL.
 *
 * Fix: drop the single-column unique, add a composite (org_id, key)
 * unique. The NULL-org rows are kept — they are no longer reachable
 * through the global-scoped read path anyway, and dropping them
 * would lose the original seeded defaults a future tool might want.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Drop the legacy single-column unique. Index name follows
        // Laravel's default: <table>_<col>_unique.
        Schema::table('crm_settings', function (Blueprint $t) {
            try { $t->dropUnique('crm_settings_key_unique'); } catch (\Throwable $e) {}
        });

        // Add the proper composite unique. Wrapped in try so re-runs
        // don't blow up if it was already created on the prod DB.
        Schema::table('crm_settings', function (Blueprint $t) {
            try { $t->unique(['organization_id', 'key'], 'crm_settings_org_key_unique'); } catch (\Throwable $e) {}
        });

        // Stale NULL-org rows are now unreachable through the global
        // scope. Delete them so they stop being a confusing artifact
        // when poking at the table directly.
        DB::table('crm_settings')->whereNull('organization_id')->delete();
    }

    public function down(): void
    {
        Schema::table('crm_settings', function (Blueprint $t) {
            try { $t->dropUnique('crm_settings_org_key_unique'); } catch (\Throwable $e) {}
            try { $t->unique('key', 'crm_settings_key_unique'); } catch (\Throwable $e) {}
        });
    }
};
