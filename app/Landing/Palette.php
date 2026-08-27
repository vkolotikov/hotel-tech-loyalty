<?php
namespace App\Landing;

/**
 * The six curated design palettes (landing phase 3c, spec §3).
 *
 * D2's decision is "palettes are data, not stylesheets" — the rebuilt
 * template (Task 4) reads exactly these fifteen custom-property names off
 * whichever palette a page resolves to, plus the `dark` flag for
 * `color-scheme` and the monogram/veil variants. Nothing here decides
 * which pages GET a palette; that is the layout's job (Task 4 wires the
 * inline `:root` block) and the editor's job (Task 6 offers the six cards).
 * This class only answers "what does palette X actually look like".
 *
 * Mirrors IndustryProfile's authored-array shape deliberately: an
 * id-keyed array of plain data, a private constructor, and a `for()` that
 * resolves an untrusted string against it — the same house pattern, the
 * same reason (a template that reads `$palette->accent` should never have
 * to wonder whether the array underneath forgot a key).
 */
final class Palette
{
    /**
     * The token keys every authored palette below must define, and the
     * only ones `tokens` may ever carry — spec §3's own enumeration,
     * verbatim. The rebuilt CSS (Task 4) consumes exactly these fifteen
     * custom-property names; `dark` drives `color-scheme` instead and is
     * its own property below, not a sixteenth token, because `tokens` is
     * typed as a plain string map and `dark` is a bool.
     *
     * `--accent-text` (Task 5) is likewise NOT a sixteenth key here: the
     * layout's palette emission derives it from `dark` at render time, as
     * `var(--accent-bright)` on a dark palette and `var(--accent-deep)` on
     * a light one — a pointer, never an authored literal, so this map
     * stays the single source of truth for values and nothing new can
     * drift from the pair it names. See layout.blade.php's palette block.
     */
    public const TOKEN_KEYS = [
        'bg', 'bg-2', 'bg-elev', 'glass',
        'text', 'text-soft', 'text-muted',
        'line', 'line-soft',
        'accent', 'accent-bright', 'accent-deep', 'accent-on',
        'halo', 'scrim',
    ];

    private function __construct(
        public readonly string $id,
        public readonly string $label,
        public readonly bool   $dark,
        /** @var array<string,string> exactly the fifteen keys in TOKEN_KEYS */
        public readonly array  $tokens,
    ) {}

