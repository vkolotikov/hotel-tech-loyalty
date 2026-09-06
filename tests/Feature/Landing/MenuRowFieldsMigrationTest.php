<?php
namespace Tests\Feature\Landing;

use App\Models\LandingPage;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * The migration that gives each menu row its own SERVICE WINDOW and its own
 * "starting price" mark — the two columns the per-row variance the three
 * hospitality authors draw ("From €48" on one row, "€125 per guest" on the
 * next, "Evenings" on a row with no price at all) needs on the shared
 * `services` table.
 *
 * Loaded and run directly (`up()` on the returned instance) against the
 * trait-built schema, exactly as it runs against the live table: no tenant
 * bound, rows found by column alone. The rows are inserted through the query
 * builder rather than the model, because BelongsToBrand's creating hook
 * assigns a default brand to any row that arrives without one, and a row
 * with NO brand is one of the states this migration has to get right.
 *
 * THE BACKFILL IS THE PART THAT MATTERS. Before this migration a written band
 * prefix (`content.services.price_prefix`) marked every row on the page as a
 * starting price; after it the row's own flag decides and the band leaf is
 * only the word. So a page whose prefix is written today must wake up with
 * every row it lists already ticked, or the deploy would silently change a
 * live page. "Every row it lists" is PageContent's own scope — the page's
 * organisation, and its brand OR an unassigned row — spelled here with the
 * query builder so the migration never depends on app code that may change.
 */
class MenuRowFieldsMigrationTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    private const MIGRATION = 'migrations/2026_09_06_180000_add_menu_row_fields_to_services.php';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function migration(): Migration
    {
        $this->assertFileExists(database_path(self::MIGRATION), 'The menu-row migration does not exist.');

        return require database_path(self::MIGRATION);
    }

    /** A page on a kit, with whatever the tenant wrote under `services`. */
    private function page(int $orgId, ?int $brandId, array $services): LandingPage
    {
        return LandingPage::create([
            'organization_id' => $orgId, 'brand_id' => $brandId,
            'slug' => 'p-' . $orgId . '-' . ($brandId ?? 'none') . '-' . uniqid(),
            'template_key' => 'maison_vela', 'industry' => 'restaurant', 'status' => 'published',
            'published_at' => now(),
            'content' => ['hero' => ['headline' => 'Vela'], 'services' => $services],
            'theme'   => [],
        ]);
    }

    /** A bare Service row, through the query builder: no hooks, no default brand. */
    private function row(int $orgId, ?int $brandId, string $name, bool $active = true): int
    {
        return (int) DB::table('services')->insertGetId([
            'organization_id' => $orgId, 'brand_id' => $brandId, 'name' => $name,
            'price' => 48, 'currency' => 'EUR', 'sort_order' => 0, 'is_active' => $active,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function isFrom(int $id): bool
    {
        return (bool) DB::table('services')->where('id', $id)->value('price_is_from');
    }

    private function dropTheColumnsIfPresent(): void
    {
        foreach (['service_window', 'price_is_from'] as $column) {
            if (Schema::hasColumn('services', $column)) {
                Schema::table('services', fn ($table) => $table->dropColumn($column));
            }
        }
    }

    // ─── The columns ─────────────────────────────────────────────────────

    public function test_it_adds_both_row_columns_and_is_a_no_op_when_they_already_exist(): void
    {
        $this->dropTheColumnsIfPresent();
        $migration = $this->migration();

        $migration->up();

        $this->assertTrue(Schema::hasColumn('services', 'service_window'));
        $this->assertTrue(Schema::hasColumn('services', 'price_is_from'));

        // A re-run on an environment that already has the columns must not
        // throw — the house shape of every guarded migration here.
        $migration->up();

        $this->assertTrue(Schema::hasColumn('services', 'service_window'));
        $this->assertTrue(Schema::hasColumn('services', 'price_is_from'));
    }

    public function test_a_row_that_says_nothing_has_no_window_and_a_fixed_price(): void
    {
        $this->dropTheColumnsIfPresent();
        $this->migration()->up();

        $id = $this->row(1, 1, 'Le Déjeuner');

        $this->assertNull(DB::table('services')->where('id', $id)->value('service_window'));
        $this->assertFalse($this->isFrom($id));
    }

    public function test_down_removes_both_columns_and_is_a_no_op_when_they_are_gone(): void
    {
        $migration = $this->migration();
        $migration->up();

        $migration->down();

        $this->assertFalse(Schema::hasColumn('services', 'service_window'));
        $this->assertFalse(Schema::hasColumn('services', 'price_is_from'));

        $migration->down();

        $this->assertFalse(Schema::hasColumn('services', 'price_is_from'));
    }

    // ─── The backfill ────────────────────────────────────────────────────

    /**
     * The page's scope is the organisation and its brand OR an unassigned
     * row (PageContent::scopedToBrand) — every row in it, active or not,
     * because the band prefix marked every row the page could ever show.
     * A sibling brand's rows and another organisation's are not the page's.
     */
    public function test_a_written_band_prefix_ticks_every_row_in_the_pages_scope_and_no_other(): void
    {
        $this->page(1, 1, ['heading' => 'Menus', 'price_prefix' => 'From']);

        $own        = $this->row(1, 1, 'Le Déjeuner');
        $unassigned = $this->row(1, null, 'À la carte');
        $inactive   = $this->row(1, 1, 'Winter menu', active: false);
        $sibling    = $this->row(1, 2, 'Sibling brand menu');
        $stranger   = $this->row(2, 1, 'Another restaurant');

        $this->migration()->up();

        $this->assertTrue($this->isFrom($own));
        $this->assertTrue($this->isFrom($unassigned));
        $this->assertTrue($this->isFrom($inactive));
        $this->assertFalse($this->isFrom($sibling));
        $this->assertFalse($this->isFrom($stranger));
    }

    /** A page with no brand lists every row of its organisation, so it ticks every one. */
    public function test_a_brandless_page_ticks_every_row_of_its_organisation(): void
    {
        $this->page(1, null, ['price_prefix' => 'ab']);

        $brandOne   = $this->row(1, 1, 'Lunch');
        $brandTwo   = $this->row(1, 2, 'Dinner');
        $unassigned = $this->row(1, null, 'Bar');
        $stranger   = $this->row(2, null, 'Elsewhere');

        $this->migration()->up();

        $this->assertTrue($this->isFrom($brandOne));
        $this->assertTrue($this->isFrom($brandTwo));
        $this->assertTrue($this->isFrom($unassigned));
        $this->assertFalse($this->isFrom($stranger));
    }

    public function test_a_blank_or_missing_prefix_ticks_nothing(): void
    {
        $this->page(1, 1, ['price_prefix' => '']);
        $this->page(1, 2, ['price_prefix' => '   ']);
        $this->page(1, 3, ['heading' => 'Menus']);

        $ids = [$this->row(1, 1, 'A'), $this->row(1, 2, 'B'), $this->row(1, 3, 'C'), $this->row(1, null, 'D')];

        $this->migration()->up();

        foreach ($ids as $id) {
            $this->assertFalse($this->isFrom($id));
        }
    }

    /**
     * `content` is whatever the tenant's saves left there. A page whose
     * content is not a map, or whose `services` is not one, is skipped —
     * never a crash halfway through a deploy's `migrate --force`.
     */
    public function test_content_that_is_not_a_map_is_skipped_rather_than_fatal(): void
    {
        // One page per brand is the table's own rule, so each shape gets a
        // brand of its own; the row under test is unassigned, in scope of all.
        $base = [
            'organization_id' => 1, 'template_key' => 'maison_vela',
            'industry' => 'restaurant', 'status' => 'published', 'theme' => '[]',
            'created_at' => now(), 'updated_at' => now(),
        ];
        foreach ([
            ['null-content',    null],
            ['string-content',  json_encode('just a string')],
            ['string-services', json_encode(['services' => 'not a map'])],
            ['list-prefix',     json_encode(['services' => ['price_prefix' => ['From']]])],
            ['broken-json',     '{not json'],
        ] as $i => [$slug, $content]) {
            DB::table('landing_pages')->insert($base + ['brand_id' => $i + 1, 'slug' => $slug, 'content' => $content]);
        }

        $id = $this->row(1, null, 'Le Déjeuner');

        $this->migration()->up();

        $this->assertFalse($this->isFrom($id));
    }

    public function test_the_backfill_is_idempotent(): void
    {
        $this->page(1, 1, ['price_prefix' => 'From']);
        $id = $this->row(1, 1, 'Le Déjeuner');

        $migration = $this->migration();
        $migration->up();
        $migration->up();

        $this->assertTrue($this->isFrom($id));
    }
}
