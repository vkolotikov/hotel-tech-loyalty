<?php
namespace Tests\Feature\Landing;

use App\Models\LandingPage;
use App\Services\Landing\LandingOnboardingService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * The data migration that moved every page off the generic house design
 * (`ruled_page`) and onto one of the owner's six kits — and the registry
 * helper it resolves the destination through.
 *
 * The migration is loaded and run directly (`up()` on the returned
 * instance) against the trait-built landing schema, exactly as it would run
 * against the live table: no tenant bound, rows found by `template_key`
 * alone. The retired key is spelled as a literal in the fixtures below for
 * the same reason it is spelled in the migration — nothing else in the
 * codebase names it any more, and that is the point.
 */
class RetireRuledPageMigrationTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    private const MIGRATION = 'migrations/2026_09_04_090000_retire_ruled_page_landing_template.php';

    /** The rows the generic design's pages carried: the industry's own seven. */
    private const LEGACY_ROWS = ['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function migration(): Migration
    {
        return require database_path(self::MIGRATION);
    }

    /** A page on the retired design, with the rows such a page actually had. */
    private function legacyPage(string $slug, string $industry, int $brandId, array $content = []): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => $brandId, 'slug' => $slug,
            'template_key' => 'ruled_page', 'industry' => $industry, 'status' => 'published',
            'published_at' => now(),
            'content' => $content ?: ['hero' => ['headline' => 'Hexa Academy'], 'about' => ['body' => 'Twenty years on this street']],
            'theme'   => ['brand_color' => '#123456'],
        ]);

        foreach (self::LEGACY_ROWS as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => $key !== 'team', 'sort' => $i]);
        }

        return $page;
    }

    private function fresh(LandingPage $page): LandingPage
    {
        return LandingPage::withoutGlobalScopes()->with('sections')->findOrFail($page->id);
    }

    // ─── The destination ─────────────────────────────────────────────────

    /**
     * The migration's destination is the registry's own answer, resolved
     * through the ONE industry → vertical map — never a copy of it here.
     */
    public function test_the_default_design_is_the_first_offerable_design_of_the_industrys_own_trade(): void
    {
        $offerable = LandingOnboardingService::offerableTemplateKeys();
        $byKey     = collect(LandingOnboardingService::templates())->keyBy('key');

        foreach (\App\Models\Organization::INDUSTRIES as $industry) {
            $chosen   = LandingOnboardingService::defaultTemplateFor($industry);
            $vertical = LandingOnboardingService::verticalForIndustry($industry);

            $this->assertContains($chosen, $offerable, "'{$industry}' defaults to a design nobody may choose.");

            if ($vertical !== null) {
                $this->assertSame($vertical, $byKey[$chosen]['vertical'],
                    "'{$industry}' defaults to a design drawn for another trade.");
            } else {
                $this->assertSame($offerable[0], $chosen,
                    "'{$industry}' has no kits of its own and must fall back to the first design on offer.");
            }
        }

        // The concrete answers the migration relied on, named so a reorder
        // of the registry has to come past this test.
        $this->assertSame('nocturne_ritual', LandingOnboardingService::defaultTemplateFor('beauty'));
        $this->assertSame('maison_vela', LandingOnboardingService::defaultTemplateFor('restaurant'));
        $this->assertSame('nocturne_ritual', LandingOnboardingService::defaultTemplateFor('hotel'));
        $this->assertSame('nocturne_ritual', LandingOnboardingService::defaultTemplateFor('education'));
        $this->assertSame('nocturne_ritual', LandingOnboardingService::defaultTemplateFor('not-an-industry'));
    }

    // ─── The move ────────────────────────────────────────────────────────

    public function test_a_page_on_the_retired_design_moves_onto_its_trades_first_design(): void
    {
        $beauty     = $this->legacyPage('beauty-salon', 'beauty', 1);
        $restaurant = $this->legacyPage('the-brasserie', 'restaurant', 2);
        $academy    = $this->legacyPage('hexa-academy', 'education', 3);

        $this->migration()->up();

        $this->assertSame('nocturne_ritual', $this->fresh($beauty)->template_key);
        $this->assertSame('maison_vela', $this->fresh($restaurant)->template_key);
        $this->assertSame('nocturne_ritual', $this->fresh($academy)->template_key);

        $this->assertSame(0, DB::table('landing_pages')->where('template_key', 'ruled_page')->count());
    }

    /**
     * The re-seed is `seedSectionsFor()` asked a second time, and it is
     * ADDITIVE: every row the page had is still there, in its own order,
     * with its own `enabled`; the new design's own blocks arrive after
     * them; `content` and `theme` are untouched.
     */
    public function test_the_move_adds_the_new_designs_blocks_and_deletes_nothing(): void
    {
        $page = $this->legacyPage('hexa-academy', 'education', 3);

        $this->migration()->up();

        $fresh = $this->fresh($page);
        $keys  = $fresh->sections->sortBy('sort')->pluck('key')->values()->all();

        $this->assertSame(self::LEGACY_ROWS, array_slice($keys, 0, count(self::LEGACY_ROWS)),
            'A row the page already had moved, or went missing.');

        foreach (['announcement', 'trust', 'faq'] as $block) {
            $this->assertContains($block, $keys, "The new design's own '{$block}' block was not seeded.");
        }

        $this->assertSame(
            LandingOnboardingService::seedSectionsFor('nocturne_ritual', \App\Landing\IndustryProfile::for('education')),
            array_values(array_intersect(
                LandingOnboardingService::seedSectionsFor('nocturne_ritual', \App\Landing\IndustryProfile::for('education')),
                $keys,
            )),
            'The page does not carry every row a page created on its new design would.',
        );

        // The tenant's own answers survive: a band they switched off stays
        // off, and the words they wrote are exactly where they left them.
        $this->assertFalse((bool) $fresh->sections->firstWhere('key', 'team')->enabled);
        $this->assertSame('Twenty years on this street', $fresh->content['about']['body']);
        $this->assertSame('Hexa Academy', $fresh->content['hero']['headline']);
        $this->assertSame(['brand_color' => '#123456'], $fresh->theme);
    }

    /**
     * A restaurant page keeps its `team` row even though no hospitality kit
     * draws one: "additive only" means the migration never decides a row is
     * dead — the layout simply skips it, and the row is waiting if the
     * tenant ever moves to a design that draws it.
     */
    public function test_a_row_the_new_design_does_not_draw_is_kept_not_deleted(): void
    {
        $page = $this->legacyPage('the-brasserie', 'restaurant', 2);

        $this->migration()->up();

        $keys = $this->fresh($page)->sections->pluck('key')->all();

        $this->assertSame('maison_vela', $this->fresh($page)->template_key);
        $this->assertContains('team', $keys);
        $this->assertCount(count(self::LEGACY_ROWS) + 3, $keys);
    }

    public function test_pages_on_any_other_design_are_not_touched(): void
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 5, 'slug' => 'garden-room',
            'template_key' => 'luma_garden', 'industry' => 'restaurant', 'status' => 'draft',
        ]);
        $page->sections()->create(['key' => 'hero', 'enabled' => true, 'sort' => 0]);

        $before = DB::table('landing_page_sections')->where('landing_page_id', $page->id)->get()->map(fn ($r) => (array) $r)->all();
        $row    = (array) DB::table('landing_pages')->where('id', $page->id)->first();

        $this->migration()->up();

        $this->assertSame($row, (array) DB::table('landing_pages')->where('id', $page->id)->first());
        $this->assertSame($before, DB::table('landing_page_sections')->where('landing_page_id', $page->id)->get()->map(fn ($r) => (array) $r)->all());
    }

    public function test_running_the_migration_twice_changes_nothing_the_second_time(): void
    {
        $page = $this->legacyPage('hexa-academy', 'education', 3);

        $this->migration()->up();

        $snapshot = fn () => [
            (array) DB::table('landing_pages')->where('id', $page->id)->first(),
            DB::table('landing_page_sections')->where('landing_page_id', $page->id)->orderBy('id')->get()->map(fn ($r) => (array) $r)->all(),
        ];

        $once = $snapshot();

        $this->migration()->up();

        $this->assertSame($once, $snapshot());
    }

    /** No landing tables at all (an environment that never had the feature) is a no-op, not an error. */
    public function test_it_is_a_no_op_without_the_landing_tables(): void
    {
        \Illuminate\Support\Facades\Schema::drop('landing_page_redirects');
        \Illuminate\Support\Facades\Schema::drop('landing_page_sections');
        \Illuminate\Support\Facades\Schema::drop('landing_pages');

        $this->migration()->up();

        $this->assertFalse(\Illuminate\Support\Facades\Schema::hasTable('landing_pages'));
    }
}
