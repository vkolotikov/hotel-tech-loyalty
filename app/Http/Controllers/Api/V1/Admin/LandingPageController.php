<?php
namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Landing\IndustryProfile;
use App\Models\LandingPage;
use App\Rules\ScalarLeaves;
use App\Support\LandingPageGuard;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * The rules about what may exist at an address — slug format, reserved
 * words, global uniqueness, the live-redirect hold, and one page per brand —
 * live in {@see LandingPageGuard} rather than here, because the onboarding
 * wizard (LandingOnboardingController) is a second way to create a page and
 * two copies of those rules would be two different answers to the same
 * question.
 */
class LandingPageController extends Controller
{
    /** One page per brand, so there is no index. */
    public function show(): JsonResponse
    {
        return response()->json(['page' => $this->current()]);
    }

    public function store(Request $request): JsonResponse
    {
        // Same clean-message reasoning as update() below — see its comment.
        $data = $request->validate([
            'slug'         => 'required|string|max:63',
            'template_key' => 'required|string|in:ruled_page',
        ], [
            'slug.required' => 'Please choose a web address.',
            'slug.string'   => 'That web address is not valid.',
            'slug.max'      => 'Please use a shorter web address — up to 63 characters.',
        ]);

        $slug = LandingPageGuard::validatedSlug($data['slug']);
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
        abort_if(LandingPageGuard::brandHasPage($org->id, $brandId), 409, LandingPageGuard::ONE_PER_BRAND);

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
            if (LandingPageGuard::slugIsTaken($slug)) {
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
            if (!LandingPageGuard::brandHasPage($page->organization_id, $page->brand_id)) {
                throw $e;
            }

            abort(409, LandingPageGuard::ONE_PER_BRAND);
        }

        // No redirect row may share a slug with a live page — the invariant
        // that lets Task 12's resolver stop caring which table it reads first.
        // update() keeps it on rename; this keeps it on claim. Cleared only
        // after the claim succeeded, because until then the row is still
        // somebody else's. See LandingPageGuard::releaseRedirects().
        LandingPageGuard::releaseRedirects($slug);

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
        // Task 10b round 1: the "Web address" field must never let the word
        // "slug" reach the tenant (spec §9, and the whole reason this
        // screen is labelled "Web address" in the first place) — but
        // `$request->validate()` runs THIS rule set before the handler
        // reaches `LandingPageGuard::validatedSlug()` below, whose own
        // messages ARE clean. A submission over 63 characters (the address
        // input has no `maxLength`, and the frontend only disables "Use
        // this address" on an EMPTY preview, not a long one) previously
        // fell straight through to Laravel's own default message — "The
        // slug field must not be greater than 63 characters." — reaching
        // the tenant verbatim via LandingEditor.tsx's `errors.slug[0]`
        // surfacing. Named explicitly here so no default validator message
        // for this field can ever say the word, regardless of which rule
        // fires.
        $data = $request->validate([
            'slug'    => 'sometimes|string|max:63',
            'theme'   => ['sometimes', 'array', new ScalarLeaves(depth: 1)],
            'content' => ['sometimes', 'array', new ScalarLeaves(depth: 2)],
            'seo'     => ['sometimes', 'array', new ScalarLeaves(depth: 1)],
        ], [
            'slug.string' => 'That web address is not valid.',
            'slug.max'    => 'Please use a shorter web address — up to 63 characters.',
        ]);

        // content.contact.* used to be constrained by ScalarLeaves(depth:2)
        // above alone -- SHAPE, not FORMAT: any scalar was a legal leaf, so
        // email='not an email' and a 200,000-character phone both saved with
        // a 200 and published verbatim into contact.blade.php's `mailto:`
        // and the LocalBusiness JSON-LD. This is the SECOND door into the
        // same column -- LandingOnboardingController::store() has enforced
        // exactly these per-field rules on `contact.*` since Task 2 -- and a
        // tenant editing an existing page through this screen must not be
        // held to a looser standard than one running the wizard for the
        // first time.
        //
        // A SEPARATE Validator instance, deliberately, rather than sibling
        // rule keys ('content.contact.phone' etc.) added to the SAME
        // validate() call above: Laravel's own anti-mass-assignment safety
        // net (`Validator::$excludeUnvalidatedArrayKeys`, on by default
        // since Laravel 9) silently drops an entire array-typed field from
        // `validated()`'s result the moment ANY dotted rule names one of its
        // children, because there is then no wildcard rule covering the
        // OTHER children ('content.hero', 'content.about', ...) — every
        // section but contact would have quietly vanished from every save
        // that also touched contact, and from every save that touched
        // NEITHER (a content.contact.* rule key existing at all is what
        // trips it, not whether contact itself was submitted). Caught by
        // test_updating_content_without_a_slug_leaves_the_address_alone
        // during this fix, which is the regression test for exactly that.
        // Only `is_array()`, never assumed: content.contact may legitimately
        // be a plain non-array scalar on data written before this column had
        // a shape at all (RuledPageRenderTest's own
        // "string shaped contact does not take the page down"), and
        // Validator::make() takes an array, not a scalar.
        $contact = $data['content']['contact'] ?? null;

        if (is_array($contact)) {
            Validator::make($contact, [
                'phone'   => 'nullable|string|max:64',
                'email'   => 'nullable|string|email|max:191',
                'address' => 'nullable|string|max:191',
            ], [
                // Every message named for the identical reason the slug
                // messages above are: Laravel's own default for a failed
                // `email` rule is "The email field must be a valid email
                // address." -- fine here since 'email' is already the
                // honest name of the field, but the OTHER defaults ("The
                // phone field must not be greater than 64 characters.") are
                // not something a tenant filling in a marketing page should
                // ever read verbatim.
                'phone.string'   => 'Please enter a valid phone number.',
                'phone.max'      => 'Please use a shorter phone number — up to 64 characters.',
                'email.string'   => 'Please enter a valid email address.',
                'email.email'    => 'Please enter a valid email address.',
                'email.max'      => 'Please use a shorter email address — up to 191 characters.',
                'address.string' => 'Please enter a valid address.',
                'address.max'    => 'Please use a shorter address — up to 191 characters.',
            ])->validate();
        }

        if (isset($data['slug'])) {
            $data['slug'] = LandingPageGuard::validatedSlug($data['slug'], $page->id);
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
                    LandingPageGuard::releaseRedirects($data['slug']);

                    // The old address may be printed on a card or a shopfront,
                    // so keep it working rather than 404ing it the moment it
                    // changes.
                    DB::table('landing_page_redirects')->updateOrInsert(
                        ['slug' => $page->slug],
                        [
                            'landing_page_id' => $page->id,
                            'expires_at'      => now()->addDays(LandingPageGuard::REDIRECT_TTL_DAYS),
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
            if (LandingPageGuard::slugIsTaken($data['slug'] ?? $page->slug, $page->id)) {
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

    /**
     * Take my page off the internet.
     *
     * Resolved with {@see LandingPageGuard::pageToTakeDown()} rather than
     * current(), and that is the whole difference between this verb and the
     * build verbs above. current() resolves ONE brand — the bound one, else
     * the org's default — which is right for everything that writes to a
     * page and wrong for the one verb whose failure mode is a live page its
     * owner cannot reach. The SPA sends `brand_id=all` by default and after
     * any localStorage reset, so a page published on a non-default brand
     * answered 404 here while still serving the tenant's address, phone
     * number, staff names and prices; the brand switcher that would have
     * fixed it is itself behind `check.subscription`, i.e. unavailable to
     * exactly the cancelled tenant this route exists for.
     *
     * Teardown is the ONLY verb widened this way. See the guard's docblock.
     */
    public function unpublish(): JsonResponse
    {
        $page = LandingPageGuard::pageToTakeDown();
        abort_if($page === null, 404);

        $page->update(['status' => LandingPage::STATUS_DRAFT]);

        return response()->json(['page' => $page->fresh()]);
    }

    /**
     * The read counterpart to unpublish() — carved out of `feature:landing_pages`
     * and `check.subscription` for the identical reason (routes/api.php has the
     * full story): a tenant whose plan no longer covers this builder must still
     * be able to see whether their own page is public, and at what address, in
     * order to decide to take it down. Without this, the admin SPA has no way
     * to show that tenant anything at all — `show()` carries the full edit
     * surface (theme/content/seo/sections) and stays behind the entitlement
     * gate on purpose, so it cannot be reused here.
     *
     * Deliberately the narrowest possible answer: whether there is currently
     * something public, and if so, where. Not the page id, not its draft
     * content, not whether a page exists in draft form with nothing to tear
     * down — none of that is needed to decide "show Unpublish" vs "nothing to
     * do here", and returning it would be surface this entitlement-free route
     * has no business carrying.
     *
     * Those two keys are the WHOLE response, and
     * LandingPageTeardownTest::test_status_answers_with_exactly_two_keys
     * pins the exact key set rather than probing one path at a time. A
     * review found that adding `'page' => $page` here left the entire
     * landing suite green while the draft slug and URL travelled out
     * through the one admin route stripped of BOTH the entitlement gate and
     * `check.subscription` — an `assertNull($body['url'])` says nothing
     * about a sibling key carrying the same address.
     *
     * Resolved org-wide via {@see LandingPageGuard::pageToTakeDown()} for
     * the same reason unpublish() is: the read half has to be able to SEE
     * the page the write half can take down, or the admin screen tells a
     * lapsed tenant "nothing to do here" over a page that is still live.
     */
    public function status(): JsonResponse
    {
        $page = LandingPageGuard::pageToTakeDown();
        $published = $page !== null && $page->status === LandingPage::STATUS_PUBLISHED;

        return response()->json([
            'published' => $published,
            'url'       => $published ? $page->url : null,
        ]);
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

    /**
     * The caller's own page ON ONE BRAND — the resolver every BUILD verb
     * uses, and the same one the wizard and the section endpoint use, so
     * none of them can quietly act on a different page from the others.
     *
     * status() and unpublish() deliberately do NOT come through here; they
     * ask an org-wide question via LandingPageGuard::pageToTakeDown(). That
     * split is the fix for a real trap and must not be collapsed in either
     * direction: widening this method would let publish() put a sibling
     * brand's page on the internet, and narrowing teardown back to one
     * brand leaves a lapsed tenant with a live page they cannot reach.
     *
     * This used to lean on BrandScope and refuse the result when more than
     * one page came back. BrandScope NO-OPs on a null brand, so in "All
     * brands" mode a multi-brand org matched every one of its pages: with
     * two the request was refused, and with ONE — a page belonging to some
     * sibling brand — it was returned, and publish() would put that
     * sibling's page on the internet. The refusal covered the plural case
     * and missed the singular one, which is the more dangerous half.
     *
     * LandingPageGuard resolves the brand first (bound brand, else the org's
     * default — the brand a new page is already created on) and filters on
     * it explicitly. The ambiguity guard survives inside pageOnBrand() for
     * the one state that can still reach it.
     */
    private function current(): ?LandingPage
    {
        return LandingPageGuard::pageOnBrand(LandingPageGuard::currentBrandId());
    }

}
