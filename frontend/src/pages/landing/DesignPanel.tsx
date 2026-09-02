import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { pickerSafeHex } from './designChoices'
import { industryCards, type IndustryOption } from './industryChoices'
import {
  industryHasChanged, showTemplatePicker, templateGroups,
  type TemplateGroupKind, type TemplateOption, type TemplateSupport,
} from './editorCatalog'

/**
 * THE DESIGN CONTROLS: the design this page is on, the one colour every
 * design honours, and the way to change design.
 *
 * Shared verbatim between `LandingEditor`'s Design tab and `LandingWizard`'s
 * own design step, so the two screens cannot offer different choices or
 * describe the same design differently. Only the layout differs (this is a
 * column in the editor, a full-width step in the wizard) and one behaviour:
 * the wizard is CHOOSING, so its picker is open; the editor is EDITING a
 * page that already has a design, so its picker sits behind "Change design".
 *
 * ─── WHAT USED TO BE HERE, AND WHY IT IS NOT ────────────────────────────
 *
 * Six palette cards, four type-pairing cards, and — on the section rows next
 * door — twenty-one tone swatches. All three existed to make ONE generic
 * template (`ruled_page`) look varied, and they worked: that design reads
 * `theme.palette`, `theme.font_pairing` and each band's tone class, and
 * still does, for the pages already on it.
 *
 * Six faithful conversions of the owner's own HTML/CSS kits later, none of
 * that is a choice anybody is making. Each kit ships its author's complete
 * `:root` — their colours, their faces, their composed dark/paper/sand
 * rhythm — and its layout reads none of those three keys; that is exactly
 * what each row's `supports` has been publishing. With the generic design
 * retired from the offer (see `offerable` in `editorCatalog.ts`), every
 * design a tenant can now choose ignores all three, so the controls could
 * only ever be drawn to do nothing. A control that cannot act is not
 * rendered — this project's own rule — and the honest end state of that rule
 * for a control no offerable design honours is deletion, not a gate.
 *
 * THE ACCENT STAYS. It is the one override every kit was converted to
 * honour, spent on the family each author uses as accent TEXT rather than as
 * a ground with type on it, and it is the control a tenant most often comes
 * here for.
 *
 * Every card below is a REAL claim about a real design — its own name and
 * the author's own words for it, off the wire, never a swatch or an invented
 * label.
 *
 * No unit tests target this file directly — `vitest.config.ts` is node-env,
 * pure-function-only (no DOM, no React Testing Library); what IS tested is
 * this component's data (`editorCatalog.test.ts`, `industryChoices.test.ts`)
 * and, at each call site, the payload functions that turn a click here into
 * a saved value.
 */

const kicker = 'text-[11px] font-mono uppercase tracking-[0.14em] text-primary-500'

// The house "selected card" idiom (LandingWizard.tsx's own cards, predating
// this component): border + a soft ring in primary-500, versus a plain
// border that brightens on hover.
const cardBase = 'text-left rounded-xl border p-4 transition-all outline-none '
  + 'focus-visible:ring-2 focus-visible:ring-primary-500/40'
const cardActive = 'border-primary-500 bg-primary-500/[0.08] ring-1 ring-primary-500/30'
const cardInactive = 'border-dark-border bg-dark-bg hover:border-primary-500/40 hover:bg-primary-500/[0.04]'

