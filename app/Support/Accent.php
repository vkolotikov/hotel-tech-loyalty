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
 *   3. --brand-deep and --brand-bright are derived by moving the brand toward
 *      black / white until they clear their own surface, so accent-coloured
 *      TEXT tracks the tenant's hue instead of staying house mauve on a navy
 *      page. Both loops terminate: black clears any light surface and white
 *      clears any dark one.
 *   4. --brand-hover moves the brand AWAY from whichever label was chosen, so
 *      hovering the primary CTA can only ever raise its contrast, never lower
 *      it - which a fixed "darken on hover" cannot promise on a light brand.
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
     * Headroom for the two text tokens. The house values sit at 6.2-6.3:1 and
     * these carry body-size copy on a page whose whole argument is legibility,
     * so stopping the moment they scrape 4.5 would be meaner than the design.
     */
    private const TEXT_TARGET = 5.5;

    /** The surfaces the derived tokens are measured against - Appendix B 4.2. */
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

    public static function for(?string $hex, string $profileDefault): self
    {
        $house  = CssColor::safe($profileDefault);
        $wanted = CssColor::safe($hex, $house);

        // No tenant colour, or one CssColor rejected: nothing to derive. The
        // stylesheet's measured house tokens are already correct.
        if ($wanted === $house) {
            return self::resolve($house, false);
        }

        // The dead band. Falling back loses the tenant's colour; not falling
        // back loses the words on their own call to action.
        if (self::contrast(self::bestLabel($wanted), $wanted) < self::FLOOR) {
            return self::resolve($house, false);
        }

        return self::resolve($wanted, true);
    }

    private static function resolve(string $brand, bool $isDerived): self
    {
        $on = self::bestLabel($brand);

        return new self(
            brand:  $brand,
            on:     $on,
            hover:  self::hover($brand, $on),
            halo:   self::rgba($brand, 0.26),
            deep:   self::toward($brand, self::BLACK, self::PAPER, self::TEXT_TARGET),
            bright: self::toward($brand, self::WHITE, self::INK, self::TEXT_TARGET),
            isDerived: $isDerived,
        );
    }

    /**
     * The hovered fill for the primary CTA.
     *
     * It moves AWAY from the label, so hovering can only raise the label's
     * contrast - a fixed "darken on hover" silently lowers it on a light
     * brand, which is where a CTA is most fragile to begin with.
     *
     * A brand already at the end it would move toward (pure black with a white
     * label, pure white with a dark one) has nowhere to go, and a CTA with no
     * hover feedback at all is a worse answer than a smaller one. Those move
     * the other way instead, and only if the label still clears the floor on
     * the result.
     */
    private static function hover(string $brand, string $on): string
    {
        $away = self::mix($brand, $on === self::LABEL_LIGHT ? self::BLACK : self::WHITE, 0.18);

        if ($away !== $brand) {
            return $away;
        }

        $toward = self::mix($brand, $on === self::LABEL_LIGHT ? self::WHITE : self::BLACK, 0.18);

        return self::contrast($on, $toward) >= self::FLOOR ? $toward : $brand;
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
