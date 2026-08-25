<?php

namespace App\Support;

use App\Models\Brand;
use App\Models\LandingPage;
use App\Scopes\BrandScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The rules a landing page has to clear before it may exist at an address.
 *
 * Extracted from LandingPageController when the onboarding wizard became a
 * SECOND way to create a page. Every rule here is a global one -- the slug
 * namespace is shared by every tenant, and "one page per brand" is enforced
 * by a database index -- so two copies of them would not merely be
 * duplication: they would be two different answers to the same question,
 * and whichever one a caller happened to use would decide whether a tenant
 * got a 422, a 409, or somebody else's customers.
 *
 * TENANCY IS NOT UNIFORM ACROSS THIS CLASS, and reading it as though it
 * were is how one of these methods becomes a cross-tenant read. Two kinds
 * of question live here and they are isolated by different means:
 *
 *   - The GLOBAL questions -- slugIsTaken(), redirectHoldsSlug(),
 *     brandHasPage() -- deliberately bypass the model scopes, because the
 *     slug namespace is shared by every tenant and brandHasPage() asks
 *     about a row on a brand the request may never have named. Each carries
 *     its own explicit organization_id filter where it needs one, and each
 *     says why in its own docblock.
 *   - The CALLER'S-OWN-ROW questions -- currentBrandId(), pageOnBrand()
 *     and pageToTakeDown() -- are tenant-scoped and MUST STAY THAT WAY.
 *     They run through TenantScope, which is the only thing standing
 *     between them and another tenant's landing page. Adding
 *     withoutGlobalScopes() to any of them -- the spelling the global
 *     methods above use, which is exactly what makes the mistake inviting
 *     -- would hand an admin somebody else's page to edit, publish or
 *     rename.
 *
 * The two caller's-own-row LOOKUPS differ in one axis and one only, and
 * the difference is the point: pageOnBrand() answers for ONE brand,
 * because every build verb writes to one brand's page; pageToTakeDown()
 * answers for the whole ORGANISATION, because a tenant who cannot select
 * the right brand must still be able to take their own page off the
 * internet. Read pageToTakeDown()'s docblock before widening either.
 */
final class LandingPageGuard
{
    /** How long a retired address keeps working after a rename. */
    public const REDIRECT_TTL_DAYS = 90;

    public const ONE_PER_BRAND = 'This brand already has a landing page. Edit that one instead of creating a second.';

    /**
     * Reachable only in a state the application refuses to create and the
     * database cannot forbid: two pages that belong to no brand at all. The
     * (organization_id, brand_id) unique index treats NULLs as distinct on
     * both sqlite and Postgres, so it cannot see the second one -- only the
     * brandHasPage() check can, and two simultaneous writes can pass that.
     * Selecting a brand is the only advice available, and it is honest for
     * the case where brands exist but none is marked default.
     */
    public const AMBIGUOUS = 'More than one landing page matches this request. Select a brand before editing.';

    /**
     * The brand whose landing page this request is about.
     *
     * "All brands" mode binds a NULL brand, and Container::instance() stores
     * it where resolve() looks with isset() -- so a null brand reads as
     * unbound and a bare app('current_brand_id') throws
     * BindingResolutionException rather than returning null. The bound()
     * guard is the house pattern for exactly this.
     *
     * The default-brand fallback is the load-bearing half. With nothing
     * bound, BelongsToBrand's creating hook already puts a NEW page on the
     * org's default brand, so that brand is where "All brands" mode writes
     * whether anybody decided it or not. Resolving it here means the readers
     * agree with the writer: the brand the wizard counts, the page the
     * editor loads, and the row apply() creates are one brand. When they
     * disagreed, `completed` went true off a sibling brand's page, the
     * prefill showed a sibling's phone number, and a section full of a
     * sibling's services was offered and then rendered empty.
     *
     * The alternative -- treating unbound as "the org-wide page only" --
     * looks tidier and is worse: the wizard would create the page on the
     * default brand and the editor would then answer 404 for the page it
     * had just made.
     */
    public static function currentBrandId(): ?int
    {
        $bound = app()->bound('current_brand_id') ? app('current_brand_id') : null;

        // Truthy, matching BelongsToBrand's own test, so a bound 0 or '' is
        // treated as unbound there and here alike.
        $id = $bound ?: Brand::where('is_default', true)->orderBy('id')->value('id');

        return $id ? (int) $id : null;
    }

