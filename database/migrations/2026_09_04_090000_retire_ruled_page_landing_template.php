<?php

use App\Landing\IndustryProfile;
use App\Models\LandingPage;
use App\Services\Landing\LandingOnboardingService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Move every page still on the generic house design onto one of the owner's
 * own designs.
 *
 * `ruled_page` was the one landing template that was NOT one of the owner's
 * six kits — the generic house design the palettes, the type pairings and
 * the per-band tones were all built to make look varied. The final scenario
 * retired it from the OFFER (nobody could pick it any more); this migration
 * retires it from the PRODUCT: its views, stylesheet, script and thumbnails
 * are deleted in the same commit, so a page left on it would render nothing.
 * The owner's instruction is that the six kits are the whole product, and a
 * page has to be on one of them.
 *
 * WHICH ONE. The same answer the wizard's design step pre-selects for a
 * tenant who has not chosen — {@see LandingOnboardingService::defaultTemplateFor()}:
 * the first offerable design drawn for the page's own trade, resolved
 * through the ONE server-side industry → vertical map the final scenario
 * shipped (`LandingOnboardingService::INDUSTRY_VERTICALS`), and the first
 * offerable design of all (`nocturne_ritual`, by the registry's own order)
 * for the seven industries no kit has been drawn for. Never a second copy of
 * that map here: a beauty page lands on the first beauty kit, a restaurant
 * on the first dining kit, a hotel or an academy on the first row.
 *
 * WHAT HAPPENS TO THE ROWS. A design is a composition, not a skin — every
 * kit draws an offer bar, a highlights strip and a questions block the
 * generic design had no partial for — so the page's section rows are topped
 * up through {@see LandingOnboardingService::addMissingSections()}, which is
 * {@see LandingOnboardingService::seedSectionsFor()} asked a second time and
 * is ADDITIVE ONLY: no row is deleted, no row's `enabled` or `sort` is
 * touched, and `content` is never read or written. A band the new design does
 * not draw keeps its row and every word the tenant wrote in it. Exactly what
 * a tenant changing design in the editor gets, through exactly the same
 * function.
 *
 * SAFE ON THE LIVE TABLE. Guarded with hasTable so an environment without
 * the landing tables is a no-op rather than an error; touches ONLY the rows
 * whose `template_key` is the retired design, one row-locked transaction
 * each; and idempotent — a second run finds no such rows and does nothing.
 * The retired key is spelled here as a literal because it is the one place
 * left in the codebase that has to name it: the registry no longer does.
 *
 * ONE-WAY. `down()` is deliberately empty: the design this moves pages OFF
 * no longer exists in the repository, so putting a page back onto it would
 * produce a page that cannot render.
 */
return new class extends Migration
{
    private const RETIRED = 'ruled_page';

    public function up(): void
    {
        if (!Schema::hasTable('landing_pages') || !Schema::hasTable('landing_page_sections')) {
            return;
        }

        $ids = DB::table('landing_pages')
            ->where('template_key', self::RETIRED)
            ->orderBy('id')
            ->pluck('id');

        $moved = 0;

        foreach ($ids as $id) {
            DB::transaction(function () use ($id, &$moved) {
                // withoutGlobalScopes(): TenantScope fails CLOSED with no
                // tenant bound, and a migration binds none. The row is
                // re-read under lock so a concurrent editor save cannot
                // interleave with the template move and the row top-up.
                $page = LandingPage::withoutGlobalScopes()
                    ->whereKey($id)
                    ->lockForUpdate()
                    ->first();

                if ($page === null || $page->template_key !== self::RETIRED) {
                    return;
                }

                $industry = (string) $page->industry;

                $page->template_key = LandingOnboardingService::defaultTemplateFor($industry);
                $page->save();

                LandingOnboardingService::addMissingSections($page, IndustryProfile::for($industry));

                $moved++;
            });
        }

        if ($moved > 0) {
            Log::info('landing: moved pages off the retired ruled_page design', ['pages' => $moved]);
        }
    }

    public function down(): void
    {
        // One-way; see the class docblock.
    }
};
