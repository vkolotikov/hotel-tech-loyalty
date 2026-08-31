<?php
namespace App\Landing;

/**
 * What a section IS — the one catalogue of section types the whole builder
 * reads.
 *
 * Before this class existed, "what is a section" was answered by whoever
 * happened to be asking:
 *
 *   - the renderer asked `view()->exists('landing.ruled_page.sections.' .
 *     $section->key)` — a KEY→VIEW lookup, which is fine while every page
 *     has exactly one band of each kind and stops being fine the moment a
 *     page can carry two of them (`text_1` names no partial);
 *   - {@see PageContent::count()} matched on a fixed list of keys;
 *   - {@see \App\Http\Controllers\Api\V1\Admin\LandingPageSectionController}
 *     asked the PAGE which keys it already owned, because it could only
 *     ever reorder;
 *   - the image endpoints spelled their slots as a literal `in:hero,about`.
 *
 * Four answers to one question, which is three too many: a fifth type could
 * be added to any one of them and silently miss the rest. Everything that
 * needs to know what a section is now reads THIS, and nothing else holds a
 * second list.
 *
 * Authored in the house shape {@see IndustryProfile} and {@see Palette}
 * already use — an id-keyed array of plain data, a private constructor, and
 * resolvers that take an UNTRUSTED string and hand back either a value
 * object or null. Callers never index `all()` by hand.
 *
 * What is deliberately NOT here:
 *
 *   - which sections a NEW page in a given industry is created with. That is
 *     {@see IndustryProfile::$defaultSections} and it is a different
 *     question (an editorial choice per industry, not a fact about the type)
 *     — SectionTypeTest asserts every key those lists name is a type this
 *     catalogue knows, which binds the two without copying either into the
 *     other.
 *   - the tenant-facing LABEL and the "where does this content come from"
 *     sentence. Those live in LandingOnboardingService::SECTION_COPY, which
 *     is wizard copy rather than structure.
 */
final class SectionType
{
    /**
     * How many instances of one repeatable type a single page may carry.
     *
     * This is not only a create-time refusal: it BOUNDS THE KEY GRAMMAR
     * ({@see typeOf()}), so `text_7` is not a section key at all — it names
     * no view, `count()` reports nothing for it, and the image endpoint
     * refuses it as a slot. That matters because the image slot rule is
     * derived from this class: an unbounded grammar would let a caller
     * upload a file against `text_999999` forever, each one stored in
     * `content` and pointed at by nothing.
     */
    public const MAX_INSTANCES_PER_TYPE = 6;

    /**
     * How many section rows one page may carry in total, fixed and
     * repeatable together.
     *
     * The longest shipped `defaultSections` list is seven, so this leaves
     * room for nine added bands on the busiest industry — comfortably more
     * than a marketing page should have, and low enough that a runaway
     * client cannot turn one page into an unbounded row count. Checked
     * inside the create transaction, against the row-locked page, so two
     * simultaneous adds cannot both see fifteen.
     */
    public const MAX_SECTIONS_PER_PAGE = 16;

    /**
     * The template whose partials {@see viewFor()} resolves against unless a
     * caller names another one.
     *
     * It used to be the only one, spelled into a `landing.ruled_page.
     * sections.` prefix constant. `nocturne_ritual` (the first of the
     * BeautyTech kits) is a SECOND template rendering the SAME catalogue
     * through its own partials, so the prefix became a function of the
     * template rather than a fact about this class. Defaulted here so every
     * existing caller — the ruled_page layout, the endpoints, the tests —
     * keeps resolving exactly what it resolved before.
     */
    public const DEFAULT_TEMPLATE = 'ruled_page';

    /**
     * Every template that ships partials under resources/views/landing/
     * {key}/sections/, in the order they were built.
     *
     * NOT a second copy of {@see \App\Services\Landing\LandingOnboardingService::TEMPLATES}
     * — that is the tenant-facing registry (which templates a page may be
     * SET to, with the words the picker prints). This is the narrower fact
     * that a type-to-partial question has more than one answer now, and it
     * exists so SectionTypeTest can ask "does this type render ANYWHERE"
     * rather than assuming ruled_page. A type is legitimately renderable by
     * one template and not the other: `announcement`, `trust` and `faq` are
     * the nocturne kit's blocks and ruled_page has no partial for any of
     * them, which the renderer already handles by skipping the band (see
     * the layout's $renderedSections filter — "a section key with no partial
     * is skipped rather than fatal").
     *
     * @var list<string>
     */
    public const TEMPLATES_WITH_PARTIALS = ['ruled_page', 'nocturne_ritual'];

