<?php

namespace App\Support;

/**
 * The tenant's accent colour, resolved into a contrast-safe token set.
 *
 * CssColor answers "is this string a colour"; it does not answer "can anyone
 * read text on it". A landing page needs the second question answered, because
 * every accent token it writes ends up either behind text or as text.
 *
 * THIS IS NOT Appendix B section 3.4's BrandPalette, and it deliberately does
 * not implement 3.4's --brand-on rule, which is wrong. That rule picks the
 * label colour by testing the brand's relative luminance against a fixed
 * threshold (> 0.42 ? ink : white). Measured over a 140k-point sweep of the
 * sRGB cube: white clears 4.5:1 on this brand only below L = 0.1833, and the
 * ink token clears it only above L = 0.2084. Those two ranges do not meet, so
 * no single threshold can separate them - 3.4's rule fails 4.5:1 on 33.8% of
 * hexes, and the hardcoded #FFFFFF it replaced fails on 63.7%. Between the two
 * figures lies a genuine dead band, 5.1% of the cube, where NEITHER label
 * works at any threshold (#0078D7, the Windows blue a tenant is entirely
 * likely to paste, sits in it). A rule that picks between two options cannot
 * rescue those; the only honest answer is to refuse the colour.
 *
 * So this class measures instead of guessing:
 *
 *   1. Both candidate labels are scored against the brand and the better one
 *      wins.
 *   2. If the winner is still under 4.5:1, the tenant hex is DISCARDED and the
 *      profile's house accent is used - a page whose CTA label cannot be read
 *      is worse than a page in the wrong colour.
 *   3. --brand is a FILL as well as a backdrop for a label, so it is measured
 *      against its SURFACE too, at 3:1 - WCAG 1.4.11, the non-text floor -
 *      the porcelain PAPER by default, or whichever surface the caller names
 *      (see SURFACE, below). A brand that fails is pushed away from that
 *      surface until it clears - toward ink on a light surface, toward white
 *      on a dark one - rather than discarded: the tenant's hue survives
 *      where the house mauve would not be their colour at all. Nothing above
 *      catches this, because every other test scores the brand against its
 *      own label rather than against the page: #FFFFFF, #F5F5F5, #FFFF00 and
 *      #FFF176 all clear 15:1 on their label and all land at 1.01-1.08 on
 *      the (default, porcelain) paper.
 *   4. --brand-deep is derived by moving the brand toward black (on a light
 *      surface) or white (on a dark one) until it clears ITS OWN surface -
 *      again PAPER by default or whichever surface the caller names - so
 *      accent-coloured TEXT tracks the tenant's hue instead of staying house
 *      mauve on a navy page, and so the same shade still works as the CTA
 *      fill's second gradient stop once that fill sits on a dark palette
 *      rather than on porcelain. --brand-bright is measured against the
 *      fixed INK band instead, on purpose, and never against $surface: it
 *      exists for one decorative element, the ink band, whose background
 *      never changes with the palette a page is showing. Both loops
 *      terminate: black clears any light surface and white clears any dark
 *      one.
 *   5. --brand-hover moves the brand AWAY from whichever label was chosen, so
 *      hovering the primary CTA raises its contrast rather than lowering it -
 *      which a fixed "darken on hover" cannot promise on a light brand. It
 *      has to clear its surface at 3:1 too, since "away from a dark label" is
 *      "toward the page", so the move shrinks where a full-size one would
 *      dissolve the button into the page and reverses where no size of it
 *      fits. That reversal is the one case hovering lowers the label's
 *      contrast - 1.2% of the cube, never below 4.5:1, and the alternative
 *      is a CTA with no hover state at all.
 *
 * SURFACE (phase 3c final fix wave, F1). Every "against the paper" above
 * used to mean, literally, the hardcoded porcelain default - true while
 * every landing page shared the same background, false the moment palettes
 * (spec §3) shipped a page whose real background is a near-black brown or
 * navy. A tenant hex could clear the PAPER-measured fill check above and
 * still ride a --brand fill and a --brand-deep text shade BOTH moved toward
 * black; correct on porcelain, and on each of the three dark palettes the
 * result was a CTA gradient of two near-black stops on a near-black page,
 * because "away from the paper" and "away from a near-black bg" are
 * opposite directions.
 *
 * for() therefore takes an optional $surface (a hex string; PAPER when
 * omitted, which is what keeps a palette-less page byte-identical to before
 * this fix). It asks the one question that matters - does a light label or
 * a dark one read better ON the surface itself - by reusing bestLabel()'s
 * own contrast comparison rather than inventing a second luminance rule (see
 * away()). Every place above that moved a colour "toward black, off the
 * paper" now moves it toward black off a light surface and toward white off
 * a dark one, measured against WHICHEVER surface was actually named - the
 * SURFACE_FLOOR / SURFACE_TARGET / TEXT_TARGET numbers this class already
 * measured are unchanged; only the direction and the surface they are taken
 * against are parameters now. layout.blade.php passes the resolved
 * palette's own `bg` token as $surface when a palette is chosen, and passes
 * nothing when it is not.
 *
 * What it does NOT do, on purpose: no HSL saturation clamping, no neon
 * killing, no lightness banding. Those are 3.4's taste rules, they need their
 * own decisions, and none of them are what makes a page unreadable.
 *
 * COUPLING, stated because it is invisible: when isDerived is false the caller
 * must emit --brand only and let the stylesheet's own house tokens stand. That
 * is correct exactly while a profile's accent equals the house --brand in its
 * stylesheet. Adding a second industry profile means adding its house triple
 * to the stylesheet (Appendix B 3.12a), not relying on this.
 */
