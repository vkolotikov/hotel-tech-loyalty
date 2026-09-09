import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { pickerSafeHex } from './designChoices'
import { industryChips, industryName, type IndustryOption } from './industryChoices'
import { industryIcon } from './industryIcons'
import {
  industryHasChanged, templateGroups, templateHasChanged,
  type TemplateOption, type TemplateSupport,
} from './editorCatalog'

/**
 * THE DESIGN CONTROLS, in the order a tenant decides them (2026-09-08):
 *
 *   1 · Your trade   — chips for the trades this product draws designs for,
 *                      plus the one the page is already filed under.
 *   2 · Your design  — the trade's designs, picture first; the saved one is
 *                      marked "Current"; a picked one renders in the live
 *                      pane at once, with a note and the way back.
 *   3 · Your colour  — the accent, the one override every design honours.
 *
 * Shared verbatim between `LandingEditor`'s Design tab and `LandingWizard`'s
 * design step, so the two screens cannot offer different choices or describe
 * the same design differently. The wizard asks the trade on its own step and
 * hands this panel no `industries`, so step 1 is simply absent there and the
 * numbering follows the steps actually drawn.
 *
 * Every card is a REAL claim about a real design — its own name, the
 * author's own words and a picture of the author's own page, off the wire —
 * and the designs offered for a trade come from the server's
 * `templates[*].vertical` joined against `industries[*].vertical`: no
 * template id and no industry id is spelled out on this side (see
 * `templateGroups`). The trades on offer come off `industries[*].offerable`
 * the same way (see `industryChips`).
 *
 * WHAT USED TO BE HERE: six palette cards, four type pairings and per-band
 * tones (the retired generic design's controls — every kit ships its
 * author's own `:root`); then a nine-card industry grid under an "Advanced"
 * warning and a design picker behind a "Change design" link. Three reports
 * of "I do not see the designs" later, the picker IS the tab.
 *
 * COMPACT (2026-09-09, the owner: "minimize copy in builder, make it more
 * compact, more visual"): the chips wear their trade's icon
 * (`industryIcon`), a card is its picture and its name — the author's blurb
 * survives only as the card's tooltip — and there is no standing paragraph
 * under the chips, under the gallery or under the colour. The ONE line of
 * warning that stays is the one shown once the tenant has moved OFF the
 * saved trade, because that save rewrites their copy; the note under a
 * picked-but-unsaved design says what is being looked at, what would stop
 * showing (only when something would), and offers the way back.
 *
 * No unit tests target this file directly — `vitest.config.ts` is node-env,
 * pure-function-only (no DOM, no React Testing Library); what IS tested is
 * this component's data (`editorCatalog.test.ts`, `industryChoices.test.ts`)
 * and, at each call site, the payload functions that turn a click here into
 * a saved value. The look is verified by screenshot at 1440 and 390.
 */

const kicker = 'text-[11px] font-mono uppercase tracking-[0.14em] text-primary-500'

const chipBase = 'inline-flex items-center gap-1.5 rounded-full border pl-2.5 pr-3.5 py-1.5 text-xs font-semibold '
  + 'transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40'
const chipActive = 'border-primary-500 bg-primary-500/[0.12] text-white'
const chipInactive = 'border-dark-border bg-dark-bg text-t-secondary hover:border-primary-500/40 hover:text-white'

// The house "selected card" idiom (LandingWizard.tsx's own cards, predating
// this component): border + a soft ring in primary-500, versus a plain
// border that brightens on hover.
const cardBase = 'text-left rounded-xl border p-2 transition-all outline-none '
  + 'focus-visible:ring-2 focus-visible:ring-primary-500/40'
const cardActive = 'border-primary-500 bg-primary-500/[0.08] ring-1 ring-primary-500/30'
const cardInactive = 'border-dark-border bg-dark-bg hover:border-primary-500/40 hover:bg-primary-500/[0.04]'

const currentBadge = 'rounded-full border border-primary-500/40 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] text-primary-400'

