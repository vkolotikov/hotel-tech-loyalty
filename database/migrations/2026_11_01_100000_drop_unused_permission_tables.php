<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * The five tables spatie/laravel-permission used. The package was removed on 2026-10-31 (nothing used Spatie roles;
 * the role system is staff.role) and the owner decided on 2026-11-01 to drop its tables. They are empty in
 * production; this migration still refuses to drop any of them that holds a row, so it can never lose data.
 * down() rebuilds them exactly as the 2026_03_17 migration does.
 */
return new class extends Migration
{
    /** In dependency order: the pivot tables first, then the two they point to. */
    private const TABLES = ['role_has_permissions', 'model_has_roles', 'model_has_permissions', 'roles', 'permissions'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            if (Schema::hasTable($table) && DB::table($table)->exists()) {
                throw new RuntimeException("Table {$table} is not empty; it was expected to be unused. Nothing was dropped.");
            }
        }

        foreach (self::TABLES as $table) {
            Schema::dropIfExists($table);
        }
    }

    public function down(): void
    {
        (require __DIR__ . '/2026_03_17_094143_create_permission_tables.php')->up();
    }
};
