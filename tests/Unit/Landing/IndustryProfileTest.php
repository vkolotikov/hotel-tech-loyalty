<?php
namespace Tests\Unit\Landing;

use App\Landing\IndustryProfile;
use App\Models\Organization;
use Tests\TestCase;

class IndustryProfileTest extends TestCase
{
    public function test_beauty_uses_beauty_vocabulary(): void
    {
        $p = IndustryProfile::for('beauty');

        $this->assertSame('Treatments', $p->servicesLabel);
        $this->assertSame('Therapists', $p->peopleLabel);
        $this->assertSame('Book appointment', $p->primaryCta);
    }

    /**
     * Rewritten: the original version asserted
     * for('restaurant')->servicesLabel === for('hospitality')->servicesLabel.
     * With only the beauty profile authored, EVERY industry — resolved,
     * unresolved, aliased or not — falls back to beauty's servicesLabel, so
     * that equality held whether or not the alias lookup ran at all. It
     * would have passed against a normaliseIndustry() that did nothing.
     * schemaType() is what makes this fixable: 'beauty', 'medical',
     * 'restaurant' and 'hotel' each have their OWN schema.org subtype (see
     * IndustryProfile::SCHEMA_TYPES), so asserting on it actually exercises
     * the alias resolution rather than the shared beauty fallback.
     *
     * Also covers the two spellings a stored 'hospitality' value can take
     * that Organization::normaliseIndustry() does not itself normalise
     * (it is case- and whitespace-sensitive): IndustryProfile::for() trims
     * and lowercases before resolving, precisely so these still land on
     * 'restaurant' instead of silently falling through to DEFAULT_INDUSTRY.
     */
    public function test_an_alias_resolves_to_its_canonical_industry(): void
    {
        foreach (['hospitality', 'Hospitality', ' hospitality '] as $spelling) {
            $this->assertSame(
                'Restaurant',
                IndustryProfile::for($spelling)->schemaType(),
                "['{$spelling}'] did not resolve to the restaurant alias's schema type."
            );
        }

        // The alias and its canonical form must agree, not just each land on
        // *some* non-empty value.
        $this->assertSame(
            IndustryProfile::for('restaurant')->schemaType(),
            IndustryProfile::for('hospitality')->schemaType(),
        );
    }

    public function test_an_unknown_industry_falls_back_rather_than_throwing(): void
    {
        // A page must render even if an org carries an industry we never
        // authored a profile for.
        $this->assertNotEmpty(IndustryProfile::for('nonsense')->servicesLabel);
    }

    /**
     * The vocabulary fallback (DEFAULT_INDUSTRY = 'hotel') and the
     * schema.org type answer "did this actually resolve?" differently, and
     * must: publishing LodgingBusiness for a business that was never
     * identified as a hotel is a false claim to Google, not a graceful
     * degrade the way falling back to beauty's vocabulary is. An empty
     * string, garbage, and null must all publish the generic type.
     */
    public function test_an_unresolved_industry_publishes_the_generic_schema_type(): void
    {
        foreach (['', 'nonsense', null] as $unresolved) {
            $this->assertSame('LocalBusiness', IndustryProfile::for($unresolved)->schemaType());
        }

        // The contrast: 'hotel' passed explicitly DOES resolve, and gets
        // its own subtype rather than the generic fallback.
        $this->assertSame('LodgingBusiness', IndustryProfile::for('hotel')->schemaType());
    }

    public function test_every_profile_key_is_a_real_industry_id(): void
    {
        // The failure this prevents: a profile keyed "spa" or "salon" that no
        // organization can ever match, so it silently never applies.
        foreach (array_keys(IndustryProfile::all()) as $key) {
            $this->assertContains($key, Organization::INDUSTRIES,
                "'{$key}' is not in Organization::INDUSTRIES, so no org can ever resolve to it.");
        }
    }

    public function test_a_profile_supplies_the_eyebrow_for_every_section_it_ships(): void
    {
        // On ruled_page the eyebrows are set vertically on the Rule and read
        // as the page's index, so a missing one leaves a gap in the margin.
        // They are vocabulary, not decoration: a clinic's index has to be able
        // to read THE PROCEDURES where a salon's reads THE MENU.
        foreach (IndustryProfile::all() as $id => $data) {
            $profile = IndustryProfile::for($id);

            foreach ($data['defaultSections'] as $section) {
                if ($section === 'hero') {
                    continue;   // the hero wears the tenant's own eyebrow
                }

                $this->assertNotSame('', $profile->kicker($section),
                    "Profile [{$id}] ships section [{$section}] with no eyebrow.");
            }
        }
    }

    public function test_an_eyebrow_never_merely_repeats_the_heading_beside_it(): void
    {
        // The failure this catches is visual and silent: a band whose kicker
        // and h2 both read "Treatments" looks like a rendering bug.
        $profile = IndustryProfile::for('beauty');

        $this->assertNotSame($profile->servicesLabel, $profile->kicker('services'));
        $this->assertNotSame($profile->peopleLabel, $profile->kicker('team'));
    }

    public function test_an_unknown_section_gets_no_eyebrow_rather_than_its_key(): void
    {
        $this->assertSame('', IndustryProfile::for('beauty')->kicker('nonsense'));
    }
}