final class Accent
{
    /** WCAG AA for text under 24px. The label must clear this or the hex goes. */
    public const FLOOR = 4.5;

    /**
     * WCAG AA for non-text (SC 1.4.11). --brand is a FILL, not a label: the
     * primary CTA, the team monograms, the accent rules. Nothing above
     * measures it against the page it is painted on, and a colour picker
     * hands out #FFFFFF, #F5F5F5, #FFFF00 and #FFF176 without complaint -
     * all of which pass the label test at 15-18:1 and then land at 1.01-1.08
     * against the paper, so the primary CTA becomes a white block sitting on
     * a white page, indistinguishable from the secondary button beside it.
     */
    public const SURFACE_FLOOR = 3.0;

    /**
     * How far past that floor a clamped fill is actually taken. Both digits
     * are measured, not chosen - a clamp that stops the moment it scrapes
     * SURFACE_FLOOR costs the hover state, and one that stops anywhere
     * between costs the tenant their colour outright. Swept over 140k hexes:
     *
     *   target  hover LOWERS label contrast   hex discarded for the house
     *     3.0              14.14%                        5.08%
     *     3.4               1.22%                        8.55%
     *     3.8               1.22%                       45.16%
     *     4.0               1.22%                       22.22%
     *     4.2               1.22%                        5.08%
     *     4.5               1.22%                        5.08%
     *
     * Column one is point 5's promise. A fill left just above SURFACE_FLOOR
     * keeps the DARK label, and "away from a dark label" is "toward the
     * page", so the only legal hover left is toward the label - which lowers
     * its contrast on one hex in seven. Clamping past the dead band flips the
     * label to white, and away-from-white is away from the paper too, so both
     * floors then pull the same way. 1.22% is the residual from colours that
     * were never clamped at all, and it is a floor, not a knob.
     *
     * Column two is the dead band restated as a paper contrast: 3.6-4.03:1 IS
     * that luminance range, so a target inside it parks the fill exactly
     * where no label works and the hex is discarded after all - up to 45% of
     * the cube, against the 5.08% the dead band costs on its own. From 4.2 up
     * the clamp costs nothing. 4.5 is the first round value clear of that
     * edge, and it is FLOOR: a fill that has to be darkened at all ends up
     * where text would have had to sit anyway.
     */
    public const SURFACE_TARGET = 4.5;

    /**
     * Headroom for the two text tokens. The house values sit at 6.2-6.3:1 and
     * these carry body-size copy on a page whose whole argument is legibility,
     * so stopping the moment they scrape 4.5 would be meaner than the design.
     */
    private const TEXT_TARGET = 5.5;

    /**
     * The two fixed surfaces - Appendix B 4.2. PAPER is also the DEFAULT of
     * for()'s $surface parameter (see the SURFACE section of this docblock):
     * a page with no palette, or an unrecognised one, still renders on
     * porcelain, so nothing about this class changes for it. INK never
     * varies with the palette - it is the fixed ink band's own background, a
     * decorative element whose surface does not move with the rest of the
     * page, so --brand-bright is always measured against it rather than
     * against $surface.
     */
    private const PAPER = '#f4f6f8';
    private const INK   = '#17131e';

    /** The only two label colours on offer. There is no third. */
    private const LABEL_LIGHT = '#ffffff';
    private const LABEL_DARK  = '#17131e';

    private const BLACK = '#000000';
    private const WHITE = '#ffffff';

    private function __construct(
        public readonly string $brand,
        public readonly string $on,
        public readonly string $hover,
        public readonly string $halo,
        public readonly string $deep,
        public readonly string $bright,
        public readonly bool   $isDerived,
    ) {}

