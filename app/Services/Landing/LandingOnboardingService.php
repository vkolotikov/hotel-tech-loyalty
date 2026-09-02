<?php

namespace App\Services\Landing;

use App\Landing\ContactDetails;
use App\Landing\IndustryProfile;
use App\Landing\PageContent;
use App\Landing\SectionType;
use App\Landing\TemplateImage;
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
     *
     * Landing phase 3c, Plan A: this is now the registry for the EDITOR's
     * template picker too (the Design panel), which renders the `name` and
     * `blurb` below verbatim off `prefill()['templates']` -- so adding a
     * second template is still a change to this array alone, in one file,
     * with no second list to keep in step and no frontend release to make
     * it appear. LandingPageController::store() AND ::update() both
     * validate against templateKeys() for the same reason.
     *
     * `supports` is the OTHER half of that registry, and it is the only
     * hand-written part of this array a reader has to check against
     * something outside it: it transcribes, one bool per design control,
     * the four statements a template's own layout makes about what it
     * reads. Until it existed those statements were PROSE — nocturne's
     * layout.blade.php says in words that `theme.palette`, `theme.
     * font_pairing` and section tones are "simply not read here" — and the
     * editor, having no way to know, drew ten palette/type cards and
     * twenty-one tone swatches on a page that ignores every one of them.
     * A control that cannot act is not rendered; that rule needs this fact
     * on the wire to be applied at all.
     *
     * `renders` is NOT here on purpose. Which section types a template can
     * draw is a question about which .blade.php files shipped, and the
     * filesystem already answers it — see {@see rendersFor()}, which derives
     * it. Writing that list by hand would be a second source of truth about
     * a fact the renderer reads off disk on every request, and it would go
     * stale the first time somebody added a partial.
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
            // Every one, and this is the template App\Landing\Palette,
            // the font pairings and SectionType::bandClass() were all
            // built for: ruled_page's layout renders the palette block,
            // the pairing block and each band's tone class.
            'supports' => [
                'palette'      => true,
                'font_pairing' => true,
                'tones'        => true,
                'brand_color'  => true,
            ],
            // NOTHING IS FURNITURE HERE. ruled_page's layout renders every
            // band straight out of $renderedSections, in the tenant's own
            // `sort` order and nowhere else — grep it for `$furniture` and
            // there is none. So every row on this design really can be
            // moved, and the reorder controls tell the truth as they stand.
            'fixed_blocks' => [],
        ],
        [
            // The first of the three BeautyTech kits
            // (resources/landing-kits/beauty-tech/01-nocturne-ritual),
            // converted into a real template rather than re-drawn: the
            // author's own markup, their own :root palette and their own
            // stylesheet ship as the design, and only the CONTENT is the
            // tenant's. It is deliberately the opposite end of the range
            // from The Ruled Page — dark where that is pale, photographic
            // where that is typographic — so the picker is a choice between
            // two directions and not two shades of one.
            'key'   => 'nocturne_ritual',
            'name'  => 'Nocturne Ritual',
            // The author's own words for it, from the kit collection's
            // README: "Dark, cinematic ritual luxury / Premium spas, massage
            // and evening wellness brands". Written the way the Ruled Page's
            // blurb was rewritten in Task 11 — describing what a tenant gets,
            // in words somebody who has never commissioned a website can act
            // on, rather than the craft behind it.
            'blurb' => 'Dark and cinematic, built around your photographs. Made for premium spas, massage studios and evening wellness brands.',
            // Transcribed from the four statements
            // resources/views/landing/nocturne_ritual/layout.blade.php
            // makes about itself, in its own "WHAT THIS TEMPLATE
            // DELIBERATELY DOES NOT DO" note: no palette block (the kit's
            // :root IS the design), no font pairing (Cormorant Garamond
            // and Manrope are named in the kit's own tokens), no section
            // tones (the dark/paper/sand rhythm is composed, and a band on
            // the wrong surface breaks the sequence rather than just that
            // band) — and the accent, which is "the ONE tenant override".
            'supports' => [
                'palette'      => false,
                'font_pairing' => false,
                'tones'        => false,
                'brand_color'  => true,
            ],
            // THE KIT'S COMPOSITION, transcribed from the one place that
            // decides it: `$furniture` in this template's own
            // layout.blade.php, and the sentence above it — "announcement
            // sits above the header, contact and the review link live inside
            // the footer hub, and trust and faq have fixed places in the
            // sequence (under the hero, over the booking panel)".
            //
            // Serving it matters because five of this page's rows carry live
            // drag handles and up/down arrows that move NOTHING: the layout
            // rejects these keys out of $mainSections and draws them where
            // the author put them. That is a control that cannot act, which
            // this project's own rule says must not be rendered — and the
            // editor cannot apply that rule against a fact it has no way to
            // read. (Nor may it be spelled as `if (templateKey === …)` on
            // the far side of the wire: that is the second-source-of-truth
            // failure the whole template-fidelity plan exists to remove.)
            //
            // The VALUE is where the block ends up, from a three-word
            // vocabulary the editor translates — never authored English on
            // the wire. `contact` is here although this kit ships no
            // contact.blade.php: its details are printed inside the footer
            // hub (footer.blade.php's `data-block="contact"` address), so
            // "this design does not show this block" would be a lie about
            // it, and "shown in your footer" is the truth.
            //
            // Pinned against the layout's own literal by
            // LandingOnboardingTest::test_a_templates_fixed_blocks_match_its_own_layout.
            'fixed_blocks' => [
                'announcement' => 'top',
                'trust'        => 'fixed',
                'faq'          => 'fixed',
                'contact'      => 'footer',
                'footer'       => 'footer',
            ],
        ],
        [
            // The second of the three BeautyTech kits
            // (resources/landing-kits/beauty-tech/02-editorial-atelier),
            // converted the same way the first was: the author's own markup,
            // their own :root palette and their own stylesheet ship as the
            // design, and only the CONTENT is the tenant's.
            'key'   => 'editorial_atelier',
            'name'  => 'Editorial Atelier',
            // The author's own words for it, from the kit collection's
            // README: "Sharp editorial fashion / Hair studios and image-led
            // beauty ateliers". Written the way the other two blurbs are —
            // what a tenant gets, in words somebody who has never
            // commissioned a website can act on.
            'blurb' => 'Sharp and editorial, with big type and a magazine lookbook. Made for hair studios and image-led beauty ateliers.',
            // Transcribed from the three refusals
            // resources/views/landing/editorial_atelier/layout.blade.php
            // makes about itself in its own "WHAT THIS TEMPLATE DELIBERATELY
            // DOES NOT DO" note — and the accent, which is "the ONE tenant
            // override".
            'supports' => [
                'palette'      => false,
                'font_pairing' => false,
                'tones'        => false,
                'brand_color'  => true,
            ],
            // THE KIT'S COMPOSITION, transcribed from the one place that
            // decides it: `$furniture` in this template's own
            // layout.blade.php. Pinned against that literal by
            // LandingOnboardingTest::test_a_templates_fixed_blocks_match_its_own_layout.
            'fixed_blocks' => [
                'announcement' => 'top',
                'trust'        => 'fixed',
                'faq'          => 'fixed',
                'contact'      => 'footer',
                'footer'       => 'footer',
            ],
        ],
        [
            // The third of the three BeautyTech kits
            // (resources/landing-kits/beauty-tech/03-organic-wellness),
            // converted the same way the other two were: the author's own
            // markup, their own :root palette and their own stylesheet ship
            // as the design, and only the CONTENT is the tenant's.
            'key'   => 'organic_wellness',
            'name'  => 'Organic Wellness',
            // The author's own words for it, from the kit collection's
            // README: "Bright modern organic / Skin, body and approachable
            // wellness studios".
            'blurb' => 'Bright and organic, with daylight photography and soft rounded cards. Made for facialists, massage practices and small wellness studios.',
            // Transcribed from the three refusals
            // resources/views/landing/organic_wellness/layout.blade.php makes
            // about itself, and the accent, which is "the ONE tenant
            // override" — spent here on the CLAY family and on the accent
            // TEXT this kit sets its eight two-tone headings in, never on the
            // moss the page uses as ink (D2).
            'supports' => [
                'palette'      => false,
                'font_pairing' => false,
                'tones'        => false,
                'brand_color'  => true,
            ],
            // THE KIT'S COMPOSITION, transcribed from the one place that
            // decides it: `$furniture` in this template's own
            // layout.blade.php. Pinned against that literal by
            // LandingOnboardingTest::test_a_templates_fixed_blocks_match_its_own_layout.
            'fixed_blocks' => [
                'announcement' => 'top',
                'trust'        => 'fixed',
                'faq'          => 'fixed',
                'contact'      => 'footer',
                'footer'       => 'footer',
            ],
        ],
        [
            // The first of the three HOSPITALITY kits
            // (resources/landing-kits/hospitality/01-maison-vela), converted
            // the same way the three BeautyTech kits were: the author's own
            // markup, his own :root palette and his own stylesheet ship as the
            // design, and only the CONTENT is the tenant's.
            //
            // THE HOSPITALITY KITS SHARE THE BEAUTY KITS' BLOCK CONTRACT MINUS
            // `team`. A restaurant sells its kitchen, not its roster, and none
            // of the three authors drew a people band. Nothing here says so:
            // this directory simply ships no team.blade.php, `renders` is
            // derived from the partials on disk, and the editor stops offering
            // the band. That is the whole mechanism, and it is why `renders`
            // was never allowed to be a hand-written list.
            'key'   => 'maison_vela',
            'name'  => 'Maison Vela',
            // The author's own words for it, from the kit collection's README:
            // "Grand European brasserie / Polished city restaurants and
            // celebratory dining rooms". Written the way the other blurbs are
            // — what a tenant gets, in words somebody who has never
            // commissioned a website can act on.
            'blurb' => 'Grand and cinematic, with an oxblood-and-brass palette and a typographic menu. Made for polished city restaurants, brasseries and celebratory dining rooms.',
            // Transcribed from the three refusals
            // resources/views/landing/maison_vela/layout.blade.php makes about
            // itself, and the accent, which is "the ONE tenant override" —
            // spent here on the BRASS family (the accent text this design
            // paints on its ink bands) and on the paper-ground accent the
            // two-tone heading companion needs, never on the oxblood, which is
            // a surface with white type on it.
            'supports' => [
                'palette'      => false,
                'font_pairing' => false,
                'tones'        => false,
                'brand_color'  => true,
            ],
            // THE KIT'S COMPOSITION, transcribed from the one place that
            // decides it: `$furniture` in this template's own
            // layout.blade.php. Pinned against that literal by
            // LandingOnboardingTest::test_a_templates_fixed_blocks_match_its_own_layout.
            'fixed_blocks' => [
                'announcement' => 'top',
                'trust'        => 'fixed',
                'faq'          => 'fixed',
                'contact'      => 'footer',
                'footer'       => 'footer',
            ],
        ],
        [
            // The second of the three HOSPITALITY kits
            // (resources/landing-kits/hospitality/02-luma-garden), converted
            // the same way: the author's own markup, his own :root palette and
            // his own stylesheet ship as the design, and only the CONTENT is
            // the tenant's. Like its two siblings it ships NO team partial, so
            // `renders` does not name that band and the picker cannot offer it.
            'key'   => 'luma_garden',
            'name'  => 'Luma Garden',
            // The author's own words for it, from the kit collection's README:
            // "Luminous Mediterranean garden / All-day restaurants and
            // produce-led destinations".
            'blurb' => 'Light and Mediterranean, with a photographic hero and soft rounded menu cards. Made for garden restaurants, all-day dining rooms and produce-led kitchens.',
            // Transcribed from the three refusals
            // resources/views/landing/luma_garden/layout.blade.php makes about
            // itself, and the accent, which is "the ONE tenant override" —
            // spent here on the CLAY family, which this author uses as text and
            // as hairlines and never as a ground with type on it.
            'supports' => [
                'palette'      => false,
                'font_pairing' => false,
                'tones'        => false,
                'brand_color'  => true,
            ],
            // THE KIT'S COMPOSITION, transcribed from the one place that
            // decides it: `$furniture` in this template's own
            // layout.blade.php. Pinned against that literal by
            // LandingOnboardingTest::test_a_templates_fixed_blocks_match_its_own_layout.
            'fixed_blocks' => [
                'announcement' => 'top',
                'trust'        => 'fixed',
                'faq'          => 'fixed',
                'contact'      => 'footer',
                'footer'       => 'footer',
            ],
        ],
        [
            // The third of the three HOSPITALITY kits
            // (resources/landing-kits/hospitality/03-ember-table), converted
            // the same way: the author's own markup, his own :root palette and
            // his own stylesheet ship as the design, and only the CONTENT is
            // the tenant's. Like its two siblings it ships NO team partial, so
            // `renders` does not name that band and the picker cannot offer it.
            'key'   => 'ember_table',
            'name'  => 'Ember Table',
            // The author's own words for it, from the kit collection's README:
            // "Cinematic chef-led tasting room / Intimate restaurants, wine
            // bars and open-fire kitchens".
            'blurb' => 'Dark and cinematic, lit like an evening service, with a typographic menu and mono labels. Made for chef-led dining rooms, wine bars and open-fire kitchens.',
            // Transcribed from the three refusals
            // resources/views/landing/ember_table/layout.blade.php makes about
            // itself, and the accent, which is "the ONE tenant override" —
            // spent here on the GOLD label family and on the accent an em takes
            // on a light ground, never on the ember, which is a surface this
            // page sets its type in night on.
            'supports' => [
                'palette'      => false,
                'font_pairing' => false,
                'tones'        => false,
                'brand_color'  => true,
            ],
            // THE KIT'S COMPOSITION, transcribed from the one place that
            // decides it: `$furniture` in this template's own
            // layout.blade.php. Pinned against that literal by
            // LandingOnboardingTest::test_a_templates_fixed_blocks_match_its_own_layout.
            'fixed_blocks' => [
                'announcement' => 'top',
                'trust'        => 'fixed',
                'faq'          => 'fixed',
                'contact'      => 'footer',
                'footer'       => 'footer',
            ],
        ],
    ];

    /**
     * The keys every TEMPLATES row's `supports` map answers, which is to
     * say every design control that can be gated on one.
     *
     * Named once so {@see templates()} can normalise a row that forgot one
     * (a new template added without its bool) to FALSE rather than to
     * whatever `??` happened to be written at the reading end. False is the
     * safe direction for exactly the reason this whole fact exists: a
     * control wrongly hidden is a control a tenant asks about, and a
     * control wrongly shown is a control that does nothing.
     *
     * @var list<string>
     */
    private const SUPPORT_KEYS = ['palette', 'font_pairing', 'tones', 'brand_color'];

    /**
     * WHERE a block a template pins ends up, as a three-word vocabulary
     * rather than a sentence.
     *
     * The editor prints one translated line per value ("Shown in your
     * footer on this design."), so the wire carries the placement and not
     * the prose — the same split every other tenant-facing string on this
     * response follows except the two template blurbs, which are authored
     * marketing copy and say so.
     *
     *  - `top`    — above everything, before the header.
     *  - `footer` — inside the footer, whatever else the page does.
     *  - `fixed`  — somewhere the design chose, in the middle of the page.
     *
     * A value outside this list is dropped by {@see fixedBlocksFor()}: an
     * unknown placement would reach the editor as a blank line where an
     * explanation should be.
     *
     * @var list<string>
     */
    private const PLACEMENTS = ['top', 'fixed', 'footer'];

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
        // The three blocks the BeautyTech kits add. Described here for the
        // same reason every other key is: the editor prints these sentences
        // beside the section it is offering, and a band with no entry in
        // this table would appear as a bare key. They are page FURNITURE the
        // designs own rather than bands the wizard seeds — see
        // IndustryProfile::$defaultSections, which does not list them — so
        // 'source' names the editor rather than another screen.
        'announcement' => ['label' => 'Offer bar', 'source' => 'A short line you write here — an opening offer, late hours, a seasonal note'],
        'trust'        => ['label' => 'Highlights', 'source' => 'A line you write here, plus your review score once you have four ratings'],
        'faq'          => ['label' => 'Questions', 'source' => 'Questions and answers you write here'],
    ];

    /** How many addresses in one family to try before giving up on it. */
    private const SLUG_ATTEMPTS = 12;

    /** @return list<string> */
    public static function templateKeys(): array
    {
        return array_column(self::TEMPLATES, 'key');
    }

    /**
     * The template registry as the wizard and the editor consume it: every
     * authored row, plus the three CAPABILITY facts a screen needs in order
     * to stop offering a control the chosen design cannot honour.
     *
     * `supports` is the authored half, normalised so every row answers all
     * four questions (see {@see SUPPORT_KEYS}). `renders` is the derived
     * half — which of the catalogue's section types this template ships a
     * partial for. `fixed_blocks` (template fidelity 2.6) is the third:
     * which of the blocks it DOES draw it draws in a place of its own,
     * where the tenant's reorder controls have no say.
     *
     * All three ride the SAME response `templates` already rode, rather
     * than a new endpoint, because they are facts ABOUT the rows already on
     * it and a screen that has the row must not have to make a second
     * request to find out whether the row's design can draw what it is
     * about to offer.
     *
     * @return list<array<string, mixed>>
     */
    public static function templates(): array
    {
        return array_map(fn (array $row): array => array_merge($row, [
            'supports'       => self::supportsFor($row),
            'renders'        => self::rendersFor($row['key']),
            'fixed_blocks'   => self::fixedBlocksFor($row),
            'photo_blocks'   => self::photoBlocksFor($row['key']),
            'content_fields' => self::contentFieldsFor($row['key']),
            'image_defaults' => TemplateImage::map($row['key']),
        ]), self::TEMPLATES);
    }

    /**
     * WHICH OF A TYPE'S LEAVES THIS DESIGN ACTUALLY PRINTS — the narrowest
     * of the four capability facts, and the one the plan's own open question
     * §7 asks for: *"the `renders` fact must gate FIELDS as well as blocks,
     * or Phase 1's win is undone by Phase 5."*
     *
     * A LEAF BELONGS TO A TYPE; A DRAWN LEAF BELONGS TO A PARTIAL. Every
     * type is shared by every template and the catalogue is deliberately one
     * list, so the moment two designs stopped drawing the same things the
     * editor started offering controls that could not act:
     *
     *   - template fidelity 5.x gives `nocturne_ritual` some thirty leaves
     *     `ruled_page` draws nowhere — the two-tone heading companions, the
     *     hero's fact terms, the story ledger, the closing promises, the
     *     footer hub's social column;
     *   - and `ruled_page` has always drawn four `contact` wording overrides
     *     (`phone_label`, `address_label`, `map_label`, `closed_label`) that
     *     the kits' icon-led footer has no room for. That direction was
     *     already true before this round.
     *
     * DERIVED FROM THE PARTIAL, exactly as `photo_blocks` and `renders` are,
     * because a hand list here would be the second source of truth this whole
     * plan exists to remove. Three readings, in order:
     *
     *   1. THE TYPE'S OWN PARTIAL, scanned for the leaves it indexes by name
     *      (`$copy['x']`, or `$fields['x']` where the partial normalises the
     *      array first). This is the same scan SectionTypeTest has always run
     *      in the other direction to keep `fields` honest, so a partial that
     *      reads a leaf and a catalogue that lists it are one fact.
     *   2. THE SHARED FILES (layout, header, footer), scanned for one band's
     *      leaf read by NAME from another file — `['booking']['cta_label']`
     *      is the chrome's Book wording, resolved in the layout because the
     *      header bar and the fixed pill carry it too.
     *   3. {@see LEAF_READERS}, for the leaves a partial reaches through an
     *      allowlisted PageContent method rather than by index. A gallery's
     *      captions arrive inside `galleryPhotos()`, the FAQ's pairs inside
     *      `faqPairs()`, the trust columns inside `trustFeatures()` — the
     *      indirection is the guard, and it must not cost the tenant the
     *      control.
     *
     * A TYPE WITH NO PARTIAL OF ITS OWN may still be drawn, and that is not
     * an edge case: every one of these kits nests `contact` inside the footer
     * hub rather than giving it a band, which is why `fixed_blocks` publishes
     * its placement as `footer`. So where the type ships no partial, the
     * template's FOOTER is read for the copy the layout hands it under
     * another name (`$contactCopy['x']`).
     *
     * A type absent from this map has no opinion published about it and every
     * field is offered — an older frontend, or a type this template does not
     * render at all (which `renders` has already removed from the list).
     *
     * Asked once per builder load on the admin onboarding endpoint, never on
     * the public render path.
     *
     * @return array<string, list<string>>
     */
    public static function contentFieldsFor(string $templateKey): array
    {
        $shared = '';

        foreach (['layout', 'header', 'sections.footer'] as $name) {
            $shared .= "\n" . self::viewBody('landing.' . $templateKey . '.' . $name);
        }

        $out   = [];
        $drawn = self::drawnBlocksFor($templateKey);

        foreach (SectionType::ids() as $id) {
            $type = SectionType::get($id);

            if ($type === null || $type->fields === []) {
                continue;
            }

            // A BAND THIS DESIGN CANNOT PUT ON THE PAGE HAS NO FIELDS HERE.
            // Without this the furniture reading below — which exists for
            // `contact`, drawn inside the footer hub with no partial of its
            // own — would answer for EVERY partial-less type by scanning the
            // shared files, and `team` on a hospitality template (which ships
            // no team partial at all) would come back carrying `kicker`,
            // matched off the footer's own `$contactCopy['kicker']`. `renders`
            // already removes the band; publishing leaves for it is the same
            // untruth one level down.
            if (! isset($drawn[$id])) {
                continue;
            }

            $view = SectionType::viewForType($id, $templateKey);
            $own  = $view === null ? '' : self::viewBody($view);

            // The furniture case: no partial of its own, drawn inside the
            // footer hub under a name the layout chose.
            $body = $own !== '' ? $own : $shared;

            $seen = [];

            // 1 + the furniture reading of the same pattern. `$copy`,
            // `$fields` and `$contactCopy` are the three names a partial
            // beneath a template gives ONE thing: this section's own copy.
            preg_match_all("/\\\$(?:copy|fields|[a-z]+Copy)\['([a-z0-9_]+)'\]/", $body, $direct);

            foreach ($direct[1] as $leaf) {
                $seen[$leaf] = true;
            }

            // 2. One band's leaf, read by name from a shared file.
            preg_match_all("/\['" . preg_quote($id, '/') . "'\]\['([a-z0-9_]+)'\]/", $shared, $byName);

            foreach ($byName[1] as $leaf) {
                $seen[$leaf] = true;
            }

            // 3. The leaves that arrive through an allowlisted reader.
            $scan = $own . $shared;

            foreach (self::LEAF_READERS as $reader => $leaves) {
                if (str_contains($scan, $reader)) {
                    foreach ($leaves() as $leaf) {
                        $seen[$leaf] = true;
                    }
                }
            }

            // The one family no scan can find, because it is resolved before
            // any partial is reached: ContactDetails answers "what is this
            // business's phone number" out of the page's overrides on EVERY
            // template, so these three are offered wherever a contact row is.
            if ($id === 'contact') {
                foreach (ContactDetails::overridableFields() as $leaf) {
                    $seen[$leaf] = true;
                }
            }

            // The type's OWN order, filtered — never the order the scan
            // happened to find them in, which is the order of a file.
            $out[$id] = array_values(array_filter(
                $type->fields,
                static fn (string $leaf) => isset($seen[$leaf]),
            ));
        }

        return $out;
    }

    /**
     * The leaves a partial reaches through an allowlisted PageContent method
     * instead of by index, and the substring that proves it does.
     *
     * The one hand-written half of {@see contentFieldsFor()}, kept as small
     * as it can be and guarded from the other end: LandingOnboardingTest
     * asserts this map is TOTAL — every leaf of every type is either indexed
     * by name in some shipped partial or covered by an entry here — so a new
     * leaf that no design can reach cannot be added without the net going
     * red.
     *
     * The values are closures because {@see SectionType}'s leaf generators
     * are what enumerate each family, and reading them at class-constant time
     * is not possible.
     *
     * `contact`'s three VALUES (`phone`, `email`, `address`) are NOT here —
     * they have no reader substring to look for, because
     * {@see \App\Landing\ContactDetails::resolve()} consumes them before any
     * partial is reached. They are named in {@see contentFieldsFor()}
     * directly, beside the reason.
     *
     * @var array<string, callable(): list<string>>
     */
    private const LEAF_READERS = [
        'imageAlt('      => [SectionType::class, 'altLeaves'],
        'imageCaption('  => [SectionType::class, 'captionLeaves'],
        'galleryPhotos(' => [SectionType::class, 'galleryCaptionLeaves'],
        'faqPairs('      => [SectionType::class, 'faqLeaves'],
        'trustFeatures(' => [SectionType::class, 'trustLeaves'],
        'socialLinks('   => [SectionType::class, 'socialDestinationLeaves'],
    ];

    /** A view's source, or '' where the template ships none. */
    private static function viewBody(string $view): string
    {
        if (! view()->exists($view)) {
            return '';
        }

        $file = resource_path('views/' . str_replace('.', '/', $view) . '.blade.php');

        return is_file($file) ? (string) file_get_contents($file) : '';
    }

    /**
     * WHICH BLOCKS THIS DESIGN ACTUALLY DRAWS A PHOTOGRAPH IN — the narrower
     * fact behind `renders`, and template fidelity 4.5's general rule.
     *
     * A photo SLOT belongs to a type, which is shared by every template; a
     * DRAWN photograph belongs to a partial, which is not. The two came apart
     * the moment R3 gave `services` a band-level plate for kit 02 while kit
     * 01's own services band has never had one: the slot is legitimate, the
     * endpoint accepts it, and on Nocturne Ritual there is nowhere for the
     * picture to appear. A photo control offered there is a control that
     * cannot act — this project's own rule says such a control is not
     * rendered and its absence is explained in one sentence.
     *
     * The same rule, stated once, also closes the bug 4.5 is named for:
     * `text_1..text_6` contributed six slots to the upload allowlist while
     * `nocturne_ritual` shipped no `text` partial at all, so a tenant could
     * upload six photographs nothing would ever show. 3.2 shipped that
     * partial, but the general rule is what stops the same bug arriving with
     * every future template.
     *
     * DERIVED FROM THE PARTIAL, never authored. The question is "does this
     * file read a photograph", and the file is the only honest answer to it —
     * a hand-written list here would be a second source of truth about the
     * contents of a directory, which is exactly what `renders` refuses to be.
     * The predicate is the same one SectionTypeTest has always used to keep
     * the catalogue's `images` count honest against the partials.
     *
     * Only ever asked on the ADMIN onboarding endpoint (once per builder
     * load), never on the public render path, and only of the types that
     * declare a photograph at all — six reads per template rather than
     * thirteen.
     *
     * @return list<string>
     */
    public static function photoBlocksFor(string $templateKey): array
    {
        $out = [];

        foreach (SectionType::ids() as $id) {
            if (SectionType::get($id)?->image !== true) {
                continue;
            }

            $view = SectionType::viewForType($id, $templateKey);

            if ($view === null || !view()->exists($view)) {
                continue;
            }

            $file = resource_path('views/' . str_replace('.', '/', $view) . '.blade.php');

            if (!is_file($file)) {
                continue;
            }

            $body = (string) file_get_contents($file);

            // The two allowlisted readers on PageContent, and nothing else:
            // a partial that draws a picture goes through one of them, by
            // the same discipline that makes the hostile-value battery
            // universal. `$panelImage`-style hand-downs are deliberately not
            // matched — a band whose photograph is resolved somewhere else
            // is a band whose partial does not own the slot, and that is the
            // shape this fact exists to stop.
            if (str_contains($body, 'imageUrl(') || str_contains($body, 'galleryPhotos(') || str_contains($body, 'galleryImages(')) {
                $out[] = $id;
            }
        }

        return $out;
    }

    /**
     * THE SECTION ROWS A NEW PAGE IS CREATED WITH — the industry's own list,
     * plus the blocks the CHOSEN TEMPLATE draws that no industry seeds
     * (template fidelity 3.1 / R4).
     *
     * The union, and it takes both halves for a reason each of them alone
     * gets wrong:
     *
     *   - `defaultSections` alone is what shipped, and it leaves a brand-new
     *     Nocturne page missing three of the author's fifteen blocks
     *     (`announcement`, `trust`, `faq`) until the tenant discovers a
     *     picker. Those blocks are the design; a tenant chose it partly for
     *     them.
     *   - adding them to beauty's `defaultSections` instead — the other
     *     obvious fix — would seed three permanently-dead rows into every
     *     RULED PAGE, which ships no partial for any of them. That is the
     *     concern this template's own layout already records in prose.
     *
     * So the extra rows are a function of the TEMPLATE, resolved through the
     * same two derivations everything else here uses:
     * {@see SectionType::addableIds()} (a fixed type no industry seeds, with
     * something to edit) intersected with {@see rendersFor()} (this template
     * ships a partial for it). A Ruled Page tenant therefore still gets
     * exactly the seven rows they got before, and neither list is copied.
     *
     * REPEATABLE TYPES ARE NOT SEEDED. `text` and `gallery` are addable and
     * drawn by both templates, and `addableIds()` names them — but they have
     * no bare key (`text` is a type, `text_1` is a section) and a page that
     * arrives with an empty band is the "headed band over blank space" every
     * count() arm exists to prevent. They are added, which is what repeatable
     * means.
     *
     * Order: the industry's list first, in its own order, then the template's
     * blocks in catalogue order. Sort position barely matters for these three
     * — every kit layout draws them as furniture, in the author's own places
     * — but a stable order means two pages created a second apart carry the
     * same rows in the same sequence.
     *
     * SectionType::MAX_SECTIONS_PER_PAGE is 16 and the longest union is
     * 7 + 3 = 10, leaving six for the tenant's own text and gallery bands.
     *
     * @return list<string>
     */
    public static function seedSectionsFor(string $templateKey, IndustryProfile $profile): array
    {
        $renders = array_flip(self::rendersFor($templateKey));

        $extra = array_values(array_filter(
            SectionType::addableIds(),
            static fn (string $id) => isset($renders[$id])
                && SectionType::get($id)?->repeatable === false
                && !in_array($id, $profile->defaultSections, true),
        ));

        // The industry's own list, NARROWED to the blocks this design actually
        // puts on the page. Every industry seeds `team`, and the three
        // hospitality templates ship no team partial at all — a restaurant page
        // created on one of them would otherwise arrive carrying a row whose
        // band the layout silently drops, which is the dead control this whole
        // capability round exists to remove, arriving through the SEEDING door
        // instead of the picker.
        //
        // "Draws" is {@see drawnBlocksFor()}'s union, and it takes both halves:
        // `renders` alone would drop `contact` from every kit template, because
        // those designs draw the contact details INSIDE the footer hub and ship
        // no contact partial — which is precisely what their `fixed_blocks`
        // entry publishes as `footer`.
        //
        // A no-op for every template before this round: all four draw all seven
        // of the seeded types, one way or the other.
        $drawn = self::drawnBlocksFor($templateKey);

        $seeded = array_values(array_filter(
            $profile->defaultSections,
            static fn (string $id) => isset($drawn[SectionType::typeOf($id) ?? $id]),
        ));

        return array_values(array_merge($seeded, $extra));
    }

    /**
     * Which of a template's blocks it draws in a place of its own choosing,
     * and where — the third capability fact, beside `supports` and
     * `renders`.
     *
     * Normalised rather than passed through: a key the catalogue does not
     * know, or a placement outside {@see PLACEMENTS}, is dropped. Both would
     * otherwise reach the editor as a control silently withheld from a row
     * with no sentence to explain it, which is worse than the dead arrows
     * this fact exists to remove.
     *
     * @param  array<string, mixed> $row
     * @return array<string, string>
     */
    private static function fixedBlocksFor(array $row): array
    {
        $authored = is_array($row['fixed_blocks'] ?? null) ? $row['fixed_blocks'] : [];
        $ids      = SectionType::ids();

        $out = [];

        foreach ($authored as $key => $placement) {
            if (! is_string($key) || ! in_array($key, $ids, true)) {
                continue;
            }

            if (! is_string($placement) || ! in_array($placement, self::PLACEMENTS, true)) {
                continue;
            }

            $out[$key] = $placement;
        }

        return $out;
    }

    /**
     * EVERY BLOCK A TEMPLATE PUTS ON THE PAGE, one way or the other — the
     * union of {@see rendersFor()} and the template's own `fixed_blocks`,
     * as a lookup.
     *
     * BOTH HALVES ARE NEEDED, and each alone is wrong in a different
     * direction:
     *
     *   - `renders` alone loses `contact` on every kit template. Those designs
     *     print the address, the channels and the hours INSIDE the footer hub
     *     and ship no contact.blade.php, which is exactly what their
     *     `fixed_blocks` entry already publishes as `footer`.
     *   - `fixed_blocks` alone is only the furniture and names none of the
     *     ordinary bands.
     *
     * Asked by {@see seedSectionsFor()} (do not create a row for a band this
     * design drops) and by {@see contentFieldsFor()} (do not publish leaves for
     * one either). Both used to answer it separately, one of them wrongly.
     *
     * @return array<string, true>
     */
    private static function drawnBlocksFor(string $templateKey): array
    {
        $row = collect(self::TEMPLATES)->firstWhere('key', $templateKey) ?? [];

        return array_flip(array_merge(
            self::rendersFor($templateKey),
            array_keys(self::fixedBlocksFor($row)),
        ));
    }

    /**
     * WHICH SECTION TYPES A TEMPLATE CAN ACTUALLY DRAW — derived from the
     * shipped partials, never written down.
     *
     * This is the same question both layouts already ask, one section at a
     * time, in their `$renderedSections` filter: `view()->exists()` on
     * SectionType's answer for the key. Asking it of the whole catalogue up
     * front is what lets the editor stop offering a band this design will
     * silently drop — "Add a Text block" on nocturne_ritual, which ships no
     * text.blade.php, is today a control a tenant can press, write into,
     * save, and never see.
     *
     * DERIVED IS THE WHOLE POINT. A hand-written list here would be a
     * second answer to a question the renderer resolves off disk on every
     * request, and it would be wrong the first time somebody added a
     * partial — which is precisely how ten dead design cards and a dead Add
     * button got shipped in the first place.
     *
     * Asked through {@see SectionType::viewForType()} rather than viewFor():
     * this enumerates TYPES, and `text`/`gallery` are types whose bare ids
     * are deliberately not section keys.
     *
     * @return list<string>
     */
    public static function rendersFor(string $templateKey): array
    {
        return array_values(array_filter(
            SectionType::ids(),
            static function (string $id) use ($templateKey): bool {
                $view = SectionType::viewForType($id, $templateKey);

                return $view !== null && view()->exists($view);
            },
        ));
    }

    /**
     * One template row's `supports` map, with every key present.
     *
     * A row that omits the whole map, or one key of it, reads as FALSE —
     * see {@see SUPPORT_KEYS}. A template added without saying whether it
     * honours the palette has not said yes.
     *
     * @param  array<string, mixed> $row
     * @return array<string, bool>
     */
    private static function supportsFor(array $row): array
    {
        $authored = is_array($row['supports'] ?? null) ? $row['supports'] : [];

        $out = [];

        foreach (self::SUPPORT_KEYS as $key) {
            $out[$key] = ($authored[$key] ?? false) === true;
        }

        return $out;
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
            // templates(), not the raw TEMPLATES constant: the rows carry
            // their capability facts (`supports`, `renders`) so the editor's
            // Design panel can stop drawing a control the chosen template
            // ignores. See templates().
            'templates'      => self::templates(),
            // Landing phase 3c (wizard industry step): the nine industries
            // step 1 offers, each with the words a page in it would carry.
            // See industries() for why the list is Organization's and the
            // vocabulary is IndustryProfile's.
            'industries'     => self::industries(),
            'sections'       => $this->sections($content),
            // The section-type CATALOGUE (App\Landing\SectionType), served
            // for the identical reason `templates` and `industries` above
            // are and never mirrored on the front end: which types exist,
            // which of them a tenant may ADD, what fields each one edits and
            // which take a photo are all facts the server already holds, and
            // a second copy in TypeScript is a copy that can offer a type the
            // add endpoint would then 422 on.
            //
            // Distinct from `sections` one line up, which is a different
            // question with a confusingly similar name: THAT is this page's
            // own bands with the tenant's content counts against them ("Team
            // (0) — add some from your Team screen"), and it is what the
            // wizard's step 4 reads. THIS is the type table, independent of
            // any page.
            'section_types'  => SectionType::payload(),
            // The OTHER cap, and the only one `section_types` structurally
            // cannot carry: `limit` there is per-type ("up to six of these"),
            // while this is the whole-page ceiling
            // (SectionType::MAX_SECTIONS_PER_PAGE) that
            // LandingPageSectionController::store() checks against the
            // row-locked page. Both refusals exist; without this one on the
            // wire the editor could only grey out its Add control for the
            // first of them, and would have to discover the second by
            // issuing an add and reading the 422 -- or, worse, by keeping a
            // copy of the number 16 in TypeScript, which is exactly the
            // second source of truth `section_types` was served to avoid.
            //
            // A scalar rather than a key inside each `section_types` row: it
            // is a fact about the PAGE, not about any one type, and
            // repeating it on every row would invite a reader to believe
            // otherwise.
            'max_sections'   => SectionType::MAX_SECTIONS_PER_PAGE,
            // The tone allowlist (SectionType::TONES' ids, in the order the
            // editor should offer them) — served for the third time for the
            // third identical reason: it is what
            // LandingPageSectionController::update() validates a section's
            // colour against, so a picker built from a hand-kept copy in
            // TypeScript is a picker that can offer a swatch the save would
            // then 422 on.
            //
            // Ids only. What each one LOOKS like is a question about the
            // palette the page is currently wearing, and the admin SPA
            // already holds those colours for its own design cards
            // (frontend/src/pages/landing/designChoices.ts) — sending a hex
            // from here would be the server describing CSS it does not
            // render, and would go stale against the palette the tenant
            // switches to a moment later.
            'section_tones'  => SectionType::toneIds(),
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
                self::syncOrganizationIndustry($org, $industry);

                $page->save();

                // No redirect row may share a slug with a live page. Cleared
                // only once the claim has succeeded, because until then the
                // row is still somebody else's.
                LandingPageGuard::releaseRedirects($slug);

                // Seeded from the industry's own section list UNION the
                // blocks the chosen template draws that no industry seeds
                // (template fidelity 3.1 / R4) — so the wizard and
                // LandingPageController::store() produce the same page, and
                // so ordering is fixed at creation rather than by whatever a
                // later template revision happens to list first. See
                // seedSectionsFor().
                foreach (self::seedSectionsFor($page->template_key, $profile) as $i => $key) {
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
     *
     * WHICH ROWS: the industry's `defaultSections` — the bands a page in this
     * industry is CREATED with, which is the only question the wizard can ask
     * (it describes a page that does not exist yet) — UNION the fixed rows
     * THIS page actually carries (template fidelity 3.1).
     *
     * The union is what makes an added or template-seeded block editable at
     * all. `buildSectionRows` drops a fixed row with no entry in this list
     * rather than drawing it with blank copy, so before the union an
     * `announcement` row on a page was a row the editor silently threw away —
     * and the tenant-facing words for it ("Offer bar", "A short line you
     * write here…") have sat in SECTION_COPY, unread by anything, since the
     * kit landed. Repeatable instances are deliberately NOT unioned in: the
     * editor derives their label and their availability itself (see
     * `buildSectionRows`' instance arm), because "which bands is a page in
     * this industry created with" has no answer for a band the tenant added.
     */
    private function sections(PageContent $content): array
    {
        $page = $content->page;

        // Only a SAVED page has rows; the wizard's stand-in
        // (probePage()) is an unsaved model describing a page that does not
        // exist yet, and asking it for its sections would query on a null
        // foreign key.
        $own = $page->exists
            ? $page->sections->pluck('key')->filter(fn ($key) => SectionType::get((string) $key)?->repeatable === false)
            : collect();

        return collect($content->profile->defaultSections)
            ->concat($own)
            ->unique()
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
        // explicit_industry, NOT resolved_industry: the difference is what an
        // org that never picked gets, and this value is published on the
        // tenant's own domain. resolved_industry answers 'hotel' there --
        // DEFAULT_INDUSTRY -- so a tutoring company's page called itself
        // "The Hotel" and asked its visitors to "Book your stay". The admin
        // may keep guessing hotel; a customer-facing page may not, so an
        // unpicked industry gets the neutral profile and the wizard's first
        // step asks for the real answer.
        return $org->explicit_industry ?? IndustryProfile::FALLBACK_INDUSTRY;
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
     * PUBLIC AND STATIC since the editor gained its own industry control
     * (landing phase 3c, Plan A -- the Design panel's industry picker).
     * There are now two screens that let a tenant change this, and there
     * must not be two ANSWERS to "what does changing it do": this method is
     * the one writer both go through (apply() below-left,
     * LandingPageController::update() for a page that already exists), so
     * the no-op rule, the single column written and -- most of all -- the
     * deliberate refusal to run the CRM presets are decided once, here,
     * rather than re-decided per call site. Static because it reads no
     * instance state; the controller therefore needs no constructor
     * injection to reach it.
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
     * no-op test applyIndustry() makes for the same reason -- and the same
     * reason the editor's save may send `industry` on every save without
     * that costing an org write per keystroke-batch.
     *
     * $industry is expected CANONICAL (one of Organization::INDUSTRIES).
     * Both callers narrow before they get here -- apply() through
     * chosenIndustry()'s normaliseIndustry(), update() through the same
     * plus its own Rule::in -- because an alias reaching resolved_industry's
     * comparison below would look like a change on every single save.
     */
    public static function syncOrganizationIndustry(Organization $org, string $industry): void
    {
        if ($org->resolved_industry === $industry) {
            return;
        }

        $org->industry = $industry;
        $org->save();
    }
}
