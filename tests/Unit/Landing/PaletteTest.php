<?php
namespace Tests\Unit\Landing;

use App\Landing\Palette;
use Tests\TestCase;

class PaletteTest extends TestCase
{
    /**
     * WCAG relative luminance + contrast ratio, reimplemented independently
     * of App\Support\Accent (which already has its own copy for tenant
     * colours) — this test is the one place that formula gets verified
     * against a second, deliberately separate implementation, so a bug
     * shared between Palette's authored values and Accent's maths could
     * not silently cancel out.
     */
    private function luminance(string $hex): float
    {
        $hex = ltrim($hex, '#');
        [$r, $g, $b] = [hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2))];

        $lin = function (int $channel): float {
            $c = $channel / 255;
            return $c <= 0.03928 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4;
        };

        return 0.2126 * $lin($r) + 0.7152 * $lin($g) + 0.0722 * $lin($b);
    }

    private function contrast(string $a, string $b): float
    {
        $la = $this->luminance($a);
        $lb = $this->luminance($b);

        return (max($la, $lb) + 0.05) / (min($la, $lb) + 0.05);
    }

    public function test_the_six_curated_ids_exist(): void
    {
        $this->assertEqualsCanonicalizing(
            ['champagne_noir', 'porcelain', 'midnight_brass', 'clinic_air', 'terracotta', 'slate_amber'],
            Palette::ids()
        );
    }

    public function test_every_palette_defines_exactly_the_spec_token_keys(): void
    {
        foreach (Palette::ids() as $id) {
            $palette = Palette::for($id);

            $this->assertEqualsCanonicalizing(
                Palette::TOKEN_KEYS,
                array_keys($palette->tokens),
                "[{$id}] does not define exactly the spec §3 token keys."
            );
        }
    }

    public function test_every_palette_ships_a_dark_flag_and_a_label(): void
    {
        $expectedDark = [
            'champagne_noir' => true,
            'porcelain'      => false,
            'midnight_brass' => true,
            'clinic_air'     => false,
            'terracotta'     => false,
            'slate_amber'    => true,
        ];

        foreach ($expectedDark as $id => $dark) {
            $palette = Palette::for($id);
            $this->assertSame($dark, $palette->dark, "[{$id}] has the wrong dark flag.");
            $this->assertNotSame('', $palette->label, "[{$id}] has no label.");
        }
    }

    /**
     * D2's own promise: "Every palette ships contrast-verified: body text
     * >= 4.5:1 ... stated per token in the palette file." Both body-text
     * pairs the template actually paints text with — the primary text
     * colour and the softer one paragraphs use — must clear WCAG AA on
     * every one of the six surfaces.
     */
    public function test_every_palettes_body_text_clears_wcag_aa_on_its_own_background(): void
    {
        foreach (Palette::ids() as $id) {
            $tokens = Palette::for($id)->tokens;

            $this->assertGreaterThanOrEqual(
                4.5,
                $this->contrast($tokens['text'], $tokens['bg']),
                "[{$id}] text-on-bg fails WCAG AA (4.5:1)."
            );
            $this->assertGreaterThanOrEqual(
                4.5,
                $this->contrast($tokens['text-soft'], $tokens['bg']),
                "[{$id}] text-soft-on-bg fails WCAG AA (4.5:1)."
            );
        }
    }

    public function test_an_unknown_id_resolves_to_null(): void
    {
        $this->assertNull(Palette::for('not-a-real-palette'));
    }

    public function test_a_null_id_resolves_to_null(): void
    {
        $this->assertNull(Palette::for(null));
    }
}
