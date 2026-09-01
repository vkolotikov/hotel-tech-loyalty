import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, ArrowRight, Check, ExternalLink, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useBrandStore } from '../../stores/brandStore'
import {
  STEPS, type StepKey, type FontPairingKey, type WizardForm,
  emptyForm, loadDraft, saveDraft, clearDraft, buildPayload, type ApplyPayload,
} from './landingDraft'
import { isDataBackedSection, isOfferable, unavailableReason, type SectionMeta } from './sections'
import { DesignPanel } from './DesignPanel'
import { DEFAULT_FONT_PAIRING_ID } from './designChoices'
import {
  industryCards, resolveIndustry, sectionsForIndustry, type IndustryOption,
} from './industryChoices'
import type { TemplateOption } from './editorCatalog'
// Task 6, landing phase 3c (D4 — distinct from this file's OWN earlier
// "Task 6 built steps 1-2" below, a different phase's numbering): the
// self-hosted @font-face sheet DesignPanel's cards render against — see
// that file's own header comment. Imported here (and by LandingEditor.tsx,
// the only other screen that renders DesignPanel) so it is bundled into
// the `LandingPages` route chunk both screens already live in (App.tsx's
// `lazy(() => import('./pages/LandingPages'))`), never into the app
// shell's own initial load.
import '../../styles/landing-preview-fonts.css'

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
  /** The organisation's own current industry — the card step 1 opens
   *  pre-selected on. Always one of `industries[]`'s own ids (the backend
   *  reads it off the same profile that produced the rest of this
   *  response); typed loosely because an older backend sends no such key at
   *  all, which `resolveIndustry` handles. */
  industry?: string
}

/**
 * The one shipped template. Still sent, still posted back verbatim as
 * `template_key` — and no longer ASKED about here: with exactly one entry
 * there was never a choice to make, and a step that said "Pick the one that
 * feels right" over a single card read as a broken screen to the first
 * tenant who tested it. See `STEPS` in ./landingDraft for what step 1 asks
 * instead.
 *
 * The TYPE moved to `./editorCatalog` in landing phase 3c, Plan A, where
 * the editor's own (conditional, more-than-one-only) template picker reads
 * it — imported at the top of this file rather than declared twice, so one
 * served row has one shape on this side of the wire.
 */

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
  /** `LandingOnboardingService::industries()` — the nine ids of
   *  `Organization::INDUSTRIES`, each carrying the words a page in that
   *  industry would be written in. Defaulted at the read site rather than
   *  required, so a frontend deployed ahead of the backend renders step 1
   *  empty-but-harmless instead of throwing. */
  industries?: IndustryOption[]
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
 * The full wizard: say what you do, check your details, make it yours,
 * choose what to show, apply. Task 6 built steps 1-2; Task 7 added steps 3-4
 * and the apply call that turns the form into a draft page.
 *
 * Step 1 is deliberately not a settings form. It used to show one template
 * card ("Pick the one that feels right", over a list of exactly one), which
 * a tenant testing the shipped wizard read as broken — correctly, because
 * there was nothing to pick. It now asks the question the page is actually
 * built out of: the industry, whose profile supplies every band's name, the
 * primary button's words, the house accent and the default palette. Each
 * card is drawn in ITS OWN industry's words and colours, so the choice is
 * visible before it is made rather than explained after it.
 */