    /**
     * How many question/answer pairs one FAQ band may carry.
     *
     * A cap for the same reason {@see MAX_INSTANCES_PER_TYPE} is one: the
     * pairs are SCALAR LEAVES under `content.faq` (`q1`/`a1` … `q6`/`a6`),
     * because the column is validated `ScalarLeaves(depth: 2)` and a nested
     * `faqs: [...]` array is not a legal value in it at all. Bounded, the
     * leaf names are an enumerated list ({@see faqLeaves()}) that the
     * editor's form, the renderer and any future validator can all be built
     * from; unbounded, `content.faq.q9999` would be a leaf nothing reads and
     * nothing can remove.
     *
     * SIX because the kit's own FAQ block ships five and reads as a
     * considered list at that length: past half a dozen "a few useful
     * things" has become a support site, which is a different page.
     */
    public const MAX_FAQ_PAIRS = 6;

    /**
     * The leaf a SINGLE-photo section stores its picture under, and the one
     * spelling every page written before galleries existed carries.
     *
     * Named rather than repeated because it is now one of TWO shapes (see
     * {@see imageLeaves()}), and the whole point of naming it is that the
     * old one did not move: hero/about/text_N still store
     * `content.<key>.image_url`, byte for byte, and the goldens that pin
     * their markup never had to be recaptured.
     */
    public const SINGLE_IMAGE_LEAF = 'image_url';

    /**
     * The separator between a section key and an image leaf inside one
     * `slot` string — see {@see imageSlot()} for the grammar it belongs to.
     *
     * A DOT, because the slot then reads as the content path it names:
     * `gallery_1.image_3` is literally `content.gallery_1.image_3` with the
     * column's own name taken off the front. It also cannot collide with a
     * section key: {@see typeOf()}'s grammar is `[a-z][a-z0-9_]*(_[1-9][0-9]*)?`
     * and has no dot in it, so a single-photo slot and a multi-photo one can
     * never be mistaken for each other however either is spelled.
     */
    private const SLOT_SEPARATOR = '.';

    /**
     * THE TONE ALLOWLIST — every colour a tenant may put a band on, and the
     * band modifier class each one renders as.
     *
     * ONE list, here, next to the types it applies to. The endpoint
     * validates against it, the renderer resolves through it and the editor
     * is served it; nothing anywhere holds a second copy, for the same
     * reason this class exists at all (see the header docblock's four
     * answers to one question).
     *
     * PALETTE-DERIVED PRESETS, NEVER FREE HEX. Every value below is a
     * surface the ACTIVE palette already authors, so the choice is legible
     * in all six palettes and both schemes without anyone checking: a
     * tenant cannot pick a colour that makes their own text unreadable,
     * and a page cannot end up as eight unrelated bands. That is the same
     * ruling `theme.palette` is built on (D2, "palettes are data") applied
     * one level down.
     *
     * The ids are named for the tenant, not for the CSS — `soft`, not
     * `paper-2` — because they are what the editor's swatch row is keyed
     * on and what a hand-edited draft would carry.
     *
     * WHY THREE AND NOT FOUR. The obvious fourth ("a deep band",
     * `band--ink`) is not a fourth colour: D1's tonal ruling collapsed
     * ink and paper-2 onto the SAME surface (`--bg-2`; see
     * public/landing/ruled_page.css's "Surface rhythm" block, where both
     * classes carry the identical declaration). Offering both would put
     * two swatches in the picker that paint the same pixels — a choice
     * that changes nothing, which is worse than no choice at all.
     * `band--ink` survives as an AUTHORED DEFAULT (contact/reviews still
     * emit it, byte for byte) and answers the `soft` swatch through
     * {@see CLASS_TONES}; it is simply not something a tenant can newly
     * select.
     *
     * @var array<string, string> tone id => band modifier class ('' = the page's own surface)
     */
    public const TONES = [
        // The page's own background — the plain `.band`, no modifier. What
        // hero, services and team have always rendered as.
        'page'   => '',
        // The tinted band, `--bg-2`. About/booking/text's authored surface.
        'soft'   => 'band--paper-2',
        // Accent-tinted: `--halo` (the palette's own accent-bright at .30)
        // composited over `--bg-2`. New in this round — see the stylesheet's
        // `.band--accent` rule, and PaletteTest's contrast floor for it,
        // which measures the composite against `--text`/`--text-soft` in all
        // six palettes rather than trusting that an accent tint is bound to
        // be readable.
        'accent' => 'band--accent',
    ];

    /**
     * The reverse question, and a DIFFERENT one: given the class a section
     * is authored with, which tone swatch is it already showing?
     *
     * The editor needs this and the renderer never does. A section with no
     * stored tone still sits on a colour, and a picker that shows nothing
     * selected for it would invite the tenant to "choose" the shade the
     * band is already painted.
     *
     * `band--ink` maps to `soft` because the two ARE the same surface
     * today (see TONES' own note) — the honest answer to "what colour is
     * the contact band" is "the tinted one", even though the bytes it
     * emits say `band--ink`.
     *
     * @var array<string, string> band modifier class => tone id
     */
    private const CLASS_TONES = [
        ''              => 'page',
        'band--paper-2' => 'soft',
        'band--ink'     => 'soft',
        'band--accent'  => 'accent',
    ];

