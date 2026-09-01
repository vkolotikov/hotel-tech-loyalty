import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import {
  PALETTES, FONT_PAIRINGS, paletteFor, pairingFor, pickerSafeHex,
  type PaletteId, type FontPairingId,
} from './designChoices'
import { industryCards, type IndustryOption } from './industryChoices'
import {
  industryHasChanged, showTemplatePicker, templateCards,
  type TemplateOption, type TemplateSupport,
} from './editorCatalog'

/**
 * D4's own design-controls component (landing phase 3c, Task 6): six
 * palette cards, four type-pairing cards, and the brand-colour input,
 * shared verbatim between `LandingEditor`'s new Design panel and
 * `LandingWizard`'s "Make it yours" step — the two places D4 says must
 * offer the same choices with the same real previews, never a
 * near-identical second copy.
 *
 * Landing phase 3c, Plan A adds two OPTIONAL blocks above those three: the
 * industry picker and the template picker. Optional, and rendered only when
 * the caller supplies their data, because only ONE of this component's two
 * callers has either question left to ask — the wizard asks about industry
 * in its own first step (where it can still change which SECTIONS the page
 * is created with) and never asks about the template at all, so it passes
 * neither prop and renders byte-identically to before. The editor passes
 * both, because a page that already exists is exactly where the answers
 * given once, at creation, need somewhere to be changed.
 *
 * The industry cards here are drawn from `industryChoices.ts` — the SAME
 * module and the same `industryCards()` derivation the wizard's step 1
 * renders from, over the same served catalogue — so the two screens cannot
 * describe an industry differently, name it differently, or offer one the
 * other does not. Only the layout differs (this panel is a column, not a
 * full-width step).
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

  // ─── Plan A's two optional blocks (see this file's docblock) ──────────
  //
  // Each renders only when its own data AND its own callback are supplied,
  // so a caller with nothing to ask (LandingWizard) passes nothing and gets
  // exactly the panel that shipped before.

  /** `onboarding.industries` — the served catalogue, verbatim. Empty (or
   *  absent) hides the picker entirely, which is what a frontend deployed
   *  ahead of its backend gets. */
  industries?: IndustryOption[]
  /** The currently drafted/stored industry id. */
  industry?: string
  /** The industry actually SAVED on the row — what `industry` is compared
   *  against to decide whether the tenant has moved off it, and therefore
   *  whether the change note is shown. Never the same value as `industry`
   *  once something is chosen; see `industryHasChanged`. */
  savedIndustry?: string
  onIndustryChange?: (id: string) => void

  /** `onboarding.templates`. One row (today's `ruled_page` alone) hides the
   *  picker — see `showTemplatePicker`. */
  templates?: TemplateOption[]
  /** Already narrowed by `resolveTemplateKey` at the call site. */
  templateKey?: string
  onTemplateChange?: (key: string) => void

  /**
   * Template fidelity 1.2 — WHAT THE SELECTED TEMPLATE ACTUALLY HONOURS,
   * resolved by `templateSupports()` at the call site off the SERVED
   * `templates[*].supports`.
   *
   * Every block below whose value this panel writes is gated on the
   * matching bool, and where one is false the control is NOT RENDERED and
   * its absence is explained in one sentence. That is this project's own
   * rule, arrived at the hard way: on Nocturne Ritual this panel drew six
   * palette cards and four type-pairing cards over a design whose layout
   * reads neither key, so ten of the fifteen controls a tenant met here
   * did nothing at all, silently, forever.
   *
   * NEVER a template id compared in this file. The fact belongs to the
   * template's own layout and reaches here off the wire; a
   * `key === 'nocturne_ritual'` here would be a second statement of it
   * that the third template would silently inherit wrongly.
   *
   * Optional, and absent means "everything" — the wizard passes no
   * templates at all and must keep rendering exactly the panel it always
   * did. See `templateSupports`, which owns that direction.
   */
  supports?: TemplateSupport
}

/** Everything on — what the wizard (which asks about no template) gets, and
 *  what a response with no `supports` resolves to. Kept beside the prop it
 *  defaults so the two cannot drift. */
