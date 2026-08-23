<?php
namespace Tests\Unit\Landing;

use App\Landing\IndustryProfile;
use App\Support\Accent;
use Tests\TestCase;

/**
 * The house tokens in ruled_page.css were hand-measured against ONE colour:
 * beauty's #9B5C8F. App\Support\Accent leans on that. When a tenant supplies
 * no usable colour it reports isDerived = false, the layout writes --brand
 * alone, and every other accent token - the CTA label, the hover fill, the
 * halo, and the two text shades that carry every inline link - is left to the
 * stylesheet's hardcoded values.
 *
 * That is correct exactly while a profile's accent IS the stylesheet's house
 * --brand. Add a second profile whose accent is not, and the page ships that
 * profile's colour underneath beauty's label, with nothing in the render path
 * to notice: resolve() computes a correct label for it and the template simply
 * does not emit it. If the new accent fails 4.5:1 against the hardcoded white,
 * the default page for that entire industry has an unreadable call to action.
 *
 * So this fails at the moment the assumption stops holding, rather than at the
 * moment a customer reads about it. Both values are READ OUT of the stylesheet
 * rather than restated here, so the test and the CSS cannot drift apart - the
 * failure this guards against is precisely two files disagreeing.
 *
 * If it fails: either give the new profile its own house triple in the
 * stylesheet (Appendix B 3.12a) and key it off the profile, or change the
 * layout to emit the derived family for that profile too. Do NOT re-derive
 * beauty's tokens to make the test pass - they are tuned, not generated.
 */
class RuledPageHouseTokensTest extends TestCase
{
    private const STYLESHEET = 'landing/ruled_page.css';

    public function test_every_profile_accent_is_the_stylesheets_house_brand(): void
    {
        $house = $this->token('brand');

        foreach (IndustryProfile::all() as $id => $data) {
            $this->assertSame(
                strtolower($house),
                strtolower($data['accent']),
                "Profile [{$id}] has accent {$data['accent']}, but " . self::STYLESHEET
                . " hardcodes --brand: {$house}. See this file's docblock."
            );
        }
    }

    public function test_every_profile_accent_can_carry_the_stylesheets_house_label(): void
    {
        $label = $this->token('brand-on');

        foreach (IndustryProfile::all() as $id => $data) {
            $this->assertGreaterThanOrEqual(
                Accent::FLOOR,
                Accent::contrast($label, $data['accent']),
                "Profile [{$id}]'s accent {$data['accent']} cannot carry the hardcoded"
                . " --brand-on: {$label}. Its default page would ship an unreadable CTA."
            );
        }
    }

    /**
     * 4.2 line 40 bans --warm in capitals: "STATE DOT ONLY, never text, never
     * a bar". It is 2.44:1 on paper, and the ban is worth a test because the
     * ink band is exactly where reaching for it looks fine -- an earlier
     * revision of the stylesheet did that, on the strength of a contrast
     * figure for the token it replaced that turned out to be wrong.
     *
     * The check RESOLVES --meter rather than grepping for a spelling. An
     * earlier version of this test looked for the literal string "var(--warm)"
     * and measured --warm-safe regardless of what --meter actually pointed at,
     * so `.band--ink{--meter:#F0805A}` -- the same colour, spelled as a hex --
     * passed both halves of the guard it exists to be. Every assignment the
     * stylesheet makes is followed through its var() chain to a hex, and it is
     * that hex which is compared and measured.
     */
    public function test_no_meter_assignment_resolves_to_the_banned_warm_token(): void
    {
        $banned = strtolower($this->token('warm'));

        foreach ($this->meterValues() as $selector => $hex) {
            $this->assertNotSame(
                $banned,
                strtolower($hex),
                "--meter resolves to {$hex} under [{$selector}], which is --warm. "
                . '4.2 bans it on a bar however it is spelled. Use --warm-safe, or add '
                . 'a third measured token -- never the banned one.'
            );
        }
    }

    /**
     * And whatever it does resolve to clears the 3:1 floor a graphical object
     * needs, on every surface the page paints it over. Measured against the
     * resolved value, so a new token cannot be introduced without being held
     * to the figure that made --warm-safe acceptable in the first place.
     */
    public function test_every_meter_assignment_clears_the_graphics_floor(): void
    {
        $surfaces = ['paper', 'paper-2', 'ink', 'ink-2'];

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

        // The trailing (?!-) is what keeps --brand from matching --brand-deep.
        $found = preg_match('/--' . preg_quote($name, '/') . '(?!-)\s*:\s*(#[0-9a-fA-F]{3,8})/', $css, $m);

        $this->assertSame(1, $found, "--{$name} is not declared as a hex in " . self::STYLESHEET);

        return $m[1];
    }
}