    private function __construct(
        /** The type id — also the section KEY for every non-repeatable type. */
        public readonly string $id,
        /**
         * Whether a page may carry more than one of these. A repeatable type
         * has NO bare key: `text` alone is not a section, `text_1` is.
         */
        public readonly bool $repeatable,
        /**
         * The partial that renders it, WITHOUT the directory prefix. The
         * renderer resolves this through {@see viewFor()} rather than off
         * the key, which is the whole reason a repeatable type can exist:
         * every `text_N` on a page renders through one `text` partial.
         */
        public readonly string $view,
        /**
         * The fields a tenant may edit under `content.<key>`, in the order
         * an editor should offer them.
         *
         * Descriptive of what the partial actually reads, not enforced:
         * `content` is validated for SHAPE (ScalarLeaves depth 2) and the
         * renderer simply ignores a leaf no partial reads. Listing them here
         * is what lets the editor build its form from the catalogue instead
         * of hard-coding a second copy of every partial's `$copy[...]`
         * reads.
         *
         * `image_url` is never in this list on purpose: it has exactly one
         * writer (the image endpoints) and is refused everywhere else — see
         * $image below and LandingPageController::update()'s D4 comment.
         *
         * @var list<string>
         */
        public readonly array $fields,
        /**
         * The band modifier class this type's partial was AUTHORED with —
         * `band--paper-2` for about, `band--ink` for contact, `''` for hero.
         *
         * Transcribed from the partials, which used to be the only place it
         * was written down (eight `class="band band--x rp-y"` literals). It
         * lives here now because a section's surface became a question with
         * TWO answers — the tenant's stored `tone` when they set one, this
         * when they did not — and a fallback expressed in eight blades is a
         * fallback that drifts. {@see bandClass()} is the one place the two
         * are reconciled, and RuledPageSectionsTest pins the exact class
         * each key renders with a null tone.
         *
         * Not a tone id: `band--ink` is not one (see TONES), and turning
         * contact's authored default into `soft` would change the bytes
         * every existing page renders — which is the one thing this whole
         * feature must not do.
         */
        public readonly string $band,
        /**
         * HOW MANY photos one instance of this type carries — 0 for a band
         * with no plate, 1 for the single-plate bands (hero, about, text),
         * and 8 for the gallery.
         *
         * This is the ONLY definition of the image slot allowlist. The
         * endpoints' old `in:hero,about` literal was a second copy of it,
         * and the `bool $image` that replaced that literal was a second
         * copy of the ANSWER once "how many" stopped being "one".
         *
         * A COUNT rather than a bool because the count is what has to stay
         * finite: {@see imageLeaves()} turns it into an enumerated list of
         * leaf names, {@see imageKeys()} turns THAT into the endpoints'
         * whole `Rule::in` allowlist, and update()'s carry-forward walks the
         * same list. Raise this number and every one of those follows;
         * nothing anywhere holds a second opinion about how many photos a
         * gallery holds.
         */
        public readonly int $images,
        /**
         * Whether this type carries a photo plate AT ALL — `images > 0`,
         * derived rather than authored so the two can never disagree.
         *
         * Kept because "does this band have a picture in it" is a question
         * several callers ask and none of them want the count for.
         */
        public readonly bool $image,
    ) {}

