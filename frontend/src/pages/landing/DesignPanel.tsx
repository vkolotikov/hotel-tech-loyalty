import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import {
  PALETTES, FONT_PAIRINGS, paletteFor, pairingFor, pickerSafeHex,
  type PaletteId, type FontPairingId,
} from './designChoices'

/**
 * D4's own design-controls component (landing phase 3c, Task 6): six
 * palette cards, four type-pairing cards, and the brand-colour input,
 * shared verbatim between `LandingEditor`'s new Design panel and
 * `LandingWizard`'s "Make it yours" step — the two places D4 says must
 * offer the same choices with the same real previews, never a
 * near-identical second copy.
 *
 * Every card is a REAL miniature render — the tenant's own business name,
 * set in real self-hosted faces (see `../../styles/landing-preview-
 * fonts.css`, imported by both call sites), over the real palette colours
 * — never a swatch or a label. Per the brief: a palette card shows the
 * business name in the currently SELECTED pairing's face (so it re-renders
 * the instant the tenant changes the type style), and a pairing card shows
 * it in ITS OWN face over the currently selected PALETTE's surfaces (so the
 * two axes stay comparable against one fixed backdrop each time).
 *
 * Deliberately not wired to `theme` objects or form state directly — see
 * this file's own three callback props. Two very different callers own two
 * very different write paths (`LandingEditor`'s single `theme` object via
 * the existing save button; `LandingWizard`'s per-field `WizardForm`
 * setters via its autosaved draft), and a shared component that tried to
 * own either shape would have to know about both.
 *
 * No unit tests target this file directly — `vitest.config.ts` is
 * node-env, pure-function-only (no DOM, no React Testing Library); what
 * IS tested is this component's data (`designChoices.test.ts`) and, at
 * each call site, the payload/patch functions that turn a click here into
 * a saved value.
 */

const kicker = 'text-[11px] font-mono uppercase tracking-[0.14em] text-primary-500'

// The house "selected card" idiom (LandingWizard.tsx's own template/font
// cards, predating this component): border + a soft ring in primary-500,
// versus a plain border that brightens on hover. Reused verbatim rather
// than invented fresh — except the active variant here carries no
// `bg-primary-500/[...]` wash, because these cards paint their OWN
// background (the palette's real `bg`) and a translucent overlay on top of
// it would tint the very colour the card exists to show honestly.
const cardBase = 'relative text-left rounded-xl border p-4 transition-all overflow-hidden '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50'
const cardActive = 'border-primary-500 ring-1 ring-primary-500/30'
const cardInactive = 'border-dark-border hover:border-primary-500/40'

type DesignPanelProps = {
  /** The tenant's own business name — every card sets this, never a
   *  placeholder. Callers already resolve this fallback chain themselves
   *  (`LandingWizard`'s `businessName`, `LandingEditor`'s equivalent). */
  businessName: string
  /** The currently stored/drafted `theme.palette`, or `undefined` when
   *  nothing has been chosen yet — `designChoices.paletteFor()` resolves
   *  that (and any unrecognised id) to the CSS's own no-choice default for
   *  preview purposes only; see that function's own comment for why this
   *  component never writes that fallback back into `theme` itself. */
  palette: string | undefined
  /** Same shape as `palette`, for `theme.font_pairing`. */
  fontPairing: string | undefined
  /** The current `theme.brand_color`, or `undefined` on a page/draft that
   *  has never set one — the swatch/input then falls back to the selected
   *  palette's own accent, exactly what `Accent::for()` does server-side
   *  for an unset brand colour. */
  brandColor: string | undefined
  onPaletteChange: (id: PaletteId) => void
  onFontPairingChange: (id: FontPairingId) => void
  onBrandColorChange: (hex: string) => void
}

