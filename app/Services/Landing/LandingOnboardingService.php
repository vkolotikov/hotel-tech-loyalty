<?php

namespace App\Services\Landing;

use App\Landing\ContactDetails;
use App\Landing\IndustryProfile;
use App\Landing\PageContent;
use App\Models\Brand;
use App\Models\LandingPage;
use App\Models\Organization;
use App\Support\CssColor;
use App\Support\LandingPageGuard;
use App\Support\LandingSlug;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Builds the wizard's prefill and applies its result.
 *
 * The availability counts come from the SAME resolution the renderer uses
 * (PageContent), not from a second set of queries written here. Two
 * implementations of "does this tenant have any services" is how the wizard
 * ends up offering a section that renders empty -- the exact failure the
 * spec's "an empty section is never offered as a choice" rule exists to
 * prevent. PageContent::count() is that one resolution, and its own has()
 * is defined in terms of it, so the number this endpoint prints and the
 * yes/no the renderer acts on cannot come apart.
 *
 * The rules about what may exist at an address -- slug format, reserved
 * words, global uniqueness, the live-redirect hold, one page per brand --
 * are LandingPageGuard's, shared with LandingPageController for the same
 * reason: this class is the second way to create a page, and a second copy
 * of those rules would be a second answer to the same question.
 */
class LandingOnboardingService
{
    /**
     * The templates a tenant may choose from, in the order the wizard shows
     * them.
     *
     * Here rather than in the wizard's own code so phase 3's two remaining
     * templates are a data change on one side of the wire, and here rather
     * than in config/landing.php because a key with no
     * resources/views/landing/{key}/ behind it is a page that cannot render
     * -- this list has to move with the shipped views, not with deployment
     * configuration. The controller validates template_key against
     * templateKeys() rather than a literal, so what the wizard OFFERS and
     * what apply() ACCEPTS are one list.
     */
    public const TEMPLATES = [
        [
            'key'   => 'ruled_page',
            'name'  => 'The Ruled Page',
            // Task 11: the blurb is the FIRST sentence a tenant reads about
            // this product, and it used to be written for a designer -- "a
            // hairline rule down the margin acts as index, ruler and spine".
            // Walked live as a salon owner it says nothing about what you
            // get. Rewritten to describe the page, not the craft behind it;
            // the visual restraint is still the pitch, in words somebody who
            // has never commissioned a website can act on.
            'blurb' => 'Calm and uncluttered, with plenty of white space. Your work and your prices do the talking — nothing on the page competes with them.',
        ],
    ];

    /**
     * What each section is called, and where its content comes from, in
     * words a person who has never seen a CMS can act on.
     *
     * `source` is the screen they would go to in order to fill the section
     * -- which is what turns "Reviews (0)" from a dead end into an
     * instruction, and it is the same sentence the editor reuses, so the
     * wizard and the editor cannot describe the same section differently.
     *
     * `label` is overridden by the industry's own vocabulary wherever it
     * has one: a clinic offers Procedures and sees Clinicians, and printing
     * "Services"/"Team" at them would be the platform talking about itself.
     * See sectionLabel().
     */
    private const SECTION_COPY = [
        'hero'     => ['label' => 'Opening',  'source' => 'Your business name, and the headline you write here'],
        'services' => ['label' => 'Services', 'source' => 'Your Services screen'],
        'about'    => ['label' => 'About',    'source' => 'Words you write in the editor'],
        'team'     => ['label' => 'Team',     'source' => 'Your Team screen'],
        'reviews'  => ['label' => 'Reviews',  'source' => 'Reviews you have chosen to feature on your Reviews screen'],
        // 'reason' is the one entry here that is NOT a plain string: booking's
        // unavailability (Task 4 -- PageContent::count('booking') gates the
        // band to the 'hotel' industry) is the one case in this table whose
        // explanation names the tenant's own CTA text, which only the profile
        // knows -- see sectionReason() below, the same %s-sprintf shape
        // 'source' itself has no need for. Every other key's absence is
        // already self-explanatory from 'source' alone ("Add some from your
        // Services screen"), so only 'booking' carries one.
        'booking'  => ['label' => 'Booking',  'source' => 'Your booking button', 'reason' =>
            "Online booking currently supports hotel stays. Your '%s' button will point visitors at your contact details instead."],
        'contact'  => ['label' => 'Contact',  'source' => 'Your address and phone number in Properties'],
        'footer'   => ['label' => 'Footer',   'source' => 'Your business details in Properties'],
    ];

