<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A guest tag's name is unique within its organisation, not across all of them (2026-11-08): the CRM tables' first
 * migration gave `guest_tags.name` a global unique constraint (`guest_tags_name_unique`), from before the table had an
 * organisation, so a second venue could not have a "VIP" tag. This replaces it with a unique index on
 * (`organization_id`, `name`); GuestController validates the same rule.
 *
 * PostgreSQL only (production's database). Safe with existing data: names were unique across every organisation, so
 * they are unique within each; the new index is built before the old constraint goes, in one transaction, so no moment
 * allows duplicates within an organisation. Other drivers (the tests' SQLite schemas, built by the test helpers) are
 * left as they are.
 */
return new class extends Migration {
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql' || !Schema::hasTable('guest_tags') || !Schema::hasColumn('guest_tags', 'organization_id')) {
            return;
        }

        DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS guest_tags_org_name_unique ON guest_tags (organization_id, name)');
        DB::statement('ALTER TABLE guest_tags DROP CONSTRAINT IF EXISTS guest_tags_name_unique');
        // A database where the old rule was made as a bare index rather than a constraint.
        DB::statement('DROP INDEX IF EXISTS guest_tags_name_unique');
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql' || !Schema::hasTable('guest_tags')) {
            return;
        }

        // Only restorable while no two organisations share a tag name; otherwise PostgreSQL refuses and says so.
        DB::statement('ALTER TABLE guest_tags ADD CONSTRAINT guest_tags_name_unique UNIQUE (name)');
        DB::statement('DROP INDEX IF EXISTS guest_tags_org_name_unique');
    }
};