    public static function for(?string $hex, string $profileDefault, ?string $surface = null): self
    {
        $house   = CssColor::safe($profileDefault);
        $wanted  = CssColor::safe($hex, $house);
        // PAPER when $surface is null (no palette resolved) or hostile
        // (defence in depth only - every real caller today hands this a
        // Palette::tokens['bg'] literal, not tenant input).
        $surface = CssColor::safe($surface, self::PAPER);

        // No tenant colour, or one CssColor rejected: nothing to derive. The
        // stylesheet's measured house tokens are already correct. The house
        // accent is operator data, not tenant data, and is never clamped -
        // AccentTest asserts instead that it already clears SURFACE_FLOOR on
        // its own, which is the check a new industry profile has to pass.
        if ($wanted === $house) {
            return self::resolve($house, false, $surface);
        }

        // A fill nobody can find is as broken as a label nobody can read, and
        // until this line only the label was ever measured. --brand is
        // painted as a BLOCK - the primary CTA, the team monograms - onto the
        // paper, so #FFFFFF, #F5F5F5, #FFFF00, #FFF176 and #00E5FF (every one
        // a value a colour picker hands out, every one at 11:1 or better
        // against its own label) came out at 1.01-1.42 against the PAGE. In
        // Chrome at 390px the primary CTA was a white block on a white page,
        // indistinguishable from the secondary button beside it, and the team
        // monograms were simply not there.
        //
        // Darkened rather than discarded, using the same toward() the two
        // text shades already use: a pale yellow taken toward ink is still
        // recognisably the tenant's yellow, where the house mauve is not
        // their colour at all. Point 3 above makes exactly this argument for
        // --brand-deep, and a fill has no weaker claim to the tenant's hue
        // than accented text does. Only the dark direction is offered because
        // the paper is light, and toward() promises black clears any light
        // surface, so this terminates on a colour that clears the floor.
        //
        // GATED on the floor rather than applied to everything, and that is
        // load-bearing: an unconditional clamp to SURFACE_TARGET would drag
        // #0078D7 out of the dead band too and quietly repeal the fallback
        // below, which is a decision this class made deliberately and
        // measured (5.1% of the cube). A colour that already reads as a block
        // is judged exactly as it was before this line existed.
        if (self::contrast($wanted, $surface) < self::SURFACE_FLOOR) {
            $wanted = self::toward($wanted, self::away($surface), $surface, self::SURFACE_TARGET);
        }

        // The dead band, asked of the colour that will actually be painted.
        // The clamp above can move a colour, so this has to run AFTER it or
        // it would answer for a hex nothing renders. Falling back loses the
        // tenant's colour; not falling back loses the words on their own call
        // to action.
        if (self::contrast(self::bestLabel($wanted), $wanted) < self::FLOOR) {
            return self::resolve($house, false, $surface);
        }

        return self::resolve($wanted, true, $surface);
    }

    private static function resolve(string $brand, bool $isDerived, string $surface): self
    {
        $on = self::bestLabel($brand);

        return new self(
            brand:  $brand,
            on:     $on,
            hover:  self::hover($brand, $on, $surface),
            halo:   self::rgba($brand, 0.26),
            deep:   self::toward($brand, self::away($surface), $surface, self::TEXT_TARGET),
            bright: self::toward($brand, self::WHITE, self::INK, self::TEXT_TARGET),
            isDerived: $isDerived,
        );
    }

    /**
     * The direction "away from $surface" resolves to for toward(): BLACK off
     * a light surface, WHITE off a dark one. Reuses bestLabel()'s own
     * contrast comparison rather than a second luminance rule - a surface
     * that reads better with a light label than a dark one IS a dark
     * surface, by the exact same measurement bestLabel() already makes for a
     * brand fill, asked here of the surface instead.
     */
    private static function away(string $surface): string
    {
        return self::bestLabel($surface) === self::LABEL_LIGHT ? self::WHITE : self::BLACK;
    }

