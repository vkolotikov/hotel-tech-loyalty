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

    /**
     * D2's other promise: "UI accents >= 3:1". The rebuilt template (Task 4)
     * leans on this directly — accent GRAPHICS (the meter fill, the ticks,
     * the map dot, the monogram mark, the reading spine) are painted in
     * var(--accent) straight onto the palette's surfaces, with no per-band
     * switching, precisely because every palette authors its accent to
     * clear the 3:1 graphics floor on its own bg. This is the test that
     * makes that a contract rather than a habit.
     *
     * Task 5 (ride-along from the Task 4 review) extended the floor to ALL
     * THREE surfaces the template actually paints accent graphics over —
     * the meter fills draw on band--ink/--paper-2 (both --bg-2 now) and
     * the monogram mark sits on --bg-elev plates — and every palette
     * already cleared it: the lowest measured pair across all eighteen is
     * porcelain's accent on bg-2 at 4.01:1 (then clinic_air on bg-2 at
     * 4.41:1); every other pair sits at 4.49:1 or higher.
     */
    public function test_every_palettes_accent_clears_the_graphics_floor_on_its_own_surfaces(): void
    {
        foreach (Palette::ids() as $id) {
            $tokens = Palette::for($id)->tokens;

            foreach (['bg', 'bg-2', 'bg-elev'] as $surface) {
                $this->assertGreaterThanOrEqual(
                    3.0,
                    $this->contrast($tokens['accent'], $tokens[$surface]),
                    "[{$id}] accent-on-{$surface} fails the 3:1 UI/graphics floor."
                );
            }
        }
    }

    /**
     * The accent TONE's surface (the per-section colour round).
     *
     * `.band--accent` is the one band background that is not an authored
     * token: the stylesheet composites `--halo` — the palette's own
     * accent-bright at .30 — over `--bg-2`, so the surface arrives correct
     * in all six palettes with no new hex values to keep in step. That also
     * means no authored contrast figure covers it, and a tenant can put ANY
     * band on it: the reviews band, whose only text is quoted prose in
     * --text-soft, as readily as the hero.
     *
     * So it is measured here, the same way and against the same floor every
     * authored surface above is. The lowest measured pairs across all twelve
     * are porcelain's and slate_amber's text-soft, both at 4.76:1; every
     * other text-soft pair sits at 5.0:1 or higher and every primary-text
     * pair clears 6.8:1.
     *
     * The composite is recomputed here from the palette's own `halo` STRING
     * rather than from `accent-bright`, deliberately: `halo` is an authored
     * literal that has to track its source hex by hand (see Palette's own
     * note on the five derived tokens), so blending from the literal is what
     * makes a halo that has drifted from its accent-bright show up as a
     * contrast failure rather than passing on a number the stylesheet does
     * not actually paint.
     */
    public function test_the_accent_tones_band_surface_clears_wcag_aa_in_every_palette(): void
    {
        foreach (Palette::ids() as $id) {
            $tokens  = Palette::for($id)->tokens;
            $surface = $this->composite($tokens['halo'], $tokens['bg-2'], $id);

            foreach (['text', 'text-soft'] as $ink) {
                $this->assertGreaterThanOrEqual(
                    4.5,
                    $this->contrastRgb($this->rgb($tokens[$ink]), $surface),
                    "[{$id}] {$ink} on the accent tone's band fails WCAG AA (4.5:1)."
                );
            }
        }
    }

    /**
     * `rgba(r, g, b, a)` over an opaque hex, source-over in sRGB — what the
     * browser does with `linear-gradient(var(--halo), var(--halo))` layered
     * on a `var(--bg-2)` background-color. Kept in floats: rounding to bytes
     * would be modelling the browser's output buffer rather than its
     * compositing, and the answer is the same to three decimal places
     * either way.
     *
     * @return array{float, float, float}
     */
    private function composite(string $rgba, string $overHex, string $id): array
    {
        $this->assertMatchesRegularExpression(
            '/^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*[0-9.]+\s*\)$/',
            $rgba,
            "[{$id}] halo is not an rgba() triple this test can composite."
        );

        preg_match('/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\s*\)$/', $rgba, $m);

        [, $r, $g, $b, $alpha] = $m;
        $alpha = (float) $alpha;
        $base  = $this->rgb($overHex);

        return [
            $alpha * (float) $r + (1 - $alpha) * $base[0],
            $alpha * (float) $g + (1 - $alpha) * $base[1],
            $alpha * (float) $b + (1 - $alpha) * $base[2],
        ];
    }

    /** @return array{float, float, float} */
    private function rgb(string $hex): array
    {
        $hex = ltrim($hex, '#');

        return [
            (float) hexdec(substr($hex, 0, 2)),
            (float) hexdec(substr($hex, 2, 2)),
            (float) hexdec(substr($hex, 4, 2)),
        ];
    }

    /**
     * The same WCAG formula as luminance()/contrast() above, taking channels
     * rather than a hex string — the composited surface has no hex spelling
     * and rounding it into one to reuse those helpers would throw away the
     * fractional channels this test just computed.
     *
     * @param array{float, float, float} $a
     * @param array{float, float, float} $b
     */
    private function contrastRgb(array $a, array $b): float
    {
        $luminance = function (array $channels): float {
            $lin = function (float $channel): float {
                $c = $channel / 255;
                return $c <= 0.03928 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4;
            };

            return 0.2126 * $lin($channels[0]) + 0.7152 * $lin($channels[1]) + 0.0722 * $lin($channels[2]);
        };

        $la = $luminance($a);
        $lb = $luminance($b);

        return (max($la, $lb) + 0.05) / (min($la, $lb) + 0.05);
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
