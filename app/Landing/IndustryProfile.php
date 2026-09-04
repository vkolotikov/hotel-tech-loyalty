<?php
namespace App\Landing;

use App\Models\Organization;

/**
 * Per-industry vocabulary and defaults layered over a template.
 *
 * A template is a design; it does not know what a business calls the things it
 * sells. A spa and a clinic can choose the same template and get different
 * pages because this layer supplies the words.
 *
 * Keys are ids from Organization::INDUSTRIES. A profile keyed anything else
 * could never match an organization, so a test asserts that.
 */
final class IndustryProfile
{
    private function __construct(
        public readonly string $industry,
        public readonly string $servicesLabel,
        public readonly string $peopleLabel,
        public readonly string $primaryCta,
        public readonly string $accent,
        public readonly array  $kickers,
        public readonly array  $defaultSections,
        // The curated palette (App\Landing\Palette) this industry pre-selects
        // for a NEW page (Task 6's editor/wizard cards; nothing in THIS round
        // applies it to a page — see Palette's own docblock). Wired here
        // rather than in Palette itself, symmetrically with `accent` above:
        // industry vocabulary and industry-default styling are the same kind
        // of fact, and Palette has no reason to know Organization::INDUSTRIES
        // exists.
        public readonly string $defaultPalette,
        // Whether $industry above is a genuine match, as opposed to
        // 'other' filled in because the input didn't resolve to anything.
        // Vocabulary and schema.org type deliberately answer this question
        // differently — see schemaType().
        private readonly bool $resolved,
    ) {}

    /**
     * The mono eyebrow a band wears, which on the ruled_page template is set
     * vertically on the Rule and read as the page's index: scanning the left
     * margin gives THE MENU / THE STUDIO / WHO YOU’LL SEE / IN THEIR WORDS /
     * RESERVE / FINDING US.
     *
     * It is vocabulary, not decoration, and so it lives here rather than as a
     * literal in six partials: a clinic's index reads THE PROCEDURES / YOUR
     * CLINICIANS, and that difference is the whole point of this class.
     * Missing keys return '' so a partial can omit the eyebrow rather than
     * print a section key at a customer.
     */
    public function kicker(string $section): string
    {
        return $this->kickers[$section] ?? '';
    }

    /**
     * schema.org LocalBusiness has industry-specific subtypes, and Google's
     * own structured-data guidance is that the most specific applicable
     * type should be used rather than the generic one. As of the industry
     * profile round (2026-08-25) every id in Organization::INDUSTRIES has a
     * subtype authored here, matching {@see all()} one for one — 'other' is
     * the one entry that maps to the generic type deliberately: it is
     * genuinely a resolved, named industry (the "my business isn't listed"
     * catch-all), not the absence of one. A future industry this class has
     * not been taught the vocabulary for yet still gets the generic type
     * rather than a guess or a thrown error, same as {@see all()}.
     */
    /**
     * The profile a page falls back to when no industry resolves.
     *
     * Deliberately NOT Organization::DEFAULT_INDUSTRY. That constant dresses
     * the ADMIN and may hold an opinion; this one is published on a tenant's
     * own domain, where guessing 'hotel' told an education tenant's visitors
     * to "Book your stay". 'other' carries honestly generic words instead.
     */
    public const FALLBACK_INDUSTRY = 'other';

    private const SCHEMA_TYPES = [
        'hotel'       => 'Hotel',
        'beauty'      => 'BeautySalon',
        'medical'     => 'MedicalClinic',
        'restaurant'  => 'Restaurant',
        'legal'       => 'LegalService',
        'real_estate' => 'RealEstateAgent',
        'education'   => 'EducationalOrganization',
        'fitness'     => 'ExerciseGym',
        'other'       => 'LocalBusiness',
    ];

    public function schemaType(): string
    {
        // An unresolved industry ('', 'garbage', null) falls through to the
        // 'other' vocabulary for COPY purposes -- see for()'s own comment,
        // two methods below, on why that fallback is 'other' and never
        // Organization::DEFAULT_INDUSTRY ('hotel'): a page has to render
        // something rather than nothing, and 'other's honestly-generic words
        // ("Services", "Our team") are what an industry that was never
        // actually identified gets. schemaType() must not inherit that
        // fallback either, even though 'other' itself maps to the generic
        // LocalBusiness type in SCHEMA_TYPES below: publishing a NAMED
        // schema.org subtype for a business that was never identified as
        // that industry would be a false claim to Google, not a graceful
        // degrade, so this checks $this->resolved directly rather than
        // trusting that an unresolved industry already reads 'other' here --
        // true today, but not a fact this method should have to rely on.
        if (!$this->resolved) {
            return 'LocalBusiness';
        }

        return self::SCHEMA_TYPES[$this->industry] ?? 'LocalBusiness';
    }