type DesignPanelProps = {
  /** The current `theme.brand_color`, or `undefined` on a page/draft that
   *  has never set one — the swatch then falls back to `accentFallback`. */
  brandColor: string | undefined
  /**
   * THE COLOUR THIS PAGE WOULD USE WITH NO OVERRIDE — the industry's own
   * house accent, off `onboarding.industries[*].accent` (already through
   * `CssColor::safe()` server-side).
   *
   * Resolved by the caller rather than here, and served rather than mirrored,
   * because it is the same value `Accent::for()` falls back to at render
   * time: an unset brand colour publishes the INDUSTRY's accent, so that is
   * what the swatch has to show. It used to fall back to the selected
   * palette's accent, which was a different colour from the one the page
   * would actually paint on any kit design.
   */
  accentFallback: string
  onBrandColorChange: (hex: string) => void

  // ─── The design itself ───────────────────────────────────────────────
  //
  // Rendered only when the caller supplies both the rows and the callback,
  // so a caller with nothing to ask draws nothing.

  /** `onboarding.templates`, verbatim — every served row, retired ones
   *  included, because the CHOSEN design may be one of those (two demo pages
   *  are) and its name still has to be printable. The picker itself is built
   *  from the offer; see `templateGroups`. */
  templates?: TemplateOption[]
  /** Already narrowed by `resolveTemplateKey` at the call site. */
  templateKey?: string
  onTemplateChange?: (key: string) => void
  /**
   * THE TENANT'S OWN TRADE, off `onboarding.industries[*].vertical` — what
   * decides which three designs are offered first.
   *
   * A served value compared against each design's own served `vertical`;
   * this component never learns that `nocturne_ritual` is a beauty design.
   * Null (no kit drawn for this trade yet, or an older backend) shows every
   * offered design under one neutral heading — never an empty picker. See
   * `templateGroups`, which owns that rule.
   */
  vertical?: string | null
  /**
   * Whether the picker starts open.
   *
   * The wizard's design step IS the choice, so it opens open and draws no
   * toggle. The editor is editing a page that already has a design, so the
   * picker sits behind "Change design" — which keeps the Design tab to the
   * three things it is now for: the design, the accent, and the way to
   * change design.
   */
  pickerOpen?: boolean

  // ─── Industry, under its own warning ─────────────────────────────────

  /** `onboarding.industries` — the served catalogue, verbatim. Empty (or
   *  absent) hides the picker entirely, which is what a frontend deployed
   *  ahead of its backend gets. */
  industries?: IndustryOption[]
  /** The currently drafted/stored industry id. */
  industry?: string
  /** The industry actually SAVED on the row — what `industry` is compared
   *  against to decide whether the tenant has moved off it, and therefore
   *  whether the change note is shown. See `industryHasChanged`. */
  savedIndustry?: string
  onIndustryChange?: (id: string) => void

  /**
   * WHAT THE SELECTED DESIGN HONOURS, off the served `templates[*].supports`.
   *
   * One reader left: `brand_color`. The other three bools described controls
   * this panel no longer has — see this file's own note above — and they stay
   * on the wire because they still describe something true about each design
   * and because `ruled_page`, which really does read all four, still renders.
   *
   * NEVER a template id compared in this file. Optional, and absent means
   * "everything", which is what a response with no `supports` at all gets.
   */
  supports?: TemplateSupport
}

/** Everything on — what a response with no `supports` resolves to. Kept
 *  beside the prop it defaults so the two cannot drift. */
const ALL_SUPPORTED: TemplateSupport = {
  palette: true, font_pairing: true, tones: true, brand_color: true,
}

/** The heading over each group of designs. A three-word vocabulary off
 *  `templateGroups`, translated here — never a sentence computed in a pure
 *  module, and never a heading assembled from an industry name. */
const GROUP_HEADING: Record<TemplateGroupKind, { key: string; fallback: string }> = {
  own: { key: 'landing_pages.design.designs_own_trade', fallback: 'Made for your trade' },
  other: { key: 'landing_pages.design.designs_other_trades', fallback: 'Other designs' },
  all: { key: 'landing_pages.design.designs_all', fallback: 'All designs' },
}

