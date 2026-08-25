import { useEffect, useState, type CSSProperties } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, ArrowRight, Check, ExternalLink, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useBrandStore } from '../../stores/brandStore'
import {
  STEPS, FONT_PAIRINGS, type StepKey, type FontPairingKey, type WizardForm,
  emptyForm, loadDraft, saveDraft, clearDraft, buildPayload, type ApplyPayload,
} from './landingDraft'
import { isDataBackedSection, isOfferable, unavailableReason, SECTION_ORDER, type SectionMeta } from './sections'

/**
 * The wizard's own onboarding contract (Appendix A §7.2 house triple):
 * `GET /v1/admin/landing-pages/onboarding`, fetched once by the HOST page
 * (`LandingPages.tsx`) and handed down as the `prefill` prop whole — this
 * component never fetches it itself and never should (steps 1-2 need no
 * server call at all).
 *
 * Field names mirror the wire shape verbatim (snake_case) rather than being
 * remapped to camelCase: this is a straight read of one response, not a
 * layer other code depends on, so a remap would just be a second spelling
 * of the same six words.
 */
type OnboardingPrefill = {
  business_name: string
  headline: string | null
  subtext: string | null
  phone: string | null
  email: string | null
  address: string | null
  /** Always a valid CSS colour — the backend runs it through CssColor::safe(). */
  brand_color: string
}

type TemplateOption = {
  key: string
  name: string
  blurb: string
}

/**
 * Raw section-availability row from the API. Deliberately NOT `SectionMeta`
 * from `./sections` — that type is camelCase (`sourceLabel`) and is what
 * `isOfferable()` and step 4's toggle list actually consume; this is the
 * on-the-wire shape (`source_label`) as it arrives in `prefill`. Step 1
 * reads it for the template card's services count; step 4 maps every row
 * of it onto `SectionMeta` once, below (`sectionMetas`), so there is one
 * translation from wire shape to editor shape, not one per caller.
 */
type SectionAvailability = {
  key: string
  label: string
  source_label: string
  available: boolean
  count: number
  /** See `SectionMeta.reason` in `./sections` — this is that same field's
   *  wire spelling. */
  reason?: string | null
}

export type OnboardingResponse = {
  completed: boolean
  prefill: OnboardingPrefill
  templates: TemplateOption[]
  sections: SectionAvailability[]
  suggested_slug: string
}

type LandingWizardProps = {
  prefill: OnboardingResponse
  /** Called by the apply mutation's `onSuccess` (step 4, this task) — the
   *  host (`LandingPages.tsx`) uses it to switch from wizard to editor
   *  without waiting out the `landing-onboarding` refetch window. */
  onDone: () => void
}

const kicker = 'text-[11px] font-mono uppercase tracking-[0.14em] text-primary-500'
// bg-dark-surface, never bg-dark-card: the two are different shades, and
// dark-surface is the 525-occurrence house default (Appendix A §7.4).
const card = 'bg-dark-surface border border-dark-border rounded-xl p-5'
const label = 'block text-xs text-t-secondary mb-1.5'
const input = 'w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:border-primary-500 outline-none'

/**
 * The exact Google Fonts request `resources/views/landing/ruled_page/layout.blade.php`
 * already makes for every published page (Fraunces variable + IBM Plex Mono
 * + Inter Tight, same axis tuple). RULING 5: the three specimen cards below
 * must show the tenant "the actual pairing", and the landing CSP allows no
 * font host but `fonts.googleapis.com`/`fonts.gstatic.com` — so this is
 * that same request, reused, not a new one. Rendered as a plain `<link>`
 * once step 3 is reached rather than fetched for every step, since steps
 * 1-2 and step 4 have no use for it.
 */
const GOOGLE_FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..500&family=IBM+Plex+Mono:wght@500&family=Inter+Tight:wght@400;500;600&display=swap'

const bodySampleStyle: CSSProperties = { fontFamily: "'Inter Tight', system-ui, sans-serif" }

