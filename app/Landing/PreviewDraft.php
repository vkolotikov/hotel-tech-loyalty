<?php
namespace App\Landing;

use App\Models\LandingPage;
use App\Models\LandingPageSection;
use App\Rules\ScalarLeaves;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * THE UNSAVED DRAFT, RENDERED BY THE REAL TEMPLATE.
 *
 * The editor's preview pane used to show the SAVED row and say so ("Save to
 * see the latest changes"). The tenant asked for it to follow their typing.
 *
 * The obvious way to do that -- re-render the page in the browser from the
 * form state -- is the one way this must never be built. The template is
 * Blade: eight partials, a layout, PageContent's six queries, Accent's
 * contrast floor, Palette's tokens, SectionType::bandClass()'s authored
 * fallbacks. A JavaScript reimplementation would be a SECOND copy of the
 * whole design, and the moment the two disagree the preview is lying about
 * what publishing will produce -- which is the defect class this feature has
 * paid for most.
 *
 * So the unsaved state takes a round trip instead: the editor POSTs it, this
 * class validates it with the write path's own rules, parks it in the cache
 * under an unguessable key, and the landing host's existing preview route
 * renders the REAL template from it. One renderer, one design, no second
 * implementation to drift.
 *
 * WHAT THIS CLASS IS NOT: a writer. Nothing here touches the database. The
 * hydrated {@see LandingPage} it hands back is a plain, never-saved model
 * carrying the stored row's columns with the draft's `theme`/`content`
 * substituted and its `sections` relation PRE-SET, so the renderer's
 * `$page->sections` cannot fall through to a query and no code path below it
 * has anything to write to.
 */
final class PreviewDraft
{
    /**
     * How long a stashed draft stays renderable.
     *
     * NINETY SECONDS, and the number is chosen against how the stash is
     * actually consumed rather than rounded to something comfortable. The
     * editor mints a key and points the iframe at it in the same tick, so
     * the ONLY legitimate reader is one frame load a few hundred
     * milliseconds later; every subsequent edit mints a fresh key and the
     * previous one is simply abandoned. What the TTL therefore has to cover
     * is not editing time but the gap between minting and painting: a slow
     * first render, a tab the browser reloads from its own cache a moment
     * later, a tenant who clicks Reload immediately after typing stops.
     * Ninety seconds covers all of that several times over.
     *
     * What it must NOT do is linger. Every key is a copy of unsaved tenant
     * content sitting in a shared cache, addressable by a URL that has been
     * through a browser's address bar and its history: the shorter that
     * window, the smaller both the replay surface and the amount of the
     * tenant's own draft that is in flight at any moment. A minute is
     * enough for the paint but leaves no room for a slow tab restore; two
     * minutes buys nothing the paint needs and doubles the window. Ninety
     * is the middle, chosen deliberately.
     *
     * Cache growth is bounded by the same reasoning: one key per debounced
     * edit, each expiring in ninety seconds, so a tenant editing hard for
     * an hour holds a few dozen entries at a time rather than an hour's
     * worth.
     */
    public const TTL_SECONDS = 90;

    /**
     * Namespaced so a stash key can never collide with -- or be mistaken
     * for -- anything else in the shared cache.
     */
    private const CACHE_PREFIX = 'landing.preview-draft:';

    /** 48 alphanumeric characters of Str::random (CSPRNG-backed). */
    private const KEY_LENGTH = 48;

    /**
     * The shape a key is allowed to have, checked BEFORE it is concatenated
     * into a cache key.
     *
     * This is not belt-and-braces on the randomness; it is the wall between
     * an attacker-supplied query string and the cache's own key namespace.
     * {@see hydrate()} receives whatever the URL carried, and a value like
     * `../` or a name from some other subsystem must not be able to address
     * an entry this feature never wrote. Alphanumeric, exactly the length
     * we mint, or it is not a key at all.
     */
    private const KEY_PATTERN = '/^[A-Za-z0-9]{48}$/';