    /**
     * The landing page belonging to a given brand, or null.
     *
     * The one page lookup for every admin endpoint that acts on "my page":
     * the builder API, the section endpoint and the wizard all resolve the
     * brand with currentBrandId() and read the row through here, so none of
     * them can quietly act on a different page from the others.
     *
     * The take(2) is what is left of LandingPageController::current()'s
     * 409-on-ambiguity, and it is deliberately kept rather than dropped --
     * see AMBIGUOUS for the one state that can still reach it. What it no
     * longer fires on is the ordinary multi-brand org in "All brands" mode:
     * that used to be unanswerable because BrandScope no-ops on a null brand
     * and every page in the org matched, and it is answerable now because
     * the brand is resolved before the query rather than left to a scope
     * that declines to narrow.
     */
    public static function pageOnBrand(?int $brandId, array $with = ['sections']): ?LandingPage
    {
        $page = self::firstOnBrand($brandId, $with);

        // A page with brand_id NULL belongs to the ORGANISATION, not to no
        // one, and it has to stay reachable after the org acquires a default
        // brand. store() leaves brand_id null only while the org has no
        // default brand -- and Organization::created backfills one -- so
        // "page created first, default brand appears afterwards" is a real
        // if uncommon sequence, and without this fallback every verb and
        // every brand selection then answers 404 for a page that exists.
        //
        // UNPUBLISH is why this is not merely untidy. That verb sits outside
        // the billing gate on purpose, so that ceasing to pay can never
        // compel a business to stay published; a page it cannot resolve is
        // a live public page whose owner has no way to take it down, which
        // is the "only way off the internet was us running an UPDATE by
        // hand" failure LandingPageTeardownTest exists to prevent.
        //
        // It cannot reopen the sibling-brand hole this method was written to
        // close: the fallback matches only brand_id IS NULL, and a page
        // belonging to no brand belongs to no sibling either.
        if ($page === null && $brandId !== null) {
            $page = self::firstOnBrand(null, $with);
        }

        return $page;
    }

    /**
     * The page a TEARDOWN verb acts on -- and this one is an ORG-WIDE
     * question, deliberately unlike every other method here.
     *
     * status() and unpublish() are the two verbs carved out of BOTH
     * `feature:landing_pages` and `check.subscription` (routes/api.php has
     * the full story) so that ceasing to pay can never compel a business to
     * stay published. Routing them through currentBrandId() -- which
     * substitutes the org's DEFAULT brand whenever the SPA sends
     * `brand_id=all`, the brand store's own default and the state after any
     * localStorage reset -- made that promise conditional on the tenant
     * having selected the right brand first:
     *
     *   - a page published on a NON-default brand was reported
     *     {published:false, url:null} and unpublish answered 404;
     *   - and the brand switcher that would have rescued them is not
     *     available to the very cohort this route exists for: GET
     *     /v1/admin/brands sits INSIDE check.subscription and answers 403
     *     for a cancelled org, brandStore does not persist the list, and
     *     BrandSwitcher renders nothing when it is empty.
     *
     * So the page kept serving the tenant's address, phone number, staff
     * names and prices with no in-product way to remove it -- the exact
     * "the only way off the internet was us running an UPDATE by hand"
     * failure LandingPageTeardownTest exists to prevent, reached through
     * the resolver instead of through the middleware.
     *
     * WHAT THIS DOES NOT DO is widen anything else. The BUILD verbs (show,
     * update, store, publish, previewUrl, sections, onboarding) keep
     * pageOnBrand(currentBrandId()) exactly as it is, because for them the
     * brand IS the question: the wizard counts one brand's services, the
     * editor loads one brand's page, and publish() must never put a sibling
     * brand's page on the internet on behalf of an admin who never selected
     * it. Teardown is the only carve-out, because it is the only verb whose
     * failure mode is a live page nobody can take down.
     *
     * TenantScope stays on and is what keeps this inside the caller's own
     * organisation -- only BrandScope is dropped, which is the spelling
     * BrandScope's own docblock prescribes for a brand-aware path asking a
     * wider question. Never withoutGlobalScopes(), which would take
     * TenantScope with it and hand one tenant another tenant's page.
     *
     * It also never refuses. AMBIGUOUS is the right answer for a build verb
     * -- "tell me which page you meant before I overwrite one" -- and the
     * wrong one here: a 409 to a cancelled tenant with no brand switcher is
     * the same dead end as a 404. So ties are broken deterministically:
     * live pages first (teardown is a question about what is on the
     * internet, and a draft is not on it), then the brand the request
     * actually named, then the DEFAULT brand's page (the one every BUILD
     * verb resolves via currentBrandId(), and so the one show() rendered
     * the Unpublish button for), then the lowest id. An org with two live
     * pages therefore takes them down one call at a time, and status()
     * reports the next one each time -- a converging loop with an end
     * state, rather than a refusal with none.
     *
     * The default-brand rung exists because "all brands" mode's Unpublish
     * click and lowest-id are unrelated facts: show() always renders the
     * DEFAULT brand's page in that mode, but two published pages meant this
     * method fell straight to lowest id, which is whichever sibling brand
     * happened to be created first -- not necessarily the one on screen.
     * The click then read as taking the visible page down while a
     * DIFFERENT brand's page silently left the internet. Preferring the
     * default brand closes that gap the same way pageOnBrand()'s own
     * default-brand fallback closes its own: by making the reader agree
     * with the writer everyone else already agrees with.
     */
    public static function pageToTakeDown(): ?LandingPage
    {
        $pages = LandingPage::withoutGlobalScope(BrandScope::class)
            ->orderBy('id')
            ->get();

        if ($pages->count() < 2) {
            return $pages->first();
        }

        $candidates = $pages->where('status', LandingPage::STATUS_PUBLISHED);

        if ($candidates->isEmpty()) {
            $candidates = $pages;
        }

        if ($candidates->count() === 1) {
            return $candidates->first();
        }

        // Only now does the brand get a say, and only to break the tie.
        // Read raw rather than through currentBrandId(), whose
        // default-brand substitution is the whole defect above: "All
        // brands" must stay "all brands" here.
        $bound = app()->bound('current_brand_id') ? app('current_brand_id') : null;

        $onBoundBrand = $bound
            ? $candidates->first(fn (LandingPage $p) => (int) $p->brand_id === (int) $bound)
            : null;

        // "All brands" mode (bound === null) used to fall straight to
        // lowest-id, which meant an entitled admin's own Unpublish click
        // could take down a SIBLING brand's live page instead of the one
        // show() rendered the button for: show() resolves the page through
        // currentBrandId(), which substitutes the org's DEFAULT brand
        // whenever nothing is bound, while this method deliberately reads
        // the RAW bound value above so "all brands" stays "all brands" for
        // the tie-break's first rung. Preferring the default brand's page
        // here -- the same substitution every BUILD verb already applies --
        // makes the two agree without reopening the sibling-brand hole:
        // it only ever narrows a tie that already has two live candidates,
        // and only tries the default brand, never a specific sibling.
        $onCurrentBrand = $onBoundBrand === null
            ? $candidates->first(fn (LandingPage $p) => (int) $p->brand_id === (int) self::currentBrandId())
            : null;

        return $onBoundBrand ?? $onCurrentBrand ?? $candidates->first();
    }