/**
 * The three pairings, mirrored 1:1 from `public/landing/ruled_page.css`'s
 * own `:root[data-font-pairing="X"]` rules — same property names, same
 * values, so a specimen card is not a good-faith approximation of what the
 * page will render, it is that rule. Only the HEADING moves per pairing;
 * body copy stays Inter Tight in all three, exactly as the stylesheet
 * leaves it (see that file's own comment on why body is left alone).
 *
 * Fix round 1 correction: `editorial` used to also declare Fraunces' SOFT
 * and WONK axes. Fraunces defines them, but `GOOGLE_FONTS_HREF` above never
 * requests them (Google Fonts serves only the axes named in the query's
 * axis list), so they were silently ignored by every browser — the
 * specimen showed a difference this build could not actually reproduce
 * on the live page. `editorial` now differs by `opsz` instead, which IS
 * in the requested axis list (`Fraunces:opsz,wght@…`) and is a real set of
 * different glyph outlines, not an approximation.
 */
const FONT_PAIRING_SPECS: { key: FontPairingKey; name: string; headingStyle: CSSProperties }[] = [
  {
    key: 'classic',
    // `name` is the ENGLISH fallback only; the render site passes it to
    // `t('landing_pages.wizard.font_name_<key>', spec.name)`. Task 11: these
    // three were the only bare strings left in a JSX text position anywhere
    // in the feature, so a French tenant picking a type style read three
    // English words on an otherwise translated screen.
    name: 'Classic',
    headingStyle: {
      fontFamily: 'Fraunces, Georgia, serif',
      fontVariationSettings: "'opsz' 144",
    },
  },
  {
    key: 'editorial',
    name: 'Editorial',
    headingStyle: {
      fontFamily: 'Fraunces, Georgia, serif',
      fontWeight: 450,
      letterSpacing: '-0.02em',
      fontVariationSettings: "'opsz' 30",
    },
  },
  {
    key: 'modern',
    name: 'Modern',
    headingStyle: {
      fontFamily: "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
      fontWeight: 500,
      letterSpacing: '0.02em',
      textTransform: 'uppercase',
    },
  },
]

/**
 * The full wizard: pick a look, check your details, make it yours, choose
 * what to show, apply. Task 6 built steps 1-2; this task (7) adds steps 3-4
 * and the apply call that turns the form into a draft page.
 *
 * Step 1 is deliberately not a settings form: every card shows the tenant's
 * OWN business name and brand colour, because this is the first moment they
 * see their own page rather than a product screenshot.
 */
