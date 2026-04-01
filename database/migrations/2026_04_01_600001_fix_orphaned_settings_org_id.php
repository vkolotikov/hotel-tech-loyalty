<?php

use App\Models\Organization;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Fix: Integration/booking settings seeded after the org-assignment migration
 * ended up with organization_id = NULL, making them invisible to TenantScope.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('hotel_settings', 'organization_id')) {
            return;
        }

        $org = Organization::first();
        if (!$org) {
            return;
        }

        // Some settings already have org_id (from the original assignment migration)
        // while duplicates were seeded later with NULL org_id.
        // Delete orphaned duplicates where an org-scoped version already exists.
        $existingKeys = DB::table('hotel_settings')
            ->where('organization_id', $org->id)
            ->pluck('key')
            ->toArray();

        if (!empty($existingKeys)) {
            DB::table('hotel_settings')
                ->whereNull('organization_id')
                ->whereIn('key', $existingKeys)
                ->delete();
        }

        // Assign remaining orphans (no duplicate conflict)
        DB::table('hotel_settings')
            ->whereNull('organization_id')
            ->update(['organization_id' => $org->id]);
    }

    public function down(): void
    {
        // Not reversible
    }
};
