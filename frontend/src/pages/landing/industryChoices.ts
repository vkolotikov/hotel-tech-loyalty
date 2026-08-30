/**
 * The wizard's first step, as data (landing phase 3c — the industry step).
 *
 * Step 1 used to ask which TEMPLATE the tenant wanted, from a list of
 * exactly one (`ruled_page`), under the words "Pick the one that feels
 * right". A choice with one option is not a choice, and a tenant who tested
 * the shipped wizard said so. Industry is the question that was worth
 * asking all along: `App\Landing\IndustryProfile` supplies the whole page's
 * vocabulary (what the services band is CALLED, what the people band is
 * called, what the primary button says), its house accent and its default
 * palette, and the booking band exists at all only for `hotel`. Picking a
 * different card visibly changes the page.
 *
 * Everything here is pure — no React, no DOM, no i18next — because this
 * repo's vitest config is node-env, pure-function-only (see
 * `vitest.config.ts`'s own docblock). The component renders what these
 * functions return; `industryChoices.test.ts` is what actually proves the
 * card data, the pre-selection and the section filter.
 *
 * The ID LIST IS NOT MIRRORED HERE. `designChoices.ts` next door hardcodes
 * the six palette ids because nothing serves them; this module deliberately
 * does the opposite, because the onboarding prefill DOES serve the
 * industries (`LandingOnboardingService::industries()`, built from
 * `Organization::INDUSTRIES` itself). Every function below therefore
 * resolves against the rows the SERVER sent, so a tenth industry added
 * backend-side appears in the wizard with no frontend release at all, and
 * an id this build has never heard of can never be sent back as a choice
 * the endpoint would 422 on. The only per-id data that lives here is the
 * English display NAME, which is UI copy (translated through i18n) rather
 * than part of the contract.
 */
import { paletteFor } from './designChoices'

/**
 * One row of `onboarding.industries` — the wire shape, snake_case,
 * verbatim, exactly as `LandingWizard.tsx`'s own `OnboardingPrefill` keeps
 * the wire's spelling for the same reason: this is a straight read of one
 * response, not a layer other code depends on.
 *
 * `services_label` / `people_label` / `primary_cta` arrive UNTRANSLATED and
 * are rendered that way. They are not admin chrome — they are the literal
 * words that will be printed on the published page, which
 * `IndustryProfile` writes in English — so translating them would show the
 * tenant a page they are not going to get. Same rule the section labels and
 * the template blurb already cross this wire under.
 */
export type IndustryOption = {
  id: string
  services_label: string
  people_label: string
  primary_cta: string
  /** The industry's house accent, already through `CssColor::safe()`. */
  accent: string
  /** A `designChoices` palette id — `IndustryProfile::defaultPalette`. */
  palette: string
  /** The bands a page in this industry is created with. */
  sections: string[]
}

/** What one card needs, with nothing left for the component to derive. */
export type IndustryCard = {
  id: string
  /** English fallback only — the screen passes this as `t()`'s default. */
  name: string
  /** This industry's own words, in the order the page uses them. */
  vocabulary: string[]
  primaryCta: string
  /** The industry's house accent (the page's default CTA colour). */
  accent: string
  /** The accent of the palette this industry opens on — the colour the
   *  page's own headings and rules are drawn in, which is what makes two
   *  cards look like two different pages rather than two labels. */
  paletteAccent: string
  paletteId: string
  selected: boolean
}

/**
 * English display names, keyed by `Organization::INDUSTRIES` id.
 *
 * Copied from `pages/Setup.tsx`'s own nine-industry picker rather than
 * invented, so the same business reads the same word in the setup wizard,
 * the Settings industry switcher and here. These are the i18n DEFAULTS —
 * `landing_pages.wizard.industry_name_<id>` is what actually renders (see
 * `localeCompleteness.test.ts`, which pins all nine keys in all five
 * locales the same way it pins the design panel's palette names).
 */
export const INDUSTRY_NAMES: Record<string, string> = {
  hotel: 'Hotel',
  beauty: 'Beauty / Spa',
  medical: 'Medical / Healthcare',
  restaurant: 'Restaurant',
  legal: 'Legal / Law firm',
  real_estate: 'Real estate',
  education: 'Education / Tutoring',
  fitness: 'Fitness / Wellness',
  other: 'Something else',
}

/**
 * A readable name for an id — the authored one, or a humanised spelling of
 * the id itself for an industry the backend has gained since this build.
 * Never a raw `real_estate` at a customer, and never an empty card.
 */