type DesignPanelProps = {
  brandColor: string | undefined
  accentFallback: string
  onBrandColorChange: (hex: string) => void

  // ─── Step 2: the design ──────────────────────────────────────────────
  //
  // Drawn only when the caller supplies both the rows and the callback, so a
  // caller with nothing to ask draws nothing.

  /** `onboarding.templates`, verbatim — every served row, retired ones
   *  included (the page's own design may be one). */
  templates?: TemplateOption[]
  templateKey?: string
  onTemplateChange?: (key: string) => void
  /** The selected trade's own `vertical`, off `industries[*]` — what decides
   *  which designs are its. Null means "no kits of its own yet". */
  vertical?: string | null
  /**
   * The design the SAVED row is on. While `templateKey` differs from it, the
   * gallery marks it "Current", the note under the gallery says what is
   * being looked at, prints `designChangeNote` and offers the way back — the
   * confirmation the browser dialog used to be, done by looking at the pane
   * instead. Absent in the wizard, where no row is saved yet.
   */
  savedTemplateKey?: string
  /** The lines that explain what the picked design changes (dropped and
   *  added blocks); computed by the editor, which knows the page's rows. */
  designChangeNote?: string[]

  // ─── Step 1: the trade ───────────────────────────────────────────────
  //
  // Same rule: rows and callback, or nothing. The wizard asks this on its
  // own step and passes neither.

  industries?: IndustryOption[]
  industry?: string
  savedIndustry?: string
  onIndustryChange?: (id: string) => void

  /** What the selected design honours, off the served `templates[*].supports`. */
  supports?: TemplateSupport
}

const ALL_SUPPORTED: TemplateSupport = {
  brand_color: true,
}

