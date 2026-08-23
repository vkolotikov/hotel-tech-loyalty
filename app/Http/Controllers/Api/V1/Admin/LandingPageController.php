<?php
namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Landing\IndustryProfile;
use App\Models\LandingPage;
use App\Rules\ScalarLeaves;
use App\Support\LandingSlug;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\ValidationException;

class LandingPageController extends Controller
{
    /** How long a retired address keeps working after a rename. */
    private const REDIRECT_TTL_DAYS = 90;

    private const ONE_PER_BRAND = 'This brand already has a landing page. Edit that one instead of creating a second.';

    /** One page per brand, so there is no index. */
    public function show(): JsonResponse
    {
        return response()->json(['page' => $this->current()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'slug'         => 'required|string|max:63',
            'template_key' => 'required|string|in:ruled_page',
        ]);

        $slug = $this->validatedSlug($data['slug']);
        $org  = $request->user()->organization;

        // "All brands" mode binds a NULL brand, and Container::instance()
        // stores it where resolve() looks with isset() — so a null brand reads
        // as unbound and a bare app('current_brand_id') throws
        // BindingResolutionException rather than returning null. The bound()
        // guard is the house pattern for exactly this (WidgetChatController:65,
        // AiUsageService:106, AnalyticsService). A null brand_id is legitimate:
        // PageContent reads such a page as org-wide.
        $brandId = app()->bound('current_brand_id') ? app('current_brand_id') : null;

        // Phase 1 ships no UI, so this API is the surface and posting twice is
        // the first mistake an integrator makes. The (organization_id,
        // brand_id) unique index catches most of it, but NULLs are distinct in
        // a unique index on both sqlite and Postgres, so it cannot see a
        // second org-wide page at all. Hence this check as well as the catch
        // below — each covers what the other misses.
        abort_if($this->brandHasPage($org->id, $brandId), 409, self::ONE_PER_BRAND);

        // Built and saved in two steps rather than ::create() so the instance
        // survives a failed insert. BelongsToOrganization and BelongsToBrand
        // both mutate the model in their `creating` hooks — the latter
        // substituting the org's default brand when none is bound — so after a
        // violation $page carries the org and brand the row would ACTUALLY have
        // taken, which is what the catch has to ask about.
        $page = new LandingPage([
            'organization_id' => $org->id,
            'brand_id'        => $brandId,
            'slug'            => $slug,
            'template_key'    => $data['template_key'],
            'industry'        => $org->resolved_industry,
            'status'          => LandingPage::STATUS_DRAFT,
        ]);

        try {
            $page->save();
        } catch (UniqueConstraintViolationException $e) {
            // Reachable two ways the check above cannot see: BelongsToBrand
            // substitutes the org's default brand when none is bound, so the
            // row can land on a brand we never tested; and two simultaneous
            // POSTs both pass the check. The index is the real authority —
            // report what it decided rather than a 500.
            //
            // Which index, though, is a question and not an assumption. See
            // slugIsTaken() for why these lookups must not run inside an open
            // transaction.
            if ($this->slugIsTaken($slug)) {
                throw ValidationException::withMessages(['slug' => 'That web address is already taken.']);
            }

            // Everything that is not the slug index lands here, and on Postgres
            // that is SQLSTATE 23505 — which also covers a primary-key
            // collision from a desynced landing_pages_id_seq, routine after a
            // manual insert or a restore. Telling an admin "this brand already
            // has a landing page" when the brand has none sends them hunting
            // for a page that does not exist, so claim it only once the row is
            // demonstrably there. Anything else is a failure we cannot explain,
            // and a 500 is the honest answer to that.
            if (!$this->brandHasPage($page->organization_id, $page->brand_id)) {
                throw $e;
            }

            abort(409, self::ONE_PER_BRAND);
        }

        // No redirect row may share a slug with a live page — the invariant
        // that lets Task 12's resolver stop caring which table it reads first.
        // update() keeps it on rename; this keeps it on claim. validatedSlug()
        // has already refused the slug if a LIVE redirect held it, so whatever
        // is here is a lapsed row: inert against today's resolver, and a
        // counter-example to the invariant tomorrow. Cleared only after the
        // claim succeeded, because until then the row is still somebody else's.
        DB::table('landing_page_redirects')->where('slug', $slug)->delete();

        // Seed section rows now so ordering is fixed at creation, and a later
        // template revision cannot silently reorder a published page.
        foreach (IndustryProfile::for($page->industry)->defaultSections as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        return response()->json(['page' => $page->fresh('sections')], 201);
    }

    public function update(Request $request): JsonResponse
    {
        $page = $this->current();
        abort_if($page === null, 404);

        // The three JSON columns are schemaless `array` casts, so `array`
        // alone constrains the outermost value and NOTHING inside it. That
        // matters because the public renderer reads their leaves as strings —
        // theme.brand_color goes into Accent::for(?string ...), every copy and
        // seo leaf goes through Blade's e(), which is htmlspecialchars() with
        // a `string` parameter — and an array leaf throws a TypeError in both
        // places. One PUT plus a publish was enough for a tenant to leave
        // their own live page answering 500 to every visitor.
        //
        // The depths are the shapes the renderer actually reads, not round
        // numbers: theme and seo are flat maps of fields, while content is a
        // map of SECTION KEYS onto a flat map of fields — the layout reads
        // $page->content[$section->key] and hands it to a partial as $copy —
        // so content legitimately nests one level further and must keep
        // being allowed to.
        //
        // This is one half of the fix. The renderer prunes what it reads as
        // the other half, because rows written before this rule existed are
        // already in the database; see App\Support\ScalarTree.
        $data = $request->validate([
            'slug'    => 'sometimes|string|max:63',
            'theme'   => ['sometimes', 'array', new ScalarLeaves(depth: 1)],
            'content' => ['sometimes', 'array', new ScalarLeaves(depth: 2)],
            'seo'     => ['sometimes', 'array', new ScalarLeaves(depth: 1)],
        ]);

        if (isset($data['slug'])) {
            $data['slug'] = $this->validatedSlug($data['slug'], $page->id);
        }

        // One transaction: a rename is a delete, an insert and an update, and a
        // page whose slug moved while its redirects did not is precisely the
        // broken address this feature exists to prevent.
        //
        // The catch sits OUTSIDE it deliberately. DB::transaction() has already
        // rolled back by the time the handler runs, so the lookups in there are
        // safe; inside, on Postgres, they would hit 25P02 on an aborted
        // transaction and turn a 422 back into a 500.
        try {
            DB::transaction(function () use ($page, $data) {
                if (isset($data['slug']) && $data['slug'] !== $page->slug) {
                    // Moving ONTO an address means nothing may still redirect
                    // away from it. A rename of a → b → a would otherwise leave
                    // the page's own primary URL redirecting to itself: dead
                    // weight at best, a redirect loop at worst. validatedSlug()
                    // has already refused the slug if such a row belonged to
                    // anyone else, so whatever is left is ours to clear.
                    DB::table('landing_page_redirects')->where('slug', $data['slug'])->delete();

                    // The old address may be printed on a card or a shopfront,
                    // so keep it working rather than 404ing it the moment it
                    // changes.
                    DB::table('landing_page_redirects')->updateOrInsert(
                        ['slug' => $page->slug],
                        [
                            'landing_page_id' => $page->id,
                            'expires_at'      => now()->addDays(self::REDIRECT_TTL_DAYS),
                            'created_at'      => now(),
                            'updated_at'      => now(),
                        ],
                    );
                }

                $page->update($data);
            });
        } catch (UniqueConstraintViolationException $e) {
            // A lost race on the global unique on `slug`: two tenants submitted
            // the same address in the gap between validatedSlug() and the
            // write. store() answers that with a 422, so this must too — a
            // caller should not have to know which verb they used to understand
            // what happened to them.
            if ($this->slugIsTaken($data['slug'] ?? $page->slug, $page->id)) {
                throw ValidationException::withMessages(['slug' => 'That web address is already taken.']);
            }

            throw $e;
        }

        return response()->json(['page' => $page->fresh('sections')]);
    }

    public function publish(): JsonResponse
    {
        $page = $this->current();
        abort_if($page === null, 404);

        $page->update([
            'status'             => LandingPage::STATUS_PUBLISHED,
            'published_at'       => now(),
            'first_published_at' => $page->first_published_at ?? now(),
        ]);

        return response()->json(['page' => $page->fresh()]);
    }

    public function unpublish(): JsonResponse
    {
        $page = $this->current();
        abort_if($page === null, 404);

        $page->update(['status' => LandingPage::STATUS_DRAFT]);

        return response()->json(['page' => $page->fresh()]);
    }

    /** Short-lived signed URL, so a draft is visible to its owner and nobody else. */
    public function previewUrl(): JsonResponse
    {
        $page = $this->current();
        abort_if($page === null, 404);

        return response()->json([
            'url' => URL::temporarySignedRoute('landing.preview', now()->addHours(2), ['page' => $page->id]),
        ]);
    }

    private function current(): ?LandingPage
    {
        // BelongsToOrganization scopes this, and BrandScope narrows it further
        // when a brand is bound. Do not add a where clause.
        //
        // BrandScope NO-OPs on a null brand, though, so in "All brands" mode a
        // multi-brand org matches every one of its pages and a bare ->first()
        // would silently pick one: publish() would publish whichever row sorted
        // first, leaving the others unreachable with no error raised.
        //
        // Refusing the ambiguity rather than demanding a brand is deliberate. A
        // null brand is not itself an error — an org with no brand rows
        // legitimately owns exactly one org-wide page, PageContent already
        // reads a null-brand page that way, and requiring a bound brand would
        // lock that org out of the feature entirely. What is unanswerable is
        // *which* page a request means when there is more than one, so that,
        // and only that, is what gets refused.
        $pages = LandingPage::with('sections')->orderBy('id')->take(2)->get();

        abort_if(
            $pages->count() > 1,
            409,
            'This organization has a landing page per brand. Select a brand before editing.',
        );

        return $pages->first();
    }

    /**
     * Is this address spoken for, anywhere on the platform? Deliberately
     * unscoped: /{slug} is one namespace shared by every tenant.
     *
     * Both catch blocks call this AFTER a failed write, to ask which index
     * fired, and that is only safe outside an open transaction. On Postgres a
     * failed statement aborts the enclosing transaction and every later query
     * in it returns 25P02 — so wrapping store() in DB::transaction() would
     * quietly turn these 409/422 answers back into 500s. The suite is pinned to
     * sqlite, which does not behave that way, so nothing local would catch it.
     */
    private function slugIsTaken(string $slug, ?int $ignoreId = null): bool
    {
        return LandingPage::withoutGlobalScopes()
            ->where('slug', $slug)
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();
    }

    /** One page per brand — and for this purpose a null brand is a brand. */
    private function brandHasPage(int $orgId, ?int $brandId): bool
    {
        return LandingPage::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->when(
                $brandId === null,
                fn ($q) => $q->whereNull('brand_id'),
                fn ($q) => $q->where('brand_id', $brandId),
            )
            ->exists();
    }

    private function validatedSlug(string $raw, ?int $ignoreId = null): string
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
        $taken = $this->slugIsTaken($slug, $ignoreId);

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
        $reserved = DB::table('landing_page_redirects')
            ->where('slug', $slug)
            ->where('expires_at', '>', now())
            ->when($ignoreId, fn ($q) => $q->where('landing_page_id', '!=', $ignoreId))
            ->exists();

        if ($taken || $reserved) {
            throw ValidationException::withMessages(['slug' => 'That web address is already taken.']);
        }

        return $slug;
    }
}