    /**
     * The authored catalogue.
     *
     * The eight fixed types are transcribed from what the shipped partials
     * already do — `fields` is each partial's own `$copy[...]` reads and
     * `images` is how many photos it reads through PageContent. Nothing
     * about them changes by being written down here; SectionTypeTest pins
     * the `fields`/`images` pairs against the partials so a future edit to a
     * partial cannot quietly diverge from this table.
     *
     * `text` is the repeatable band this catalogue was first built for: an
     * eyebrow, a heading, body copy and an optional photo, which is the
     * shape of every "and another thing" section a marketing page ever
     * needs.
     *
     * `gallery` is the second, and the first type to hold MORE THAN ONE
     * photo — a caption and a grid of up to eight pictures. It is the reason
     * `image` became `images`: everything downstream of this table (the
     * endpoints' slot allowlist, update()'s carry-forward, the delete
     * verb's file sweep, the editor's strip) is derived from the number,
     * so a gallery of ten would be one edit here and nothing else.
     *
     * `band` is likewise transcribed rather than invented: it is the exact
     * modifier class each partial's own `<section class="band …">` already
     * carried before the tone round, and RuledPageSectionsTest asserts the
     * rendered class per key so the table and the partials cannot diverge.
     *
     * @return array<string, array{repeatable: bool, view: string, fields: list<string>, band: string, images: int}>
     */
    public static function all(): array
    {
        return [
            // The opening. `image` because hero.blade.php renders the photo
            // composition when content.hero.image_url resolves, and the
            // monogram device when it does not.
            'hero' => [
                'repeatable' => false,
                'view'       => 'hero',
                'fields'     => ['kicker', 'headline', 'subtext'],
                'band'       => '',
                'images'     => 1,
            ],
            // The price list. Its ROWS come from the Services screen, not
            // from `content` — only the band's own framing copy is editable.
            'services' => [
                'repeatable' => false,
                'view'       => 'services',
                'fields'     => ['kicker', 'heading', 'subtext'],
                'band'       => '',
                'images'     => 0,
            ],
            'about' => [
                'repeatable' => false,
                'view'       => 'about',
                'fields'     => ['kicker', 'lead', 'body'],
                'band'       => 'band--paper-2',
                'images'     => 1,
            ],
            'team' => [
                'repeatable' => false,
                'view'       => 'team',
                'fields'     => ['kicker', 'heading', 'subtext'],
                'band'       => '',
                'images'     => 0,
            ],
            'reviews' => [
                'repeatable' => false,
                'view'       => 'reviews',
                'fields'     => ['kicker'],
                'band'       => 'band--ink',
                'images'     => 0,
            ],
            'booking' => [
                'repeatable' => false,
                'view'       => 'booking',
                'fields'     => ['kicker', 'heading', 'terms', 'call_label', 'call_short'],
                'band'       => 'band--paper-2',
                'images'     => 0,
            ],
            // phone/email/address are the three fields ContactDetails lets a
            // page override per-page (see its docblock); the rest of the
            // contact facts pass through the Property untouched and are not
            // page content at all.
            'contact' => [
                'repeatable' => false,
                'view'       => 'contact',
                'fields'     => [
                    'kicker', 'phone', 'email', 'address',
                    'phone_label', 'email_label', 'address_label', 'map_label', 'closed_label',
                ],
                'band'       => 'band--ink',
                'images'     => 0,
            ],
            // Rendered outside the section loop (the layout includes it
            // unconditionally) and listed here anyway: it IS a section type,
            // and the wizard already names it. It has no editable copy — the
            // footer reads the business's own details.
            'footer' => [
                'repeatable' => false,
                'view'       => 'footer',
                'fields'     => [],
                'band'       => '',
                'images'     => 0,
            ],
            // The repeatable band this catalogue was built for.
            'text' => [
                'repeatable' => true,
                'view'       => 'text',
                'fields'     => ['kicker', 'heading', 'body'],
                'band'       => 'band--paper-2',
                'images'     => 1,
            ],
            // The picture grid. EIGHT, and the number is a judgement rather
            // than a round one: a contact sheet reads as a considered
            // selection at four to eight and as an unsorted camera roll
            // past that, and eight tiles exactly into the two column counts
            // the stylesheet uses (four across on a wide screen, two on a
            // phone) so the last row is never a single orphan.
            //
            // Its `fields` are an eyebrow and a heading and nothing else:
            // the pictures ARE the content here, and `count()` reads them
            // rather than any copy — a gallery with words and no photos is
            // not a section, so it does not render.
            'gallery' => [
                'repeatable' => true,
                'view'       => 'gallery',
                'fields'     => ['kicker', 'heading'],
                'band'       => '',
                'images'     => 8,
            ],
            // ─── The BeautyTech kits' three additional blocks ─────────────
            //
            // Added with `nocturne_ritual`, the first kit converted into a
            // template. The kits share ONE block contract (see
            // resources/landing-kits/beauty-tech/README.md), so these three
            // are the shapes all three of them need and our model had no
            // answer for; the other twelve map straight onto types that
            // already existed.
            //
            // ruled_page ships no partial for any of them, deliberately.
            // These are the kits' composition, not a change to the Ruled
            // Page's, and the renderer already treats a type with no partial
            // as a band to skip rather than an error (see viewFor()'s note).
            // A tenant who switches templates therefore gains or loses them
            // with the design that authors them, and their stored copy is
            // waiting untouched if they switch back.

            // The offer bar above the header. `text` is the whole band —
            // count() reads it and nothing else, so an announcement with a
            // link label and no message is not a section (the same ruling
            // `text` and `gallery` already carry, pointed at whichever half
            // is the reason the band exists).
            'announcement' => [
                'repeatable' => false,
                'view'       => 'announcement',
                'fields'     => ['text', 'cta_label'],
                'band'       => '',
                'images'     => 0,
            ],
            // The trust strip under the hero: a line somebody said about the
            // business, the rating the reviews already publish, and up to
            // three short highlights. THREE numbered fields rather than one
            // comma-separated leaf, because splitting a tenant string on a
            // separator makes the separator unusable inside the values —
            // "Open late, seven days" would become two highlights.
            'trust' => [
                'repeatable' => false,
                'view'       => 'trust',
                'fields'     => ['quote', 'feature_1', 'feature_2', 'feature_3'],
                'band'       => '',
                'images'     => 0,
            ],
            // The questions band. Its pairs are flat scalar leaves —
            // q1/a1 … q6/a6, capped by MAX_FAQ_PAIRS — because `content` is
            // ScalarLeaves(depth: 2) and a nested list is not a legal value
            // in that column; see faqLeaves(), which is the only enumeration
            // of them and what `fields` below is BUILT from rather than
            // repeating.
            'faq' => [
                'repeatable' => false,
                'view'       => 'faq',
                'fields'     => array_merge(['kicker', 'heading', 'subtext'], self::faqLeaves()),
                'band'       => '',
                'images'     => 0,
            ],
        ];
    }