export function LandingWizard(props: LandingWizardProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { prefill: onboarding, onDone } = props
  const { prefill, templates, sections, suggested_slug: suggestedSlug } = onboarding

  // A landing page is strictly per-brand (Task 4's whole backend fix
  // history is this exact confusion), but BrandSwitcher changes this
  // WITHOUT unmounting the host page, so this component can stay mounted
  // across a brand switch while `prefill` (fetched by the host) moves to
  // a different brand underneath it.
  const { currentBrandId, currentBrand } = useBrandStore()

  const [initial] = useState(() => loadDraft(currentBrandId) ?? { step: 0, form: emptyForm() })
  const [step, setStep] = useState(initial.step)
  const [form, setForm] = useState<WizardForm>(initial.form)

  // Which brand `step`/`form` currently describe. Compared against
  // `currentBrandId` on every render (React's documented pattern for
  // "reset state when something external changes" — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes)
  // rather than in a `useEffect`, so a brand switch cannot paint even one
  // frame of the previous brand's in-progress copy under the new brand's
  // preview. Restores the NEW brand's own draft if it has one, rather than
  // unconditionally blanking to step 0 — the tenant's per-brand progress
  // is exactly what the brand-scoped draft key exists to keep separate.
  const [formBrandId, setFormBrandId] = useState(currentBrandId)
  if (formBrandId !== currentBrandId) {
    setFormBrandId(currentBrandId)
    const restored = loadDraft(currentBrandId) ?? { step: 0, form: emptyForm() }
    setStep(restored.step)
    setForm(restored.form)
  }

  // Draft autosave. Every field the tenant sets survives a refresh or a
  // closed tab — there is no other way back into an in-progress wizard,
  // since a landing page has no "skip" endpoint to resume from. Keyed by
  // `currentBrandId`, not `formBrandId`: on the render where a brand
  // switch is detected above, `step`/`form` have already been reset to the
  // NEW brand's own (possibly restored) values, so this simply persists
  // them under the matching key — never brand A's copy under brand B's.
  useEffect(() => {
    saveDraft(currentBrandId, step, form)
  }, [currentBrandId, step, form])

  const up = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  const businessName = prefill.business_name || t('landing_pages.wizard.your_business', 'your business')
  const templateKey = form.template_key ?? templates[0]?.key ?? ''
  const headline = form.headline ?? prefill.headline ?? ''
  const subtext = form.subtext ?? prefill.subtext ?? ''
  const brandColor = form.brand_color ?? prefill.brand_color
  // Task 2: the same fallback chain as every other field above — an
  // untouched input shows the Property's own effective value (already
  // resolved server-side via ContactDetails::resolve, see `prefill`'s own
  // type), and a tenant who clears it back to that exact value is, per
  // `buildPayload`'s own diff, indistinguishable from never having touched
  // it at all — which is the point: the Property stays the source of truth
  // for anything not deliberately overridden.
  const phone = form.phone ?? prefill.phone ?? ''
  const email = form.email ?? prefill.email ?? ''
  const address = form.address ?? prefill.address ?? ''
  // Same fallback shape as templateKey above: nothing chosen yet defaults to
  // the first specimen rather than leaving the picker in a genuinely
  // unselected state, which the theme.font_pairing column has no room for
  // anyway — the backend column is `nullable`, but a page this wizard
  // creates always carries one of the three, exactly like template_key.
  const fontPairing: FontPairingKey = form.font_pairing ?? FONT_PAIRINGS[0]

  // The brand's own logo, if it has one — read from the store the app
  // already populated (BrandSwitcher's own data), not a new request. There
  // is no logo field in `prefill` at all (LandingOnboardingService::prefill()
  // never queries one), and "All brands" mode has no single brand to show a
  // logo for, so `currentBrand()` returning null there is correct, not a
  // gap.
  const logoUrl = currentBrand()?.logo_url ?? null

  // The one translation from the wire's snake_case rows to the camelCase
  // `SectionMeta` shape `isOfferable()` and the editor (Task 8) both read —
  // done once, here, rather than at each of step 4's per-row call sites.
  // `SECTION_ORDER` (not `sections` as returned) fixes the render order and
  // silently drops any row this build does not know about, the same
  // defensiveness `mergeFormDraft` applies to a stale draft.
  const sectionMetas: SectionMeta[] = SECTION_ORDER.flatMap(key => {
    const row = sections.find(s => s.key === key)
    // Keeps `key` from SECTION_ORDER itself (already `SectionKey`-typed)
    // rather than re-deriving it from the wire row's plain `string`, so
    // this needs no type assertion to satisfy `SectionMeta`.
    return row
      ? [{
        key, label: row.label, sourceLabel: row.source_label, available: row.available, count: row.count,
        reason: row.reason ?? null,
      }]
      : []
  })

  // The count already sits in the payload the host fetched — no second
  // call, and no fabricated service names: the prefill response carries
  // counts, not rows, so that is what the card can honestly show.
  const servicesSection = sections.find(s => s.key === 'services')
  const serviceCount = servicesSection && servicesSection.available && servicesSection.count > 0
    ? servicesSection.count
    : null
  // The industry's own word for it ("Treatments" for a beauty tenant, etc.)
  // — LandingOnboardingService::sectionLabel() built this specifically so
  // the platform doesn't fall back to talking about itself in the generic
  // noun ("Services") the way this line used to (Appendix A §6, and
  // LandingOnboardingService.php:67-72,283-290's own comment on why).
  // Falls back to a generic label only if the payload is ever missing the
  // row entirely, which should not happen in practice.
  const servicesLabel = servicesSection?.label || t('landing_pages.wizard.services_fallback_label', 'services')

  // Phase 2 ships exactly one template; Phase 3 adds two more (spec §9).
  // A fixed 3-column grid with one card in it leaves two-thirds of the row
  // visibly blank on every screen ≥640px — not an edge case, the ONLY case
  // in Phase 2 — which reads as broken rather than modern to a first-time
  // tenant. Sized to the count the endpoint actually returned instead.
  const templateGridClass = 'grid gap-3 ' + (templates.length > 1 ? 'sm:grid-cols-3' : 'max-w-sm')

  const stepTitle = (key: StepKey) => {
    switch (key) {
      case 'template': return t('landing_pages.wizard.step_template', 'Pick a look')
      case 'details': return t('landing_pages.wizard.step_details', 'Check your details')
      case 'style': return t('landing_pages.wizard.step_style', 'Make it yours')
      case 'sections': return t('landing_pages.wizard.step_sections', 'Choose what to show')
    }
  }

  const isLastStep = step === STEPS.length - 1

  // The slug never appears in this wizard (spec §9) — the tenant cannot
  // fix a suggestion that turns out invalid, reserved or taken, so nothing
  // here offers them a field for it. `suggestedSlug` is exactly what
  // `apply()` will be asked to accept; the wizard's job stops at handing it
  // back unchanged.
  const payload: ApplyPayload = buildPayload({
    templateKey, slug: suggestedSlug, headline, subtext, brandColor, fontPairing,
    contact: { phone, email, address },
    prefillContact: { phone: prefill.phone, email: prefill.email, address: prefill.address },
    sections: sectionMetas, sectionChoices: form.sections ?? {},
  })

  const applyMut = useMutation({
    mutationFn: (body: ApplyPayload) =>
      api.post('/v1/admin/landing-pages/onboarding', body).then(r => r.data),
    onSuccess: () => {
      clearDraft(currentBrandId)
      qc.invalidateQueries({ queryKey: ['landing-onboarding'] })
      qc.invalidateQueries({ queryKey: ['landing-page'] })
      toast.success(t('landing_pages.created', 'Your page is ready to edit'))
      onDone()
    },
    // `unknown`, not `any` (this repo's eslint config rejects `any` even
    // where the brief's own snippet used it — `ContentPlanner/lib.ts`'s
    // `errMsg()` is the established local pattern for the same cast).
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { error?: string; message?: string } } }
      toast.error(err.response?.data?.error ?? err.response?.data?.message ?? t('common.error', 'Something went wrong'))
    },
  })

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <div className="mb-8">
        <span className={kicker}>{t('landing_pages.wizard.kicker', 'Landing page setup')}</span>
        <h1 className="text-2xl font-semibold text-white mt-2">
          {t('landing_pages.wizard.title', 'Let’s build your page')}
        </h1>
        <p className="text-sm text-t-secondary mt-2 leading-relaxed">
          {t('landing_pages.wizard.subtitle', {
            name: businessName,
            defaultValue: 'A couple of quick choices, and {{name}} is ready to publish.',
          })}
        </p>
      </div>

      {/* Numbered-node stepper — Appendix A §7.1, ChatbotWizard.tsx:162. Drawn
          as a segment per step (not one absolutely-positioned line) so the
          connector survives a wrap on narrow screens. */}
      <ol className="flex flex-wrap items-center gap-y-3 mb-8">
        {STEPS.map((key, i) => (
          <li key={key} className="flex items-center">
            {i > 0 && (
              <span
                aria-hidden
                className={
                  'hidden sm:block h-px sm:w-10 mx-2 transition-colors duration-500 motion-reduce:transition-none ' +
                  (i <= step ? 'bg-primary-500' : 'bg-dark-border')
                }
              />
            )}
            <span
              aria-current={i === step ? 'step' : undefined}
              className={
                'w-[22px] h-[22px] rounded-full grid place-items-center border text-[10px] shrink-0 transition-colors motion-reduce:transition-none ' +
                (i < step
                  ? 'bg-primary-500 border-primary-500 text-black'
                  : i === step
                    ? 'bg-dark-bg border-primary-500 text-primary-500'
                    : 'bg-dark-bg border-dark-border text-t-secondary')
              }
            >
              {i < step ? <Check size={11} strokeWidth={3} /> : i + 1}
            </span>
            <span className={'ml-2 text-xs ' + (i === step ? 'text-white font-medium' : 'text-t-secondary')}>
              {stepTitle(key)}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-t-secondary leading-relaxed">
            {t('landing_pages.wizard.template_intro', {
              name: businessName,
              defaultValue: 'This is {{name}}, styled a few different ways. Pick the one that feels right — you can change it later.',
            })}
          </p>

          <div className={templateGridClass}>
            {templates.map(tpl => {
              const active = templateKey === tpl.key
              return (
                <button
                  key={tpl.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => up('template_key', tpl.key)}
                  className={'text-left rounded-xl border p-4 transition-all '
                    + (active
                      ? 'border-primary-500 bg-primary-500/[0.08] ring-1 ring-primary-500/30'
                      : 'border-dark-border bg-dark-surface hover:border-primary-500/40 hover:bg-primary-500/[0.04]')}
                >
                  <div className="flex items-center justify-between">
                    {/* Inline hex, deliberately: this IS customer data being
                        previewed (Appendix A §7.4), not admin chrome. */}
                    <span
                      aria-hidden
                      className="w-6 h-6 rounded-full border border-dark-border shrink-0"
                      style={{ backgroundColor: prefill.brand_color }}
                    />
                    {active && <Check size={16} className="text-primary-500" />}
                  </div>

                  <div className="mt-3">
                    <span className="block text-sm font-bold text-white">{businessName}</span>
                    <span className="block text-[11px] text-t-secondary mt-0.5">{tpl.name}</span>
                  </div>

                  <p className="text-[11px] text-t-secondary mt-2 leading-snug">{tpl.blurb}</p>

                  {serviceCount !== null && (
                    <p className="text-[9px] uppercase tracking-wide font-bold text-t-secondary mt-3">
                      {t('landing_pages.wizard.services_count', {
                        count: serviceCount,
                        label: servicesLabel,
                        defaultValue: '{{count}} {{label}} ready to show',
                      })}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div className={card + ' space-y-4'}>
            <div className="flex items-center justify-between">
              <span className={kicker}>{t('landing_pages.wizard.details_kicker', 'Your details')}</span>
              <Link
                to="/properties"
                className="text-xs text-primary-400 hover:text-primary-300 font-semibold"
              >
                {t('landing_pages.wizard.open_properties', 'Open Properties')}
              </Link>
            </div>

            <SummaryRow
              label={t('landing_pages.wizard.business_name', 'Business name')}
              value={prefill.business_name}
              hint={t('landing_pages.wizard.business_name_hint', 'Add your business name in Properties so it can appear on your page.')}
            />

            {/* Task 2: phone/email/address used to be read-only SummaryRows
                whose only recourse for a blank value was a hint sending the
                tenant away to edit a screen this wizard never linked
                correctly (see App\Landing\ContactDetails's own docblock on
                that misnaming). They are real inputs now, prefilled from the
                EFFECTIVE value (`prefill.*` is already
                ContactDetails::resolve()'s output — the Property, or this
                page's own saved override if one exists) and stored,
                per-page, only when the tenant's value actually differs from
                that effective prefill (`buildPayload`'s own diff) — an
                untouched field leaves the Property as this page's source of
                truth. */}
            <div>
              <label className={label} htmlFor="lw-phone">
                {t('landing_pages.wizard.phone', 'Phone')}
              </label>
              <input
                id="lw-phone"
                className={input}
                placeholder={t('landing_pages.wizard.phone_hint', 'Add a phone number so visitors can call you')}
                value={phone}
                onChange={e => up('phone', e.target.value)}
              />
            </div>
            <div>
              <label className={label} htmlFor="lw-email">
                {t('landing_pages.wizard.email', 'Email')}
              </label>
              <input
                id="lw-email"
                type="email"
                className={input}
                placeholder={t('landing_pages.wizard.email_hint', 'Add an email address so visitors can write to you')}
                value={email}
                onChange={e => up('email', e.target.value)}
              />
            </div>
            <div>
              <label className={label} htmlFor="lw-address">
                {t('landing_pages.wizard.address', 'Address')}
              </label>
              <input
                id="lw-address"
                className={input}
                placeholder={t('landing_pages.wizard.address_hint', 'Add your address so visitors can find you')}
                value={address}
                onChange={e => up('address', e.target.value)}
              />
            </div>
          </div>

          <div className={card + ' space-y-4'}>
            <div>
              <label className={label} htmlFor="lw-headline">
                {t('landing_pages.wizard.headline_label', 'Headline')}
              </label>
              <input
                id="lw-headline"
                className={input}
                placeholder={t('landing_pages.wizard.headline_placeholder', 'A short line that says what you do best')}
                value={headline}
                onChange={e => up('headline', e.target.value)}
              />
            </div>
            <div>
              <label className={label} htmlFor="lw-subtext">
                {t('landing_pages.wizard.subtext_label', 'Subtext')}
              </label>
              <input
                id="lw-subtext"
                className={input}
                placeholder={t('landing_pages.wizard.subtext_placeholder', 'One more sentence to back it up')}
                value={subtext}
                onChange={e => up('subtext', e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          {/* See GOOGLE_FONTS_HREF's own comment: the identical request the
              live page already makes, only fetched once this step is
              reached. */}
          <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />

          <div className={card + ' space-y-3'}>
            <span className={kicker}>{t('landing_pages.wizard.color_kicker', 'Brand colour')}</span>
            <div className="flex items-center gap-3">
              {/* Inline hex, deliberately: the swatch previews the exact
                  colour the tenant is choosing (Appendix A §7.4's one
                  named carve-out for admin chrome). */}
              <span
                aria-hidden
                className="w-9 h-9 rounded-full border border-dark-border shrink-0"
                style={{ backgroundColor: brandColor }}
              />
              <input
                type="color"
                aria-label={t('landing_pages.wizard.color_label', 'Brand colour')}
                value={brandColor}
                onChange={e => up('brand_color', e.target.value)}
                className="h-9 w-16 rounded-lg border border-dark-border bg-dark-bg cursor-pointer"
              />
              <span className="text-xs text-t-secondary font-mono">{brandColor}</span>
            </div>
          </div>

          <div className="space-y-3">
            <span className={kicker}>{t('landing_pages.wizard.font_kicker', 'Type style')}</span>
            <p className="text-sm text-t-secondary leading-relaxed">
              {t('landing_pages.wizard.font_intro', 'How your headings and body text look together. Pick the one that feels right.')}
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              {FONT_PAIRING_SPECS.map(spec => {
                const active = fontPairing === spec.key
                return (
                  <button
                    key={spec.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => up('font_pairing', spec.key)}
                    className={'text-left rounded-xl border p-4 transition-all '
                      + (active
                        ? 'border-primary-500 bg-primary-500/[0.08] ring-1 ring-primary-500/30'
                        : 'border-dark-border bg-dark-surface hover:border-primary-500/40 hover:bg-primary-500/[0.04]')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-t-secondary">
                        {t(`landing_pages.wizard.font_name_${spec.key}`, spec.name)}
                      </span>
                      {active && <Check size={16} className="text-primary-500" />}
                    </div>

                    {/* Inline font-family/weight/tracking, deliberately: this
                        specimen literally IS the pairing the tenant is
                        choosing, shown in their own business name — the
                        second carve-out Appendix A §7.4 names. */}
                    <span className="block text-lg text-white mt-3 truncate" style={spec.headingStyle}>
                      {businessName}
                    </span>
                    <span className="block text-xs text-t-secondary mt-1" style={bodySampleStyle}>
                      {t('landing_pages.wizard.font_sample', 'Quietly, unmistakably yours.')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {logoUrl && (
            <div className={card + ' flex items-center justify-between gap-4'}>
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={logoUrl}
                  alt=""
                  className="w-10 h-10 rounded-lg border border-dark-border object-contain bg-dark-bg shrink-0"
                />
                <span className="text-xs text-t-secondary">
                  {t('landing_pages.wizard.logo_hint', 'Your logo appears on your page automatically. No upload needed here.')}
                </span>
              </div>
              <Link
                to="/settings"
                className="text-xs text-primary-400 hover:text-primary-300 font-semibold flex items-center gap-1 shrink-0"
              >
                {t('landing_pages.wizard.edit_in_settings', 'Edit in Settings')} <ExternalLink size={12} />
              </Link>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-t-secondary leading-relaxed">
            {t('landing_pages.wizard.sections_intro', 'Every section below can be switched on or off. You can change this any time from the editor.')}
          </p>

          {sectionMetas.map(section => {
            // RULING 4, from ./sections — the one predicate the wizard and
            // the editor (Task 8) both call, so the two screens cannot
            // disagree about which sections are real.
            const offerable = isOfferable(section)
            const checked = offerable ? (form.sections?.[section.key] ?? true) : false

            return (
              <div key={section.key} className={card + ' flex items-start justify-between gap-4'}>
                <div className="min-w-0">
                  <span className="block text-sm font-medium text-white">{section.label}</span>
                  {offerable ? (
                    <span className="block text-xs text-t-secondary mt-0.5">
                      {/* Task 11, found by walking this screen: the count
                          only means anything for a section whose content is
                          ROWS somewhere else (RULING 4 / isDataBackedSection).
                          For the sections the tenant TYPES, it printed
                          "0 from Words you write in the editor" on a brand-new
                          page — which reads as "this is empty/broken" and
                          invites them to switch off the About section they
                          have simply not written yet. Those sections show the
                          source sentence alone. */}
                      {isDataBackedSection(section.key)
                        ? t('landing_pages.section_source', {
                          count: section.count,
                          source: section.sourceLabel,
                          defaultValue: '{{count}} from {{source}}',
                        })
                        : section.sourceLabel}
                    </span>
                  ) : (
                    <span className="block text-xs text-warning/90 mt-0.5">
                      {/* Fix 2 (phase 3a correctness review): the backend's
                          own authored reason (today: booking's industry-gate
                          sentence) beats the generic instruction below,
                          which makes no sense for a section nothing will
                          ever unlock by writing into it. */}
                      {unavailableReason(section, t('landing_pages.wizard.section_unavailable', {
                        source: section.sourceLabel,
                        defaultValue: 'Nothing to show yet. Add some from {{source}}.',
                      }))}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  aria-label={section.label}
                  disabled={!offerable}
                  onClick={() => up('sections', { ...form.sections, [section.key]: !checked })}
                  className={'relative shrink-0 w-9 h-5 rounded-full transition-colors outline-none '
                    + 'focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-40 '
                    + (checked ? 'bg-primary-500' : 'bg-dark-border')}
                >
                  <span
                    aria-hidden
                    className={'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform '
                      + (checked ? 'translate-x-4' : 'translate-x-0.5')}
                  />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between mt-6">
        <button
          type="button"
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0 || applyMut.isPending}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-t-secondary hover:text-white rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500/40 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft size={15} /> {t('landing_pages.wizard.back', 'Back')}
        </button>

        <button
          type="button"
          onClick={() => {
            if (isLastStep) {
              applyMut.mutate(payload)
            } else {
              setStep(s => Math.min(STEPS.length - 1, s + 1))
            }
          }}
          disabled={isLastStep && applyMut.isPending}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary-500 text-black rounded-lg hover:bg-primary-400 transition-colors focus-visible:ring-2 focus-visible:ring-primary-500/40 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLastStep
            ? (applyMut.isPending
              ? <><Loader2 size={15} className="animate-spin" /> {t('landing_pages.wizard.creating', 'Creating…')}</>
              : <>{t('landing_pages.wizard.create', 'Create my page')} <Check size={15} /></>)
            : <>{t('landing_pages.wizard.continue', 'Continue')} <ArrowRight size={15} /></>}
        </button>
      </div>
    </div>
  )
}

/** A read-only fact, or — per the brief — a plain-English hint in its place
 *  when the tenant has never filled it in. A blank business name is
 *  something to fix here, not discover on the published page, so it is
 *  shown rather than hidden. */
function SummaryRow({ label: text, value, hint }: { label: string; value: string | null; hint: string }) {
  return (
    <div>
      <span className="block text-xs text-t-secondary mb-1">{text}</span>
      {value
        ? <span className="block text-sm text-white">{value}</span>
        : <span className="block text-xs text-warning/90">{hint}</span>}
    </div>
  )
}
