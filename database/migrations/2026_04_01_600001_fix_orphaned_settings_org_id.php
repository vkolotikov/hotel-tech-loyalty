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

        DB::table('hotel_settings')
            ->whereNull('organization_id')
            ->update(['organization_id' => $org->id]);
    }

    public function down(): void
    {
        // Not reversible
    }
};