export function DesignPanel({
  businessName, palette, fontPairing, brandColor,
  onPaletteChange, onFontPairingChange, onBrandColorChange,
}: DesignPanelProps) {
  const { t } = useTranslation()

  const activePalette = paletteFor(palette)
  const activePairing = pairingFor(fontPairing)
  const resolvedBrandColor = brandColor || activePalette.accent

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <span className={kicker}>{t('landing_pages.design.palette_kicker', 'Look')}</span>
        <p className="text-sm text-t-secondary leading-relaxed">
          {t(
            'landing_pages.design.palette_intro',
            'Every palette is designed to look great from the start — pick the one that feels like your business.',
          )}
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          {PALETTES.map(p => {
            const active = p.id === activePalette.id
            const headingStyle: CSSProperties = {
              color: p.text,
              fontFamily: activePairing.displayFontFamily,
              fontWeight: activePairing.displayFontWeight,
              letterSpacing: activePairing.displayLetterSpacing,
              textTransform: activePairing.displayTextTransform,
              fontVariationSettings: activePairing.displayFontVariationSettings,
            }
            const bodyStyle: CSSProperties = { color: p.textSoft, fontFamily: activePairing.bodyFontFamily }

            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => onPaletteChange(p.id)}
                className={cardBase + ' ' + (active ? cardActive : cardInactive)}
                style={{ backgroundColor: p.bg }}
              >
                <div className="flex items-center justify-between">
                  <span aria-hidden className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.accent }} />
                  {active && <Check size={14} className="text-primary-500" />}
                </div>

                <span className="block mt-3 text-lg truncate" style={headingStyle}>{businessName}</span>
                <span className="block mt-1.5 text-[11px] leading-relaxed" style={bodyStyle}>
                  {t('landing_pages.design.specimen_line1', 'Quietly, unmistakably yours.')}
                </span>
                <span className="block text-[11px] leading-relaxed" style={bodyStyle}>
                  {t('landing_pages.design.specimen_line2', 'Designed to feel considered, not templated.')}
                </span>

                <span
                  aria-hidden
                  className="block mt-2.5 h-[3px] w-10 rounded-full"
                  style={{ backgroundImage: `linear-gradient(90deg, ${p.accent}, ${p.accentBright})` }}
                />
                <span className="block mt-1.5 text-[10px] font-mono uppercase tracking-wide" style={{ color: p.textSoft }}>
                  {t(`landing_pages.design.palette_name_${p.id}`, p.label)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <span className={kicker}>{t('landing_pages.design.pairing_kicker', 'Type style')}</span>
        <p className="text-sm text-t-secondary leading-relaxed">
          {t('landing_pages.design.pairing_intro', 'How your headings and body text look together.')}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {FONT_PAIRINGS.map(fp => {
            const active = fp.id === activePairing.id
            const headingStyle: CSSProperties = {
              color: activePalette.text,
              fontFamily: fp.displayFontFamily,
              fontWeight: fp.displayFontWeight,
              letterSpacing: fp.displayLetterSpacing,
              textTransform: fp.displayTextTransform,
              fontVariationSettings: fp.displayFontVariationSettings,
            }
            const bodyStyle: CSSProperties = { color: activePalette.textSoft, fontFamily: fp.bodyFontFamily }

            return (
              <button
                key={fp.id}
                type="button"
                aria-pressed={active}
                onClick={() => onFontPairingChange(fp.id)}
                className={cardBase + ' ' + (active ? cardActive : cardInactive)}
                style={{ backgroundColor: activePalette.bg }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wide" style={{ color: activePalette.textSoft }}>
                    {t(`landing_pages.design.pairing_name_${fp.id}`, fp.label)}
                  </span>
                  {active && <Check size={14} className="text-primary-500" />}
                </div>

                <span className="block mt-3 text-lg truncate" style={headingStyle}>{businessName}</span>
                <span className="block mt-1.5 text-xs" style={bodyStyle}>
                  {t('landing_pages.design.specimen_line1', 'Quietly, unmistakably yours.')}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <span className={kicker}>{t('landing_pages.design.color_kicker', 'Brand colour')}</span>
        <div className="flex items-center gap-3">
          {/* Inline hex, deliberately: this swatch previews the exact
              colour the tenant is choosing (the wizard's own established
              carve-out for admin chrome, Appendix A §7.4). */}
          <span
            aria-hidden
            className="w-9 h-9 rounded-full border border-dark-border shrink-0"
            style={{ backgroundColor: resolvedBrandColor }}
          />
          <input
            type="color"
            aria-label={t('landing_pages.design.color_label', 'Brand colour')}
            // F4 (phase 3c final fix wave): narrowed separately from the
            // swatch/readout above and below, which keep showing
            // resolvedBrandColor verbatim. `<input type="color">` coerces
            // anything that is not a strict 6-hex-digit value to #000000 —
            // see pickerSafeHex's own comment — so without this narrowing
            // the picker opened black while the swatch beside it showed the
            // real (non-#rrggbb) stored colour, and the tenant's first drag
            // silently wrote black over their actual accent.
            value={pickerSafeHex(resolvedBrandColor, activePalette.accent)}
            onChange={e => onBrandColorChange(e.target.value)}
            className="h-9 w-16 rounded-lg border border-dark-border bg-dark-bg cursor-pointer"
          />
          <span className="text-xs text-t-secondary font-mono">{resolvedBrandColor}</span>
        </div>
      </div>
    </div>
  )
}