export function DesignPanel({
  brandColor, accentFallback, onBrandColorChange,
  templates, templateKey, onTemplateChange, vertical, pickerOpen,
  industries, industry, savedIndustry, onIndustryChange,
  supports = ALL_SUPPORTED,
}: DesignPanelProps) {
  const { t } = useTranslation()

  const resolvedBrandColor = brandColor || accentFallback

  const templateOptions = templates ?? []
  const chosen = templateOptions.find(o => o.key === templateKey)
  const groups = templateGroups(templateOptions, templateKey ?? '', vertical)
  const canChangeDesign = showTemplatePicker(templateOptions) && onTemplateChange !== undefined

  // The picker is either permanently open (the wizard is choosing) or behind
  // a toggle (the editor is editing). One boolean, not two code paths.
  const [changing, setChanging] = useState(false)
  const showPicker = canChangeDesign && (pickerOpen === true || changing)

  const industryOptions = industries ?? []
  const showIndustries = industryOptions.length > 0 && onIndustryChange !== undefined
  const industryOwnCards = industryCards(industryOptions, industry ?? '')
  const industryMoved = industryHasChanged(industry, savedIndustry)

  return (
    <div className="space-y-6">
      {/*
        THE DESIGN THIS PAGE IS ON, said plainly and first. It used to be
        implicit — a lit card somewhere in a grid of cards — which is fine
        while you are choosing and useless afterwards, when the question is
        "what am I looking at".
      */}
      {(chosen || canChangeDesign) && (
        <div className="space-y-2">
          <span className={kicker}>{t('landing_pages.design.chosen_kicker', 'Your design')}</span>

          {/*
            The summary is gated on `chosen` rather than on the block, and
            the toggle is not: a page whose stored design the response no
            longer describes has nothing to summarise, and withholding the
            way OUT of that state — because there is nothing to print above
            it — would be the one case where a tenant most needs the picker.
          */}
          {chosen && (
            <div className="rounded-xl border border-dark-border bg-dark-bg p-4">
              {/* Untranslated, from the server — see `TemplateOption`. */}
              <p className="text-sm font-semibold text-white">{chosen.name}</p>
              <p className="text-xs text-t-secondary leading-relaxed mt-1.5">{chosen.blurb}</p>
            </div>
          )}

          {canChangeDesign && pickerOpen !== true && (
            <button
              type="button"
              aria-expanded={changing}
              onClick={() => setChanging(v => !v)}
              className="text-xs text-primary-400 hover:text-primary-300 font-semibold outline-none
                focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded"
            >
              {changing
                ? t('landing_pages.design.change_cancel', 'Keep this design')
                : t('landing_pages.design.change_open', 'Change design')}
            </button>
          )}
        </div>
      )}

      {showPicker && onTemplateChange && (
        <div className="space-y-4">
          <p className="text-sm text-t-secondary leading-relaxed">
            {t(
              'landing_pages.design.template_intro',
              'Each design is a complete look, drawn by hand — its own colours, its own type, its own layout. Your words, your photographs and your accent colour come with you.',
            )}
          </p>

          {groups.map(group => (
            <div key={group.kind} className="space-y-3">
              <span className={kicker}>
                {t(GROUP_HEADING[group.kind].key, GROUP_HEADING[group.kind].fallback)}
              </span>

              {group.kind === 'other' && (
                <p className="text-xs text-t-secondary leading-relaxed">
                  {t(
                    'landing_pages.design.designs_other_trades_note',
                    'Drawn for another trade. Nothing stops you using one — your own words and sections stay exactly as they are.',
                  )}
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {group.cards.map(c => (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={c.selected}
                    onClick={() => onTemplateChange(c.key)}
                    className={cardBase + ' ' + (c.selected ? cardActive : cardInactive)}
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
          ))}
        </div>
      )}

      {/*
        BRAND COLOUR — the one design control every design honours, and the
        one a tenant most often arrives here to change.
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
              value={pickerSafeHex(resolvedBrandColor, accentFallback)}
              onChange={e => onBrandColorChange(e.target.value)}
              className="h-9 w-16 rounded-lg border border-dark-border bg-dark-bg cursor-pointer"
            />
            <span className="text-xs text-t-secondary font-mono">{resolvedBrandColor}</span>
          </div>
          <p className="text-xs text-t-secondary leading-relaxed">
            {t(
              'landing_pages.design.color_note',
              'The one colour that is yours on every design — your buttons, your links and the small type your designer set in accent.',
            )}
          </p>
        </div>
      )}

      {/*
        INDUSTRY, LAST, AND UNDER ITS OWN WARNING.

        It is the most destructive control on this screen — its own change
        note below says that saving it rewrites every heading, the wording on
        every button and which sections are on offer. It is also what decides
        WHICH DESIGNS ARE OFFERED FIRST above, which is the reason it stays on
        this panel at all rather than moving out with the palette: a tenant
        filed under the wrong trade is being shown the wrong three designs,
        and this is where they find that out. The confirm is the caller's (see
        `LandingEditor`'s `onIndustryChange`), mirroring the one `handleRemove`
        already puts in front of the only other irreversible control here.
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
                'Your page is written in your own trade’s words, and your trade is what decides which designs you are offered first. Change this and the headings, the button wording, the sections on offer and the designs above all follow.',
              )}
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {industryOwnCards.map(c => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={c.selected}
                  onClick={() => onIndustryChange(c.id)}
                  className={cardBase + ' ' + (c.selected ? cardActive : cardInactive)}
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
                      draws them — mono eyebrows in the accent that industry
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
