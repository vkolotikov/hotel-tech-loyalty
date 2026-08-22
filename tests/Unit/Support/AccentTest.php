<?php
namespace Tests\Unit\Support;

use App\Support\Accent;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The point of this class is a promise about contrast, so the tests measure
 * rather than compare against baked-in hexes: a golden-value test would go
 * green on a broken derivation the moment somebody updated the golden value.
 */
class AccentTest extends TestCase
{
    private const HOUSE = '#9B5C8F';
    private const PAPER = '#f4f6f8';
    private const INK   = '#17131e';

    /** The adversarial set Appendix B 3.4 names, plus a dead-band colour. */
    public static function colours(): array
    {
        return [
            'house'          => ['#9B5C8F'],
            'yellow'         => ['#FFFF00'],
            'green'          => ['#00FF00'],
            'black'          => ['#000000'],
            'white'          => ['#FFFFFF'],
            'near white'     => ['#F5F5F5'],
            'purple'         => ['#7B2D8E'],
            'cyan'           => ['#00E5FF'],
            'dark red'       => ['#8B0000'],
            'mid grey'       => ['#808080'],
            'windows blue'   => ['#0078D7'],
            'null'           => [null],
            'a colour name'  => ['red'],
            'not a colour'   => ['"; background: url(x)'],
        ];
    }

    #[DataProvider('colours')]
    public function test_the_label_can_always_be_read_on_the_fill(?string $hex): void
    {
        $accent = Accent::for($hex, self::HOUSE);

        $this->assertGreaterThanOrEqual(
            Accent::FLOOR,
            Accent::contrast($accent->on, $accent->brand),
            $accent->on . ' on ' . $accent->brand . ' is below the floor.'
        );
    }

    #[DataProvider('colours')]
    public function test_the_label_survives_the_hover_state(?string $hex): void
    {
        $accent = Accent::for($hex, self::HOUSE);

        // The CTA is the one element on the page that has to survive its own
        // hover state, and a fixed "darken" cannot promise that on a light
        // brand - which is why hover is derived rather than borrowed from
        // --brand-deep.
        $this->assertGreaterThanOrEqual(
            Accent::FLOOR,
            Accent::contrast($accent->on, $accent->hover),
            $accent->on . ' on hover ' . $accent->hover . ' is below the floor.'
        );
    }

    #[DataProvider('colours')]
    public function test_hovering_normally_deepens_rather_than_flattens(?string $hex): void
    {
        $accent = Accent::for($hex, self::HOUSE);

        // Pure black and pure white have nowhere to move away from their
        // label, so they move toward it instead and give up some contrast to
        // keep any hover feedback at all - still above the floor, asserted
        // above. Every other colour only gains.
        if (in_array($accent->brand, ['#000000', '#ffffff'], true)) {
            $this->assertNotSame($accent->brand, $accent->hover, 'The CTA has no hover state.');

            return;
        }

        $this->assertGreaterThanOrEqual(
            Accent::contrast($accent->on, $accent->brand) - 0.001,
            Accent::contrast($accent->on, $accent->hover)
        );
    }

    #[DataProvider('colours')]
    public function test_the_text_shades_clear_their_own_surfaces(?string $hex): void
    {
        $accent = Accent::for($hex, self::HOUSE);

        $this->assertGreaterThanOrEqual(Accent::FLOOR, Accent::contrast($accent->deep, self::PAPER),
            '--brand-deep carries small text on paper.');
        $this->assertGreaterThanOrEqual(Accent::FLOOR, Accent::contrast($accent->bright, self::INK),
            '--brand-bright carries small text on an ink band.');
    }

    #[DataProvider('colours')]
    public function test_every_token_is_a_value_css_will_accept(?string $hex): void
    {
        $accent = Accent::for($hex, self::HOUSE);

        foreach ([$accent->brand, $accent->on, $accent->hover, $accent->deep, $accent->bright] as $token) {
            $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/', $token);
        }

        // Nothing reaches the stylesheet that could close the declaration it
        // sits in: the halo is formatted from integers, not interpolated.
        $this->assertMatchesRegularExpression('/^rgba\(\d{1,3},\d{1,3},\d{1,3},0?\.\d+\)$/', $accent->halo);
    }

    public function test_a_colour_no_label_can_sit_on_is_discarded(): void
    {
        // #0078D7 is inside the 5% dead band: white is 4.499:1 on it - four
        // thousandths under the floor - and the ink token is 4.065:1.
        // Appendix B 3.4's threshold rule would paint one of them on anyway.
        $accent = Accent::for('#0078D7', self::HOUSE);

        $this->assertFalse($accent->isDerived);
        $this->assertSame('#9b5c8f', $accent->brand);
    }

    public function test_a_usable_tenant_colour_is_kept(): void
    {
        $accent = Accent::for('#1F5FA8', self::HOUSE);

        $this->assertTrue($accent->isDerived);
        $this->assertSame('#1f5fa8', $accent->brand);
    }

    public function test_the_profile_default_is_not_reported_as_a_tenant_derivation(): void
    {
        // The caller uses isDerived to decide whether to override the
        // stylesheet's measured house tokens. A tenant who happens to type the
        // house colour - in any case - must not trigger that, because the
        // derivation targets 5.5:1 while the house tokens sit at 6.2-6.3:1.
        foreach ([null, '#9B5C8F', '#9b5c8f', 'nonsense'] as $hex) {
            $this->assertFalse(Accent::for($hex, self::HOUSE)->isDerived, var_export($hex, true));
        }
    }

    public function test_it_beats_the_rule_appendix_b_proposes(): void
    {
        // Appendix B 3.4: relativeLuminance(--brand) > 0.42 ? #17131E : #FFFFFF.
        // This is the measurement that says not to implement it.
        $appendixFailures = 0;
        $oursFailures     = 0;
        $sampled          = 0;

        for ($r = 0; $r < 256; $r += 17) {
            for ($g = 0; $g < 256; $g += 17) {
                for ($b = 0; $b < 256; $b += 17) {
                    $hex = sprintf('#%02x%02x%02x', $r, $g, $b);
                    $sampled++;

                    // The appendix's rule, restated in terms of contrast: it
                    // picks white for everything below its threshold, which is
                    // where its failures live.
                    $appendixPick = Accent::contrast('#ffffff', $hex) >= Accent::contrast('#17131e', $hex)
                        ? '#ffffff'
                        : '#17131e';

                    // Deliberately NOT the appendix rule - this is the best
                    // any two-way pick can do, and it still fails on the dead
                    // band, which is what forces the fallback.
                    if (Accent::contrast($appendixPick, $hex) < Accent::FLOOR) {
                        $appendixFailures++;
                    }

                    $accent = Accent::for($hex, self::HOUSE);

                    if (Accent::contrast($accent->on, $accent->brand) < Accent::FLOOR) {
                        $oursFailures++;
                    }
                }
            }
        }

        $this->assertGreaterThan(0, $appendixFailures,
            'The dead band should exist; if it does not, this class is unnecessary.');
        $this->assertSame(0, $oursFailures,
            'Every colour in the sweep must end with a readable label, dead band included.');
        $this->assertSame(4096, $sampled);
    }
}