export function DesignPanel({
  brandColor, accentFallback, onBrandColorChange,
  templates, templateKey, onTemplateChange, vertical, savedTemplateKey, designChangeNote,
  industries, industry, savedIndustry, onIndustryChange,
  supports = ALL_SUPPORTED,
}: DesignPanelProps) {
  const { t } = useTranslation()

  const resolvedBrandColor = brandColor || accentFallback

  const industryOptions = industries ?? []
  const showTrade = industryOptions.length > 0 && onIndustryChange !== undefined
  const chips = industryChips(industryOptions, industry ?? '')
  const industryMoved = industryHasChanged(industry, savedIndustry)
  // The trade's name for the gallery heading — the wizard's own key, so one
  // industry has one word for it wherever a tenant meets it.
  const tradeName = industry
    ? t(`landing_pages.wizard.industry_name_${industry}`, industryName(industry))
    : ''

  const templateOptions = templates ?? []
  const groups = templateGroups(templateOptions, templateKey ?? '', vertical)
  const gallery = groups[0]
  const showDesigns = gallery !== undefined && onTemplateChange !== undefined
  const chosen = templateOptions.find(o => o.key === templateKey)
  const savedName = templateOptions.find(o => o.key === savedTemplateKey)?.name ?? ''

  // The steps a caller actually gets, numbered in the order they are drawn:
  // the editor draws all three, the wizard's design step two.
  let step = 0
  const nextStep = () => String(++step)

  return (
    <div className="space-y-6">
      {showTrade && (
        <section className="space-y-3">
          <StepHeading n={nextStep()} title={t('landing_pages.design.trade_kicker', 'Your trade')} />
          <div className="flex flex-wrap gap-2">
            {chips.map(chip => {
              const Icon = industryIcon(chip.id)

              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={chip.selected}
                  onClick={() => onIndustryChange(chip.id)}
                  className={chipBase + ' ' + (chip.selected ? chipActive : chipInactive)}
                >
                  <Icon size={14} aria-hidden className="shrink-0" />
                  {/* The wizard's own key, deliberately reused rather than a
                      second family: one industry, one word for it. */}
                  {t(`landing_pages.wizard.industry_name_${chip.id}`, chip.name)}
                </button>
              )
            })}
          </div>
          {/* Shown only once the tenant has moved OFF the saved trade: the
              one control here that rewrites their copy on save deserves a
              line of warning, and only then. One line — the consequences
              are seen in the pane. */}
          {industryMoved && (
            <p className="text-xs text-warning leading-relaxed">
              {t('landing_pages.design.industry_change_note', {
                trade: tradeName,
                defaultValue: 'Saving switches your page to {{trade}} words and sections.',
              })}
            </p>
          )}
        </section>
      )}

      {showDesigns && onTemplateChange && gallery && (
        <section className="space-y-3">
          <StepHeading
            n={nextStep()}
            title={t('landing_pages.design.chosen_kicker', 'Your design')}
            aside={gallery.kind === 'own' && tradeName !== ''
              ? t('landing_pages.design.designs_made_for', { trade: tradeName, defaultValue: 'Made for {{trade}}' })
              : undefined}
          />

          {/* NOBODY IS EVER OFFERED NOTHING: a trade whose kits are still
              being converted sees every design, and is told so. */}
          {gallery.kind === 'all' && tradeName !== '' && (
            <p className="text-xs text-t-secondary leading-relaxed">
              {t('landing_pages.design.designs_coming', {
                trade: tradeName,
                defaultValue: 'Designs made for {{trade}} are coming. Until then, any of these works.',
              })}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {gallery.cards.map(c => (
              <button
                key={c.key}
                type="button"
                aria-pressed={c.selected}
                onClick={() => onTemplateChange(c.key)}
                // The author's blurb, off the wire, as the tooltip: the card
                // itself is the picture and the name (compact, 2026-09-09).
                title={c.blurb}
                className={cardBase + ' ' + (c.selected ? cardActive : cardInactive)}
              >
                {/* The author's own page, first screen — a design is chosen by
                    looking at it. Decorative: the name below is the label.
                    The "Current" badge sits on the picture's corner so the
                    name keeps the card's full width (a two-column card is
                    narrow enough that the badge beside the name truncated
                    "Nocturne Ritual"). */}
                {c.previewImage && (
                  <div className="relative">
                    <img
                      src={c.previewImage}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full aspect-[8/5] object-cover object-top rounded-lg border border-dark-border"
                    />
                    {c.key === savedTemplateKey && (
                      <span className={currentBadge + ' absolute top-1.5 right-1.5 bg-dark-bg/90'}>
                        {t('landing_pages.design.current_badge', 'Current')}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 mt-2 px-0.5">
                  {/* Untranslated, from the server — see `TemplateOption`. */}
                  <span className="text-sm font-semibold text-white truncate">{c.name}</span>
                  {c.key === savedTemplateKey ? (
                    // A design with no picture (a retired one still on the
                    // row) keeps the badge beside its name.
                    !c.previewImage && (
                      <span className={currentBadge + ' shrink-0'}>
                        {t('landing_pages.design.current_badge', 'Current')}
                      </span>
                    )
                  ) : c.selected ? (
                    <Check size={16} className="text-primary-500 shrink-0" />
                  ) : null}
                </div>
              </button>
            ))}
          </div>

          {/*
            A DESIGN PICKED BUT NOT SAVED (2026-09-07). The pane is already
            showing it — the draft carries `template_key` — so the choice is
            confirmed by looking rather than by a browser dialog, which a
            browser told to stop showing dialogs would swallow silently. The
            lines the dialog used to say, and a way back to the saved design.
          */}
          {templateHasChanged(templateKey, savedTemplateKey) && (
            <div className="rounded-xl border border-primary-500/40 bg-primary-500/[0.06] p-3 space-y-1.5">
              <p className="text-sm text-white">
                {t('landing_pages.design.previewing_note', {
                  name: chosen?.name ?? '',
                  defaultValue: 'You are looking at {{name}} in the preview. Save to keep it.',
                })}
              </p>
              {(designChangeNote ?? []).map((line, i) => (
                <p key={i} className="text-xs text-t-secondary leading-relaxed">{line}</p>
              ))}
              <button
                type="button"
                onClick={() => onTemplateChange(savedTemplateKey as string)}
                className="text-xs text-primary-400 hover:text-primary-300 font-semibold outline-none
                  focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded"
              >
                {t('landing_pages.design.keep_saved', { name: savedName, defaultValue: 'Keep {{name}}' })}
              </button>
            </div>
          )}
        </section>
      )}

      {/*
        BRAND COLOUR — the one design control every design honours, and the
        one a tenant most often arrives here to change.
      */}
      {supports.brand_color && (
        <section className="space-y-3">
          <StepHeading n={nextStep()} title={t('landing_pages.design.color_kicker', 'Brand colour')} />
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
        </section>
      )}
    </div>
  )
}

/** A numbered step heading: the number in a small primary disc, the kicker
 *  beside it, and an optional right-aligned aside in the same mono voice. */
function StepHeading({ n, title, aside }: { n: string; title: string; aside?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-500/15 text-[11px] font-mono text-primary-400"
        >
          {n}
        </span>
        <span className={kicker}>{title}</span>
      </span>
      {aside && (
        <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-t-secondary truncate">{aside}</span>
      )}
    </div>
  )
}
