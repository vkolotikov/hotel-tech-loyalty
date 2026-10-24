<?php

namespace Tests\Feature\LoyaltyWorkspace;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\StartsFromABlankDatabase;
use Tests\TestCase;

/**
 * Release 3's two migrations (spec 2026-10-22 §2, R3-1), run on sqlite on top of the tables as their own release-2
 * migrations build them, with a row already in each: nullable columns only, the rows untouched, a second run a no-op,
 * and down() removing exactly what up() added.
 */
class DurableFilesMigrationTest extends TestCase
{
    use StartsFromABlankDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // The migrations build their tables from nothing; on PostgreSQL built from every migration that is a schema
        // of the test's own (outside a transaction: the ledger's index is built CONCURRENTLY).
        $this->startFromABlankDatabaseOutsideATransaction();
    }

    private const WALLET = ['apple_cert_content', 'apple_wwdr_content', 'google_service_account_content'];

    private function migration(string $file): object
    {
        return require base_path("database/migrations/{$file}");
    }

    /** What the release-2 tables point at, so their own migrations (with foreign keys) can build them. */
    private function parents(): void
    {
        foreach (['organizations', 'brands', 'users'] as $table) {
            Schema::create($table, fn (Blueprint $t) => $t->id());
            DB::table($table)->insert(['id' => 1]);
        }
    }

    /** @return array<string, array{type: string, nullable: bool}> */
    private function columns(string $table): array
    {
        return collect(Schema::getColumns($table))->mapWithKeys(fn (array $c) => [$c['name'] => ['type' => $c['type'], 'nullable' => $c['nullable']]])->all();
    }

    public function test_the_wallet_file_columns_are_added_nullable_beside_the_paths_and_removed_again(): void
    {
        $this->parents();
        $this->migration('2026_05_12_250000_create_wallet_configs.php')->up();
        DB::table('wallet_configs')->insert(['organization_id' => 1, 'apple_cert_path' => 'wallet/1/apple-cert.p12', 'apple_team_id' => 'ABCDE12345']);
        $before = array_keys($this->columns('wallet_configs'));

        $migration = $this->migration('2026_10_22_100000_add_file_contents_to_wallet_configs.php');
        $migration->up();
        $migration->up();

        $columns = $this->columns('wallet_configs');
        foreach (self::WALLET as $column) {
            $this->assertSame(['type' => 'text', 'nullable' => true], $columns[$column], $column);
        }
        $row = DB::table('wallet_configs')->first();
        $this->assertSame('wallet/1/apple-cert.p12', $row->apple_cert_path);
        $this->assertSame('ABCDE12345', $row->apple_team_id);
        $this->assertNull($row->apple_cert_content);

        $migration->down();
        $this->assertSame($before, array_keys($this->columns('wallet_configs')));
        $this->assertSame('wallet/1/apple-cert.p12', DB::table('wallet_configs')->value('apple_cert_path'));
        $migration->down();
    }

    public function test_the_import_file_column_is_added_nullable_and_removed_again(): void
    {
        $this->parents();
        $this->migration('2026_08_10_093000_create_member_import_batches_table.php')->up();
        DB::table('member_import_batches')->insert(['uuid' => '00000000-0000-0000-0000-000000000001', 'organization_id' => 1, 'stored_path' => '/srv/storage/app/member-imports/a.csv']);
        $before = array_keys($this->columns('member_import_batches'));

        $migration = $this->migration('2026_10_22_100100_add_file_content_to_member_import_batches.php');
        $migration->up();
        $migration->up();

        $this->assertSame(['type' => 'text', 'nullable' => true], $this->columns('member_import_batches')['file_content']);
        $row = DB::table('member_import_batches')->first();
        $this->assertSame('/srv/storage/app/member-imports/a.csv', $row->stored_path);
        $this->assertNull($row->file_content);

        $migration->down();
        $this->assertSame($before, array_keys($this->columns('member_import_batches')));
        $migration->down();
    }
}