    /** How many addresses in one family to try before giving up on it. */
    private const SLUG_ATTEMPTS = 12;

    /** @return list<string> */
    public static function templateKeys(): array
    {
        return array_column(self::TEMPLATES, 'key');
    }

    /**
     * Every industry the wizard's first step may offer, each carrying the
     * words a page in that industry would actually be written in.
     *
     * The LIST and its order are Organization::INDUSTRIES' — the same nine
     * ids the registration picker, the Settings industry switcher and
     * normaliseIndustry() all speak, so what the wizard offers and what
     * apply() accepts are one list (exactly the discipline templateKeys()
     * already gives template_key). The WORDS are IndustryProfile's, read
     * through for() rather than all(): every id in INDUSTRIES has an
     * authored profile today (IndustryProfileTest asserts that one-for-one
     * match), and a TENTH industry added to INDUSTRIES before this class is
     * taught its vocabulary degrades to 'other's honestly-generic copy
     * rather than vanishing from a picker the rest of the platform still
     * offers it in -- for()'s own documented fallback, inherited here on
     * purpose instead of re-decided.
     *
     * Deliberately NOT translated. servicesLabel / peopleLabel / primaryCta
     * are not admin chrome: they are the literal words that will be printed
     * on the tenant's published page, which is rendered in English by
     * IndustryProfile itself. Showing them verbatim is what makes the card
     * a preview of the page rather than a description of one -- the same
     * reason `sections[].label` and the template blurb already cross this
     * wire untranslated.
     *
     * `sections` is the band list a page in that industry is created with
     * (apply() seeds exactly $profile->defaultSections), which is what lets
     * the wizard's step 4 stop offering a band the chosen industry's page
     * would never have -- 'booking' is the only key that varies today.
     *
     * @return list<array<string, mixed>>
     */
    public static function industries(): array
    {
        return collect(Organization::INDUSTRIES)
            ->map(function (string $id): array {
                $profile = IndustryProfile::for($id);

                return [
                    'id'             => $id,
                    'services_label' => $profile->servicesLabel,
                    'people_label'   => $profile->peopleLabel,
                    'primary_cta'    => $profile->primaryCta,
                    // Through CssColor for the same reason brandColor()
                    // below runs the brand's own colour through it: the
                    // swatch a card paints has to be the colour the page
                    // would really use, not a value Accent::for() would
                    // normalise or discard at render time.
                    'accent'         => CssColor::safe($profile->accent),
                    // The palette id only. What that palette LOOKS like is
                    // already mirrored on the front end
                    // (frontend/src/pages/landing/designChoices.ts, which
                    // the design step's own cards render from), so sending
                    // the tokens again here would be a second copy of the
                    // same six palettes on the same screen.
                    'palette'        => $profile->defaultPalette,
                    'sections'       => $profile->defaultSections,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * Everything the wizard needs to open with something already filled in.
     *
     * Completion is the existence of a page, NOT a crm_settings marker.
     * crm_settings is unique on (organization_id, key) with no brand column,
     * so a marker-gated wizard runs once per ORGANISATION; a landing page is
     * per BRAND. A marker would mean brand B never sees the wizard because
     * brand A finished it -- and the only way back would be an UPDATE by
     * hand.
     */
    public function prefill(): array
    {
        $org     = $this->organization();
        $brandId = $this->brandId();
        $brand   = $brandId ? Brand::find($brandId) : null;

        // THIS brand's page if there is one, so re-opening the wizard shows
        // the copy the tenant already wrote rather than blanking it;
        // otherwise an unsaved stand-in. Both carry the brand resolved
        // above, so what is described and what apply() would write are one
        // brand -- see currentPage() and probePage().
        $page    = $this->currentPage($brandId);
        $content = PageContent::for($page ?? $this->probePage($org, $brandId));

        // The very same Property the page will publish -- resolved by
        // PageContent, brand preference and all -- rather than a fresh
        // Property query here, which would be free to hand the wizard a
        // sibling brand's phone number and address for the tenant to
        // confirm.
        $contact = $content->contact;

        return [
            'completed' => $page !== null,
            'prefill'   => [
                'business_name' => $contact?->name ?? $brand?->name ?? $org->name,
                // Not invented. An empty headline is a field the wizard
                // shows with a hint, which is honest; a headline we made up
                // is copy the business never approved and might publish
                // without reading.
                'headline'      => $page?->content['hero']['headline'] ?? null,
                'subtext'       => $page?->content['hero']['subtext'] ?? null,
                'phone'         => $contact?->phone,
                'email'         => $contact?->email,
                'address'       => $contact?->address,
                'brand_color'   => $this->brandColor($page, $brand, $content->profile->accent),
                // The card the wizard's first step opens pre-selected on.
                // Read off the PROFILE that produced everything else in
                // this response -- the section list, the labels, the house
                // accent -- rather than from $org->resolved_industry
                // directly, so the pre-selected card cannot describe a
                // different industry from the rest of the prefill. The two
                // are the same value for a tenant with no page yet (see
                // newPageIndustry(), which is what probePage() hands
                // PageContent); where a page DOES exist this is that page's
                // own committed snapshot, which is the thing the prefill is
                // describing.
                'industry'      => $content->profile->industry,
            ],
            'templates'      => self::TEMPLATES,
            // Landing phase 3c (wizard industry step): the nine industries
            // step 1 offers, each with the words a page in it would carry.
            // See industries() for why the list is Organization's and the
            // vocabulary is IndustryProfile's.
            'industries'     => self::industries(),
            'sections'       => $this->sections($content),
            'suggested_slug' => $page?->slug ?? $this->suggestSlug($org, $brand, $contact),
        ];
    }

    /**
     * Create the page the wizard describes, or nothing at all.
     *
     * One transaction around the page row and its section rows: a page whose
     * sections were half-written is a page the editor cannot list and the
     * renderer draws with bands missing, and there is no way for the tenant
     * to tell that has happened.
     */
    public function apply(array $data): LandingPage
    {
        $org     = $this->organization();
        $brandId = $this->brandId();
        // Read once and used for both the row's snapshot and the section
        // list seeded from it, so the page cannot be filed under one
        // industry and given another's bands. See chosenIndustry(), and
        // newPageIndustry() behind it.
        $industry = $this->chosenIndustry($data, $org);
        $profile  = IndustryProfile::for($industry);

        // Everything that can be refused is refused before the transaction
        // opens, so the common failures never leave a half-built page to
        // roll back in the first place.
        $chosen = $this->chosenSections($data['sections'] ?? [], $profile->defaultSections);
        $slug   = LandingPageGuard::validatedSlug($data['slug']);

        // Running the wizard twice -- a stale tab, a double submit, a second
        // person in the same account -- must not produce a second page.
        //
        // Asked with currentPage(), the SAME resolution prefill() reports
        // `completed` from, and not with brandHasPage(). The two differ on
        // exactly one state: an organisation-wide page (brand_id NULL) in an
        // org that also has a default brand. pageOnBrand() falls back to that
        // row, so prefill says completed and the editor opens it -- and
        // brandHasPage(org, defaultBrand) would say "no page here", let the
        // wizard build a second one, and leave the tenant with two pages one
        // screen said they did not have. Whatever the wizard calls finished,
        // apply() calls already done.
        //
        // brandHasPage() keeps its place in the catch below, where the
        // question is the different one of which INDEX just fired.
        abort_if(
            $this->currentPage($brandId) !== null,
            409,
            LandingPageGuard::ONE_PER_BRAND,
        );

        // Built here rather than inside the transaction so the instance
        // survives a failed insert: the catch below has to ask which index
        // fired, and one of those questions is about the brand this row was
        // headed for. brand_id is passed explicitly -- see brandId() -- so
        // BelongsToBrand's creating hook returns early rather than choosing
        // a brand nothing in this request ever looked at.
        $page = new LandingPage([
            'organization_id' => $org->id,
            'brand_id'        => $brandId,
            'slug'            => $slug,
            'template_key'    => $data['template_key'],
            'industry'        => $industry,
            // A DRAFT, always. The wizard's job is to build the page;
            // putting a business on the internet stays a deliberate,
            // separate act with its own button.
            'status'          => LandingPage::STATUS_DRAFT,
            'theme'           => $this->theme($data, $profile),
            'content'         => $this->content($data, $org, $brandId),
        ]);

        // The catch sits OUTSIDE the transaction deliberately, exactly as
        // LandingPageController::update()'s does: DB::transaction() has
        // already rolled back by the time the handler runs, so the lookups
        // in there are safe; inside, on Postgres, they would hit 25P02 on an
        // aborted transaction and turn a 422 into a 500.
        try {
            return DB::transaction(function () use ($org, $industry, $page, $slug, $profile, $chosen) {
                // BEFORE the page insert, and inside the same transaction:
                // the org write is what makes Organization::updated resync
                // the industry snapshot onto every landing page the org
                // already has, and a page created before that sweep would
                // be swept by it a moment later for no reason. Rolled back
                // with the page if anything below fails -- "create the page
                // the wizard describes, or nothing at all" has to include
                // the choice the wizard was describing it with.
                $this->syncOrganizationIndustry($org, $industry);

                $page->save();

                // No redirect row may share a slug with a live page. Cleared
                // only once the claim has succeeded, because until then the
                // row is still somebody else's.
                LandingPageGuard::releaseRedirects($slug);

                // Seeded from the industry's own section list so the wizard
                // and LandingPageController::store() produce the same page,
                // and so ordering is fixed at creation rather than by
                // whatever a later template revision happens to list first.
                foreach ($profile->defaultSections as $i => $key) {
                    $page->sections()->create([
                        'key'     => $key,
                        'enabled' => $chosen[$key] ?? true,
                        'sort'    => $i,
                    ]);
                }

                return $page->fresh('sections');
            });
        } catch (UniqueConstraintViolationException $e) {
            // A lost race, on one of two indexes. Which one is a question
            // and not an assumption: answering "that address is taken" to a
            // tenant whose address is fine, or "you already have a page" to
            // one who has none, sends them hunting for something that is not
            // there.
            if (LandingPageGuard::slugIsTaken($slug)) {
                throw ValidationException::withMessages(['slug' => 'That web address is already taken.']);
            }

            if (!LandingPageGuard::brandHasPage($page->organization_id, $page->brand_id)) {
                throw $e;
            }

            abort(409, LandingPageGuard::ONE_PER_BRAND);
        }
    }

    // ─── Prefill parts ───────────────────────────────────────────────────

    /**
     * One row per section this template will have, in the order it will have
     * them, each carrying whether the tenant has anything to put in it.
     *
     * `available` and `count` are the same number asked twice -- see
     * PageContent::count(). The wizard's own rule (isOfferable) is
     * `available && count > 0`, which is deliberately belt and braces on one
     * strap: it can only ever be wrong in the direction of NOT offering a
     * section, which is the safe direction.
     */
    private function sections(PageContent $content): array
    {
        return collect($content->profile->defaultSections)
            ->map(fn (string $key) => [
                'key'          => $key,
                'label'        => $this->sectionLabel($key, $content->profile),
                'source_label' => self::SECTION_COPY[$key]['source'] ?? '',
                'available'    => $content->has($key),
                'count'        => $content->count($key),
                // null once a section IS available -- there is nothing to
                // explain -- and null for every unavailable section that
                // carries no authored 'reason' (an empty Services screen
                // needs no essay, 'source_label' already says where to go).
                // Only 'booking' has one today; see SECTION_COPY's own note.
                'reason'       => $content->has($key) ? null : $this->sectionReason($key, $content->profile),
            ])
            ->values()
            ->all();
    }

    private function sectionLabel(string $key, IndustryProfile $profile): string
    {
        return match ($key) {
            'services' => $profile->servicesLabel,
            'team'     => $profile->peopleLabel,
            default    => self::SECTION_COPY[$key]['label'] ?? Str::headline($key),
        };
    }

    /**
     * Why an unavailable section is unavailable, in words the tenant did not
     * have to ask for — or null, for every section whose absence is already
     * explained by 'source_label' alone.
     *
     * 'reason' names the tenant's OWN primary CTA text ("Book a lesson",
     * "Book your stay", ...), which is industry vocabulary this class does
     * not carry an opinion about — sprintf against the profile handed to
     * every other line in sections() keeps this one string in step with
     * whatever hero.blade.php is actually printing on the button, rather
     * than a copy of one industry's CTA hard-coded here.
     */
    private function sectionReason(string $key, IndustryProfile $profile): ?string
    {
        $template = self::SECTION_COPY[$key]['reason'] ?? null;

        return $template === null ? null : sprintf($template, $profile->primaryCta);
    }

    /**
     * The colour the page would open in: the tenant's own if the page
     * already carries one, then the brand's, then the industry's house
     * accent.
     *
     * Run through CssColor so the swatch the wizard paints is the colour the
     * page will actually use -- Accent::for() normalises the same way at
     * render time, and a brand row holding "rebeccapurple" or an eight-digit
     * hex would otherwise be shown as chosen and then silently discarded.
     */
    private function brandColor(?LandingPage $page, ?Brand $brand, string $houseAccent): string
    {
        return CssColor::safe(
            $page?->theme['brand_color'] ?? $brand?->primary_color,
            CssColor::safe($houseAccent),
        );
    }

    /**
     * An address nobody holds, derived from what the business is called.
     *
     * The slug never appears in the wizard at all (spec §9), so the tenant
     * cannot repair a suggestion that turns out to be invalid, reserved or
     * taken: whatever this returns is what apply() will be asked to accept,
     * and a suggestion apply() refuses is a dead end with no error the
     * person can act on. Hence every candidate is checked against the same
     * guard apply() will use, and hence the last resort at the bottom, which
     * cannot fail to be a legal slug.
     */
    private function suggestSlug(Organization $org, ?Brand $brand, ?ContactDetails $contact): string
    {
        $names = [$contact?->name, $brand?->name, $org->name];

        foreach ($names as $name) {
            $base = $this->slugBase((string) $name);

            // Not merely empty: "Jo" normalises to a slug below the minimum
            // length and an emoji normalises to nothing at all, and both are
            // names real businesses have. Falling through to the next name
            // gives them "glamour" rather than "jo-2".
            if ($base === null) {
                continue;
            }

            if ($free = $this->firstFreeSlug($base)) {
                return $free;
            }
        }

        // Nothing the business is called can be an address. This can, is
        // stable for the org, and is almost never contended.
        return $this->firstFreeSlug('business-' . $org->id)
            ?? 'business-' . $org->id . '-' . Str::lower(Str::random(6));
    }

    /** The normalised, length-trimmed stem of a name, or null if it cannot be one. */
    private function slugBase(string $name): ?string
    {
        // rtrim after the cut: truncating mid-word can leave a trailing
        // hyphen, which isValid() rejects.
        $base = rtrim(substr(LandingSlug::normalise($name), 0, LandingSlug::MAX), '-');

        return LandingSlug::isValid($base) ? $base : null;
    }

    /** The first address in this family nobody holds, or null if they all are. */
    private function firstFreeSlug(string $base): ?string
    {
        for ($n = 1; $n <= self::SLUG_ATTEMPTS; $n++) {
            $candidate = $n === 1 ? $base : $this->withSuffix($base, $n);

            if (LandingSlug::isValid($candidate)
                && !LandingSlug::isReserved($candidate)
                && !LandingPageGuard::slugIsTaken($candidate)
                && !LandingPageGuard::redirectHoldsSlug($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    private function withSuffix(string $base, int $n): string
    {
        $room = LandingSlug::MAX - strlen((string) $n) - 1;

        return rtrim(substr($base, 0, $room), '-') . '-' . $n;
    }

    // ─── Apply parts ─────────────────────────────────────────────────────

    /**
     * The tenant's choices, keyed by section, with anything this page would
     * not have refused rather than ignored.
     *
     * Refused, not created: a key this template does not own is either a
     * stale client or a typo, and inserting it would put a row in the table
     * that the renderer has no partial for and nothing will ever explain --
     * the same answer LandingPageSectionController gives, in the same words.
     *
     * @return array<string, bool>
     */
    private function chosenSections(array $rows, array $known): array
    {
        $chosen = [];

        foreach ($rows as $row) {
            if (!in_array($row['key'], $known, true)) {
                throw ValidationException::withMessages([
                    'sections' => "This page has no section called '{$row['key']}'.",
                ]);
            }

            $chosen[$row['key']] = (bool) $row['enabled'];
        }

        return $chosen;
    }

    /**
     * D6 (landing phase 3c Task 2): `palette` joins the two keys this
     * method already carried through — App\Http\Controllers\Api\V1\Admin\
     * LandingOnboardingController::store() now validates it (via
     * App\Landing\ThemeRules::validate(), against exactly
     * ThemeRules::keys()) the same as brand_color/font_pairing, so it must
     * be extracted here too or a validated-and-accepted `theme.palette`
     * would silently fail to reach the stored row — accepted by the
     * controller, dropped by the service, the same class of bug D4's
     * comment elsewhere in this codebase warns single-writer columns
     * about.
     *
     * Task 6 (landing phase 3c, D2's own deferred half — see
     * `App\Landing\Palette`'s header docblock: "nothing in THIS round
     * applies it to a page"; this is that application): a tenant who never
     * opened the wizard's palette picker submits `theme.palette` absent,
     * not merely falsy — the wizard's own `WizardForm.palette` field stays
     * genuinely unset until touched (see `landingDraft.ts`), so `?? null`
     * here would otherwise store no palette at all and leave the page
     * rendering the CSS's bare `porcelain` default regardless of industry.
     * Falling back to `$profile->defaultPalette` instead means EVERY new
     * page opens on a palette curated for its own industry — the
     * education tenant above gets `slate_amber`, not a beauty salon's
     * `champagne_noir` inherited by accident of stylesheet order — while a
     * tenant who DID choose one keeps exactly that choice, since the `??`
     * only ever fires on the absent/null case.
     *
     * @return array<string, string>
     */
    private function theme(array $data, IndustryProfile $profile): array
    {
        return $this->kept([
            'brand_color'  => $data['theme']['brand_color']  ?? null,
            'font_pairing' => $data['theme']['font_pairing'] ?? null,
            'palette'      => $data['theme']['palette']      ?? $profile->defaultPalette,
        ]);
    }

    /**
     * The copy, filed under the section that renders it: the layout reads
     * $page->content[$section->key] and hands it to the partial as $copy,
     * and hero.blade.php reads headline and subtext off that.
     */
    private function content(array $data, Organization $org, ?int $brandId): array
    {
        $hero = $this->kept([
            'headline' => $data['copy']['headline'] ?? null,
            'subtext'  => $data['copy']['subtext']  ?? null,
        ]);

        $content = $hero === [] ? [] : ['hero' => $hero];

        $contact = $this->contactOverrides($data, $org, $brandId);
        if ($contact !== []) {
            $content['contact'] = $contact;
        }

        return $content;
    }

    /**
     * Only the contact fields the tenant actually changed from what THIS
     * page would otherwise publish — the Property stays the source of truth
     * for everything left alone (Task 2's whole point). Diffed against the
     * SAME resolution prefill() shows the wizard, not the raw Property:
     * ContactDetails::resolve($property, []) with an empty override array,
     * because the page being built here does not exist yet and so carries
     * none. A field the tenant never touched arrives holding exactly that
     * effective value (the form's own `form.x ?? prefill.x ?? ''` fallback
     * chain), so comparing against anything OTHER than this same resolution
     * would freeze an untouched field into the page the moment the Property
     * and the prefill happened to differ from a raw column read.
     *
     * filled() first, same as kept() above and for the identical reason: a
     * blank string is absence to ContactDetails::resolve() (its own
     * docblock), so storing one here would be a no-op override that only
     * pollutes content.contact for no behavioural difference at all.
     */
    private function contactOverrides(array $data, Organization $org, ?int $brandId): array
    {
        $submitted = is_array($data['contact'] ?? null) ? $data['contact'] : [];

        if ($submitted === []) {
            return [];
        }

        // The probe carries no page (it does not exist yet) and so no
        // content.contact overrides of its own — exactly prefill()'s own
        // "no page yet" branch, reused rather than re-derived.
        $effective = PageContent::for($this->probePage($org, $brandId))->contact;

        $changed = [];

        foreach (['phone', 'email', 'address'] as $key) {
            $value = $submitted[$key] ?? null;

            if (!is_string($value) || trim($value) === '') {
                continue;
            }

            $trimmed = trim($value);

            if ($trimmed !== $effective->{$key}) {
                $changed[$key] = $trimmed;
            }
        }

        return $changed;
    }

    /**
     * Absent rather than empty. Every reader of these columns falls through
     * a `??` chain or a filled() test, so a key holding '' is a value that
     * suppresses the fallback the tenant would otherwise have got -- their
     * own business name in the <h1>, for one.
     */
    private function kept(array $values): array
    {
        return array_filter($values, fn ($value) => filled($value));
    }

    // ─── Context ─────────────────────────────────────────────────────────

    /**
     * The tenant this request speaks for, read from the container binding
     * TenantMiddleware sets rather than from the authenticated user.
     *
     * That binding is the same authority TenantScope itself consults, so
     * anything this class resolves through it is by construction the same
     * tenant the model scopes will admit -- there is no second opinion to
     * disagree with.
     */
    private function organization(): Organization
    {
        $orgId = app()->bound('current_organization_id') ? app('current_organization_id') : null;

        $org = $orgId ? Organization::find($orgId) : null;

        // Fail closed, exactly as TenantScope does. Unreachable behind the
        // middleware stack these routes carry; a 500 would be the wrong
        // answer if it ever became reachable.
        abort_if($org === null, 403, 'No organization context for this request.');

        return $org;
    }

    /**
     * The brand this wizard is building for.
     *
     * The resolution lives in LandingPageGuard because the builder API and
     * the section endpoint need the same answer -- see currentBrandId()
     * there for why the default-brand fallback is the load-bearing half.
     */
    private function brandId(): ?int
    {
        return LandingPageGuard::currentBrandId();
    }

    /**
     * The page belonging to that brand, or null.
     *
     * Filtered on the resolved brand, not left to BrandScope, which no-ops
     * on a null bound brand and would return ANY brand's page in the
     * organisation. Everything downstream would then describe a page this
     * wizard is not building:
     *
     *   - `completed` would go true because a SIBLING brand has a page,
     *     which is per-organisation completion -- the exact failure the
     *     crm_settings marker was rejected to avoid, arriving through the
     *     scope instead of through a settings row;
     *   - PageContent::for() would describe that sibling's page, putting
     *     its Property -- name, phone, email, address -- into the form this
     *     tenant confirms, and counting its services toward a section the
     *     new page would render empty.
     *
     * Completion, the counts, apply()'s refusal, the builder API and the
     * section endpoint therefore all resolve the brand the same way and read
     * the row through the same lookup.
     */
    private function currentPage(?int $brandId): ?LandingPage
    {
        return LandingPageGuard::pageOnBrand($brandId);
    }

    /**
     * A stand-in for the page that does not exist yet.
     *
     * PageContent::for() reads exactly three things off the page it is given
     * -- organization_id, brand_id and industry -- plus `content` for the
     * about band, and never touches its id or reads its row back. An unsaved
     * model is therefore a faithful subject, and asking PageContent about it
     * is what makes the wizard's counts the renderer's counts rather than a
     * good-faith imitation of them.
     *
     * The three values it is given are the three apply() will write, and
     * $brandId in particular is the RESOLVED brand rather than the bound one
     * -- see brandId() for why the difference is the whole ballgame.
     */
    private function probePage(Organization $org, ?int $brandId): LandingPage
    {
        return new LandingPage([
            'organization_id' => $org->id,
            'brand_id'        => $brandId,
            'industry'        => $this->newPageIndustry($org),
        ]);
    }

    /**
     * The industry a NEW page will be created under.
     *
     * One expression, read by probePage() and by apply(), because the
     * industry decides the section list: sections() lists
     * $content->profile->defaultSections, and for a tenant with no page yet
     * that profile is this industry's. If the two read the industry
     * differently, the wizard offers one set of bands and apply() seeds
     * another, and nothing downstream can tell which was meant.
     *
     * Where a page already EXISTS, PageContent reads the page's own
     * industry snapshot instead -- which is correct, because that page is
     * what the prefill is describing and what the renderer will draw. apply()
     * never runs in that case; it refuses with a 409 first. That snapshot is
     * no longer purely creation-time-and-frozen, though: Organization::booted()
     * re-writes every one of the org's pages to `resolved_industry` whenever
     * the org's own industry changes, so "the page's own snapshot" and "the
     * org's current industry" stay the same value except mid-request, between
     * the org's save() and that hook's write.
     */
    private function newPageIndustry(Organization $org): string
    {
        return $org->resolved_industry;
    }

    /**
     * The industry this page is being built for: the one the wizard's first
     * step asked about, or -- when the request carries none at all -- the
     * org's own, exactly as before this step existed.
     *
     * Normalised through the model rather than trusted as sent, so an alias
     * ('hospitality') resolves the same way here as everywhere else in the
     * platform and an unresolvable value falls through to the org's own
     * industry instead of reaching IndustryProfile::for() to be silently
     * read as 'other'. The controller has already refused anything outside
     * Organization::INDUSTRIES with a 422; this is the belt to that
     * braces, and the reason a direct API caller cannot file a page under
     * an industry the platform does not have.
     */
    private function chosenIndustry(array $data, Organization $org): string
    {
        $submitted = $data['industry'] ?? null;

        return (is_string($submitted) ? Organization::normaliseIndustry($submitted) : null)
            ?? $this->newPageIndustry($org);
    }

    /**
     * Move the ORGANISATION onto the industry the tenant just chose, so
     * that choice survives as a fact about the business rather than as one
     * page's private opinion of it.
     *
     * `organizations.industry` is the only writer this needs. Every landing
     * page's own `industry` snapshot follows from Organization::updated
     * (see that hook: "the pages following along is this hook's job"), so
     * nothing here touches landing_pages a second time -- the row this
     * request is about carries $industry directly because apply() built it
     * with the same value, and any SIBLING brand's page is resynced by the
     * hook.
     *
     * What this deliberately does NOT do is run the industry PRESETS.
     * POST /v1/auth/apply-industry (AuthController::applyIndustry) is the
     * one path that reshapes an org's CRM pipeline, lost-reason taxonomy,
     * custom fields, planner groups and loyalty ladder to a new industry,
     * and it refuses with a 409 until the admin has acknowledged a listed
     * set of consequences. Reshaping any of that as a side effect of
     * building a marketing page would be exactly the unacknowledged data
     * change that gate exists to prevent. Writing the column alone changes
     * only what the product CALLS things (vocabulary, KPI selection,
     * schema.org type, this page's own bands) and destroys nothing, which
     * is what the wizard's own copy tells the tenant it will do; the full
     * reshape stays one deliberate click away in Settings -> Industry.
     *
     * A choice equal to the org's current industry -- the overwhelmingly
     * common case, since the wizard opens pre-selected on it -- writes
     * nothing at all, so an untouched first step cannot bump updated_at or
     * fire the resync sweep over pages that are already correct. The same
     * no-op test applyIndustry() makes for the same reason.
     */
    private function syncOrganizationIndustry(Organization $org, string $industry): void
    {
        if ($org->resolved_industry === $industry) {
            return;
        }

        $org->industry = $industry;
        $org->save();
    }
}