    /**
     * THE FAQ LEAF GRAMMAR — every leaf under `content.faq` that holds one
     * half of a question/answer pair, in render order.
     *
     * The same shape, and for the same reason, as {@see imageLeaves()}'s
     * multi-photo case: a bounded, enumerated list of SCALAR leaf names, so
     * that "what renders" and "what an editor may write" are one finite list
     * rather than two that agree today. Pairs are interleaved (q1, a1, q2,
     * a2, …) because that is the order a form should offer them in, and
     * `fields` above is this list verbatim.
     *
     * @return list<string>
     */
    public static function faqLeaves(): array
    {
        $leaves = [];

        for ($n = 1; $n <= self::MAX_FAQ_PAIRS; $n++) {
            $leaves[] = 'q' . $n;
            $leaves[] = 'a' . $n;
        }

        return $leaves;
    }

    /** @return list<string> */
    public static function ids(): array
    {
        return array_keys(self::all());
    }

    /**
     * The types a tenant may ADD to a page — the create endpoint's own
     * allowlist. Fixed types are seeded when the page is created and can be
     * switched off, never added and never removed.
     *
     * @return list<string>
     */
    public static function repeatableIds(): array
    {
        return array_values(array_keys(array_filter(
            self::all(),
            static fn (array $type) => $type['repeatable'],
        )));
    }

    /**
     * Every key the grammar admits, fixed ids and repeatable instances
     * together — the enumeration {@see imageKeys()} filters and the one
     * place the "1..MAX_INSTANCES_PER_TYPE" loop is written.
     *
     * @return list<string>
     */
    private static function allKeys(): array
    {
        $keys = [];

        foreach (self::all() as $id => $type) {
            if (!$type['repeatable']) {
                $keys[] = $id;

                continue;
            }

            for ($n = 1; $n <= self::MAX_INSTANCES_PER_TYPE; $n++) {
                $keys[] = $id . '_' . $n;
            }
        }

        return $keys;
    }

    /**
     * THE IMAGE LEAF GRAMMAR — which leaves under `content.<key>` a photo
     * may be stored in, for one section key, in RENDER ORDER.
     *
     * Two shapes, and only two:
     *
     *   - a SINGLE-photo type stores its picture at `image_url`, exactly
     *     where hero, about and every `text_N` have always stored it. This
     *     did not move, and that is the point: no stored row was rewritten,
     *     no golden was recaptured, and `content.hero.image_url` still means
     *     what it meant.
     *   - a MULTI-photo type stores its pictures at `image_1` … `image_<n>`,
     *     n bounded by the type's own `images` count. SCALAR LEAVES, one per
     *     picture — never a nested `images: [...]` array, because `content`
     *     is validated `ScalarLeaves(depth: 2)` and a nested array is not a
     *     legal value in that column at all. `content.gallery_1.image_3` is;
     *     `content.gallery_1.images[2]` is not, and could not be made to be
     *     without loosening the shape rule that keeps an array leaf out of
     *     `e()` and `Accent::for()`.
     *
     * Returns [] for a key that names no type, and for a type with no
     * photos — so a caller can loop this unconditionally and get the right
     * answer for services, for a junk key from a raw write, and for a
     * gallery, without asking three different questions first.
     *
     * @return list<string>
     */
    public static function imageLeaves(string $key): array
    {
        $type = self::forKey($key);

        if ($type === null || $type->images < 1) {
            return [];
        }

        if ($type->images === 1) {
            return [self::SINGLE_IMAGE_LEAF];
        }

        $leaves = [];

        for ($n = 1; $n <= $type->images; $n++) {
            $leaves[] = 'image_' . $n;
        }

        return $leaves;
    }

