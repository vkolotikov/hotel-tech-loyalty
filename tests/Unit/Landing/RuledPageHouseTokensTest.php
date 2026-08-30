<?php
namespace Tests\Unit\Landing;

use App\Landing\IndustryProfile;
use App\Support\Accent;
use Tests\TestCase;

/**
 * The house tokens in ruled_page.css — since Task 4 (landing phase 3c) the
 * porcelain palette under the spec §3 names — were hand-measured against ONE
 * colour: beauty's #9B5C8F. App\Support\Accent leans on that. When a tenant
 * supplies no usable colour it reports isDerived = false, the layout writes
 * --accent alone (and, with a curated palette chosen, nothing at all — the
 * palette block carries its own family), and every other accent token — the
 * CTA label, the halo, and the two text shades that carry every inline link
 * — is left to the stylesheet's hardcoded values.
 *
 * That is correct exactly while a profile's accent IS the stylesheet's house
 * --accent — true of beauty alone, which is what the first test below
 * checks. The industry profile round (2026-08-25) deliberately gave the
 * other eight profiles their OWN accents (spec §4.2): a page in one of them,
 * with no palette chosen, ships that profile's colour underneath porcelain's
 * hardcoded label/halo, with nothing in the render path to notice. If the
 * profile accent fails 4.5:1 against the hardcoded white, the default page
 * for that entire industry has an unreadable call to action — the failure
 * mode the SECOND test guards for every profile, and what caught fitness's
 * spec value (#C25A2B, 4.383:1 — under the floor); see
 * IndustryProfile::all()'s docblock for the correction.
 *
 * The palette system is the two-part remedy this file's older docblock asked
 * for: a profile whose accent diverges from the house triple now gets a
 * complete curated palette (its default is authored in IndustryProfile).
 * The first test stays anyway — porcelain's own accent drifting off
 * beauty's profile accent would break the "no palette means porcelain"
 * identity the goldens pin. Do NOT re-derive porcelain's tokens to make it
 * pass again — they are tuned, not generated.
 */
class RuledPageHouseTokensTest extends TestCase
{
    private const STYLESHEET = 'landing/ruled_page.css';

    public function test_beautys_accent_is_the_stylesheets_house_accent(): void
    {
        $house = $this->token('accent');

        $this->assertSame(
            strtolower($house),
            strtolower(IndustryProfile::all()['beauty']['accent']),
            self::STYLESHEET . "'s hardcoded --accent: {$house} no longer matches beauty's profile"
            . ' accent, which is the one colour the house tokens were hand-measured against.'
            . " See this file's docblock."
        );
    }

    public function test_every_profile_accent_can_carry_the_stylesheets_house_label(): void
    {
        $label = $this->token('accent-on');

        foreach (IndustryProfile::all() as $id => $data) {
            $this->assertGreaterThanOrEqual(
                Accent::FLOOR,
                Accent::contrast($label, $data['accent']),
                "Profile [{$id}]'s accent {$data['accent']} cannot carry the hardcoded"
                . " --accent-on: {$label}. Its default page would ship an unreadable CTA."
            );
        }
    }

    /**
     * Whatever --meter resolves to must clear the 3:1 floor a graphical
     * object needs, on every surface the page paints it over. Under the
     * palette system --meter is var(--accent) by design — PaletteTest holds
     * every CURATED palette's accent to the same floor on its own bg; this
     * test holds the porcelain defaults the stylesheet itself ships, and it
     * RESOLVES the var() chain rather than grepping for a spelling, so a
     * new hex smuggled in as `--meter:#F0805A` is measured exactly like the
     * token it replaced. (The old --warm ban died with the old token set:
     * no --warm exists to reach for any more, and this floor is the rule
     * that made the ban matter.)
     */
    public function test_every_meter_assignment_clears_the_graphics_floor(): void
    {
        $surfaces = ['bg', 'bg-2', 'bg-elev'];

        foreach ($this->meterValues() as $selector => $hex) {
            foreach ($surfaces as $surface) {
                $this->assertGreaterThanOrEqual(
                    3.0,
                    Accent::contrast($hex, $this->token($surface)),
                    "--meter ({$hex}, from [{$selector}]) fails the 3:1 graphics floor on --{$surface}."
                );
            }
        }
    }

    /**
     * Every --meter assignment in the stylesheet, resolved to a literal hex
     * and keyed by the selector that makes it.
     *
     * @return array<string, string>
     */
    private function meterValues(): array
    {
        $css = file_get_contents(public_path(self::STYLESHEET));

        // The selector is whatever precedes the block this declaration sits
        // in, so a failure names the rule to go and look at rather than only
        // the colour.
        $found = preg_match_all(
            '/([^{}]+)\{[^{}]*--meter\s*:\s*([^;}]+)/',
            $css,
            $matches,
            PREG_SET_ORDER
        );

        $this->assertNotSame(0, $found, '--meter is never assigned in ' . self::STYLESHEET);

        $values = [];

        foreach ($matches as $match) {
            $selector = trim(preg_replace('/\s+/', ' ', $match[1]));
            $values[$selector] = $this->resolve(trim($match[2]));
        }

        return $values;
    }

    /**
     * Follow a custom-property value through its var() chain to a hex.
     *
     * The depth cap is not defensive dressing: a stylesheet can genuinely
     * contain a cycle, and this runs over a file anyone may edit.
     */
    private function resolve(string $value, int $depth = 0): string
    {
        $this->assertLessThan(8, $depth, "Cannot resolve [{$value}]: too many var() hops, or a cycle.");

        if (preg_match('/^var\(\s*--([a-z0-9-]+)/i', $value, $reference) === 1) {
            return $this->resolve($this->token($reference[1]), $depth + 1);
        }

        $this->assertMatchesRegularExpression('/^#[0-9a-fA-F]{3,8}$/', $value,
            "[{$value}] is neither a hex nor a var() this test can follow.");

        return $value;
    }

    /** Read a custom property's value straight out of the shipped stylesheet. */
    private function token(string $name): string
    {
        $css = file_get_contents(public_path(self::STYLESHEET));

        $this->assertNotFalse($css, self::STYLESHEET . ' is missing.');

        // The trailing (?!-) is what keeps --accent from matching --accent-deep.
        $found = preg_match('/--' . preg_quote($name, '/') . '(?!-)\s*:\s*(#[0-9a-fA-F]{3,8})/', $css, $m);

        $this->assertSame(1, $found, "--{$name} is not declared as a hex in " . self::STYLESHEET);

        return $m[1];
    }
}
