<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 2 security fix: Add organization_id to tables that were missing tenant scoping.
 * Tables that already had the column from the multitenancy migration are skipped.
 */
return new class extends Migration
{
    public function up(): void
    {
        $tables = [
            'guest_tags',
            'guest_segments',
            'crm_settings',
            'planner_day_notes',
            'guest_custom_fields',
            'guest_import_runs',
        ];

        foreach ($tables as $table) {
            if (Schema::hasTable($table) && !Schema::hasColumn($table, 'organization_id')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->unsignedBigInteger('organization_id')->nullable()->after('id');
                    $t->index('organization_id');
                });
            }
        }
    }

    public function down(): void
    {
        $tables = [
            'guest_tags', 'guest_segments', 'crm_settings',
            'planner_day_notes', 'guest_custom_fields', 'guest_import_runs',
        ];

        foreach ($tables as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'organization_id')) {
                Schema::table($table, function (Blueprint $t) {
                    $t->dropIndex(['organization_id']);
                    $t->dropColumn('organization_id');
                });
            }
        }
    }
};