    /**
     * The request rules, which are the WRITE PATH'S rules and nothing
     * looser.
     *
     * This endpoint renders arbitrary tenant-supplied content through the
     * same Blade templates a live public page uses, so every guard that
     * protects that path has to protect this one -- `ScalarLeaves` at the
     * depth each column legitimately nests to (an array leaf is a TypeError
     * in `e()` and in `Accent::for()`, i.e. a 500, not a cosmetic problem;
     * see {@see \App\Support\ScalarTree}), and the section rows' own
     * `key`/`enabled`/`sort`/`tone` rules copied FROM
     * {@see \App\Http\Controllers\Api\V1\Admin\LandingPageSectionController::update()}
     * rather than re-imagined, down to `Rule::in(SectionType::toneIds())`
     * being the one tone allowlist.
     *
     * `theme`'s allowlist is NOT here: it is {@see ThemeRules::validate()},
     * called from {@see theme()} below as its own Validator instance, for
     * exactly the reason that method's docblock gives (dotted sibling rules
     * would trip `Validator::$excludeUnvalidatedArrayKeys`).
     *
     * `sections` is capped at the same page cap the create verb enforces so
     * a caller cannot post ten thousand rows at a renderer.
     */
    public static function rules(): array
    {
        return [
            'theme'   => ['sometimes', 'array', new ScalarLeaves(depth: 1)],
            'content' => ['sometimes', 'array', new ScalarLeaves(depth: 2)],

            'sections'           => ['sometimes', 'array', 'max:' . SectionType::MAX_SECTIONS_PER_PAGE],
            'sections.*.key'     => 'required|string|max:64',
            'sections.*.enabled' => 'required|boolean',
            'sections.*.sort'    => 'required|integer|min:0|max:999',
            'sections.*.tone'    => ['sometimes', 'nullable', 'string', Rule::in(SectionType::toneIds())],
        ];
    }

    /**
     * Character for character the section endpoint's own messages, for the
     * same house reason (spec 9): Laravel's defaults here name raw indexed
     * field paths a tenant never sees a form for.
     */
    public static function messages(): array
    {
        return [
            'sections.*.tone.string' => 'Please choose one of the colours offered for this section.',
            'sections.*.tone.in'     => 'Please choose one of the colours offered for this section.',
        ];
    }

    /**
     * Park one validated draft and hand back the key that names it.
     *
     * $data is what `$request->validate(self::rules(), self::messages())`
     * returned; the checks that cannot be expressed as rules -- the theme
     * allowlist, the image single-writer refusal, the section-key grammar
     * -- run here so there is one place that knows what a draft is.
     */
    public static function stash(LandingPage $page, array $data): string
    {
        $payload = [
            'page_id'         => $page->id,
            // The tenant boundary, written into the entry itself. See
            // hydrate(): a key is only honoured against the page AND the
            // organisation it was minted for, so a key that leaked can only
            // ever re-render the draft it already belonged to.
            'organization_id' => $page->organization_id,
            'theme'           => self::theme($page, $data['theme'] ?? null),
            'content'         => self::content($page, $data['content'] ?? null),
            'sections'        => self::sections($page, $data['sections'] ?? null),
        ];

        $key = Str::random(self::KEY_LENGTH);

        Cache::put(self::CACHE_PREFIX . $key, $payload, self::TTL_SECONDS);

        return $key;
    }

