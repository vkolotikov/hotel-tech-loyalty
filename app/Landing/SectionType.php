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

    /** Where the ruled_page template keeps its section partials. */
    private const VIEW_PREFIX = 'landing.ruled_page.sections.';

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
         * Whether this type carries a photo plate — which is to say whether
         * `content.<key>.image_url` is a leaf the image endpoints may write
         * and {@see PageContent::imageUrl()} may be asked for.
         *
         * This is the ONLY definition of the image slot allowlist. The
         * endpoints' old `in:hero,about` literal was a second copy of it.
         */
        public readonly bool $image,
    ) {}

    /**
     * The authored catalogue.
     *
     * The eight fixed types are transcribed from what the shipped partials
     * already do — `fields` is each partial's own `$copy[...]` reads and
     * `image` is whether it calls `PageContent::imageUrl()`. Nothing about
     * them changes by being written down here; SectionTypeTest pins the
     * `fields`/`image` pairs against the partials so a future edit to a
     * partial cannot quietly diverge from this table.
     *
     * `text` is the one new type: the repeatable band a tenant can add as
     * many as six of — an eyebrow, a heading, body copy and an optional
     * photo, which is the shape of every "and another thing" section a
     * marketing page ever needs.
     *
     * `band` is likewise transcribed rather than invented: it is the exact
     * modifier class each partial's own `<section class="band …">` already
     * carried before the tone round, and RuledPageSectionsTest asserts the
     * rendered class per key so the table and the partials cannot diverge.
     *
     * @return array<string, array{repeatable: bool, view: string, fields: list<string>, band: string, image: bool}>
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
                'image'      => true,
            ],
            // The price list. Its ROWS come from the Services screen, not
            // from `content` — only the band's own framing copy is editable.
            'services' => [
                'repeatable' => false,
                'view'       => 'services',
                'fields'     => ['kicker', 'heading', 'subtext'],
                'band'       => '',
                'image'      => false,
            ],
            'about' => [
                'repeatable' => false,
                'view'       => 'about',
                'fields'     => ['kicker', 'lead', 'body'],
                'band'       => 'band--paper-2',
                'image'      => true,
            ],
            'team' => [
                'repeatable' => false,
                'view'       => 'team',
                'fields'     => ['kicker', 'heading', 'subtext'],
                'band'       => '',
                'image'      => false,
            ],
            'reviews' => [
                'repeatable' => false,
                'view'       => 'reviews',
                'fields'     => ['kicker'],
                'band'       => 'band--ink',
                'image'      => false,
            ],
            'booking' => [
                'repeatable' => false,
                'view'       => 'booking',
                'fields'     => ['kicker', 'heading', 'terms', 'call_label', 'call_short'],
                'band'       => 'band--paper-2',
                'image'      => false,
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
                'image'      => false,
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
                'image'      => false,
            ],
            // The repeatable band this catalogue was built for.
            'text' => [
                'repeatable' => true,
                'view'       => 'text',
                'fields'     => ['kicker', 'heading', 'body'],
                'band'       => 'band--paper-2',
                'image'      => true,
            ],
        ];
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
     * Every section key that may carry a photo — the image endpoints' whole
     * `slot` allowlist, enumerated rather than described so it can be handed
     * straight to Rule::in().
     *
     * Finite because the key grammar is: a repeatable type contributes
     * exactly {@see MAX_INSTANCES_PER_TYPE} keys, not an open-ended family.
     * That is what stops a caller uploading a file against an unbounded
     * sequence of slots the renderer would never read.
     *
     * @return list<string>
     */
    public static function imageKeys(): array
    {
        $keys = [];

        foreach (self::all() as $id => $type) {
            if (!$type['image']) {
                continue;
            }

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
            image:      $data['image'],
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
     * where a 500 is not.
     */
    public static function viewFor(string $key): ?string
    {
        $type = self::forKey($key);

        return $type === null ? null : self::VIEW_PREFIX . $type->view;
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
     * @return list<array{id: string, repeatable: bool, fields: list<string>, image: bool, limit: int|null, default_tone: string|null}>
     */
    public static function payload(): array
    {
        $rows = [];

        foreach (self::all() as $id => $type) {
            $rows[] = [
                'id'           => $id,
                'repeatable'   => $type['repeatable'],
                'fields'       => $type['fields'],
                'image'        => $type['image'],
                'limit'        => $type['repeatable'] ? self::MAX_INSTANCES_PER_TYPE : null,
                'default_tone' => self::defaultToneFor($id),
            ];
        }

        return $rows;
    }
}
