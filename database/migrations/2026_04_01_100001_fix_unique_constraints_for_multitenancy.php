<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Replace single-column unique constraints with composite (organization_id, column)
 * so each tenant can have their own Bronze tier, hotel_name setting, etc.
 *
 * Idempotent: checks constraint existence before drop/add to handle partial runs.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->swapUnique('loyalty_tiers', 'name', 'organization_id');
        $this->swapUnique('hotel_settings', 'key', 'organization_id');
        $this->swapUnique('properties', 'code', 'organization_id');

        if (Schema::hasColumn('benefit_definitions', 'code')) {
            $this->swapUnique('benefit_definitions', 'code', 'organization_id');
        }
    }

    public function down(): void
    {
        $this->restoreUnique('loyalty_tiers', 'name', 'organization_id');
        $this->restoreUnique('hotel_settings', 'key', 'organization_id');
        $this->restoreUnique('properties', 'code', 'organization_id');

        if (Schema::hasColumn('benefit_definitions', 'code')) {
            $this->restoreUnique('benefit_definitions', 'code', 'organization_id');
        }
    }

    /**
     * Drop single-column unique, add composite unique (idempotent).
     */
    private function swapUnique(string $table, string $column, string $orgColumn): void
    {
        $singleName = "{$table}_{$column}_unique";
        $compositeName = "{$table}_{$orgColumn}_{$column}_unique";

        if ($this->constraintExists($table, $singleName)) {
            Schema::table($table, fn (Blueprint $t) => $t->dropUnique([$column]));
        }

        if (!$this->constraintExists($table, $compositeName)) {
            Schema::table($table, fn (Blueprint $t) => $t->unique([$orgColumn, $column]));
        }
    }

    /**
     * Restore single-column unique, drop composite unique (idempotent).
     */
    private function restoreUnique(string $table, string $column, string $orgColumn): void
    {
        $compositeName = "{$table}_{$orgColumn}_{$column}_unique";
        $singleName = "{$table}_{$column}_unique";

        if ($this->constraintExists($table, $compositeName)) {
            Schema::table($table, fn (Blueprint $t) => $t->dropUnique([$orgColumn, $column]));
        }

        if (!$this->constraintExists($table, $singleName)) {
            Schema::table($table, fn (Blueprint $t) => $t->unique($column));
        }
    }

    private function constraintExists(string $table, string $name): bool
    {
        return (bool) DB::selectOne(
            "SELECT 1 FROM pg_indexes WHERE tablename = ? AND indexname = ?",
            [$table, $name]
        );
    }
};