    /**
     * The six authored palettes, spec §3 values verbatim — nothing here is
     * re-derived or rounded from the plan. Ten of the fifteen tokens per
     * palette (bg/bg-2/bg-elev/text/text-soft/text-muted/accent/
     * accent-bright/accent-deep/accent-on) are the spec's explicit hex
     * values, copied byte for byte including whichever case the spec
     * happened to author them in (champagne_noir lowercase, the other five
     * uppercase) — "verbatim" means verbatim, not "normalised to look
     * consistent". The remaining five (glass, line, line-soft, halo,
     * scrim) are not in the spec's explicit list at all; they are derived
     * here in the reference stylesheet's own idiom (see
     * docs/superpowers/specs/assets/2026-08-26-beauty-tech-reference.css's
     * `:root`, where --bg-glass/--line/--line-soft/--gold-glow are each an
     * rgba() of another named colour at a fixed alpha), applied uniformly
     * across all six palettes:
     *
     *   - glass:     rgba(bg-elev, 0.62)   — the reference's own
     *                                        --bg-glass alpha, off elev
     *                                        rather than a one-off brown so
     *                                        every palette's glass panel is
     *                                        tinted with ITS OWN surface.
     *   - line:      rgba(accent-bright, 0.22) — the reference's --line.
     *   - line-soft: rgba(accent-bright, 0.12) — the reference's
     *                                             --line-soft (same ratio
     *                                             to line, half the alpha).
     *   - halo:      rgba(accent-bright, 0.30) — the reference's
     *                                             --gold-glow.
     *   - scrim:     rgba(bg, 0.72)        — the reference's hero __veil
     *                                        gradient stops (rgba(bg,
     *                                        0.50-0.95) layered); 0.72
     *                                        sits mid-range as a single flat
     *                                        value for the mobile
     *                                        text-on-photo scrim (D5),
     *                                        which needs one opacity, not a
     *                                        gradient.
     *
     * Every palette's rgb() triple behind these five was computed once at
     * authoring time (hexdec of the ten explicit tokens above) — there is
     * no runtime colour maths in this class, matching IndustryProfile's
     * "pure data" shape. NOTE (Task 4 review ride-along): that makes the
     * five derived tokens AUTHORED LITERALS that must track their source
     * hex by hand — edit bg-elev, accent-bright or bg in any palette and
     * the matching glass/line/line-soft/halo/scrim rgb() triples below it
     * must be recomputed in the same edit, or the derivations silently
     * describe a colour the palette no longer contains. The contrast figure on each pair below is the
     * same WCAG relative-luminance ratio PaletteTest re-derives
     * independently (it does not call into this class's own numbers) and
     * Accent::contrast() already implements for tenant colours.
     *
     * @return array<string, array{label: string, dark: bool, tokens: array<string,string>}>
     */
    public static function all(): array
    {
        return [
            'champagne_noir' => [
                // The reference language itself (test.beauty-tech.uk) —
                // warm charcoal/brown, champagne/gold. Default for beauty.
                'label' => 'Champagne Noir',
                'dark'  => true,
                'tokens' => [
                    'bg'        => '#15100b',
                    'bg-2'      => '#1c150e',
                    'bg-elev'   => '#2b2014',
                    // glass: rgba(bg-elev = 43,32,20, 0.62)
                    'glass'     => 'rgba(43, 32, 20, 0.62)',
                    'text'      => '#f7eeda',
                    'text-soft' => '#d8cdb6',
                    'text-muted'=> '#a89e88',
                    // contrast: text-on-bg 16.38:1, text-soft-on-bg 12.00:1
                    // line/line-soft/halo: rgba(accent-bright = 241,212,155, alpha)
                    'line'      => 'rgba(241, 212, 155, 0.22)',
                    'line-soft' => 'rgba(241, 212, 155, 0.12)',
                    'accent'        => '#d8b878',
                    'accent-bright' => '#f1d49b',
                    'accent-deep'   => '#927044',
                    'accent-on'     => '#1a1208',
                    // contrast: accent-on-on-accent (label) 9.74:1
                    'halo'      => 'rgba(241, 212, 155, 0.3)',
                    // scrim: rgba(bg = 21,16,11, 0.72)
                    'scrim'     => 'rgba(21, 16, 11, 0.72)',
                ],
            ],
            'porcelain' => [
                // Refined current light default — 'other' industry, and
                // the porcelain the un-palette'd CSS's own :root already
                // ships, so a page set to it explicitly must look
                // identical to a page with no palette at all.
                'label' => 'Porcelain',
                'dark'  => false,
                'tokens' => [
                    'bg'        => '#F4F6F8',
                    'bg-2'      => '#ECE8EE',
                    'bg-elev'   => '#FFFFFF',
                    // glass: rgba(bg-elev = 255,255,255, 0.62)
                    'glass'     => 'rgba(255, 255, 255, 0.62)',
                    'text'      => '#211C29',
                    'text-soft' => '#5B5266',
                    'text-muted'=> '#7A7186',
                    // contrast: text-on-bg 15.35:1, text-soft-on-bg 6.82:1
                    // line/line-soft/halo: rgba(accent-bright = 199,127,180, alpha)
                    'line'      => 'rgba(199, 127, 180, 0.22)',
                    'line-soft' => 'rgba(199, 127, 180, 0.12)',
                    'accent'        => '#9B5C8F',
                    'accent-bright' => '#C77FB4',
                    'accent-deep'   => '#7E4874',
                    'accent-on'     => '#FFFFFF',
                    // contrast: accent-on-on-accent (label) 4.86:1
                    'halo'      => 'rgba(199, 127, 180, 0.3)',
                    // scrim: rgba(bg = 244,246,248, 0.72)
                    'scrim'     => 'rgba(244, 246, 248, 0.72)',
                ],
            ],
            'midnight_brass' => [
                // Hotel default.
                'label' => 'Midnight Brass',
                'dark'  => true,
                'tokens' => [
                    'bg'        => '#0f1419',
                    'bg-2'      => '#151c23',
                    'bg-elev'   => '#1d2630',
                    // glass: rgba(bg-elev = 29,38,48, 0.62)
                    'glass'     => 'rgba(29, 38, 48, 0.62)',
                    'text'      => '#EDF2F4',
                    'text-soft' => '#C3CDD4',
                    'text-muted'=> '#8B98A3',
                    // contrast: text-on-bg 16.40:1, text-soft-on-bg 11.46:1
                    // line/line-soft/halo: rgba(accent-bright = 227,201,143, alpha)
                    'line'      => 'rgba(227, 201, 143, 0.22)',
                    'line-soft' => 'rgba(227, 201, 143, 0.12)',
                    'accent'        => '#C8A96A',
                    'accent-bright' => '#E3C98F',
                    'accent-deep'   => '#8F7440',
                    'accent-on'     => '#10151A',
                    // contrast: accent-on-on-accent (label) 8.16:1
                    'halo'      => 'rgba(227, 201, 143, 0.3)',
                    // scrim: rgba(bg = 15,20,25, 0.72)
                    'scrim'     => 'rgba(15, 20, 25, 0.72)',
                ],
            ],
            'clinic_air' => [
                // Medical / dental default.
                'label' => 'Clinic Air',
                'dark'  => false,
                'tokens' => [
                    'bg'        => '#F7FAFB',
                    'bg-2'      => '#EDF3F5',
                    'bg-elev'   => '#FFFFFF',
                    // glass: rgba(bg-elev = 255,255,255, 0.62)
                    'glass'     => 'rgba(255, 255, 255, 0.62)',
                    'text'      => '#122A33',
                    'text-soft' => '#3D5A66',
                    'text-muted'=> '#5E7B87',
                    // contrast: text-on-bg 14.25:1, text-soft-on-bg 7.02:1
                    // line/line-soft/halo: rgba(accent-bright = 58,167,176, alpha)
                    'line'      => 'rgba(58, 167, 176, 0.22)',
                    'line-soft' => 'rgba(58, 167, 176, 0.12)',
                    'accent'        => '#0E7C86',
                    'accent-bright' => '#3AA7B0',
                    'accent-deep'   => '#0A5B62',
                    'accent-on'     => '#FFFFFF',
                    // contrast: accent-on-on-accent (label) 4.95:1
                    'halo'      => 'rgba(58, 167, 176, 0.3)',
                    // scrim: rgba(bg = 247,250,251, 0.72)
                    'scrim'     => 'rgba(247, 250, 251, 0.72)',
                ],
            ],
            'terracotta' => [
                // Restaurant / café default.
                'label' => 'Terracotta',
                'dark'  => false,
                'tokens' => [
                    'bg'        => '#FAF5EE',
                    'bg-2'      => '#F3EADD',
                    'bg-elev'   => '#FFFFFF',
                    // glass: rgba(bg-elev = 255,255,255, 0.62)
                    'glass'     => 'rgba(255, 255, 255, 0.62)',
                    'text'      => '#2A2018',
                    'text-soft' => '#5C4C3E',
                    'text-muted'=> '#82705F',
                    // contrast: text-on-bg 14.69:1, text-soft-on-bg 7.57:1
                    // line/line-soft/halo: rgba(accent-bright = 217,106,71, alpha)
                    'line'      => 'rgba(217, 106, 71, 0.22)',
                    'line-soft' => 'rgba(217, 106, 71, 0.12)',
                    'accent'        => '#B4462A',
                    'accent-bright' => '#D96A47',
                    'accent-deep'   => '#8A3520',
                    'accent-on'     => '#FFFFFF',
                    // contrast: accent-on-on-accent (label) 5.45:1
                    'halo'      => 'rgba(217, 106, 71, 0.3)',
                    // scrim: rgba(bg = 250,245,238, 0.72)
                    'scrim'     => 'rgba(250, 245, 238, 0.72)',
                ],
            ],
            'slate_amber' => [
                // Fitness / education / professional (legal, real_estate)
                // default — the spec's own label for this palette names
                // "professional" alongside fitness and education, which is
                // what fixes legal/real_estate's mapping (see
                // IndustryProfile::all()'s defaultPalette and this task's
                // report for the full nine-industry table).
                'label' => 'Slate Amber',
                'dark'  => true,
                'tokens' => [
                    'bg'        => '#16181D',
                    'bg-2'      => '#1C1F26',
                    'bg-elev'   => '#242832',
                    // glass: rgba(bg-elev = 36,40,50, 0.62)
                    'glass'     => 'rgba(36, 40, 50, 0.62)',
                    'text'      => '#EFF1F4',
                    'text-soft' => '#C6CBD4',
                    'text-muted'=> '#9199A6',
                    // contrast: text-on-bg 15.69:1, text-soft-on-bg 10.90:1
                    // line/line-soft/halo: rgba(accent-bright = 242,197,131, alpha)
                    'line'      => 'rgba(242, 197, 131, 0.22)',
                    'line-soft' => 'rgba(242, 197, 131, 0.12)',
                    'accent'        => '#E0A458',
                    'accent-bright' => '#F2C583',
                    'accent-deep'   => '#A5763B',
                    'accent-on'     => '#171310',
                    // contrast: accent-on-on-accent (label) 8.46:1
                    'halo'      => 'rgba(242, 197, 131, 0.3)',
                    // scrim: rgba(bg = 22,24,29, 0.72)
                    'scrim'     => 'rgba(22, 24, 29, 0.72)',
                ],
            ],
        ];
    }

    /** The six ids, in the order they are authored above. */
    public static function ids(): array
    {
        return array_keys(self::all());
    }

    /**
     * Whitelists an untrusted `theme.palette` value against the six
     * authored ids — the same defensive shape as the font_pairing block at
     * layout.blade.php:20-31, but returning null for "no match" rather
     * than a fallback string, because unlike font_pairing there is no
     * third state to distinguish: no palette and an unrecognised palette
     * both mean exactly one thing here — "the CSS's own :root porcelain
     * default stands, emit nothing".
     *
     * Callers must not hand this a non-string, non-null value directly
     * (an array or object `theme.palette` leaf would fail the `?string`
     * type at the call site before this method ever runs) — the layout
     * guards that the same way it already guards font_pairing, by
     * checking `is_string()` on the raw theme leaf first.
     */
    public static function for(?string $id): ?self
    {
        if ($id === null) {
            return null;
        }

        $data = self::all()[$id] ?? null;

        if ($data === null) {
            return null;
        }

        return new self(
            id:     $id,
            label:  $data['label'],
            dark:   $data['dark'],
            tokens: $data['tokens'],
        );
    }
}