    /**
     * At most one page for exactly one brand -- or a refusal.
     *
     * The take(2) can only ever find a second row on the null branch: the
     * (organization_id, brand_id) unique index makes a duplicate impossible
     * for a concrete brand, and NULLs are distinct in that index. See
     * AMBIGUOUS.
     */
    private static function firstOnBrand(?int $brandId, array $with): ?LandingPage
    {
        // BrandScope is dropped so that the brand filter is ENTIRELY the
        // explicit one above it. Leaving the scope on meant the brand was
        // still being decided in two places, and the two disagreed on the
        // one query that matters most: with a brand bound, the scope adds
        // `brand_id = X`, so the organisation-wide fallback below asked for
        // `brand_id = X AND brand_id IS NULL` and could never match. The
        // org-wide page stayed unreachable for every brand selection, which
        // is the defect the fallback exists to fix.
        //
        // TenantScope STAYS ON, and it is the only thing keeping this query
        // inside the caller's own organisation. Dropping brand filtering
        // alone is the spelling BrandScope's own docblock prescribes for a
        // brand-aware path that means to ask a wider question; never reach
        // for withoutGlobalScopes(), which would take TenantScope with it.
        $pages = self::onBrand(
            LandingPage::withoutGlobalScope(BrandScope::class)->with($with),
            $brandId,
        )
            ->orderBy('id')
            ->take(2)
            ->get();

        abort_if($pages->count() > 1, 409, self::AMBIGUOUS);

        return $pages->first();
    }

    /**
     * Is this address spoken for, anywhere on the platform? Deliberately
     * unscoped: /{slug} is one namespace shared by every tenant.
     *
     * LandingPageController's catch blocks call this AFTER a failed write, to
     * ask which index fired, and that is only safe outside an open
     * transaction. On Postgres a failed statement aborts the enclosing
     * transaction and every later query in it returns 25P02 -- so wrapping
     * store() in DB::transaction() would quietly turn those 409/422 answers
     * back into 500s. The suite is pinned to sqlite, which does not behave
     * that way, so nothing local would catch it.
     */
    public static function slugIsTaken(string $slug, ?int $ignoreId = null): bool
    {
        return LandingPage::withoutGlobalScopes()
            ->where('slug', $slug)
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();
    }