    /**
     * Whether `$field` is an image leaf — the ONE test update() and the
     * preview's own validator make before they refuse a submitted
     * `content.<section>.<field>`.
     *
     * DELIBERATELY WIDER THAN {@see imageLeaves()}. That method enumerates
     * what a type legitimately holds; this one is the refusal, and a refusal
     * that only knew the legitimate names would wave `image_9` through on a
     * gallery of eight and `image_1` through on the hero — writing a leaf
     * the renderer will never read, into a column whose photo leaves are
     * supposed to have exactly one writer. `image_` is a prefix no editable
     * field in this catalogue uses or ever will (the fields are prose and
     * labels), so the whole family is refused and the single-writer rule
     * holds for shapes this build has not thought of.
     */
    public static function isImageField(string $field): bool
    {
        return str_starts_with($field, 'image_');
    }

    /**
     * THE IMAGE SLOT ALLOWLIST — every `slot` the image endpoints accept,
     * enumerated rather than described so it can be handed straight to
     * Rule::in().
     *
     * A slot names ONE PICTURE, not one section, and it is spelled two ways
     * because a section holds its pictures two ways:
     *
     *   - `hero`, `about`, `text_4` — a single-photo section names itself,
     *     exactly as it did before galleries existed. Its leaf is implied.
     *   - `gallery_2.image_5` — a multi-photo section names the picture,
     *     `<section key><separator><leaf>` (see {@see SLOT_SEPARATOR}).
     *
     * The asymmetry is deliberate and is the reason no existing caller,
     * stored row or test had to change: making every slot carry its leaf
     * would have renamed `hero` to `hero.image_url` on the wire for no gain.
     * {@see imageSlot()} is the one parser that reads either spelling.
     *
     * Finite because the key grammar is (a repeatable type contributes
     * exactly {@see MAX_INSTANCES_PER_TYPE} keys) and because `images` is a
     * count rather than an invitation. That is what stops a caller uploading
     * a file against an unbounded sequence of slots the renderer would never
     * read — today 2 fixed + 6 text + 6 × 8 gallery = 56 of them, and it is
     * a closed list at every build.
     *
     * @return list<string>
     */
    public static function imageKeys(): array
    {
        $slots = [];

        foreach (self::allKeys() as $key) {
            $leaves = self::imageLeaves($key);

            if ($leaves === []) {
                continue;
            }

            if ($leaves === [self::SINGLE_IMAGE_LEAF]) {
                $slots[] = $key;

                continue;
            }

            foreach ($leaves as $leaf) {
                $slots[] = $key . self::SLOT_SEPARATOR . $leaf;
            }
        }

        return $slots;
    }

    /**
     * Resolve an UNTRUSTED slot string into the section key and the content
     * leaf it names, or null when it names neither.
     *
     * The one parser for the grammar {@see imageKeys()} enumerates, so the
     * endpoints never split a string themselves — `$content[$key][$leaf]` is
     * the only shape either of them writes, whichever spelling arrived.
     *
     * Re-derives the leaf from the CATALOGUE rather than trusting the half
     * of the string after the separator: `gallery_1.image_9` on a gallery of
     * eight, `hero.image_url`, `gallery_1.body` and `text_1.image_1` all
     * return null here, which is the same answer Rule::in already gives them
     * — checked twice on purpose, because this is the method that decides
     * which leaf gets written and it must not be reachable with anything but
     * a leaf the type actually holds.
     *
     * @return array{key: string, leaf: string}|null
     */
    public static function imageSlot(string $slot): ?array
    {
        $parts = explode(self::SLOT_SEPARATOR, $slot);

        if (count($parts) > 2) {
            return null;
        }

        $key    = $parts[0];
        $leaves = self::imageLeaves($key);

        if ($leaves === []) {
            return null;
        }

        // The bare-key spelling: legal only for a type that holds exactly
        // one photo, so `gallery_1` alone is not a slot and cannot be made
        // to write image_1 by accident.
        if (count($parts) === 1) {
            return $leaves === [self::SINGLE_IMAGE_LEAF] ? ['key' => $key, 'leaf' => self::SINGLE_IMAGE_LEAF] : null;
        }

        // The `<key>.<leaf>` spelling: legal only for a multi-photo type,
        // and only for a leaf it actually holds.
        if ($leaves === [self::SINGLE_IMAGE_LEAF] || !in_array($parts[1], $leaves, true)) {
            return null;
        }

        return ['key' => $key, 'leaf' => $parts[1]];
    }

    /** A type by its ID (`text`), never by a section key (`text_1`). */
    public static function get(string $id): ?self
    {
        $data = self::all()[$id] ?? null;

        return $data === null ? null : new self(
            id:         $id,
            repeatable: $data['repeatable'],
            view:       $data['view'],
            fields:     $data['fields'],
            band:       $data['band'],
            images:     $data['images'],
            // Derived, never authored: `image` is "does this band have a
            // picture in it" and `images` is "how many", and one of those
            // being a restatement of the other is exactly how the two would
            // drift.
            image:      $data['images'] > 0,
        );
    }