    /**
     * The page the renderer should draw, or NULL when this key names no
     * draft we are willing to render -- expired, never existed, malformed,
     * or minted for a different page or a different tenant.
     *
     * Null rather than an abort, deliberately, and the caller turns it into
     * a render of the SAVED row. A tenant whose ninety seconds elapsed while
     * the tab was in the background must get their page back, not a 403
     * error page inside the editor's own pane; and an attacker who guessed
     * at a key learns nothing from a fallback that renders the page their
     * signed URL already entitled them to see.
     */
    public static function hydrate(LandingPage $stored, mixed $key): ?LandingPage
    {
        if (!is_string($key) || preg_match(self::KEY_PATTERN, $key) !== 1) {
            return null;
        }

        $draft = Cache::get(self::CACHE_PREFIX . $key);

        if (!is_array($draft)) {
            return null;
        }

        // THE CROSS-TENANT REFUSAL. The preview URL is signed, so a caller
        // can only ever address a page they were handed a signature for --
        // but a tenant can mint a signature for their OWN page and hang
        // somebody else's stash key off it, and the signature would be
        // perfectly valid. The entry's own page id and organisation are
        // what make that go nowhere: a mismatch is treated exactly like an
        // expired key, so the response is that caller's own saved page and
        // never one byte of the other tenant's draft.
        if (($draft['page_id'] ?? null) !== $stored->id
            || ($draft['organization_id'] ?? null) !== $stored->organization_id) {
            // Logged because it cannot happen by accident: the editor only
            // ever pairs a key with the page it minted it for.
            Log::warning('landing.preview_draft.scope_mismatch', [
                'requested_page_id' => $stored->id,
                'draft_page_id'     => $draft['page_id'] ?? null,
            ]);

            return null;
        }

        // A plain, never-saved model. `new LandingPage()` leaves `exists`
        // false, so even a stray save() somewhere below could only attempt
        // an INSERT that the slug's unique index would refuse outright --
        // it could never quietly UPDATE the tenant's real row. Nothing on
        // the render path writes; this is what makes that structural rather
        // than a promise.
        $page = new LandingPage();
        $page->setRawAttributes($stored->getAttributes());

        $page->theme   = is_array($draft['theme'] ?? null) ? $draft['theme'] : [];
        $page->content = is_array($draft['content'] ?? null) ? $draft['content'] : [];

        // PRE-SET, not merely eager-loaded: with the relation already on the
        // model, `$page->sections` in the renderer and in the layout answers
        // from memory and never issues a query -- which matters twice over,
        // because this model's key names a REAL row whose real sections
        // would otherwise come back and quietly overwrite the draft's
        // ordering with the stored one.
        $page->setRelation('sections', self::sectionModels($stored, $draft['sections'] ?? []));

        return $page;
    }

    /**
     * The draft's `theme`, with every allowlisted key the payload omitted
     * carried forward from what is stored.
     *
     * Both halves mirror `LandingPageController::update()` exactly: the
     * allowlist refusal is {@see ThemeRules::validate()} (the same 422 a
     * save would give), and the carry-forward is that method's own, so a
     * preview cannot show a page a save of the same payload would not
     * produce.
     */
    private static function theme(LandingPage $page, mixed $submitted): array
    {
        $stored = is_array($page->theme) ? $page->theme : [];

        if (!is_array($submitted)) {
            return $stored;
        }

        ThemeRules::validate($submitted);

        foreach (ThemeRules::keys() as $key) {
            if (!array_key_exists($key, $submitted) && array_key_exists($key, $stored)) {
                $submitted[$key] = $stored[$key];
            }
        }

        return $submitted;
    }

    /**
     * The draft's `content` -- WITH THE STORED PHOTOS, NEVER THE PAYLOAD'S.
     *
     * `content.<slot>.image_url` has exactly one writer, the image
     * endpoints (D4), and a preview must not become a second door into that
     * leaf even though it writes nothing: a preview that showed a photo the
     * save path would refuse is a preview that lies, and one that let a
     * caller name an arbitrary URL would render an attacker-chosen `src`
     * inside the tenant's own frame. So this performs update()'s pair of
     * moves unchanged -- refuse the leaf outright, then carry the STORED
     * value forward for every section type the catalogue says holds a photo
     * -- and the photo a tenant just uploaded appears in the live preview
     * because the row already has it, not because the editor sent it.
     */
    private static function content(LandingPage $page, mixed $submitted): array
    {
        $stored = is_array($page->content) ? $page->content : [];

        if (!is_array($submitted)) {
            return $stored;
        }

        foreach ($submitted as $fields) {
            if (!is_array($fields)) {
                continue;
            }

            foreach (array_keys($fields) as $field) {
                if (SectionType::isImageField((string) $field)) {
                    // update()'s own words, and its own silence about which
                    // field path was at fault.
                    throw ValidationException::withMessages([
                        'content' => 'Photos are changed with the photo controls, not by editing text.',
                    ]);
                }
            }
        }

        foreach ($stored as $sectionKey => $storedFields) {
            if (!is_array($storedFields)) {
                continue;
            }

            // update()'s own loop, leaf for leaf — see its comment for why
            // the carry-forward asks the catalogue WHICH leaves rather than
            // taking the refusal's wider `image_*` family. A gallery's eight
            // pictures reach the live preview exactly as hero's one does:
            // from the STORED row, never from the payload the editor sent.
            foreach (SectionType::imageLeaves((string) $sectionKey) as $leaf) {
                if (!isset($storedFields[$leaf]) || !is_string($storedFields[$leaf])) {
                    continue;
                }

                if (!isset($submitted[$sectionKey]) || !is_array($submitted[$sectionKey])) {
                    $submitted[$sectionKey] = [];
                }

                if (!array_key_exists($leaf, $submitted[$sectionKey])) {
                    $submitted[$sectionKey][$leaf] = $storedFields[$leaf];
                }
            }
        }

        return $submitted;
    }