    /**
     * "The page belonging to THIS brand", spelled once.
     *
     * Deliberately not left to BrandScope, which NO-OPs when the bound brand
     * is null ("All brands" mode) and therefore matches every brand's page in
     * the organisation. That no-op is right for the scope's own purpose --
     * an admin listing rows across brands wants them all -- and wrong for
     * every question this class is asked, because those questions are about
     * ONE row that will be written, read back, or refused: whether this
     * brand has a page, which page the wizard is describing, and which page
     * the tenant is about to overwrite.
     *
     * For that purpose a null brand IS a brand: it means the org-wide page,
     * not "any page". Getting that wrong made `completed` per-organisation
     * in All-brands mode, described a sibling brand's Property in the
     * prefill, and counted a sibling brand's services toward a section the
     * new page would render empty -- three faces of one disagreement.
     */
    public static function onBrand(Builder $query, ?int $brandId): Builder
    {
        return $query->when(
            $brandId === null,
            fn ($q) => $q->whereNull('brand_id'),
            fn ($q) => $q->where('brand_id', $brandId),
        );
    }

    /**
     * One page per brand -- and for this purpose a null brand is a brand.
     *
     * Unscoped with an explicit organization_id rather than left to
     * TenantScope, because the callers ask this about a row they are about
     * to write on a brand that may not be the bound one: BelongsToBrand
     * substitutes the org's default brand when nothing is bound, so the page
     * can land on a brand the request never named.
     */
    public static function brandHasPage(int $orgId, ?int $brandId): bool
    {
        return self::onBrand(
            LandingPage::withoutGlobalScopes()->where('organization_id', $orgId),
            $brandId,
        )->exists();
    }

    /**
     * The address, normalised and cleared for use, or a 422 naming why not.
     *
     * @throws ValidationException
     */
    public static function validatedSlug(string $raw, ?int $ignoreId = null): string
    {
        $slug = LandingSlug::normalise($raw);

        if (!LandingSlug::isValid($slug)) {
            throw ValidationException::withMessages([
                'slug' => 'Use 3 to 63 letters, numbers and hyphens.',
            ]);
        }

        if (LandingSlug::isReserved($slug)) {
            throw ValidationException::withMessages(['slug' => 'That web address is reserved.']);
        }

        // Global uniqueness: /{slug} is one namespace across every tenant, so
        // this deliberately ignores tenancy scoping or it would miss clashes.
        $taken = self::slugIsTaken($slug, $ignoreId);

        // A retired address is still an occupied address. It keeps resolving
        // for REDIRECT_TTL_DAYS, so handing it to a second tenant meanwhile
        // puts two businesses on one URL — one reachable through landing_pages,
        // one through landing_page_redirects. Whichever table a resolver
        // consults first, somebody's customers land on a competitor.
        //
        // Rows belonging to the page being edited are excluded so a tenant can
        // move back to an address it used to hold; update() then clears the row
        // it has just moved onto.
        // expires_at is NOT NULL in the migration, so "never expires" is not a
        // state a row can be in and there is no null branch to answer for.
        $reserved = self::redirectHoldsSlug($slug, $ignoreId);

        if ($taken || $reserved) {
            throw ValidationException::withMessages(['slug' => 'That web address is already taken.']);
        }

        return $slug;
    }

    /** Does a LIVE redirect still point away from this address? */
    public static function redirectHoldsSlug(string $slug, ?int $ignoreId = null): bool
    {
        return DB::table('landing_page_redirects')
            ->where('slug', $slug)
            ->where('expires_at', '>', now())
            ->when($ignoreId, fn ($q) => $q->where('landing_page_id', '!=', $ignoreId))
            ->exists();
    }

    /**
     * Drop any redirect row sitting on this address.
     *
     * No redirect row may share a slug with a live page — the invariant that
     * lets the public resolver stop caring which table it reads first.
     * validatedSlug() has already refused the slug if a LIVE redirect held
     * it, so whatever is here is a lapsed row: inert against today's
     * resolver, and a counter-example to the invariant tomorrow. Callers
     * clear it only once their own claim has succeeded, because until then
     * the row is still somebody else's.
     */
    public static function releaseRedirects(string $slug): void
    {
        DB::table('landing_page_redirects')->where('slug', $slug)->delete();
    }
}