const ALL_SUPPORTED: TemplateSupport = {
  palette: true, font_pairing: true, tones: true, brand_color: true,
}

export function DesignPanel({
  businessName, palette, fontPairing, brandColor,
  onPaletteChange, onFontPairingChange, onBrandColorChange,
  industries, industry, savedIndustry, onIndustryChange,
  templates, templateKey, onTemplateChange,
  supports = ALL_SUPPORTED,
}: DesignPanelProps) {
  const { t } = useTranslation()

  const activePalette = paletteFor(palette)
  const activePairing = pairingFor(fontPairing)
  const resolvedBrandColor = brandColor || activePalette.accent

  const industryOptions = industries ?? []
  const showIndustries = industryOptions.length > 0 && onIndustryChange !== undefined
  const industryOwnCards = industryCards(industryOptions, industry ?? '')
  const industryMoved = industryHasChanged(industry, savedIndustry)

  const templateOptions = templates ?? []
  const showTemplates = showTemplatePicker(templateOptions) && onTemplateChange !== undefined
  const templateOwnCards = templateCards(templateOptions, templateKey ?? '')

  // WHICH OF THE TWO SHAPE-OF-THE-PAGE CONTROLS THIS DESIGN IGNORES, said
  // once so the sentence below can name them honestly. Both false is the
  // common case (a kit template owns its whole visual identity); one of the
  // two is possible in principle and is what the three keys exist for.
  const lockedPalette = !supports.palette
  const lockedType = !supports.font_pairing
  const templateName = templateOptions.find(o => o.key === templateKey)?.name ?? ''

  return (
    <div className="space-y-6">
      {showTemplates && (
        <div className="space-y-3">
          <span className={kicker}>{t('landing_pages.design.template_kicker', 'Page style')}</span>
          <p className="text-sm text-t-secondary leading-relaxed">
            {t(
              'landing_pages.design.template_intro',
              'How your page is laid out. Your words, your photos and your colours come with you.',
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {templateOwnCards.map(c => (
              <button
                key={c.key}
                type="button"
                aria-pressed={c.selected}
                onClick={() => onTemplateChange(c.key)}
                className={'text-left rounded-xl border p-4 transition-all outline-none '
                  + 'focus-visible:ring-2 focus-visible:ring-primary-500/40 '
                  + (c.selected
                    ? 'border-primary-500 bg-primary-500/[0.08] ring-1 ring-primary-500/30'
                    : 'border-dark-border bg-dark-bg hover:border-primary-500/40 hover:bg-primary-500/[0.04]')}
              >
                <div className="flex items-center justify-between gap-2">
                  {/* Untranslated, from the server — see `TemplateOption`. */}
                  <span className="text-sm font-semibold text-white truncate">{c.name}</span>
                  {c.selected && <Check size={16} className="text-primary-500 shrink-0" />}
                </div>
                <p className="text-xs text-t-secondary leading-relaxed mt-2">{c.blurb}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/*
        BRAND COLOUR, SECOND — right under the page style, because it is the
        one design control every template honours and the one a tenant most
        often arrives here to change. It used to be last, under six palette
        cards and four type cards, on a template that draws none of them.
      */}
      {supports.brand_color && (
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
      )}

      {supports.palette && (
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
      )}

      {supports.font_pairing && (
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
      )}

      {/*
        THE ABSENCE, EXPLAINED — the other half of "a control that cannot act
        is not rendered". A tenant who used these cards on The Ruled Page and
        then switched to a kit template must be told where they went, and
        that the one colour control they have left still works. Named after
        the template so the sentence reads as a fact about the design they
        chose rather than as a missing feature.
      */}
      {(lockedPalette || lockedType) && (
        <p className="text-sm text-t-secondary leading-relaxed">
          {lockedPalette && lockedType
            ? t('landing_pages.design.locked_look_and_type', {
              template: templateName,
              defaultValue: '{{template}} comes with its own colours and type — the designer chose them, and they are part of why the page looks like this. Your brand colour still applies above.',
            })
            : lockedPalette
              ? t('landing_pages.design.locked_look', {
                template: templateName,
                defaultValue: '{{template}} comes with its own colours — the designer chose them, and they are part of why the page looks like this. Your brand colour still applies above.',
              })
              : t('landing_pages.design.locked_type', {
                template: templateName,
                defaultValue: '{{template}} comes with its own type — the designer chose it, and it is part of why the page looks like this.',
              })}
        </p>
      )}

      {/*
        INDUSTRY, LAST, AND UNDER ITS OWN WARNING.

        It is the most destructive control on this screen — its own change
        note below says that saving it rewrites every heading, the wording on
        every button and which sections are on offer — and until this round
        it was the FIRST thing, and the largest grid, a tenant met when they
        came here looking for a colour. The confirm is the caller's (see
        `LandingEditor`'s `onIndustryChange`), mirroring the one `handleRemove`
        already puts in front of the only other irreversible control in the
        editor.
      */}
      {showIndustries && (
        <div className="space-y-4 border-t border-dark-border pt-6">
          {/* The warning colour, not the primary one every other kicker on
              this panel wears: this heading exists to slow a tenant down
              before the one control here that rewrites their copy. */}
          <span className="block text-[11px] font-mono uppercase tracking-[0.14em] text-warning">
            {t('landing_pages.design.advanced_kicker', 'Advanced — this changes your page’s words')}
          </span>
          <div className="space-y-3">
            <span className={kicker}>{t('landing_pages.design.industry_kicker', 'Your industry')}</span>
            <p className="text-sm text-t-secondary leading-relaxed">
              {t(
                'landing_pages.design.industry_intro',
                'Your page is written in your own trade’s words. Change this and the headings, the button wording and the sections on offer follow.',
              )}
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {industryOwnCards.map(c => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={c.selected}
                  onClick={() => onIndustryChange(c.id)}
                  className={'text-left rounded-xl border p-4 transition-all outline-none '
                    + 'focus-visible:ring-2 focus-visible:ring-primary-500/40 '
                    + (c.selected
                      ? 'border-primary-500 bg-primary-500/[0.08] ring-1 ring-primary-500/30'
                      : 'border-dark-border bg-dark-bg hover:border-primary-500/40 hover:bg-primary-500/[0.04]')}
                >
                  <div className="flex items-center justify-between gap-2">
                    {/* The wizard's own key, deliberately reused rather than a
                        second `landing_pages.design.industry_name_*` family:
                        one industry, one word for it, wherever a tenant meets
                        it. `localeCompleteness.test.ts`'s hand-verified net
                        already pins all nine of these in all five locales. */}
                    <span className="text-sm font-semibold text-white truncate">
                      {t(`landing_pages.wizard.industry_name_${c.id}`, c.name)}
                    </span>
                    {c.selected && <Check size={16} className="text-primary-500 shrink-0" />}
                  </div>

                  {/* This industry's own band names, drawn the way the page
                      draws them — mono eyebrows in the palette that industry
                      opens on. Inline colour, deliberately: customer-facing
                      page styling being previewed, not admin chrome
                      (Appendix A §7.4), and the whole point is that two
                      industries do not look alike. */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3">
                    {c.vocabulary.map(word => (
                      <span
                        key={word}
                        className="text-[10px] font-mono uppercase tracking-[0.12em]"
                        style={{ color: c.paletteAccent }}
                      >
                        {word}
                      </span>
                    ))}
                  </div>

                  {/* The page's own primary button, at card size. Every
                      profile's accent clears the WCAG 4.5:1 floor against a
                      white label — see IndustryProfile::all()'s docblock — so
                      the label is safe as plain white here. */}
                  <span
                    className="inline-block mt-3 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: c.accent }}
                  >
                    {c.primaryCta}
                  </span>
                </button>
              ))}
            </div>

            {industryMoved && (
              <p className="text-xs text-t-secondary leading-relaxed">
                {t(
                  'landing_pages.design.industry_change_note',
                  'Saving this rewrites your page in the new trade’s words — headings, section names and the wording on your buttons — and changes which sections you can show (online booking is offered to hotels only). It also changes the words the rest of your workspace uses. Nothing you have already saved — bookings, clients, settings — is changed or deleted.',
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