    /**
     * Industry vocabulary, authored per spec §4.2 (2026-08-25) — final copy,
     * transcribed rather than improvised. Eight profiles were added here in
     * that round; before it, this method authored `beauty` alone and every
     * other industry silently inherited its vocabulary through the {@see
     * for()} fallback — a live education tenant was offered "Treatments"
     * and "Therapists" as a direct result.
     *
     * `defaultSections` lists 'booking' for `hotel` AND `beauty` — beauty
     * deliberately, so that a salon's page is created with the row and the
     * gate decides whether it renders. Which gate changed in template
     * fidelity phase 6: {@see PageContent::bookingMode()} is a CAPABILITY
     * test (a hotel, or any tenant with a bookable service, practitioner and
     * schedule) rather than an industry test, so a band can now appear on a
     * page in ANY industry — a kit template draws one, and a clinic with
     * working hours on file gets it. That is why EVERY profile carries a
     * `booking` kicker below, including the seven whose `defaultSections`
     * never seed the row: {@see kicker()} returns '' for a missing key, and
     * an empty string over a band that renders is a blank eyebrow, not a
     * graceful degrade. The '' return itself stays, for the legacy section
     * row a template rollback can leave behind on a key no profile knows.
     *
     * `fitness`'s accent is the one value NOT taken verbatim from the spec
     * table: the spec lists #C25A2B, which sits in Accent's WCAG dead band
     * (white on it measures 4.383:1, dark ink 4.172:1 — both under the 4.5:1
     * FLOOR), and Accent::for() does not run its own discard-on-fail check
     * against the house colour itself (only against a REJECTED tenant
     * candidate) — so an un-overridden fitness page would ship an unreadable
     * CTA to every tenant in that industry from day one. Darkened 4% toward
     * black along the same hue, the same step Accent::toward() itself uses,
     * to #BA5629 (white label 4.718:1) — the smallest correction that clears
     * the floor with real headroom rather than scraping it. See AccentTest's
     * per-profile house-colour coverage, which is what caught this.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function all(): array
    {
        return [
            'beauty' => [
                'servicesLabel' => 'Treatments',
                'peopleLabel'   => 'Therapists',
                'primaryCta'    => 'Book appointment',
                'accent'        => '#9B5C8F',
                // Spec §3 D2: "champagne_noir (the reference language;
                // beauty/spa default)".
                'defaultPalette'=> 'champagne_noir',
                'kickers'       => [
                    'services' => 'The menu',
                    'about'    => 'The studio',
                    'team'     => 'Who you’ll see',
                    'reviews'  => 'In their words',
                    'booking'  => 'Reserve',
                    'contact'  => 'Finding us',
                ],
                'defaultSections' => ['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'],
            ],
            'hotel' => [
                'servicesLabel' => 'Rooms & Suites',
                'peopleLabel'   => 'At your service',
                'primaryCta'    => 'Book your stay',
                'accent'        => '#1B3A5C',
                // Spec §3 D2: "midnight_brass (hotel)".
                'defaultPalette'=> 'midnight_brass',
                'kickers'       => [
                    'services' => 'Stay with us',
                    'about'    => 'The hotel',
                    // Was 'At your service', identical to peopleLabel just
                    // below it -- team.blade.php stacks the kicker directly
                    // above the h2 that prints peopleLabel, so the band read
                    // as the same three words twice. Ledger-authored
                    // replacement (final-review.md, MUST-FIX item 4).
                    'team'     => 'Your hosts',
                    'reviews'  => 'Guest words',
                    'booking'  => 'Reserve',
                    'contact'  => 'Getting here',
                ],
                'defaultSections' => ['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'],
            ],
            'medical' => [
                'servicesLabel' => 'Services',
                'peopleLabel'   => 'Practitioners',
                'primaryCta'    => 'Book a consultation',
                'accent'        => '#1D6F6B',
                // Spec §3 D2: "clinic_air (medical, dental)".
                'defaultPalette'=> 'clinic_air',
                'kickers'       => [
                    'services' => 'What we treat',
                    'about'    => 'The clinic',
                    'team'     => 'Your care team',
                    'reviews'  => 'Patient words',
                    'booking'  => 'Appointments',
                    'contact'  => 'Visit us',
                ],
                'defaultSections' => ['hero', 'services', 'about', 'team', 'reviews', 'contact'],
            ],
            'restaurant' => [
                'servicesLabel' => 'The menu',
                'peopleLabel'   => 'The kitchen',
                'primaryCta'    => 'Reserve a table',
                'accent'        => '#8C3B2E',
                // Spec §3 D2: "terracotta (restaurant, café)".
                'defaultPalette'=> 'terracotta',
                'kickers'       => [
                    'services' => 'On the table',
                    'about'    => 'The house',
                    // Was 'The kitchen', identical to peopleLabel just below
                    // it -- same duplication as the hotel profile above, and
                    // the same ledger-authored replacement.
                    'team'     => 'Behind the pass',
                    'reviews'  => 'Word of mouth',
                    'booking'  => 'Reservations',
                    'contact'  => 'Find us',
                ],
                'defaultSections' => ['hero', 'services', 'about', 'team', 'reviews', 'contact'],
            ],
            'legal' => [
                'servicesLabel' => 'Practice areas',
                'peopleLabel'   => 'Attorneys',
                'primaryCta'    => 'Request a consultation',
                'accent'        => '#3B4B74',
                // Spec §3 D2 names slate_amber's third bucket "professional"
                // alongside fitness/education, and never names legal or
                // real_estate anywhere else — this is that bucket, not a
                // fallback. See this task's report for the full nine-way
                // table.
                'defaultPalette'=> 'slate_amber',
                'kickers'       => [
                    'services' => 'How we help',
                    'about'    => 'The firm',
                    'team'     => 'Who represents you',
                    'reviews'  => 'Client words',
                    'booking'  => 'Consultations',
                    'contact'  => 'Reach us',
                ],
                'defaultSections' => ['hero', 'services', 'about', 'team', 'reviews', 'contact'],
            ],
            'real_estate' => [
                'servicesLabel' => 'Services',
                'peopleLabel'   => 'Agents',
                'primaryCta'    => 'Arrange a viewing',
                'accent'        => '#7A5C2E',
                // Spec §3 D2's slate_amber bucket ("professional"); see the
                // legal profile's own comment just above for why.
                'defaultPalette'=> 'slate_amber',
                'kickers'       => [
                    'services' => 'What we do',
                    'about'    => 'The agency',
                    'team'     => 'Your agents',
                    'reviews'  => 'From our clients',
                    'booking'  => 'Viewings',
                    'contact'  => 'Talk to us',
                ],
                'defaultSections' => ['hero', 'services', 'about', 'team', 'reviews', 'contact'],
            ],
            'education' => [
                'servicesLabel' => 'Courses',
                'peopleLabel'   => 'Instructors',
                'primaryCta'    => 'Book a lesson',
                'accent'        => '#35509E',
                // Spec §3 D2: "slate_amber (fitness, education,
                // professional)".
                'defaultPalette'=> 'slate_amber',
                'kickers'       => [
                    'services' => 'What you\'ll learn',
                    'about'    => 'The academy',
                    'team'     => 'Who teaches',
                    'reviews'  => 'From our students',
                    'booking'  => 'Book a place',
                    'contact'  => 'Get in touch',
                ],
                'defaultSections' => ['hero', 'services', 'about', 'team', 'reviews', 'contact'],
            ],
            'fitness' => [
                'servicesLabel' => 'Classes',
                'peopleLabel'   => 'Trainers',
                'primaryCta'    => 'Book a class',
                // See this method's docblock: darkened from the spec's
                // #C25A2B, which fails the WCAG label floor unaided.
                'accent'        => '#BA5629',
                // Spec §3 D2: "slate_amber (fitness, education,
                // professional)".
                'defaultPalette'=> 'slate_amber',
                'kickers'       => [
                    'services' => 'Train with us',
                    'about'    => 'The studio',
                    'team'     => 'Your coaches',
                    'reviews'  => 'Member words',
                    'booking'  => 'Save your spot',
                    'contact'  => 'Find the gym',
                ],
                'defaultSections' => ['hero', 'services', 'about', 'team', 'reviews', 'contact'],
            ],
            'other' => [
                'servicesLabel' => 'Services',
                'peopleLabel'   => 'Our team',
                'primaryCta'    => 'Get in touch',
                'accent'        => '#2D6A4F',
                // Spec §3 D2: "porcelain (... other, default)" — also the
                // palette the un-palette'd CSS's own :root already ships,
                // so 'other' picking it is a genuine no-op default.
                'defaultPalette'=> 'porcelain',
                'kickers'       => [
                    'services' => 'What we offer',
                    'about'    => 'About us',
                    'team'     => 'The people',
                    'reviews'  => 'Kind words',
                    'booking'  => 'Book a time',
                    'contact'  => 'Contact',
                ],
                'defaultSections' => ['hero', 'services', 'about', 'team', 'reviews', 'contact'],
            ],
        ];
    }

    public static function for(?string $industry): self
    {
        // Normalising through the model means aliases such as "hospitality"
        // resolve the same way here as everywhere else in the platform.
        //
        // normaliseIndustry() itself does neither of the two lines below —
        // it is used platform-wide, and widening ITS contract is a bigger
        // change than this class should make unilaterally. But
        // LandingPage.industry is a plain string(32) snapshot with no
        // constraint, so "Hospitality" or " hospitality " reaching it is
        // not far-fetched, and normaliseIndustry() is case- and
        // whitespace-sensitive: neither variant resolves, both silently
        // fall through to the 'other' vocabulary below, and a restaurant's
        // structured data would tell Google it is a generic LocalBusiness
        // rather than a Restaurant. Trim and lowercase here, once, before
        // resolving — this only WIDENS what resolves correctly, so nothing
        // that already worked can start failing.
        $normalised = is_string($industry) ? strtolower(trim($industry)) : $industry;
        $resolvedId = Organization::normaliseIndustry($normalised);
        // Both the vocabulary fallback below and `resolved:` at the bottom
        // of this method must test $resolvedId the SAME way. A falsy check
        // (?:) here paired with a strict !== null check there would agree
        // for every value normaliseIndustry() can return TODAY, but not for
        // a hypothetical future industry id of '0': that string is falsy,
        // so $id would silently become 'other' while `resolved` stayed
        // true, and schemaType() would then map 'other's LocalBusiness type
        // onto an industry that was never actually '0' — the exact false
        // claim to Google this class exists to prevent. One test, used in
        // both places (`??`, a strict-null operator, not `?:`), is what
        // keeps that impossible rather than merely unlikely.
        //
        // This deliberately does NOT reuse Organization::DEFAULT_INDUSTRY
        // ('hotel'): that constant answers "which industry does an org get
        // when it has never picked ONE AT ALL", a different question from
        // "what vocabulary does a STRING THAT NEVER RESOLVED get". Coercing
        // the latter to DEFAULT_INDUSTRY is how this exact bug happened a
        // second time inside this fix — once every industry (including
        // hotel) had an authored profile, an unresolved id silently started
        // reading as "Rooms & Suites" / "Book your stay" instead of the
        // generic copy below, because DEFAULT_INDUSTRY is itself a NAMED
        // industry. 'other' is the only id with no more-generic industry to
        // misrepresent as, which is why it is Organization::INDUSTRIES' own
        // "my business isn't listed" entry.
        $id = $resolvedId ?? self::FALLBACK_INDUSTRY;

        $all = self::all();

        // Falling back to `other` rather than throwing: this line does NOT
        // catch an unresolved $industry — $id above is already 'other' in
        // that case, and self::all() authors every id in
        // Organization::INDUSTRIES (a test asserts it), so $all[$id] hits
        // directly for every value $id can take today. What this guards is
        // tomorrow's version of the bug this whole method exists to fix: a
        // TENTH industry added to INDUSTRIES (so $resolvedId legitimately
        // resolves to it) before this class is taught its vocabulary. That
        // org must still get a page, and 'other's honestly-generic copy
        // ("Services", "Our team") is the right thing to hand it — silently
        // inheriting some OTHER named industry's words is exactly how an
        // education tenant was once offered "Treatments" and "Therapists".
        $data = $all[$id] ?? $all['other'];

        return new self(
            industry:        $id,
            servicesLabel:   $data['servicesLabel'],
            peopleLabel:     $data['peopleLabel'],
            primaryCta:      $data['primaryCta'],
            accent:          $data['accent'],
            kickers:         $data['kickers'],
            defaultSections: $data['defaultSections'],
            defaultPalette:  $data['defaultPalette'],
            resolved:        $resolvedId !== null,
        );
    }
}
