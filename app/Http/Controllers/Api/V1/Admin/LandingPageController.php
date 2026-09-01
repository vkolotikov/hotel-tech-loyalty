<?php
namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Landing\IndustryProfile;
use App\Landing\PreviewDraft;
use App\Landing\SectionType;
use App\Landing\ThemeRules;
use App\Models\LandingPage;
use App\Models\Organization;
use App\Rules\MaxImageDimensions;
use App\Rules\ScalarLeaves;
use App\Services\Landing\LandingOnboardingService;
use App\Services\MediaService;
use App\Support\LandingPageGuard;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
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
            'slug' => 'required|string|max:63',
            // Landing phase 3c, Plan A: `in:ruled_page` was a literal — a
            // second copy of LandingOnboardingService::TEMPLATES that a
            // future template would have had to be remembered in. Both the
            // onboarding controller and update() below already validate
            // against templateKeys(); all three now do, so adding a
            // template is a change to that one array.
            'template_key' => ['required', 'string', Rule::in(LandingOnboardingService::templateKeys())],
        ], [
            'slug.required' => 'Please choose a web address.',
            'slug.string'   => 'That web address is not valid.',
            'slug.max'      => 'Please use a shorter web address — up to 63 characters.',
            // Named for the same reason the slug messages are: Laravel's
            // own default is "The selected template key is invalid.", which
            // hands a tenant a raw field name (spec §9's rule, the one the
            // word "slug" already has to obey here).
            'template_key.required' => 'Please choose one of the available page styles.',
            'template_key.string'   => 'Please choose one of the available page styles.',
            'template_key.in'       => 'Please choose one of the available page styles.',
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
        //
        // The industry's list UNION the blocks the chosen template draws that
        // no industry seeds (template fidelity 3.1 / R4) — one derivation,
        // shared with LandingOnboardingService::apply(), so a page created
        // through this endpoint and a page created through the wizard carry
        // the same rows. See LandingOnboardingService::seedSectionsFor().
        foreach (LandingOnboardingService::seedSectionsFor(
            $page->template_key,
            IndustryProfile::for($page->industry),
        ) as $i => $key) {
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
            // ─── Landing phase 3c, Plan A: the two choose-once-at-creation
            // fields the editor's Design panel now also owns.
            //
            // Both are 'sometimes', so every caller that predates this
            // (including every save this screen made before the panel
            // gained the two pickers) behaves EXACTLY as it did: an absent
            // key changes neither the page's template nor the org's
            // industry.
            //
            // Rule::in against the same two registries the onboarding
            // controller uses — LandingOnboardingService::templateKeys()
            // and Organization::INDUSTRIES — never a literal list, so what
            // the wizard offers, what the editor offers and what either
            // endpoint accepts cannot come apart. `industry` is handled
            // specially below: it is NOT a column this endpoint writes.
            'template_key' => ['sometimes', 'string', Rule::in(LandingOnboardingService::templateKeys())],
            'industry'     => ['sometimes', 'string', Rule::in(Organization::INDUSTRIES)],
        ], [
            'slug.string' => 'That web address is not valid.',
            'slug.max'    => 'Please use a shorter web address — up to 63 characters.',
            // Every message named, same house rule as the slug pair above
            // and ThemeRules::messages(): Laravel's defaults here are "The
            // selected template key is invalid." and "The selected industry
            // is invalid.", the first of which hands a tenant a raw field
            // name and neither of which says anything they can act on. The
            // industry wording is character-for-character the onboarding
            // controller's, so the same mistake reads the same in the
            // wizard and in the editor.
            'template_key.string' => 'Please choose one of the available page styles.',
            'template_key.in'     => 'Please choose one of the available page styles.',
            'industry.string'     => 'Please choose one of the listed industries.',
            'industry.in'         => 'Please choose one of the listed industries.',
        ]);

        // D4 (landing phase 3b, media round): image_url is a leaf ScalarLeaves
        // happily allows through — it is just a string — but it names a file
        // written by MediaService::upload(), and this endpoint has no way to
        // know whether a submitted string is a real upload, a dead path from
        // a page that has moved on, or somebody else's file entirely. Letting
        // it through here would give this column TWO writers for the same
        // leaf: uploadImage()/removeImage() below (which pair every write
        // with the matching delete of the file it replaces) and this free-text
        // path (which cannot, and would leak the old file on every edit that
        // happened to carry a stale image_url along for the ride). So this
        // runs before anything else touches `content`, and it names no field
        // path in its message — content.hero.image_url is exactly the kind of
        // string spec 9 says must never reach a tenant verbatim.
        //
        // Widened from a literal `image_url` to SectionType::isImageField()
        // when the gallery arrived: a band can now hold eight pictures, at
        // `image_1`…`image_8`, and every one of them has the same single
        // writer for the same reason. The test is the whole `image_*`
        // family rather than the eight legitimate names — see that method's
        // own note: a refusal that only knew the legitimate leaves would
        // wave `image_9` through into a column nothing reads it from.
        foreach (($data['content'] ?? []) as $sectionKey => $fields) {
            if (!is_array($fields)) {
                continue;
            }

            foreach (array_keys($fields) as $field) {
                if (SectionType::isImageField((string) $field)) {
                    throw ValidationException::withMessages([
                        'content' => 'Photos are changed with the photo controls, not by editing text.',
                    ]);
                }
            }
        }

        // Coordinator ruling 3b-2, amending D4 -- and ruling 3b-7, amending
        // 3b-2 in turn: update() still REPLACES the whole `content` column
        // wholesale, and the one legal payload D4 leaves a tenant is exactly
        // the one that omits image_url, so every text-only save must carry
        // that leaf forward from what is already stored or the very next
        // save erases whatever uploadImage() just wrote, orphaning its file.
        // Ruling 3b-7 narrows WHICH sections this applies to: hero and about
        // are the only two slots the image endpoints own (`slot` is
        // `in:hero,about` on both), so this is scoped to exactly those two
        // rather than every section — a section this build never gives a
        // photo control has no image_url leaf of its own to protect, and
        // carrying one forward for it would just be re-saving a raw-DB
        // shape nothing here ever wrote.
        //
        // Ruling 3b-6 moves the actual carry-forward INSIDE the transaction
        // below, reading the row lockForUpdate() re-reads rather than this
        // stale $page snapshot — see that block's own comment for why the
        // stale snapshot is the resurrect vector under a race.

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

        // D6 (landing phase 3c): `theme` gets an allowlist -- exactly
        // App\Landing\ThemeRules::keys(), each with its own format/allowlist
        // rule (ThemeRules::rules()). Before this, `theme` was constrained
        // only by `array` + `ScalarLeaves(depth: 1)` above -- SHAPE, not
        // membership or FORMAT -- so any flat scalar key was silently
        // accepted (`theme.radius`, `theme.dark`, a `font_pairing` value
        // outside the three curated ones, all round-tripped with a 200).
        //
        // ThemeRules::validate() runs as its own Validator instance for the
        // identical reason the $contact block above is one: adding
        // 'theme.palette' etc. as SIBLING rule keys to the SAME validate()
        // call above would trip Validator::$excludeUnvalidatedArrayKeys the
        // moment `theme` carries a key those dotted rules do not enumerate
        // -- the phase-3a trap, applied to `theme` instead of `content` (see
        // ThemeRules::validate()'s own docblock for the full reasoning).
        //
        // Only `is_array()`, never assumed: theme may legitimately be a
        // plain non-array scalar on data written before this column had a
        // shape at all, same reasoning as $contact above.
        $theme = $data['theme'] ?? null;

        if (is_array($theme)) {
            ThemeRules::validate($theme);
        }

        // Landing phase 3c, Plan A. `industry` is lifted OUT of $data here
        // and never reaches $fresh->update($data) below, because
        // landing_pages.industry has exactly one writer and it is not this
        // endpoint: Organization::updated resyncs every one of the org's
        // pages the moment organizations.industry changes (see that hook,
        // and LandingOnboardingService::syncOrganizationIndustry()'s own
        // docblock). Writing the snapshot here as well would be a second
        // writer for the same column — the precise shape of bug D4's
        // image_url rule exists to prevent on `content` — and the two would
        // disagree the first time an alias or a sibling brand's page was
        // involved.
        //
        // normaliseIndustry() as well as the Rule::in above, for the same
        // "belt to that braces" reason chosenIndustry() gives: the rule is
        // what refuses an unknown industry with a friendly 422, and this is
        // what guarantees the value handed to the writer is canonical (so
        // its equality no-op cannot be defeated by an alias). null here
        // means the request never asked, which leaves the organisation
        // exactly as it was.
        $industry = array_key_exists('industry', $data)
            ? Organization::normaliseIndustry($data['industry'])
            : null;

        unset($data['industry']);

        // The org this page belongs to, resolved the same way store() above
        // resolves it. Read before the transaction so the write inside it is
        // a plain save() on an already-loaded model.
        $org = $request->user()->organization;

        if (isset($data['slug'])) {
            $data['slug'] = LandingPageGuard::validatedSlug($data['slug'], $page->id);
        }

        // One transaction: a rename is a delete, an insert and an update, and a
        // page whose slug moved while its redirects did not is precisely the
        // broken address this feature exists to prevent.
        //
        // Ruling 3b-6: everything inside now reads a FRESHLY re-read, ROW-LOCKED
        // copy of the page — never the `$page` resolved above, which is only
        // good for the 404/authorization decision already made and for the
        // primary key + organization_id that identify which row to lock. Three
        // content writers (this one, uploadImage(), removeImage()) each used to
        // load-modify-save a stale snapshot with no lock at all, so a hero+about
        // dual upload, a save racing an in-flight upload, or two overlapping
        // saves could each drop the other's write, resurrect a just-deleted
        // leaf, or leave the DB pointing at a file that no longer exists. The
        // lock is scoped to the SAME row the guard already chose — `id` AND
        // `organization_id`, not a wider tenant query — so this fixes the race
        // without widening what this endpoint can ever touch.
        //
        // The catch sits OUTSIDE it deliberately. DB::transaction() has already
        // rolled back by the time the handler runs, so the lookups in there are
        // safe; inside, on Postgres, they would hit 25P02 on an aborted
        // transaction and turn a 422 back into a 500.
        try {
            DB::transaction(function () use ($page, $data, $industry, $org) {
                /** @var LandingPage $fresh */
                $fresh = LandingPage::where('id', $page->id)
                    ->where('organization_id', $page->organization_id)
                    ->lockForUpdate()
                    ->firstOrFail();

                // Landing phase 3c, Plan A: the industry change, through the
                // SAME writer the wizard's own POST goes through — never a
                // second copy of "what changing an industry means" (it is
                // one column, it is not the CRM preset reshape behind
                // POST /v1/auth/apply-industry, and it is a no-op when the
                // chosen industry is the one the org is already on).
                //
                // First inside the transaction, exactly as apply() does it,
                // and for the same reason: this is what fires
                // Organization::updated's resync sweep across the org's
                // landing pages, so $fresh's own `industry` snapshot is
                // rewritten by the hook — never by the update() below, whose
                // $data no longer carries the key at all. Rolled back with
                // everything else if the write that follows fails, so a
                // refused save cannot leave the business filed under an
                // industry its page never moved to.
                if ($industry !== null) {
                    LandingOnboardingService::syncOrganizationIndustry($org, $industry);
                }

                // Ruling 3b-2/3b-7's carry-forward, now against the FRESH
                // row's content and scoped to hero/about only (see this
                // method's own comment above, where this used to live, for
                // both rulings' full reasoning). Reading `$fresh->content`
                // rather than `$page->content` is the actual fix: under a
                // race, `$page` is a snapshot from before this request even
                // started validating, so carrying ITS leaf forward could
                // resurrect a leaf an in-flight uploadImage()/removeImage()
                // had already changed or removed by the time this
                // transaction runs.
                if (array_key_exists('content', $data)) {
                    foreach (($fresh->content ?? []) as $sectionKey => $storedFields) {
                        // Ruling 3b-7's "which sections" question, asked of
                        // the catalogue instead of a literal pair. It used to
                        // read `!in_array($sectionKey, ['hero', 'about'])`,
                        // which was the right SET and the wrong SOURCE: the
                        // moment a tenant-added text band could hold a photo,
                        // that literal silently stopped carrying it forward
                        // and the very next text-only save erased the leaf,
                        // orphaning the file — the exact failure 3b-2 was
                        // written to prevent, reintroduced for the new
                        // sections only.
                        //
                        // Now asked as "WHICH LEAVES", not "does this section
                        // have a photo": SectionType::imageLeaves() answers
                        // ['image_url'] for hero/about/text_N, the eight
                        // image_N names for a gallery, and [] for
                        // services/team/reviews and for a junk key from a raw
                        // write — so the loop below is the same carry-forward
                        // it always was, run once per picture the section
                        // legitimately holds. Deliberately NOT the wider
                        // isImageField() family the refusal above uses: a
                        // section this build never gives a photo control has
                        // no leaf of its own to protect, and carrying one
                        // forward for it would just be re-saving a raw-DB
                        // shape nothing here ever wrote.
                        if (!is_array($storedFields)) {
                            continue;
                        }

                        foreach (SectionType::imageLeaves((string) $sectionKey) as $leaf) {
                            if (!isset($storedFields[$leaf]) || !is_string($storedFields[$leaf])) {
                                continue;
                            }

                            if (!isset($data['content'][$sectionKey]) || !is_array($data['content'][$sectionKey])) {
                                $data['content'][$sectionKey] = [];
                            }

                            if (!array_key_exists($leaf, $data['content'][$sectionKey])) {
                                $data['content'][$sectionKey][$leaf] = $storedFields[$leaf];
                            }
                        }
                    }
                }

                // D6's other half: `theme` is still REPLACED WHOLESALE by
                // `$fresh->update($data)` below, same as `content` above --
                // there is no per-key theme writer the way uploadImage()/
                // removeImage() own `content.{slot}.image_url`, so nothing
                // here forces every save to omit a key the way D4 forces
                // image_url out of `content`. But the design panel (Task 6)
                // does not exist yet, and this task must not leave a save
                // that touches ONE theme key (a future `theme.palette`-only
                // PATCH, from Task 6's cards or a direct API call) able to
                // erase whichever OTHER allowlisted keys the tenant already
                // had saved (`brand_color`, `font_pairing`) purely because
                // this request happened not to repeat them. So: any
                // ThemeRules::keys() the SUBMITTED theme omits is carried
                // forward from the FRESH, row-locked copy -- never from the
                // stale `$page` resolved before this transaction opened,
                // for the identical race reason the content carry-forward
                // above reads `$fresh->content` and not `$page->content`.
                // Today's only writer (LandingEditor.tsx's saveMut) always
                // sends the complete stored theme object back unchanged
                // (see this task's report), so this is currently a no-op in
                // production; it exists so that guarantee does not have to
                // be re-verified by hand every time a future task touches
                // this write path.
                if (array_key_exists('theme', $data) && is_array($data['theme'])) {
                    $storedTheme = is_array($fresh->theme) ? $fresh->theme : [];

                    foreach (ThemeRules::keys() as $key) {
                        if (!array_key_exists($key, $data['theme']) && array_key_exists($key, $storedTheme)) {
                            $data['theme'][$key] = $storedTheme[$key];
                        }
                    }
                }

                if (isset($data['slug']) && $data['slug'] !== $fresh->slug) {
                    // Moving ONTO an address means nothing may still redirect
                    // away from it. A rename of a → b → a would otherwise leave
                    // the page's own primary URL redirecting to itself: dead
                    // weight at best, a redirect loop at worst. validatedSlug()
                    // has already refused the slug if such a row belonged to
                    // anyone else, so whatever is left is ours to clear.
                    LandingPageGuard::releaseRedirects($data['slug']);

                    // The old address may be printed on a card or a shopfront,
                    // so keep it working rather than 404ing it the moment it
                    // changes. $fresh->slug, not $page->slug: the locked row is
                    // the only copy that can answer what the CURRENT address
                    // actually is.
                    DB::table('landing_page_redirects')->updateOrInsert(
                        ['slug' => $fresh->slug],
                        [
                            'landing_page_id' => $fresh->id,
                            'expires_at'      => now()->addDays(LandingPageGuard::REDIRECT_TTL_DAYS),
                            'created_at'      => now(),
                            'updated_at'      => now(),
                        ],
                    );
                }

                $fresh->update($data);
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

    /**
     * The one writer for `content.{slot}.image_url` — see D4's comment in
     * update() for why that leaf is refused everywhere else. Multipart form
     * data does not parse on a PUT in PHP, which is why this is a POST
     * (routes/api.php has the note); the frontend sends FormData.
     *
     * $old is read before the upload so a slow upload racing a second
     * request still deletes whatever THIS request found on the page when it
     * started, not whatever happens to be there by the time it finishes.
     * MediaService::delete() only fires once the new file is safely saved —
     * deleting the old file first and then failing the write would leave the
     * page pointing at nothing.
     */
    public function uploadImage(Request $request): JsonResponse
    {
        $data = $request->validate([
            // Rule::in over the SLOTS THE CATALOGUE SAYS CARRY A PHOTO
            // (App\Landing\SectionType), never the `in:hero,about` literal
            // this used to be. That literal was a second copy of "which
            // sections have an image", and the repeatable text band made it
            // wrong: `text_3` is a legitimate photo slot on a page that has
            // that band, and no list spelled out by hand here could stay in
            // step with a catalogue that also drives the renderer and the
            // re-hydration below.
            //
            // Note what this rule does NOT check: whether the page actually
            // HAS that section row. Neither did the old literal — an upload
            // to `about` on a page with no about band has always been
            // accepted and simply never rendered — and the two halves are
            // genuinely independent (a tenant can add the band after
            // choosing the photo). The grammar is bounded at
            // SectionType::MAX_INSTANCES_PER_TYPE, so the set of slots this
            // accepts is finite whatever a caller sends.
            'slot'  => ['required', 'string', Rule::in(SectionType::imageKeys())],
            'image' => ['required', 'image', 'mimes:jpeg,png,jpg,webp', 'max:5120', new MaxImageDimensions(4096)],
        ], [
            'slot.required'  => 'Please choose which photo you are replacing.',
            'slot.string'    => 'Please choose which photo you are replacing.',
            'slot.in'        => 'Please choose which photo you are replacing.',
            'image.required' => 'Please choose a photo to upload.',
            'image.image'    => 'Please upload a JPEG, PNG or WebP photo.',
            'image.mimes'    => 'Please upload a JPEG, PNG or WebP photo.',
            'image.max'      => 'Please use a photo up to 5 MB.',
        ]);

        $page = $this->current();
        abort_if($page === null, 404);

        $slot = $data['slot'];

        // THE ONE PARSER for a slot, and the second wall behind Rule::in
        // above — see SectionType::imageSlot(). A single-photo band names
        // itself (`hero`) and its leaf is implied; a gallery names the
        // picture (`gallery_2.image_5`). Everything below writes
        // $content[$key][$leaf] and knows nothing about which spelling
        // arrived, which is what let the whole multi-photo grammar land
        // without moving a stored byte or a golden.
        //
        // Unreachable-null by construction (Rule::in enumerates exactly what
        // this accepts), and refused rather than assumed anyway: this is the
        // method that decides which leaf gets written, and a 422 is the
        // right answer if the two lists ever disagree.
        $target = SectionType::imageSlot($slot);

        if ($target === null) {
            throw ValidationException::withMessages([
                'slot' => 'Please choose which photo you are replacing.',
            ]);
        }

        // Ruling 3b-6: the upload itself stays OUTSIDE and BEFORE the
        // transaction below — a row lock must never be held across a
        // network transfer to MediaService's disk. $old is deliberately NOT
        // read here (that would be the same stale-snapshot bug the
        // transaction exists to fix): it is captured from the freshly
        // locked row instead, once we are actually about to overwrite it.
        $url = MediaService::upload($data['image'], 'landing');

        try {
            $old = DB::transaction(function () use ($page, $target, $url) {
                /** @var LandingPage $fresh */
                $fresh = LandingPage::where('id', $page->id)
                    ->where('organization_id', $page->organization_id)
                    ->lockForUpdate()
                    ->firstOrFail();

                $old = $fresh->content[$target['key']][$target['leaf']] ?? null;

                // The one level of nesting update() already lives with: content is a
                // map of section keys onto a flat map of fields, so only the leaf
                // this endpoint owns is touched — every sibling field already
                // written under this slot (a headline, a subtext, the gallery's
                // other seven pictures) survives.
                $content = $fresh->content ?? [];
                $section = is_array($content[$target['key']] ?? null) ? $content[$target['key']] : [];
                $section[$target['leaf']] = $url;
                $content[$target['key']] = $section;

                $fresh->content = $content;
                $fresh->save();

                return $old;
            });
        } catch (\Throwable $e) {
            // W3, the compensating delete: the upload above already landed
            // on disk, so a failed save inside the transaction must not
            // leave that new file orphaned with nothing pointing at it.
            // Best-effort — a delete failure must not mask the ORIGINAL
            // exception, which is what actually explains this request's 500.
            try {
                MediaService::delete($url);
            } catch (\Throwable) {
            }

            throw $e;
        }

        // Only after the new file is on the page and saved, and only once —
        // never inside the transaction, which must not hold its lock across
        // this call. A string check, not a truthiness one: an old value of
        // '0' is a legal (if odd) past upload and must still be cleaned up.
        // $old !== $url guards the (practically unreachable, since upload()
        // names are random) case of the fresh row already holding exactly
        // the file we just wrote — never delete the file this request just
        // saved.
        if (is_string($old) && $old !== '' && $old !== $url) {
            // W4: best-effort, same pattern as ChatWidgetConfigController's
            // avatar-replace path (:181-190) — a failed delete of the OLD
            // file must not turn this successful upload into an error
            // response for the tenant.
            try {
                MediaService::delete($old);
            } catch (\Throwable $e) {
                Log::warning('landing.image.delete_failed', [
                    'slot'  => $slot,
                    'url'   => $old,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return response()->json(['slot' => $slot, 'image_url' => $url]);
    }

    /** The other half of the single-writer rule: clears the leaf and deletes the file it named. */
    public function removeImage(Request $request): JsonResponse
    {
        $data = $request->validate([
            // The same catalogue-derived allowlist uploadImage() uses — see
            // its comment. The two halves of the single-writer rule must
            // agree about which slots exist, or a slot could be written and
            // never cleared.
            'slot' => ['required', 'string', Rule::in(SectionType::imageKeys())],
        ], [
            'slot.required' => 'Please choose which photo you are removing.',
            'slot.string'   => 'Please choose which photo you are removing.',
            'slot.in'       => 'Please choose which photo you are removing.',
        ]);

        $page = $this->current();
        abort_if($page === null, 404);

        $slot = $data['slot'];

        // The same parse uploadImage() performs, for the same reason — see
        // its comment. The two halves of the single-writer rule must agree
        // about which leaf a slot names, or a picture could be written and
        // never cleared.
        $target = SectionType::imageSlot($slot);

        if ($target === null) {
            throw ValidationException::withMessages([
                'slot' => 'Please choose which photo you are removing.',
            ]);
        }

        // Ruling 3b-6: same lock-and-reread shape as update()/uploadImage() —
        // $old is read from the freshly locked row, not a stale snapshot, so
        // this cannot delete a file a concurrent uploadImage() has already
        // replaced.
        $old = DB::transaction(function () use ($page, $target) {
            /** @var LandingPage $fresh */
            $fresh = LandingPage::where('id', $page->id)
                ->where('organization_id', $page->organization_id)
                ->lockForUpdate()
                ->firstOrFail();

            $content = $fresh->content ?? [];
            $section = is_array($content[$target['key']] ?? null) ? $content[$target['key']] : [];
            $old = $section[$target['leaf']] ?? null;

            // Unset, not merely nulled — and the section stays in place even if
            // this was its only field, matching update(): nothing in this column
            // ever prunes a section down to nothing on its own. ScalarTree is
            // what makes an empty section harmless to the renderer. On a
            // gallery this leaves a GAP in the leaf sequence (image_2 removed
            // from image_1..image_3), which is deliberate: renumbering would
            // mean rewriting leaves this request was not asked to touch, and
            // galleryImages() closes the gap at render time.
            unset($section[$target['leaf']]);
            $content[$target['key']] = $section;

            $fresh->content = $content;
            $fresh->save();

            return $old;
        });

        if (is_string($old) && $old !== '') {
            // W4: same best-effort pattern as uploadImage() above — a failed
            // delete must not turn this successful removal into an error
            // response.
            try {
                MediaService::delete($old);
            } catch (\Throwable $e) {
                Log::warning('landing.image.delete_failed', [
                    'slot'  => $slot,
                    'url'   => $old,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        return response()->json(['slot' => $slot, 'image_url' => null]);
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

    /**
     * How long a minted preview URL's SIGNATURE stays valid.
     *
     * Named once because two endpoints mint one now (previewUrl() and
     * previewDraft() below) and the frontend pins the same number
     * (`previewFreshness.ts`'s PREVIEW_URL_TTL_MS) to refresh a long-open
     * editor before it expires. Three copies of "two hours" is two too
     * many.
     */
    private const PREVIEW_URL_TTL_HOURS = 2;

    /** Short-lived signed URL, so a draft is visible to its owner and nobody else. */
    public function previewUrl(): JsonResponse
    {
        $page = $this->current();
        abort_if($page === null, 404);

        return response()->json([
            'url' => URL::temporarySignedRoute(
                'landing.preview',
                now()->addHours(self::PREVIEW_URL_TTL_HOURS),
                ['page' => $page->id],
            ),
        ]);
    }

    /**
     * THE LIVE PREVIEW: render what the tenant is typing, without saving it.
     *
     * The editor posts its in-flight `theme`, `content` and section rows
     * here; {@see PreviewDraft} validates them with the write path's own
     * rules, parks them in the cache under an unguessable key, and this
     * hands back a signed preview URL carrying that key. The landing host's
     * `preview()` renders the REAL Blade template from the stash.
     *
     * WHY NOT RE-RENDER IN THE BROWSER: see PreviewDraft's own docblock. A
     * JavaScript copy of the template would be a second design that drifts
     * from the shipped one, and a preview that drifts is worse than no
     * preview at all.
     *
     * WHY THIS WRITES NOTHING: the tenant has not pressed Save. A preview
     * that persisted would publish half-typed copy to anyone holding the
     * public URL of an already-live page, and would race the very save it
     * is previewing. The stash is the whole persistence this feature has.
     *
     * The URL's signature lives the same two hours previewUrl()'s does --
     * one lifetime for both, so `previewFreshness.ts` keeps governing both
     * -- while the STASH behind it lives ninety seconds. Between the two
     * the URL still renders: the key has simply expired and
     * `PreviewDraft::hydrate()` answers null, so the route falls back to the
     * saved draft rather than an error page inside the editor's own pane.
     */
    public function previewDraft(Request $request): JsonResponse
    {
        $page = $this->current();
        abort_if($page === null, 404);

        $data = $request->validate(PreviewDraft::rules(), PreviewDraft::messages());

        $key = PreviewDraft::stash($page, $data);

        return response()->json([
            'url' => URL::temporarySignedRoute(
                'landing.preview',
                now()->addHours(self::PREVIEW_URL_TTL_HOURS),
                ['page' => $page->id, 'draft' => $key],
            ),
            // Published rather than mirrored, for the same reason every
            // other allowlist and cap on this screen is: the editor's
            // caption has to stop claiming "live" once the stash behind the
            // frame has certainly expired, and a hardcoded 90 on the
            // frontend is a number this server might later disagree with.
            'expires_in' => PreviewDraft::TTL_SECONDS,
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