export function LandingWizard(props: LandingWizardProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { prefill: onboarding, onDone } = props
  const { prefill, templates, sections, suggested_slug: suggestedSlug } = onboarding
  const industryOptions = onboarding.industries ?? []

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
  // Step 1's answer, narrowed against the ids the server actually offered —
  // never the raw draft value, which could be an id a later release removed
  // or a hand-edited localStorage entry. Falls through to the organisation's
  // own industry (the pre-selected card) and, failing even that, to '' — at
  // which point `buildPayload` omits the key entirely and the backend files
  // the page under the org's industry exactly as it did before this step.
  const selectedIndustry = resolveIndustry(industryOptions, form.industry, prefill.industry)
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
  // the house pairing (`DEFAULT_FONT_PAIRING_ID` — the CSS's own no-choice
  // face) rather than leaving the picker in a genuinely unselected state,
  // which the theme.font_pairing column has no room for anyway — the
  // backend column is `nullable`, but a page this wizard creates always
  // carries one of the four, exactly like template_key.
  const fontPairing: FontPairingKey = form.font_pairing ?? DEFAULT_FONT_PAIRING_ID
  // Unlike fontPairing/brandColor, a palette is left GENUINELY unset until
  // the tenant actually picks one — see `ApplyPayload['theme']`'s own
  // comment: an untouched selection reaches `apply()` as an absent key, and
  // `LandingOnboardingService::theme()` (landing phase 3c Task 6) fills it from the org's
  // own industry default instead of this frontend module's own first
  // palette. `DesignPanel` still needs SOMETHING to render the type-pairing
  // cards' surfaces against before that choice exists, which is exactly
  // what its own `paletteFor(undefined)` fallback is for.
  const palette = form.palette

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
  //
  // TEMPLATE FIDELITY 3.1: the SERVED rows, in wire order, rather than
  // `SECTION_ORDER.flatMap(...)`. That literal was seven keys, so it
  // silently dropped every row outside them — and `onboarding.sections` now
  // carries more than seven (a page's own fixed rows are unioned in, so an
  // `announcement` the design seeded has a label and an availability count).
  // Dropping a row the server described is the defensiveness that turns
  // into a bug the moment the server has something new to say. The wire's
  // own order is the industry profile's own `defaultSections` order, which
  // is what `SECTION_ORDER` was a copy of.
  //
  // Then filtered and relabelled to the industry STEP 1 CHOSE, not the one
  // the org happens to be on today — see `sectionsForIndustry`, which is
  // also what keeps a block the wizard has no business offering (page
  // furniture the design seeds for itself) out of step 4: it admits only
  // the keys that industry's own section list names. Without it, a tenant
  // who switches away from an industry with a booking band posts a
  // `booking` row the new page's template does not own, and the backend
  // (correctly) 422s the Create button on a section the wizard itself
  // offered them.
  const sectionMetas: SectionMeta[] = sectionsForIndustry(
    sections.map(row => ({
      key: row.key,
      label: row.label,
      sourceLabel: row.source_label,
      available: row.available,
      count: row.count,
      reason: row.reason ?? null,
    })),
    industryOptions,
    selectedIndustry,
  )

  // The count already sits in the payload the host fetched — no second
  // call, and no fabricated service names: the prefill response carries
  // counts, not rows, so that is what the card can honestly show. Read
  // straight off the wire rows rather than off `sectionMetas`, because the
  // number is a fact about the tenant's Services screen and does not change
  // with which industry card is selected — only the WORD for it does, and
  // each card supplies its own (see below).
  const servicesSection = sections.find(s => s.key === 'services')
  const serviceCount = servicesSection && servicesSection.available && servicesSection.count > 0
    ? servicesSection.count
    : null

  // Every card is drawn from the industry it represents, in THAT industry's
  // vocabulary and colours — a salon card says "Treatments / Therapists /
  // Book appointment", a school card says "Courses / Instructors / Book a
  // lesson" — so the choice visibly changes something before it is made.
  const cards = industryCards(industryOptions, selectedIndustry)
  // Shown only once the tenant has moved OFF their own industry: picking
  // the card that was already selected changes nothing at all, and a
  // standing warning about a change nobody made is just noise.
  const industryChanged = selectedIndustry !== '' && selectedIndustry !== prefill.industry

  const stepTitle = (key: StepKey) => {
    switch (key) {
      case 'industry': return t('landing_pages.wizard.step_industry', 'Your industry')
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
    templateKey, industry: selectedIndustry,
    slug: suggestedSlug, headline, subtext, brandColor, fontPairing, palette,
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
            {t('landing_pages.wizard.industry_intro', {
              name: businessName,
              defaultValue: 'Your page is written in your own trade’s words. Pick the closest match and {{name}} gets that language, those colours and the sections that fit.',
            })}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(card => (
              <button
                key={card.id}
                type="button"
                aria-pressed={card.selected}
                onClick={() => up('industry', card.id)}
                className={'text-left rounded-xl border p-4 transition-all outline-none '
                  + 'focus-visible:ring-2 focus-visible:ring-primary-500/40 '
                  + (card.selected
                    ? 'border-primary-500 bg-primary-500/[0.08] ring-1 ring-primary-500/30'
                    : 'border-dark-border bg-dark-surface hover:border-primary-500/40 hover:bg-primary-500/[0.04]')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white truncate">
                    {t(`landing_pages.wizard.industry_name_${card.id}`, card.name)}
                  </span>
                  {card.selected && <Check size={16} className="text-primary-500 shrink-0" />}
                </div>

                {/* The industry's own band names, drawn the way the page
                    draws them: mono eyebrows in the palette this industry
                    opens on (IndustryProfile::defaultPalette). Inline
                    colour, deliberately — this is customer-facing page
                    styling being previewed, not admin chrome (Appendix A
                    §7.4), and the whole point of the card is that two
                    industries do not look alike. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3">
                  {card.vocabulary.map(word => (
                    <span
                      key={word}
                      className="text-[10px] font-mono uppercase tracking-[0.12em]"
                      style={{ color: card.paletteAccent }}
                    >
                      {word}
                    </span>
                  ))}
                </div>

                {/* The page's own primary button, at card size. Every
                    profile's accent clears the WCAG 4.5:1 floor against a
                    white label — see IndustryProfile::all()'s docblock on
                    the one accent that had to be darkened to keep that
                    true — so the label is safe as plain white here. */}
                <span
                  className="inline-block mt-3 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: card.accent }}
                >
                  {card.primaryCta}
                </span>

                {serviceCount !== null && (
                  <p className="text-[10px] text-t-secondary mt-3">
                    {t('landing_pages.wizard.services_count', {
                      count: serviceCount,
                      label: card.vocabulary[0],
                      defaultValue: '{{count}} {{label}} ready to show',
                    })}
                  </p>
                )}
              </button>
            ))}
          </div>

          {industryChanged && (
            <p className="text-xs text-t-secondary leading-relaxed">
              {t(
                'landing_pages.wizard.industry_change_note',
                'This also changes the words the rest of your workspace uses. Nothing you have already saved — bookings, clients, settings — is changed or deleted.',
              )}
            </p>
          )}
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
          {/* Task 6, landing phase 3c (D4): the wizard's own copy of the editor's Design
              panel — same component, same six palettes and four pairings,
              same self-hosted faces (../../styles/landing-preview-fonts.css,
              imported at the top of this file). `palette` is left
              genuinely absent until the tenant picks one here — see this
              file's own `palette` const above for why. */}
          <DesignPanel
            businessName={businessName}
            palette={palette}
            fontPairing={fontPairing}
            brandColor={brandColor}
            onPaletteChange={id => up('palette', id)}
            onFontPairingChange={id => up('font_pairing', id)}
            onBrandColorChange={hex => up('brand_color', hex)}
          />

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
            {t('landing_pages.wizard.sections_intro', 'Choose what your page shows. You can change any of this later from the editor.')}
          </p>

          {sectionMetas.map(section => {
            // RULING 4, from ./sections — the one predicate the wizard and
            // the editor (Task 8) both call, so the two screens cannot
            // disagree about which sections are real.
            const offerable = isOfferable(section)

            // A section the tenant has nothing for YET is not an error and
            // must not be dressed as one. It used to render in `warning`
            // amber beside a greyed-out dead switch — the visual grammar
            // this product uses for "something is wrong here" — under the
            // words "Nothing to show yet. Add some from Your Team screen.",
            // and the tenant who tested the shipped wizard read the row as
            // broken. It stays VISIBLE, because it is genuinely useful (it
            // tells them what the page could show and where that content
            // comes from); it just reads as a blank waiting to be filled:
            // a dashed outline, no colour, and a quiet "Not yet" marker in
            // place of a switch nobody can operate.
            if (!offerable) {
              return (
                <div
                  key={section.key}
                  className="bg-dark-surface/40 border border-dashed border-dark-border rounded-xl p-5 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    <span className="block text-sm font-medium text-t-secondary">{section.label}</span>
                    <span className="block text-xs text-t-secondary/80 mt-1 leading-relaxed">
                      {/* Fix 2 (phase 3a correctness review): the backend's
                          own authored reason (today: booking's industry-gate
                          sentence) beats the generic invitation below,
                          which makes no sense for a section nothing will
                          ever unlock by writing into it. */}
                      {unavailableReason(section, t('landing_pages.wizard.section_pending', {
                        source: section.sourceLabel,
                        defaultValue: 'Add this from {{source}} whenever you are ready — it appears on your page as soon as you do.',
                      }))}
                    </span>
                  </div>

                  <span className="shrink-0 rounded-full border border-dark-border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] text-t-secondary/70">
                    {t('landing_pages.wizard.section_not_yet', 'Not yet')}
                  </span>
                </div>
              )
            }

            // Offerable from here down, so an untouched toggle simply
            // defaults on — the same `?? true` `buildPayload` sends and
            // `chosenSections()` applies server-side.
            const checked = form.sections?.[section.key] ?? true

            return (
              <div key={section.key} className={card + ' flex items-start justify-between gap-4'}>
                <div className="min-w-0">
                  <span className="block text-sm font-medium text-white">{section.label}</span>
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
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  aria-label={section.label}
                  onClick={() => up('sections', { ...form.sections, [section.key]: !checked })}
                  className={'relative shrink-0 w-9 h-5 rounded-full transition-colors outline-none '
                    + 'focus-visible:ring-2 focus-visible:ring-primary-500/40 '
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