    /** The tone ids, in the order the editor should offer them. @return list<string> */
    public static function toneIds(): array
    {
        return array_keys(self::TONES);
    }

    /**
     * THE ONE PLACE A BAND'S SURFACE IS DECIDED — the tenant's stored tone
     * when they set one, the section's authored default when they did not.
     *
     * Every section partial calls this and none of them knows what a tone
     * is; that is the point. The alternative that was NOT taken is a
     * `$section->tone === 'accent' ? … : …` ternary in each of the eight
     * `<section class="band …">` tags, which is eight places to add the
     * fourth tone to and eight places for one of them to be missed.
     *
     * A NULL TONE RENDERS EXACTLY WHAT THE PAGE RENDERED BEFORE TONES
     * EXISTED. That is not a nicety — it is what keeps every already-live
     * page, and the renderer's four byte goldens, unchanged by this
     * feature. There is deliberately no "if no tone then `soft`" anywhere:
     * the fallback is the AUTHORED class, per type, from the catalogue
     * above.
     *
     * An unrecognised tone (a hand-edited row, a value written by a build
     * that knew a tone this one has since dropped) falls through to the
     * authored default rather than rendering as an arbitrary class name —
     * the same read-time re-whitelisting `theme.palette` and
     * `theme.font_pairing` already get in the layout, and for the same
     * reason: `tone` is a plain varchar with no database constraint behind
     * it, and a value that reached the column by any route other than the
     * endpoint must not be able to put attacker-chosen text into a `class`.
     *
     * Returns the FULL class list (`band` plus the modifier, space
     * separated) rather than just the modifier, so a caller cannot forget
     * the base class — `.band` is what carries the padding, the reading
     * spine and the seam rules, and a band without it is not a band.
     */
    public static function bandClass(string $key, ?string $tone = null): string
    {
        $modifier = $tone === null ? null : (self::TONES[$tone] ?? null);

        if ($modifier === null) {
            $modifier = self::forKey($key)?->band ?? '';
        }

        return $modifier === '' ? 'band' : 'band ' . $modifier;
    }

    /**
     * Which tone the editor should show as already selected for a section
     * carrying no stored tone — the swatch equivalent of its authored
     * class. Null for a type this catalogue does not know.
     *
     * Takes a TYPE ID, like {@see get()} and unlike {@see bandClass()}: the
     * answer is a fact about the type, so every `text_N` on a page shares
     * one, and {@see payload()} — the only caller — is a per-type table.
     *
     * The renderer never asks: it needs the CLASS, and turning the class
     * into a tone and back would lose `band--ink`.
     */
    public static function defaultToneFor(string $typeId): ?string
    {
        $type = self::get($typeId);

        return $type === null ? null : (self::CLASS_TONES[$type->band] ?? null);
    }

    /**
     * THE ONE PARSER. Every "what kind of section is this key" question in
     * the codebase resolves here, so the key grammar is defined exactly
     * once.
     *
     *   - a non-repeatable type is named by its own id, exactly: `about`.
     *   - a repeatable type's instances are `<id>_<n>`, n from 1 to
     *     {@see MAX_INSTANCES_PER_TYPE}, with no leading zero — `text_1`.
     *     The bare `text` is NOT a section key, and neither is `text_0`,
     *     `text_01` or `text_7`.
     *
     * Returns null for anything else, which is what makes every caller's
     * "unknown key" path a single `null` test: the renderer skips the band,
     * count() reports nothing, the image endpoint refuses the slot, and the
     * delete endpoint refuses the key.
     */
    public static function typeOf(string $key): ?string
    {
        $all = self::all();

        if (isset($all[$key])) {
            // A repeatable type's bare id is not a key. Falling through here
            // rather than returning it is what stops a `text` row from ever
            // resolving to a view: it would render, but nothing could
            // enumerate it as an instance, and the cap could not see it.
            return $all[$key]['repeatable'] ? null : $key;
        }

        // Greedy on the id half deliberately: `text_1_2` resolves its id to
        // `text_1`, which is not a type, rather than to `text` with a
        // trailing `_2` quietly ignored.
        if (preg_match('/^([a-z][a-z0-9_]*)_([1-9][0-9]*)$/', $key, $m) !== 1) {
            return null;
        }

        [, $id, $index] = $m;

        if (!isset($all[$id]) || !$all[$id]['repeatable']) {
            return null;
        }

        return (int) $index <= self::MAX_INSTANCES_PER_TYPE ? $id : null;
    }