export function industryName(id: string): string {
  if (INDUSTRY_NAMES[id]) return INDUSTRY_NAMES[id]

  return id
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Which industry the wizard is actually building for.
 *
 * `chosen` is whatever sits in the autosaved draft — which can be a value
 * from a hand-edited localStorage entry, or an id a later backend release
 * removed. It only wins if the server is still offering it; otherwise the
 * organisation's own current industry does, which is the card the step
 * opens pre-selected on. This is the ONE narrowing between the draft and
 * the request, which is why `mergeFormDraft` leaves `industry` as a plain
 * string rather than guarding it against a hardcoded list the way it has to
 * for palettes and font pairings (there is no endpoint serving those).
 *
 * Returns `''` only when the response carried no industries at all (an
 * older backend): the payload then omits `industry` entirely and the server
 * files the page under the org's own industry exactly as it did before this
 * step existed.
 */
export function resolveIndustry(
  options: IndustryOption[],
  chosen: string | undefined,
  current: string | undefined,
): string {
  const offered = (id: string | undefined): boolean =>
    typeof id === 'string' && options.some(o => o.id === id)

  if (offered(chosen)) return chosen as string
  if (offered(current)) return current as string

  return ''
}

/**
 * The cards, in the order the server listed them
 * (`Organization::INDUSTRIES`' own order — the same order the registration
 * picker and the Settings switcher use, so an admin recognises the layout).
 */
export function industryCards(options: IndustryOption[], selectedId: string): IndustryCard[] {
  return options.map(option => ({
    id: option.id,
    name: industryName(option.id),
    // Two nouns, not three: these are the bands a tenant will actually
    // recognise as changing ("Treatments" and "Therapists" for a salon,
    // "Courses" and "Instructors" for a school). The CTA is carried
    // separately because it is a BUTTON on the page, not a heading, and the
    // card draws it as one.
    vocabulary: [option.services_label, option.people_label],
    primaryCta: option.primary_cta,
    accent: option.accent,
    paletteAccent: paletteFor(option.palette).accent,
    paletteId: option.palette,
    selected: option.id === selectedId,
  }))
}

/**
 * The section rows as the CHOSEN industry would describe them: the bands
 * that industry's page actually has, under that industry's own words.
 *
 * The prefill's `sections` describe the industry the ORGANISATION is on
 * today, because that is the only one the server could resolve when it
 * built the response. Choosing a different card can therefore leave a row
 * in that list which the new industry's page will never have — `booking` is
 * the only key that varies across the nine profiles today (`hotel` and
 * `beauty` list it; the other seven do not), and sending it anyway is not a
 * cosmetic mismatch: `LandingOnboardingService::chosenSections()` REFUSES a
 * key the page's own template does not own ("This page has no section
 * called 'booking'."), so the tenant's Create button would 422 on a choice
 * the wizard itself offered them.
 *
 * Filtering here fixes both halves at once — the row disappears from step 4
 * and from the payload — because both read this one list.
 *
 * A section the new industry HAS but the prefill never described (switching
 * to `hotel` from an industry with no booking band) is simply absent from
 * the payload, and `chosenSections()`'s own `$chosen[$key] ?? true` default
 * turns it on. That is the right answer and the safe direction: the band
 * exists on the created page, switched on, and the editor can turn it off.
 *
 * The RELABEL half is the same rule, applied to the words rather than the
 * list: `LandingOnboardingService::sectionLabel()` names the services band
 * from `servicesLabel` and the people band from `peopleLabel`, and it did so
 * for the industry the ORG is on. A tenant who has just picked Education in
 * step 1 must not read "Treatments" in step 4 — the label they see has to be
 * the label their page will print. Only those two keys carry industry
 * vocabulary; every other band's name ("Opening", "About", "Contact") is
 * industry-independent in `SECTION_COPY` and is left exactly as sent.
 *
 * An industry id the response never offered (an older backend with no
 * `industries` at all) changes nothing — the pre-industry-step behaviour,
 * unchanged.
 */
export function sectionsForIndustry<T extends { key: string; label: string }>(
  rows: T[],
  options: IndustryOption[],
  industryId: string,
): T[] {
  const industry = options.find(o => o.id === industryId)

  if (!industry) return rows

  return rows
    .filter(row => industry.sections.includes(row.key))
    .map(row => {
      if (row.key === 'services') return { ...row, label: industry.services_label }
      if (row.key === 'team') return { ...row, label: industry.people_label }
      return row
    })
}