    /**
     * The hovered fill for the primary CTA.
     *
     * It moves AWAY from the label, so hovering can only raise the label's
     * contrast - a fixed "darken on hover" silently lowers it on a light
     * brand, which is where a CTA is most fragile to begin with.
     *
     * That move is no longer unconditional, because it is only ever measured
     * against the LABEL and the fill also has to stay visible on the PAPER.
     * Where the label is the dark one, "away from the label" is "toward the
     * paper": #808080 rests at 3.65:1 against the page and its full-size
     * hover landed at 2.70:1, so the state that is supposed to confirm the
     * press instead dissolved the button into the page.
     *
     * A brand already at the end it would move toward (pure black with a
     * white label) has nowhere to go either, and a CTA with no hover feedback
     * at all is a worse answer than a smaller one. So each direction is tried
     * at shrinking sizes rather than once at full size, and the other
     * direction is the fallback - which is where hovering can lower the
     * label's contrast, still never below the floor. $brand itself is the
     * last resort and means no hover state at all; over a 140k sweep of the
     * cube nothing reaches it, but it is what keeps this total.
     */
    private static function hover(string $brand, string $on, string $surface): string
    {
        $away = self::nudge($brand, $on === self::LABEL_LIGHT ? self::BLACK : self::WHITE, $on, $surface);

        if ($away !== $brand) {
            return $away;
        }

        return self::nudge($brand, $on === self::LABEL_LIGHT ? self::WHITE : self::BLACK, $on, $surface);
    }

    /**
     * The largest move toward $target, up to 18%, that keeps BOTH floors: the
     * label readable on the result, and the result still visible against the
     * paper. $brand back means even the smallest move breaks one of them.
     *
     * 18% is the design's hover delta and stays the first thing tried, so
     * every colour with room for it is unaffected by this loop existing. The
     * 2% floor is where a fill stops being a state change a person can see.
     */
    private static function nudge(string $brand, string $target, string $on, string $surface): string
    {
        for ($percent = 18; $percent >= 2; $percent -= 2) {
            $candidate = self::mix($brand, $target, $percent / 100);

            if ($candidate !== $brand
                && self::contrast($on, $candidate) >= self::FLOOR
                && self::contrast($candidate, $surface) >= self::SURFACE_FLOOR) {
                return $candidate;
            }
        }

        return $brand;
    }

    /** Whichever of the two labels reads better on this colour. */
    private static function bestLabel(string $hex): string
    {
        return self::contrast(self::LABEL_LIGHT, $hex) >= self::contrast(self::LABEL_DARK, $hex)
            ? self::LABEL_LIGHT
            : self::LABEL_DARK;
    }

    /**
     * Step $hex toward $target until it clears $ratio against $surface.
     *
     * Bounded by construction rather than by a magic iteration cap: 25 steps
     * of 4% arrives at $target exactly, and black clears any light surface
     * while white clears any dark one, so the loop's exit is a property of the
     * colour space and not a hope.
     */
    private static function toward(string $hex, string $target, string $surface, float $ratio): string
    {
        for ($step = 0; $step <= 25; $step++) {
            $candidate = self::mix($hex, $target, min(1.0, $step * 0.04));

            if (self::contrast($candidate, $surface) >= $ratio) {
                return $candidate;
            }
        }

        return $target;
    }

    /** Linear blend in sRGB. Good enough: every result is measured after. */
    private static function mix(string $hex, string $target, float $t): string
    {
        [$r1, $g1, $b1] = self::rgb($hex);
        [$r2, $g2, $b2] = self::rgb($target);

        return sprintf(
            '#%02x%02x%02x',
            (int) round($r1 + ($r2 - $r1) * $t),
            (int) round($g1 + ($g2 - $g1) * $t),
            (int) round($b1 + ($b2 - $b1) * $t),
        );
    }

    /**
     * The halo is the one place a tenant colour is allowed to be unreadable:
     * it sits outside a 2px focus ring that is never tenant-derived, and it
     * carries identity rather than information.
     */
    private static function rgba(string $hex, float $alpha): string
    {
        [$r, $g, $b] = self::rgb($hex);

        return sprintf('rgba(%d,%d,%d,%s)', $r, $g, $b, rtrim(number_format($alpha, 2), '0'));
    }

    /** WCAG 2.x contrast ratio. */
    public static function contrast(string $a, string $b): float
    {
        $la = self::luminance($a);
        $lb = self::luminance($b);

        return (max($la, $lb) + 0.05) / (min($la, $lb) + 0.05);
    }

    /** WCAG relative luminance. */
    private static function luminance(string $hex): float
    {
        [$r, $g, $b] = self::rgb($hex);

        $lin = static function (int $channel): float {
            $c = $channel / 255;

            return $c <= 0.03928 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4;
        };

        return 0.2126 * $lin($r) + 0.7152 * $lin($g) + 0.0722 * $lin($b);
    }

    /** @return array{0:int,1:int,2:int} */
    private static function rgb(string $hex): array
    {
        $hex = ltrim(CssColor::safe($hex), '#');

        return [
            (int) hexdec(substr($hex, 0, 2)),
            (int) hexdec(substr($hex, 2, 2)),
            (int) hexdec(substr($hex, 4, 2)),
        ];
    }
}
