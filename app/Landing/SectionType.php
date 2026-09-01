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
     * How many photographs one gallery band holds.
     *
     * Named because it is now spelled in two places that must agree — the
     * `gallery` type's own `images` count, and {@see galleryCaptionLeaves()},
     * which numbers one caption per tile. `images` cannot read this list and
     * the list cannot read `images` (it is built while {@see all()} is being
     * built), so the number lives here and SectionTypeTest asserts the type
     * carries exactly it.
     *
     * EIGHT, and the number is a judgement rather than a round one — see the
     * `gallery` row's own note in {@see all()}.
     */
    public const GALLERY_IMAGES = 8;

    /**
     * How many columns the trust strip holds (template fidelity 5.4 / D7).
     *
     * FOUR, which is the superset: kit 01 draws three flat highlights, kits
     * 02 and 03 each draw four value+caption pairs. Raised from three, which
     * was kit 01's shape read as if it were the model's.
     *
     * One number, read by {@see trustLeaves()} (which builds the type's
     * `fields`) and by {@see \App\Landing\PageContent::trustFeatures()}
     * through that list. It used to be a literal in both files.
     */
    public const MAX_TRUST_FEATURES = 4;

    /**
     * The social platforms the kits' footer hubs draw, in the author's own
     * order: leaf suffix => the platform's own spelling of its name.
     *
     * The NAME is here rather than derived from the key because these are
     * proper nouns and nothing mechanical spells them right — `Str::title`
     * makes "Tiktok". It is the anchor's accessible name (the icons are
     * aria-hidden and there is no visible text), and it is deliberately NOT
     * run through `__()`: a brand name is the same word in every locale.
     *
     * One entry per branch in `nocturne_ritual/icon.blade.php`, and
     * {@see socialLeaves()} builds the content leaves from the same keys, so
     * a platform cannot arrive with a URL and no icon or the reverse.
     *
     * @var array<string, string>
     */
    public const SOCIAL_PLATFORMS = [
        'instagram' => 'Instagram',
        'facebook'  => 'Facebook',
        'tiktok'    => 'TikTok',
    ];

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
                'fields'     => array_merge(
                    // `headline_accent` is the companion leaf R6 settles on
                    // (template fidelity 5.1): the trailing fragment the
                    // author sets in the accent colour, echoed as
                    // `{{ $heading }} <em>{{ $accent }}</em>` by
                    // App\Landing\Copy. It sits IMMEDIATELY after the leaf
                    // it belongs to, because the editor draws its controls
                    // in this order and "Words to highlight" means nothing
                    // three inputs below the heading it highlights.
                    ['kicker', 'headline', 'headline_accent', 'subtext', 'cta_label'],
                    // THE FACTS CARD'S THREE TERMS (template fidelity 5.2).
                    // The VALUES stay derived — the closing time the business
                    // publishes, the rating it earned, the city it is in —
                    // because a card that lets a tenant type its own numbers
                    // is a card that can lie. Only the WORDING is theirs, and
                    // each leaf is bound to its own fact rather than to a
                    // position: with no rating the city's label must not slide
                    // up into the rating's row. Kit 01 writes "Open late"
                    // where the derivation says "Open until"; that one string
                    // is what these exist for.
                    ['hours_label', 'rating_label', 'city_label'],
                    self::photoLeaves(),
                ),
                'band'       => '',
                'images'     => 1,
            ],
            // The price list. Its ROWS come from the Services screen, not
            // from `content` — only the band's own framing copy and the
            // band-level editorial plate are editable.
            //
            // R3: ONE photograph here, for the whole band, which is kit 02's
            // sticky `.services__media`. The per-ROW picture kit 03 draws on
            // its featured card is a different thing entirely and is NOT a
            // page slot: there can be up to PageContent::MAX_SERVICES rows,
            // and each one already has an uploadable `Service.image` on the
            // Services screen — read through PageContent::serviceImage().
            'services' => [
                'repeatable' => false,
                'view'       => 'services',
                // `item_cta_label` is the wording on each ROW's booking chip,
                // hardcoded `__('Book')` until template fidelity 5.2. Kit 01
                // writes exactly "Book"; kit 03 writes "Reserve this ritual".
                'fields'     => array_merge(
                    ['kicker', 'heading', 'heading_accent', 'subtext', 'item_cta_label'],
                    self::photoLeaves(),
                ),
                'band'       => '',
                'images'     => 1,
            ],
            'about' => [
                'repeatable' => false,
                'view'       => 'about',
                // THE NUMBERED LEDGER IS THE AUTHOR'S, AND IT IS GUIDANCE
                // (template fidelity 5.2). Kit 01's three lines are "Arrive
                // 20 minutes early for tea and thermal time." — advice, not
                // opening hours — and the conversion had nowhere to put
                // them, so it published a grouped week under the author's
                // ornamental 01/02/03 instead. The derived week survives as
                // the fallback for every page that has no lines of its own,
                // so nothing regresses; a tenant who writes one takes the
                // ledger back.
                'fields'     => array_merge(
                    ['kicker', 'lead', 'lead_accent', 'body', 'fact_1', 'fact_2', 'fact_3'],
                    self::photoLeaves(),
                ),
                'band'       => 'band--paper-2',
                'images'     => 1,
            ],
            // R1: the team band's photograph is its OWN slot, not the first
            // practitioner's avatar. All three kits' alt text names three
            // people at once — it is a photograph OF THE STUDIO, and putting
            // one face in a frame the author drew for three is what the
            // avatar substitution was doing. That substitution survives as
            // the FALLBACK so nothing regresses for a tenant who has neither
            // uploaded a band photograph nor is on a design that ships one.
            'team' => [
                'repeatable' => false,
                'view'       => 'team',
                'fields'     => array_merge(
                    ['kicker', 'heading', 'heading_accent', 'subtext', 'item_cta_label'],
                    self::photoLeaves(),
                ),
                'band'       => '',
                'images'     => 1,
            ],
            // THE ONE BAND THAT COULD NOT NAME ITSELF (template fidelity
            // 5.2). `fields` was `['kicker']` alone, so kit 03's "Kind
            // words, left after the exhale." and kit 02's "Recent studio
            // feedback" had nowhere to live and the nocturne partial had to
            // promote the EYEBROW into the <h2> to give the band a heading
            // at all. That promotion survives as the fallback — a page with
            // no heading renders exactly what it rendered before — and a
            // tenant who writes one gets the author's real two-part header.
            'reviews' => [
                'repeatable' => false,
                'view'       => 'reviews',
                'fields'     => ['kicker', 'heading', 'heading_accent', 'subtext'],
                'band'       => 'band--ink',
                'images'     => 0,
            ],
            // R2: the closing panel's photograph is its OWN slot. Kit 01
            // reuses the hero plate here and that reuse is the author's
            // composition — so it is the DEFAULT (see TemplateImage), not a
            // hard-coded alias. "All images which I can change later" does
            // not admit an image that is silently a copy of another one.
            'booking' => [
                'repeatable' => false,
                'view'       => 'booking',
                // THE PROMISES ARE THREE LEAVES NOW, NOT A SENTENCE SPLIT
                // (template fidelity 5.2). The partial was cutting `terms`
                // on sentence boundaries and printing the fragments as the
                // author's uppercase chips — which meant a tenant with one
                // long sentence lost all three, a fourth chip was
                // impossible, and the author's own page (which carries BOTH
                // a paragraph AND three chips) could not be reproduced at
                // all: the split rendered one or the other, never both. The
                // split stays as the migration fallback for pages that have
                // no promise leaves.
                'fields'     => array_merge(
                    ['kicker', 'heading', 'heading_accent', 'terms'],
                    ['promise_1', 'promise_2', 'promise_3'],
                    ['cta_label', 'call_label', 'call_short'],
                    self::photoLeaves(),
                ),
                'band'       => 'band--paper-2',
                'images'     => 1,
            ],
            // phone/email/address are the three fields ContactDetails lets a
            // page override per-page (see its docblock); the rest of the
            // contact facts pass through the Property untouched and are not
            // page content at all.
            //
            // THE FOOTER HUB'S OWN THREE FAMILIES LIVE HERE, and that is a
            // deliberate resolution of template fidelity 5.5 rather than
            // where the plan first put them. 5.5 proposes `content.footer.*`;
            // `footer` is CHROME — it has no row on any page, no industry
            // seeds one, and giving it `fields` would immediately make it
            // ADDABLE ({@see addableIds()}, whose second family is "a fixed
            // type nobody seeds, with something to edit"), i.e. a picker
            // entry offering to add a band every layout already draws
            // unconditionally. The `footer` entry's own docblock below names
            // that trap in as many words.
            //
            // `contact` is where they belong instead, and not merely because
            // it is convenient: on every one of these kits the footer hub IS
            // the contact block — the author nests `data-block="contact"`
            // inside `.footer-hub`, the layout already hands this row's copy
            // to the footer partial as `$contactCopy`, `fixed_blocks`
            // already publishes its placement as `footer`, and the editor
            // already tells the tenant "Shown in your footer on this
            // design." Every page carries a contact row, so all five are
            // reachable with no seeding change and no new mechanism.
            //
            //   - `descriptor` is the small caps word under the wordmark
            //     ("Bathhouse", "Atelier London"). The conversion substituted
            //     Property.city for it, which is wrong on all six kits and
            //     wrong TWICE (header and footer). The city survives as the
            //     fallback.
            //   - `social_*` are the Follow column. There is no social
            //     destination anywhere else in this platform's data model —
            //     not on Property, not on Organization, not on LandingPage —
            //     which is why the conversion rendered no column at all. A
            //     blank leaf renders no icon: this page never links to `#`.
            //   - `legal_note` is the sentence after the copyright line.
            'contact' => [
                'repeatable' => false,
                'view'       => 'contact',
                'fields'     => array_merge(
                    [
                        'kicker', 'phone', 'email', 'address',
                        'phone_label', 'email_label', 'address_label', 'map_label', 'closed_label',
                        'descriptor',
                    ],
                    self::socialLeaves(),
                    ['legal_note'],
                ),
                'band'       => 'band--ink',
                'images'     => 0,
            ],
            // CHROME, and this is where that is written down (template
            // fidelity 3.5). It is listed here because it IS a section type
            // and the wizard already names it, but it is the one type in this
            // catalogue with no editable copy and no photograph, and that is
            // a decision rather than an omission:
            //
            //   - every layout includes it UNCONDITIONALLY, outside the
            //     section loop, so there is no row to switch off and no order
            //     to move it in. `fixed_blocks` publishes it as `footer`
            //     placement for exactly that reason.
            //   - what it prints is the business's own details — the name,
            //     the address, the phone, the hours, the review link — which
            //     are Properties data, not page copy. The one leaf it reads
            //     out of `content` is the CONTACT band's kicker (see
            //     footer.blade.php), which the contact type already owns and
            //     already offers a control for.
            //   - the page's tagline, which is the only text a tenant might
            //     expect to write here, is `seo.description` and has had its
            //     own control on the Publish tab since template fidelity 1.5.
            //
            // Being fieldless is therefore load-bearing in two places rather
            // than merely true: {@see addableIds()} refuses to offer it (a
            // control that would add a row nothing renders differently), and
            // the editor draws its row as a plain header with no disclosure.
            // A later phase that gives the footer real leaves of its own —
            // a legal note, social destinations — undoes both by adding them
            // here, and should read this note first.
            //
            // TEMPLATE FIDELITY 5.5 READ IT. The footer's tagline, social
            // column and legal line are all real and all now rendered — the
            // tagline off `seo.description` (1.5) and the other two off the
            // CONTACT row's own leaves, which the layout already hands this
            // partial as `$contactCopy`. They are not here, and this stays
            // `[]`, for exactly the reason above: no page carries a footer
            // row, so a leaf here would be a control no tenant could reach,
            // and adding one would put "Footer" in the add-a-block picker.
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
                'fields'     => array_merge(
                    ['kicker', 'heading', 'heading_accent', 'body'],
                    self::photoLeaves(),
                ),
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
            // Its `fields` are an eyebrow, a heading and one caption per
            // tile: the pictures ARE the content here, and `count()` reads
            // them rather than any copy — a gallery with words and no photos
            // is not a section, so it does not render.
            //
            // The captions are the author's own glass pills, which the
            // conversion had to drop for want of a field (gallery.blade.php
            // said so in as many words). They are ORDINARY CONTENT LEAVES,
            // not image leaves — `isImageField()` refuses the `image_`
            // prefix and nothing else — so they travel the plain content
            // save while the pictures beside them keep their single writer.
            'gallery' => [
                'repeatable' => true,
                'view'       => 'gallery',
                // `subtext` is the gallery intro both kit 02 and kit 03
                // write (template fidelity 5.2). Kit 01 draws no paragraph
                // here — but the header it draws IS `.section-heading--split`,
                // the same two-column header the services band fills with
                // exactly such a paragraph, so a tenant who writes one gets
                // it in the composition the author already drew rather than
                // in a new one.
                'fields'     => array_merge(
                    ['kicker', 'heading', 'heading_accent', 'subtext'],
                    self::galleryCaptionLeaves(),
                ),
                'band'       => '',
                'images'     => self::GALLERY_IMAGES,
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
            // {@see MAX_TRUST_FEATURES} short highlights. NUMBERED fields
            // rather than one comma-separated leaf, because splitting a
            // tenant string on a separator makes the separator unusable
            // inside the values — "Open late, seven days" would become two
            // highlights.
            //
            // FOUR, AND EACH MAY BE A PAIR (template fidelity 5.4 / D7).
            // Kit 01 shows three flat strings; kits 02 and 03 each show FOUR
            // items as a value + caption pair ("15 years" / "Combined studio
            // experience"). One superset serves all three, and it is
            // ADDITIVE rather than a rename: `feature_N` is the leaf live
            // pages already carry and it goes on meaning what it meant — the
            // highlight, or the pair's VALUE when a caption joins it. See
            // {@see trustLeaves()}, which is the only enumeration of them.
            'trust' => [
                'repeatable' => false,
                'view'       => 'trust',
                'fields'     => array_merge(['quote'], self::trustLeaves()),
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
                'fields'     => array_merge(
                    ['kicker', 'heading', 'heading_accent', 'subtext'],
                    self::faqLeaves(),
                ),
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

    /**
     * THE WORDS THAT BELONG TO A SINGLE PHOTOGRAPH — the two text leaves
     * every one-picture band carries beside its plate (template fidelity
     * 4.3).
     *
     *   - `alt` is what a screen reader (and a search engine, and anybody on
     *     a connection that lost the file) is told the picture shows. Every
     *     kit writes a real descriptive alt on every photograph and every
     *     converted partial hardcoded `alt=""`, which is a WCAG 1.1.1 gap on
     *     a page whose entire pitch is its photography.
     *   - `caption` is the line printed under the frame in the design's own
     *     voice. The partials have been substituting the street address for
     *     it, which matches the author's kit by luck and nothing else.
     *
     * NEITHER IS AN IMAGE LEAF, and that is the property this list exists to
     * make structural. {@see isImageField()} refuses the whole `image_`
     * prefix, so these travel the ordinary content save — one writer for the
     * picture, the normal writer for the words about it — and no endpoint,
     * carry-forward rule or delete sweep has to learn about them.
     *
     * Spelled ONCE and merged into each single-photo type's `fields` rather
     * than typed out six times, so the day a third leaf joins them (a focal
     * point, if D4 is ever answered — and NOT named `image_focus`, which the
     * refusal above would eat) it is one edit.
     *
     * @return list<string>
     */
    public static function photoLeaves(): array
    {
        return array_merge(self::altLeaves(), self::captionLeaves());
    }

    /**
     * The two halves of {@see photoLeaves()}, named separately because they
     * have separate READERS — `PageContent::imageAlt()` and
     * `imageCaption()` — and `LandingOnboardingService::contentFieldsFor()`
     * asks per reader which leaves it publishes. A partial can honestly draw
     * one and not the other.
     *
     * @return list<string>
     */
    public static function altLeaves(): array
    {
        return ['alt'];
    }

    /** @return list<string> */
    public static function captionLeaves(): array
    {
        return ['caption'];
    }

    /**
     * The same words for a band that holds MORE THAN ONE photograph, one
     * caption per tile, numbered to match the picture leaf beside it:
     * `image_3`'s caption is `caption_3`.
     *
     * Derived from the gallery's own `images` count rather than a literal
     * eight — the two numbers have to be the same number, and the whole
     * reason `images` is a count is that everything downstream follows from
     * it. Read out of {@see all()} would be circular (this is called while
     * building that array), so the count is named here as its own constant
     * and pinned against the type by SectionTypeTest.
     *
     * ALT IS DELIBERATELY ABSENT. Eight more inputs on the busiest card in
     * the editor is the "fifteen loose boxes" failure 3.3 just removed from
     * the FAQ, and a gallery tile is a decorative mosaic in every one of the
     * three kits — the caption pill is the information, and it is beside the
     * picture on the page. A tile with a caption and no alt is a picture
     * whose meaning is already in the document.
     *
     * @return list<string>
     */
    public static function galleryCaptionLeaves(): array
    {
        $leaves = [];

        for ($n = 1; $n <= self::GALLERY_IMAGES; $n++) {
            $leaves[] = 'caption_' . $n;
        }

        return $leaves;
    }

    /**
     * THE TRUST STRIP'S HIGHLIGHTS, in render order — every leaf under
     * `content.trust` that holds one column of it (template fidelity 5.4).
     *
     * `feature_N` is the highlight (kit 01's shape) or the pair's VALUE
     * (kits 02 and 03: "15 years"); `feature_N_caption` is the line under
     * it ("Combined studio experience"). Interleaved, because that is the
     * order a form should offer them in and it is what `fields` above is
     * built from.
     *
     * THE CAP USED TO BE SPELLED TWICE — a literal three here and a literal
     * `['feature_1', 'feature_2', 'feature_3']` inside
     * {@see \App\Landing\PageContent::trustFeatures()} — which is the "one
     * fact in two places" failure this plan's risk register names by name.
     * PageContent reads THIS list now, so the number moves in one edit.
     *
     * @return list<string>
     */
    public static function trustLeaves(): array
    {
        $leaves = [];

        for ($n = 1; $n <= self::MAX_TRUST_FEATURES; $n++) {
            $leaves[] = 'feature_' . $n;
            $leaves[] = 'feature_' . $n . '_caption';
        }

        return $leaves;
    }

    /**
     * THE FOOTER HUB'S FOLLOW COLUMN — a label and one destination per
     * platform the kits actually draw (template fidelity 5.5).
     *
     * All six kits render an Instagram / Facebook / TikTok trio and this
     * platform holds a social destination for a business NOWHERE: not on
     * `Property`, not on `Organization`, not on `LandingPage`. So they are
     * page content, which is both the cheap answer and the honest one — a
     * landing page is the only thing in this product that would render them.
     *
     * THREE, NOT AN OPEN LIST, and that is the same ruling every enumerated
     * family in this class carries: the icons are the author's own SVG paths
     * and there is exactly one per platform, so a fourth platform is a new
     * icon and a new leaf together rather than a URL with nothing to draw it.
     *
     * @return list<string>
     */
    public static function socialLeaves(): array
    {
        return array_merge(['social_label'], self::socialDestinationLeaves());
    }

    /**
     * The DESTINATIONS alone, without the column's own label.
     *
     * Split out for the same reason {@see altLeaves()} is: they have a
     * different reader. `PageContent::socialLinks()` publishes the three
     * URLs and knows nothing about the heading over them, which a partial
     * reads by index like any other line of copy — so a design could draw
     * the icons under a heading of its own, or none.
     *
     * @return list<string>
     */
    public static function socialDestinationLeaves(): array
    {
        return array_map(
            static fn (string $platform) => 'social_' . $platform,
            array_keys(self::SOCIAL_PLATFORMS),
        );
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
     * THE ADD ALLOWLIST — every type a tenant may put on a page that does
     * not already have one, which is a wider question than "which types
     * repeat" (template fidelity 3.1 / R4).
     *
     * Two families, and the second is the reason this exists:
     *
     *   - every REPEATABLE type, which is what this allowlist has always
     *     been. A page may hold up to {@see MAX_INSTANCES_PER_TYPE} of each.
     *   - every FIXED type that no industry's page is created with, and that
     *     has something to edit. `announcement`, `trust` and `faq` are the
     *     BeautyTech kits' own blocks: three of the author's fifteen, drawn
     *     by the shipped partials, described in tenant words by
     *     {@see \App\Services\Landing\LandingOnboardingService::SECTION_COPY}
     *     — and, until this list existed, reachable from no screen in the
     *     product at all, because the create endpoint accepted repeatable
     *     types only and no `defaultSections` list names them.
     *
     * DERIVED, never a second literal `['announcement', 'trust', 'faq']`.
     * Both halves of the second family's test are facts already written down
     * somewhere else:
     *
     *   - "no industry seeds it" is {@see IndustryProfile::all()}'s own
     *     `defaultSections` lists, unioned. A type that IS seeded arrives
     *     with the page and is switched off rather than added, which is the
     *     rule `LandingPageSectionController::destroy()` already states from
     *     the other end.
     *   - "has something to edit" is this catalogue's own `fields`/`images`.
     *     `footer` is the type that fails it: it declares no editable copy
     *     and no photograph because it is CHROME — the layout includes it
     *     unconditionally and it reads the business's own details — so
     *     "add a footer" would be a control that adds a row nothing renders
     *     differently. See its entry in {@see all()}.
     *
     * Order is {@see all()}'s authored order, so a picker built from this
     * list reads in catalogue order rather than in two clumps.
     *
     * @return list<string>
     */
    public static function addableIds(): array
    {
        $seeded = self::seededIds();

        return array_values(array_keys(array_filter(
            self::all(),
            static fn (array $type, string $id) => $type['repeatable']
                || (!isset($seeded[$id]) && ($type['fields'] !== [] || $type['images'] > 0)),
            ARRAY_FILTER_USE_BOTH,
        )));
    }

    /**
     * Every section key some industry's new page is created with, as a SET
     * (id => true) so {@see addableIds()} can test membership without a
     * linear scan per type.
     *
     * The one place this class reads {@see IndustryProfile}, and it reads
     * the same `defaultSections` lists `LandingPageController::store()` and
     * `LandingOnboardingService::apply()` seed from — so "this type arrives
     * with the page" and "this type may be added to a page" are one decision
     * with one input, rather than two lists that agree until somebody edits
     * one of them.
     *
     * @return array<string, true>
     */
    private static function seededIds(): array
    {
        $seeded = [];

        foreach (IndustryProfile::all() as $profile) {
            foreach ($profile['defaultSections'] as $key) {
                $seeded[$key] = true;
            }
        }

        return $seeded;
    }

    /**
     * The section KEY one add of `$typeId` should create, or null when the
     * page cannot take another.
     *
     * The two spellings the key grammar admits, answered by the one method
     * the create endpoint calls, so that endpoint never branches on
     * `repeatable` itself:
     *
     *   - a REPEATABLE type allocates the lowest free instance index —
     *     {@see nextInstanceKey()}, unchanged, cap and all.
     *   - a FIXED type IS its own key. There can only ever be one, so the
     *     answer is the bare id when the page does not already carry it and
     *     null when it does — the caller turns that null into its own named
     *     refusal, exactly as it already does for the instance cap.
     *
     * Refuses a type this catalogue does not know, and a fixed type that is
     * not addable at all, so a caller that reached here past its own
     * `Rule::in` still cannot create a row for `footer`.
     *
     * @param list<string> $existingKeys every section key the page already carries
     */
    public static function keyFor(string $typeId, array $existingKeys): ?string
    {
        $type = self::get($typeId);

        if ($type === null || !in_array($typeId, self::addableIds(), true)) {
            return null;
        }

        if ($type->repeatable) {
            return self::nextInstanceKey($typeId, $existingKeys);
        }

        return in_array($typeId, $existingKeys, true) ? null : $typeId;
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
                $slots[] = self::slotFor($key, $leaf);
            }
        }

        return $slots;
    }

    /**
     * One MULTI-photo slot's name, in the spelling {@see imageKeys()}
     * enumerates and {@see imageSlot()} parses — `gallery_1.image_3`.
     *
     * Public because a second caller appeared: {@see TemplateImage} keys the
     * design's own photographs by slot, and {@see PageContent::galleryPhotos()}
     * has to build the same string to ask for one. Two places spelling a
     * separator is how a separator changes in one of them, so the composer
     * is here beside the parser rather than the constant being exported.
     */
    public static function slotFor(string $key, string $leaf): string
    {
        return $key . self::SLOT_SEPARATOR . $leaf;
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

        return $type === null ? null : self::viewForType($type->id, $template);
    }

    /**
     * The same view name, asked of a TYPE ID rather than of a section key.
     *
     * The two questions are genuinely different and only one of them can be
     * asked of `text`: {@see typeOf()} deliberately refuses a repeatable
     * type's bare id as a key (`text` is a type, `text_1` is a section), so
     * `viewFor('text')` is null even though `landing.ruled_page.sections.
     * text` exists and is exactly the partial a `text` band renders through.
     *
     * Anything enumerating the CATALOGUE — "which of these thirteen types
     * does this template ship a partial for" — is asking about types, not
     * about any page's keys, and has to come in this door or it silently
     * drops every repeatable type. {@see \App\Services\Landing\LandingOnboardingService::rendersFor()}
     * is that caller, and it is why this exists.
     */
    public static function viewForType(string $typeId, string $template = self::DEFAULT_TEMPLATE): ?string
    {
        $type = self::get($typeId);

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
     * `addable` is the question the "+ Add a block" picker actually asks, and
     * it is NOT `repeatable` (template fidelity 3.1). Three of the kits'
     * fifteen blocks are fixed types a tenant may nonetheless add, because no
     * industry's page is created with them — see {@see addableIds()}. The
     * editor filtered its picker on `repeatable` until this key existed,
     * which is why `announcement`, `trust` and `faq` were reachable from no
     * screen in the product.
     *
     * @return list<array{id: string, repeatable: bool, addable: bool, fields: list<string>, image: bool, image_slots: int, limit: int|null, default_tone: string|null}>
     */
    public static function payload(): array
    {
        $addable = array_flip(self::addableIds());
        $rows    = [];

        foreach (self::all() as $id => $type) {
            $rows[] = [
                'id'           => $id,
                'repeatable'   => $type['repeatable'],
                'addable'      => isset($addable[$id]),
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
