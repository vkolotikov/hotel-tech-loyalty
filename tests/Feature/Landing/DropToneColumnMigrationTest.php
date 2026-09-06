<?php
namespace Tests\Feature\Landing;

use Illuminate\Database\Migrations\Migration;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * The migration that drops `landing_page_sections.tone`.
 *
 * The column was the generic house design's per-band colour
 * (2026_08_31_090000_add_tone_to_landing_page_sections). That design was
 * retired on 2026-09-05 with the machinery only it read, and the column
 * stayed behind as the safe direction on the live table: no kit layout
 * reads it, no endpoint validates it, no screen offers it, and the model
 * stopped filling it. This migration removes it, guarded in both directions
 * like every other here, and `down()` restores the nullable 16-character
 * column exactly as the 08-31 migration made it — empty, which is what every
 * row of a retired design's colour is worth.
 *
 * Run directly (`up()` / `down()` on the returned instance) against the
 * trait-built schema, which mirrors the live table AFTER this migration
 * (no `tone`), so the pre-migration state — the column as the 08-31
 * migration made it — is built here first.
 */
class DropToneColumnMigrationTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    private const MIGRATION = 'migrations/2026_09_06_190000_drop_tone_from_landing_page_sections.php';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();

        if (!Schema::hasColumn('landing_page_sections', 'tone')) {
            Schema::table('landing_page_sections', fn ($table) => $table->string('tone', 16)->nullable());
        }
    }

    private function migration(): Migration
    {
        $this->assertFileExists(database_path(self::MIGRATION), 'The drop-tone migration does not exist.');

        return require database_path(self::MIGRATION);
    }

    public function test_the_fixture_starts_with_the_column_the_migration_removes(): void
    {
        $this->assertTrue(Schema::hasColumn('landing_page_sections', 'tone'), 'The pre-migration state was not built; the test would prove nothing.');
    }

    public function test_up_drops_the_column_and_is_a_no_op_once_it_is_gone(): void
    {
        $migration = $this->migration();

        $migration->up();
        $this->assertFalse(Schema::hasColumn('landing_page_sections', 'tone'));

        $migration->up();
        $this->assertFalse(Schema::hasColumn('landing_page_sections', 'tone'));
    }

    /** The rows themselves are untouched: a section keeps its key, order and content. */
    public function test_dropping_the_column_keeps_every_other_column_and_row(): void
    {
        DB::table('landing_pages')->insert([
            'id' => 1, 'organization_id' => 1, 'brand_id' => 1, 'slug' => 'vela', 'template_key' => 'maison_vela',
            'industry' => 'restaurant', 'status' => 'published', 'content' => '{}', 'theme' => '[]',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('landing_page_sections')->insert([
            'landing_page_id' => 1, 'key' => 'hero', 'enabled' => true, 'sort' => 0, 'tone' => 'ink',
            'content' => json_encode(['headline' => 'Some evenings']),
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->migration()->up();

        $row = DB::table('landing_page_sections')->where('landing_page_id', 1)->first();
        $this->assertSame('hero', $row->key);
        $this->assertSame(0, (int) $row->sort);
        $this->assertTrue((bool) $row->enabled);
        $this->assertSame(['headline' => 'Some evenings'], json_decode($row->content, true));
        $this->assertObjectNotHasProperty('tone', $row);
    }

    public function test_down_restores_the_nullable_column_and_is_a_no_op_when_it_exists(): void
    {
        $migration = $this->migration();
        $migration->up();

        $migration->down();
        $this->assertTrue(Schema::hasColumn('landing_page_sections', 'tone'));

        // Nullable, so a row that says nothing about it still inserts.
        DB::table('landing_pages')->insert([
            'id' => 1, 'organization_id' => 1, 'brand_id' => 1, 'slug' => 'vela', 'template_key' => 'maison_vela',
            'industry' => 'restaurant', 'status' => 'published', 'content' => '{}', 'theme' => '[]',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('landing_page_sections')->insert([
            'landing_page_id' => 1, 'key' => 'hero', 'enabled' => true, 'sort' => 0,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertNull(DB::table('landing_page_sections')->where('landing_page_id', 1)->value('tone'));

        $migration->down();
        $this->assertTrue(Schema::hasColumn('landing_page_sections', 'tone'));
    }
}