    /**
     * The page's section rows with the editor's unsaved order, toggles and
     * colours applied on top.
     *
     * STARTS FROM THE STORED ROWS, exactly as `PUT /sections` does: that
     * endpoint updates the rows it is NAMED and leaves every other row
     * alone, so a preview built any other way (from the payload alone)
     * would silently drop a band the editor happened not to mention and
     * show the tenant a page their save would never produce.
     *
     * A key the page does not own is refused with the section endpoint's
     * own sentence rather than ignored -- again because the save would
     * refuse it, and a preview that quietly accepted more than the save
     * does is a preview that lies. `SectionType::typeOf()` is asked first
     * so a key that is not a section key AT ALL (`text_9`, `../etc`) is
     * refused on the grammar rather than on the page's happening not to
     * hold it.
     *
     * @return list<array{key: string, enabled: bool, sort: int, tone: ?string}>
     */
    private static function sections(LandingPage $page, mixed $submitted): array
    {
        $rows = [];

        foreach ($page->sections as $section) {
            $rows[$section->key] = [
                'key'     => (string) $section->key,
                'enabled' => (bool) $section->enabled,
                'sort'    => (int) $section->sort,
                'tone'    => $section->tone,
            ];
        }

        foreach (is_array($submitted) ? $submitted : [] as $row) {
            $key = (string) ($row['key'] ?? '');

            if (SectionType::typeOf($key) === null || !isset($rows[$key])) {
                throw ValidationException::withMessages([
                    'sections' => "This page has no section called '{$key}'.",
                ]);
            }

            $rows[$key]['enabled'] = (bool) $row['enabled'];
            $rows[$key]['sort']    = (int) $row['sort'];

            // PRESENT-KEY TEST, not `?? null` -- the section endpoint's own
            // contract, for its own reason: an absent `tone` means "this
            // caller does not deal in colours, leave the stored one alone",
            // while an explicit null means "put this band back to the
            // colour its partial was authored with".
            if (array_key_exists('tone', $row)) {
                $rows[$key]['tone'] = $row['tone'];
            }
        }

        return array_values($rows);
    }

    /**
     * The stashed rows as never-saved {@see LandingPageSection} models, in
     * the order `LandingPage::sections()`'s own `orderBy('sort')` would have
     * produced.
     *
     * PHP's sorts have been stable since 8.0, so rows sharing a `sort` keep
     * the order they were stashed in -- which is the stored row order, i.e.
     * the same tie-break the tenant is already looking at.
     */
    private static function sectionModels(LandingPage $stored, mixed $rows): Collection
    {
        return collect(is_array($rows) ? $rows : [])
            ->filter(fn ($row) => is_array($row) && isset($row['key']))
            ->map(fn (array $row) => new LandingPageSection([
                'landing_page_id' => $stored->id,
                'key'             => (string) $row['key'],
                'enabled'         => (bool) ($row['enabled'] ?? true),
                'sort'            => (int) ($row['sort'] ?? 0),
                'tone'            => is_string($row['tone'] ?? null) ? $row['tone'] : null,
            ]))
            ->sortBy('sort')
            ->values();
    }
}
