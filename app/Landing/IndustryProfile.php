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
        // Whether $industry above is a genuine match, as opposed to
        // DEFAULT_INDUSTRY filled in because the input didn't resolve to
        // anything. Vocabulary and schema.org type deliberately answer
        // this question differently — see schemaType().
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
     * type should be used rather than the generic one. Only the four GTM
     * industries (Organization::GTM_INDUSTRIES) have a subtype authored
     * here; everything else — including a future industry this class has
     * not been taught the vocabulary for yet, same as {@see all()} — gets
     * the generic type rather than a guess or a thrown error.
     */
    private const SCHEMA_TYPES = [
        'hotel'      => 'LodgingBusiness',
        'beauty'     => 'BeautySalon',
        'medical'    => 'MedicalBusiness',
        'restaurant' => 'Restaurant',
    ];

    public function schemaType(): string
    {
        // An unresolved industry ('', 'garbage', null) falls through to
        // DEFAULT_INDUSTRY ('hotel') for VOCABULARY purposes — a page has to
        // render something rather than nothing. schemaType() must not
        // inherit that fallback: publishing LodgingBusiness for a business
        // that was never actually identified as a hotel is a false claim to
        // Google, not a graceful degrade. An unresolved industry therefore
        // always publishes the generic type, regardless of what
        // DEFAULT_INDUSTRY happens to be.
        if (!$this->resolved) {
            return 'LocalBusiness';
        }

        return self::SCHEMA_TYPES[$this->industry] ?? 'LocalBusiness';
    }

    /** @return array<string, array<string, mixed>> */
    public static function all(): array
    {
        return [
            'beauty' => [
                'servicesLabel' => 'Treatments',
                'peopleLabel'   => 'Therapists',
                'primaryCta'    => 'Book appointment',
                'accent'        => '#9B5C8F',
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
        // fall through to DEFAULT_INDUSTRY ('hotel'), and a beauty salon's
        // structured data would tell Google it is a LodgingBusiness. Trim
        // and lowercase here, once, before resolving — this only WIDENS
        // what resolves correctly, so nothing that already worked can
        // start failing.
        $normalised = is_string($industry) ? strtolower(trim($industry)) : $industry;
        $resolvedId = Organization::normaliseIndustry($normalised);
        // Both the vocabulary fallback below and `resolved:` at the bottom
        // of this method must test $resolvedId the SAME way. A falsy check
        // (?:) here paired with a strict !== null check there would agree
        // for every value normaliseIndustry() can return TODAY, but not for
        // a hypothetical future industry id of '0': that string is falsy,
        // so $id would silently become DEFAULT_INDUSTRY while `resolved`
        // stayed true, and schemaType() would then map DEFAULT_INDUSTRY's
        // type onto an industry that was never actually '0' — the exact
        // false claim to Google this class exists to prevent. One test,
        // used in both places, is what keeps that impossible rather than
        // merely unlikely.
        $id = $resolvedId !== null ? $resolvedId : Organization::DEFAULT_INDUSTRY;

        $all = self::all();

        // Falling back to beauty rather than throwing: an org carrying an
        // industry we have not authored yet must still get a page.
        $data = $all[$id] ?? $all['beauty'];

        return new self(
            industry:        $id,
            servicesLabel:   $data['servicesLabel'],
            peopleLabel:     $data['peopleLabel'],
            primaryCta:      $data['primaryCta'],
            accent:          $data['accent'],
            kickers:         $data['kickers'],
            defaultSections: $data['defaultSections'],
            resolved:        $resolvedId !== null,
        );
    }
}
