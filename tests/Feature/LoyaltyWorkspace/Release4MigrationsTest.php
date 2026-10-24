<?php

namespace Tests\Feature\LoyaltyWorkspace;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\StartsFromABlankDatabase;
use Tests\TestCase;

/**
 * Release 4 part E's two migrations, run on sqlite on top of the tables as their own migrations build them, with a
 * row already in each: an index and a nullable column only, the rows untouched, a second run a no-op, and down()
 * removing exactly what up() added. The index's PostgreSQL path (CREATE INDEX CONCURRENTLY outside a transaction)
 * is tried on PostgreSQL before the deploy; here the migration says it runs outside a transaction.
 */
class Release4MigrationsTest extends TestCase
{
    use StartsFromABlankDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // The migrations build their tables from nothing; on PostgreSQL built from every migration that is a schema
        // of the test's own (outside a transaction: the ledger's index is built CONCURRENTLY).
        $this->startFromABlankDatabaseOutsideATransaction();
    }

    private function migration(string $file): object
    {
        return require base_path("database/migrations/{$file}");
    }

    /** @return list<string> */
    private function indexes(string $table): array
    {
        return collect(Schema::getIndexes($table))->pluck('name')->sort()->values()->all();
    }

    public function test_the_ledger_gets_its_organisation_and_time_index_outside_a_transaction_and_loses_it_again(): void
    {
        // What the ledger's own migration points at (PostgreSQL checks a foreign key's table as it is created).
        foreach (['organizations', 'users', 'loyalty_members'] as $table) {
            Schema::create($table, fn (Blueprint $t) => $t->id());
            DB::table($table)->insert(['id' => 1]);
        }
        $this->migration('2024_01_01_000005_create_points_transactions_table.php')->up();
        if (!Schema::hasColumn('points_transactions', 'organization_id')) {
            Schema::table('points_transactions', fn (Blueprint $t) => $t->unsignedBigInteger('organization_id')->nullable());
        }
        $before = $this->indexes('points_transactions');

        $migration = $this->migration('2026_10_23_140000_add_org_created_index_to_points_transactions.php');
        $this->assertFalse($migration->withinTransaction);
        $migration->up();
        $migration->up();

        $index = collect(Schema::getIndexes('points_transactions'))->firstWhere('name', 'points_transactions_org_created_index');
        $this->assertSame(['organization_id', 'created_at'], $index['columns']);
        $this->assertFalse($index['unique']);
        $this->assertSame(array_values(collect([...$before, 'points_transactions_org_created_index'])->sort()->values()->all()), $this->indexes('points_transactions'));

        $migration->down();
        $migration->down();
        $this->assertSame($before, $this->indexes('points_transactions'));
    }

    public function test_a_boost_gets_a_nullable_times_venue_at_and_its_row_stays_as_it_was(): void
    {
        foreach (['organizations', 'brands', 'properties'] as $table) {
            Schema::create($table, fn (Blueprint $t) => $t->id());
            DB::table($table)->insert(['id' => 1]);
        }
        $this->migration('2026_05_12_230000_create_earn_rate_events.php')->up();
        DB::table('earn_rate_events')->insert([
            'organization_id' => 1, 'name' => 'Double weekend', 'multiplier' => 2, 'starts_at' => '2026-10-09 18:00:00', 'ends_at' => '2026-10-11 23:00:00',
        ]);
        $before = collect(Schema::getColumns('earn_rate_events'))->pluck('name')->all();

        $migration = $this->migration('2026_10_23_140100_add_times_venue_at_to_earn_rate_events.php');
        $migration->up();
        $migration->up();

        $column = collect(Schema::getColumns('earn_rate_events'))->firstWhere('name', 'times_venue_at');
        $this->assertTrue($column['nullable']);
        $row = DB::table('earn_rate_events')->first();
        $this->assertNull($row->times_venue_at);
        $this->assertSame('2026-10-09 18:00:00', $row->starts_at);

        $migration->down();
        $migration->down();
        $this->assertSame($before, collect(Schema::getColumns('earn_rate_events'))->pluck('name')->all());
    }
}