    /** The type behind a section KEY (`text_1` → the `text` type), or null. */
    public static function forKey(string $key): ?self
    {
        $id = self::typeOf($key);

        return $id === null ? null : self::get($id);
    }

    /** Whether $key names one instance of a repeatable type — the only rows that may be deleted. */
    public static function isInstanceKey(string $key): bool
    {
        return self::forKey($key)?->repeatable === true;
    }

    /**
     * The full view name a section key renders through, or null when the key
     * is not a section at all.
     *
     * TYPE→view, never key→view: that substitution is what lets six `text_N`
     * bands share one partial. The caller still asks `view()->exists()` on
     * the result — a key this catalogue knows may still name a partial that
     * has not shipped yet, and a live page losing one band is recoverable
     * where a 500 is not. That guard is now load-bearing rather than
     * defensive: `announcement`, `trust` and `faq` are types only the
     * nocturne kit renders, so a ruled_page page carrying one of those rows
     * resolves a view that legitimately does not exist and skips the band.
     *
     * $template is a LITERAL at every call site — each layout names its own
     * directory — and never `$page->template_key`, which is a plain varchar
     * with no constraint behind it. Nothing here has to sanitise it for that
     * reason, and the `view()->exists()` the caller still makes is what
     * catches a name that resolves to nothing anyway.
     */
    public static function viewFor(string $key, string $template = self::DEFAULT_TEMPLATE): ?string
    {
        $type = self::forKey($key);

        return $type === null ? null : 'landing.' . $template . '.sections.' . $type->view;
    }

    /**
     * The next free instance key for a repeatable type, or null when the
     * page is already at {@see MAX_INSTANCES_PER_TYPE}.
     *
     * LOWEST FREE INDEX, not highest-plus-one. With a hard cap, "highest
     * plus one" burns the namespace: a tenant who adds and removes a band
     * six times has used up text_1..text_6 and can never add another,
     * despite having none. Lowest-free means the cap counts what EXISTS.
     *
     * Null is the cap, and it is the only expression of it — the caller
     * turns it into a friendly 422.
     *
     * @param list<string> $existingKeys every section key the page already carries
     */
    public static function nextInstanceKey(string $typeId, array $existingKeys): ?string
    {
        $type = self::get($typeId);

        if ($type === null || !$type->repeatable) {
            return null;
        }

        $taken = array_flip(array_filter($existingKeys, 'is_string'));

        for ($n = 1; $n <= self::MAX_INSTANCES_PER_TYPE; $n++) {
            $key = $typeId . '_' . $n;

            if (!isset($taken[$key])) {
                return $key;
            }
        }

        return null;
    }

    /**
     * The catalogue as the editor consumes it: one row per type, in authored
     * order, carrying exactly what a form needs to render itself — which
     * types may be added, which fields each one edits, and which ones offer
     * a photo control.
     *
     * `view` is deliberately absent: it is a server-side file path and the
     * browser can do nothing with it. `limit` is published for the
     * repeatable types so the editor can grey out "Add" at the cap rather
     * than discovering it through a 422.
     *
     * `band` is absent for the same reason as `view` — it is a class name
     * on a stylesheet the admin SPA does not load. What the editor needs is
     * `default_tone`: which swatch to show lit for a row whose `tone` is
     * null, so the picker says "this band is already the tinted one" rather
     * than showing nothing selected and inviting the tenant to pick the
     * colour it is already painted. {@see defaultToneFor()}.
     *
     * `image_slots` is the whole truth about photos — how many this type
     * holds — and `image` is the OLD question, kept for the build of the
     * admin SPA that is already deployed when this ships. It is published
     * as `images === 1` rather than `images > 0` deliberately: a bundle that
     * predates galleries reads `image` as "draw the one-photo control", and
     * that control names its slot with the bare section key, which the
     * endpoints refuse for a gallery (see {@see imageSlot()}). Publishing
     * `true` there would offer a control that could only ever 422; `false`
     * offers no photo control until the SPA is rebuilt, which is degraded
     * but never wrong. Anything that understands `image_slots` should read
     * that and ignore `image` entirely.
     *
     * @return list<array{id: string, repeatable: bool, fields: list<string>, image: bool, image_slots: int, limit: int|null, default_tone: string|null}>
     */
    public static function payload(): array
    {
        $rows = [];

        foreach (self::all() as $id => $type) {
            $rows[] = [
                'id'           => $id,
                'repeatable'   => $type['repeatable'],
                'fields'       => $type['fields'],
                'image'        => $type['images'] === 1,
                'image_slots'  => $type['images'],
                'limit'        => $type['repeatable'] ? self::MAX_INSTANCES_PER_TYPE : null,
                'default_tone' => self::defaultToneFor($id),
            ];
        }

        return $rows;
    }
}
