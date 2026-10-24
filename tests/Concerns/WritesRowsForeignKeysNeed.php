<?php

namespace Tests\Concerns;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Rows a test names by a fixed id in another table — property 100, member 999,
 * offer 7 — that production's foreign keys require to exist.
 *
 * On sqlite the tables a test builds carry no foreign keys, so a test can name
 * an id nothing holds; on PostgreSQL built from every migration the key refuses
 * it. rowsExist() writes a plain row with each such id there (and only there):
 * every NOT NULL column without a default gets a value its type accepts, and a
 * NOT NULL foreign key gets a row of its own made the same way, so the row is
 * one production could hold. Nothing in it is something the test reads; a test
 * that reads a column of the row sets it itself.
 */
trait WritesRowsForeignKeysNeed
{
    /**
     * @param list<int> $ids
     * @param array<string, mixed> $values columns every one of the rows gets
     */
    protected function rowsExist(string $table, array $ids, array $values = []): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }
        foreach ($ids as $id) {
            if (!DB::table($table)->where('id', $id)->exists()) {
                $this->plainRow($table, ['id' => $id] + $values);
            }
        }
    }

    /**
     * One row whose NOT NULL columns hold plain values of their type, the named ones as given. Returns its id.
     *
     * @param array<string, mixed> $values
     */
    protected function plainRow(string $table, array $values = [], int $depth = 0): int
    {
        $parents = [];
        foreach (Schema::getForeignKeys($table) as $fk) {
            if (count($fk['columns']) === 1) {
                $parents[$fk['columns'][0]] = $fk['foreign_table'];
            }
        }

        $row = [];
        foreach (Schema::getColumns($table) as $col) {
            if ($col['name'] === 'id' || $col['nullable'] || $col['default'] !== null || array_key_exists($col['name'], $values)) {
                continue;
            }
            $type = strtolower((string) $col['type_name']);
            $length = preg_match('/\((\d+)\)/', (string) $col['type'], $m) ? (int) $m[1] : null;
            $row[$col['name']] = match (true) {
                $col['name'] === 'organization_id' && app()->bound('current_organization_id') => app('current_organization_id'),
                isset($parents[$col['name']]) && $depth < 4 => $this->plainRow($parents[$col['name']], [], $depth + 1),
                str_contains($type, 'int'), str_contains($type, 'numeric'), str_contains($type, 'decimal') => 1,
                str_contains($type, 'date'), str_contains($type, 'time') => now()->toDateTimeString(),
                str_contains($type, 'bool') => true,
                str_contains($type, 'json') => '{}',
                $type === 'uuid' => (string) Str::uuid(),
                default => substr('x-' . Str::lower(Str::random(16)), 0, $length ?? 64),
            };
        }

        return (int) DB::table($table)->insertGetId(array_merge($row, $values));
    }
}
