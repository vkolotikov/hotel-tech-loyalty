<?php

namespace Tests\Concerns;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * For a test that writes its own organisation 1, or names organisations by fixed ids.
 *
 * On sqlite every test starts from an empty database. A PostgreSQL database
 * built from every migration (CLAUDE.md, "Testing against PostgreSQL") is not
 * empty: 2026_03_31_100002_assign_existing_data_to_default_org creates the
 * single-tenant install's organisation, id 1 ("My Hotel", slug `default`), and
 * later migrations give it its default brand, pipeline, settings and so on —
 * as production has. A test that inserts organisation 1 itself would collide
 * with it, and one that reads organisation 1's settings would read that
 * tenant's. This removes it inside the test's transaction (its brand, pipeline
 * and the rest go with it by their ON DELETE CASCADE foreign keys; its
 * settings rows, which have no foreign key, are removed by name), so the test
 * starts from what it would have on sqlite. The rollback brings it back.
 *
 * The test class must use DatabaseTransactions.
 */
trait ClearsTheMigrationsOrganisation
{
    protected function clearTheMigrationsOrganisation(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }
        if (DB::transactionLevel() < 1) {
            throw new \LogicException(static::class . ' must use DatabaseTransactions before it clears the migrations\' organisation.');
        }
        if (!DB::table('organizations')->where('id', 1)->where('slug', 'default')->exists()) {
            return;
        }

        foreach (['hotel_settings', 'crm_settings'] as $table) {
            if (Schema::hasTable($table)) {
                DB::table($table)->where('organization_id', 1)->delete();
            }
        }
        DB::table('organizations')->where('id', 1)->where('slug', 'default')->delete();
    }

    /**
     * The organisations a test names by fixed id, as bare rows (a name and a slug, nothing a test reads), on
     * PostgreSQL, where production's foreign keys need them; organisation 1 replaces the migrations' own. On sqlite
     * nothing is written: no key asks for the rows there, and the test's data stays exactly what it was.
     *
     * @param list<int> $ids
     */
    protected function organisationsExist(array $ids): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }
        if (in_array(1, $ids, true)) {
            $this->clearTheMigrationsOrganisation();
        }
        foreach ($ids as $id) {
            if (!DB::table('organizations')->where('id', $id)->exists()) {
                DB::table('organizations')->insert([
                    'id' => $id, 'name' => "Organization {$id}", 'slug' => "organization-{$id}",
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
    }
}
