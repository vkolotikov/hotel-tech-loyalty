<?php

namespace Tests\Feature\Database;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Tests\Concerns\StartsFromABlankDatabase;
use Tests\TestCase;

/**
 * The permission package's five tables are dropped only while every one of them is empty, and the rollback rebuilds
 * them as the original migration did.
 */
class DropUnusedPermissionTablesTest extends TestCase
{
    use DatabaseTransactions, StartsFromABlankDatabase;

    private const TABLES = ['permissions', 'roles', 'model_has_permissions', 'model_has_roles', 'role_has_permissions'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->startFromABlankDatabase();
        foreach (array_reverse(self::TABLES) as $table) {
            Schema::dropIfExists($table);
        }
        (require base_path('database/migrations/2026_03_17_094143_create_permission_tables.php'))->up();
    }

    private function migration(): object
    {
        return require base_path('database/migrations/2026_11_01_100000_drop_unused_permission_tables.php');
    }

    public function test_empty_tables_are_dropped_and_the_rollback_rebuilds_them(): void
    {
        $this->migration()->up();
        foreach (self::TABLES as $table) {
            $this->assertFalse(Schema::hasTable($table), $table);
        }

        $this->migration()->down();
        foreach (self::TABLES as $table) {
            $this->assertTrue(Schema::hasTable($table), $table);
        }
        $this->assertSame(['id', 'name', 'guard_name', 'created_at', 'updated_at'], Schema::getColumnListing('roles'));
    }

    public function test_a_table_holding_a_row_stops_the_migration_before_anything_is_dropped(): void
    {
        DB::table('roles')->insert(['name' => 'kept', 'guard_name' => 'web', 'created_at' => now(), 'updated_at' => now()]);

        try {
            $this->migration()->up();
            $this->fail('The migration dropped tables although roles holds a row.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('roles is not empty', $e->getMessage());
        }

        foreach (self::TABLES as $table) {
            $this->assertTrue(Schema::hasTable($table), $table);
        }
        $this->assertSame(1, DB::table('roles')->count());
    }
}
