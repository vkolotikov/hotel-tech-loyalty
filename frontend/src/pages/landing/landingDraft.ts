/**
 * Pure draft-persistence logic for `LandingWizard.tsx`, split into its own
 * module for two reasons: it can be unit tested with no DOM and no React
 * (`landingDraft.test.ts`), and a `.tsx` file that exports both a component
 * and plain constants/functions breaks Vite Fast Refresh for that component
 * (`react-refresh/only-export-components`) — `sections.ts` next to this file
 * is the same split for the same reason.
 *
 * Appendix A §7.6 / `SetupWizard.tsx:118,294,1294`: `loadDraft()` deep-merges
 * a parsed draft over the empty form and clamps the step, rather than
 * trusting a raw `JSON.parse` — the whole point is surviving a schema change
 * (a field added or removed since the draft was written) without breaking
 * the wizard on the first reload after that change ships.
 *
 * Task 7 adds steps 3-4 (style, sections) and, with them, `buildPayload` —
 * the pure half of the apply call. It lives here rather than in
 * `LandingWizard.tsx` for the same testability reason as everything else in
 * this file: this repo's vitest config is pure-function-only (no jsdom, no
 * React Testing Library — see `vitest.config.ts`'s own docblock), so the one
 * thing worth proving about the apply payload — that an unofferable section
 * is sent `enabled: false` no matter what the tenant's own draft says — has
 * to live in a function vitest can actually call.
 */
import { isOfferable, type SectionMeta } from './sections'
import { FONT_PAIRING_IDS, PALETTE_IDS, type FontPairingId, type PaletteId } from './designChoices'

const DRAFT_KEY_BASE = 'landing-wizard-draft-v1'

/**
 * Brand-scoped draft key.
 *
 * A landing page is the most strictly per-brand thing in this codebase —
 * Task 4 spent two backend fix rounds closing exactly this class of bug
 * (a sibling brand's Property leaking into the prefill, `publish()` hitting
 * the wrong brand's page) after the same "which brand is this, really"
 * confusion. `BrandSwitcher` changes `currentBrandId` and invalidates
 * queries WITHOUT unmounting `LandingPages.tsx`, so a single shared key
 * would let a tenant type a headline for brand A, switch to brand B, and
 * have brand A's copy sitting in what is now brand B's session and, worse,
 * in a draft the tenant could later restore under the wrong brand
 * entirely. `null` (the org-wide "All brands" selection) gets its own
 * fixed segment rather than colliding with a numeric id.
 */
export function draftKey(brandId: number | null): string {
  return `${DRAFT_KEY_BASE}:${brandId === null ? 'org' : brandId}`
}

/** The four steps of the wizard. Task 6 built `template`/`details`; Task 7
 *  appends `style` (step 3 — brand colour, font pairing) and `sections`
 *  (step 4 — what to show). The stepper, the footer's Back/Continue
 *  clamping and this module's own step-clamp all read `STEPS.length`, so
 *  none of them needed to change by hand when these two were appended.
 *
 *  Landing phase 3c (the industry step) renames the first one. `template`
 *  offered exactly ONE template (`ruled_page` is still the only shipped
 *  view) under the words "Pick the one that feels right", which a tenant
 *  testing the shipped wizard read — correctly — as a broken screen.
 *  `industry` asks the question that actually drives the page:
 *  `IndustryProfile` supplies its whole vocabulary, its house accent and
 *  its default palette, and the booking band is gated on `hotel`.
 *  `template_key` still SHIPS as `ruled_page` (see `buildPayload`); the
 *  wizard simply stops asking about it. */
export const STEPS = ['industry', 'details', 'style', 'sections'] as const
export type StepKey = (typeof STEPS)[number]

/** The four curated pairings the backend accepts — `theme.font_pairing`
 *  is validated against `App\Landing\ThemeRules::FONT_PAIRINGS`
 *  (`LandingOnboardingController::store()`), and `./designChoices` is this
 *  frontend's own hand-mirror of that exact same constant (landing phase
 *  3c Task 6 — distinct from this file's OWN "Task 6" a few lines above,
 *  an earlier phase's numbering) — so this is that list, not a second
 *  independent guess at it. */
export const FONT_PAIRINGS = FONT_PAIRING_IDS
export type FontPairingKey = FontPairingId

/**
 * What the tenant has chosen so far.
 *
 * Every field is OPTIONAL and a fresh session starts with none of them set
 * (see `emptyForm()`) — not defaulted to `''`. That is what lets the render
 * layer distinguish "untouched" from "deliberately cleared" with a single
 * `form.headline ?? prefill.headline ?? ''` per field (Appendix A §7.1,
 * `ChatbotWizard.tsx:80,85`): an untouched field is `undefined` and falls
 * through to the server's prefill; a field the tenant backspaced to nothing
 * is `''` and stays blank. Seeding a restored draft's untouched fields with
 * `''` instead of leaving them absent would collapse that distinction and
 * permanently blank out a tenant's own prefilled copy on reload — see
 * `mergeFormDraft`'s docblock and its test.
 *
 * `sections` is a map rather than the wire's array-of-rows shape
 * (`{key, enabled}[]`) because that is what a per-row toggle naturally
 * updates — `{...form.sections, [key]: next}` — and because it merges the
 * same way every other field here does: a key the tenant never touched is
 * simply absent, so `buildPayload` can fall through to "on by default",
 * matching the same default `LandingOnboardingService::chosenSections()`
 * uses server-side (`$chosen[$key] ?? true`).
 *
 * Task 2: `phone`/`email`/`address` follow the identical "absent means
 * untouched" discipline as every field above — the component's own
 * `form.phone ?? prefill.phone ?? ''` fallback chain, and `undefined` here
 * is what lets `buildPayload` tell "the tenant never opened this field"
 * apart from "the tenant cleared it back to the Property's own value",
 * which is what the diff-against-prefill logic below actually needs.
 */
export type WizardForm = {
  template_key?: string
  /** The industry card the tenant picked in step 1 — absent until they
   *  actually pick one, at which point the pre-selected card (the org's own
   *  current industry) is what step 1 was already showing. Deliberately NOT
   *  narrowed against a hardcoded id list the way `font_pairing`/`palette`
   *  are below: the onboarding response SERVES the offered industries, so
   *  `resolveIndustry` (./industryChoices) narrows this against that live
   *  list instead — a strictly better guard than a mirror of the backend
   *  constant that could drift from it. */
  industry?: string
  headline?: string
  subtext?: string
  brand_color?: string
  font_pairing?: FontPairingKey
  /** Landing phase 3c Task 6 (D4): absent until the tenant actually picks
   *  one in "Make it yours" — see `buildPayload`'s own comment on why an
   *  untouched selection is never defaulted here the way `font_pairing`
   *  is at the component's own call site. */
  palette?: PaletteId
  phone?: string
  email?: string
  address?: string
  sections?: Record<string, boolean>
}

export function emptyForm(): WizardForm {
  return {}
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * The known string fields of `patch`, and nothing else.
 *
 * Three separate guards, each earning its place from a way a stale draft
 * can go wrong:
 *  - a key `patch` doesn't have at all (a field this build added since the
 *    draft was written) is simply absent from the result, not defaulted —
 *    see the `WizardForm` docblock for why that has to be `undefined` and
 *    not `''`;
 *  - a key `patch` has but this build no longer reads (a field a LATER
 *    build removed, or a hand-edited/corrupted localStorage value) is
 *    dropped rather than carried into state nothing will ever read;
 *  - a key whose value is not a `string` (the field used to hold a
 *    different type, or the JSON was tampered with) is dropped rather than
 *    trusted — an unguarded shallow spread would let it through and any
 *    code doing `.trim()`/`.toLowerCase()` on it later would throw.
 */
export function mergeFormDraft(patch: unknown): WizardForm {
  const out: WizardForm = {}
  if (!isPlainObject(patch)) return out
  for (const key of ['template_key', 'industry', 'headline', 'subtext', 'brand_color', 'phone', 'email', 'address'] as const) {
    const value = patch[key]
    if (typeof value === 'string') out[key] = value
  }

  // Not the generic string guard above: an out-of-enum value (a pairing
  // Phase 3 removes, or a hand-edited localStorage entry) has to be
  // dropped here rather than carried into state that would send the
  // server a value it 422s on.
  const fontPairing = patch.font_pairing
  if (typeof fontPairing === 'string' && (FONT_PAIRINGS as readonly string[]).includes(fontPairing)) {
    out.font_pairing = fontPairing as FontPairingKey
  }

  // Landing phase 3c Task 6 (D4): same guard as font_pairing above, against
  // designChoices' own six ids — a draft holding a palette a later build
  // renamed or removed must not reach the request any more than a removed
  // pairing would.
  const palette = patch.palette
  if (typeof palette === 'string' && (PALETTE_IDS as readonly string[]).includes(palette)) {
    out.palette = palette as PaletteId
  }

  // Same three guards as every other field, applied per-entry rather than
  // to the whole map: a draft written before a section existed, after one
  // was removed, or hand-edited to hold a non-boolean, keeps every entry
  // that is still real and drops only the ones that are not — a single
  // bad entry must not cost the tenant every other section they toggled.
  const sections = patch.sections
  if (isPlainObject(sections)) {
    const cleaned: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(sections)) {
      if (typeof value === 'boolean') cleaned[key] = value
    }
    out.sections = cleaned
  }

  return out
}

/** A step index guaranteed to land on a real `{step === N && …}` block —
 *  never negative, never past the last step this build actually renders. */
export function clampStep(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0
  return Math.min(STEPS.length - 1, Math.max(0, n))
}

/**
 * The pure half of draft restoration: given whatever `JSON.parse` produced
 * (which for a hand-edited or pre-schema-change value in localStorage could
 * be anything), returns a `{step, form}` that is always safe to hand to
 * `useState`. Split out from the localStorage access itself so it can be
 * unit tested with no DOM and no try/catch of its own.
 */
export function parseDraft(parsed: unknown): { step: number; form: WizardForm } {
  const p = isPlainObject(parsed) ? parsed : {}
  return { step: clampStep(p.step), form: mergeFormDraft(p.form) }
}

/**
 * The three `Storage` methods this module actually calls. Defaults to the
 * real `localStorage` (the only thing that matters in the browser); tests
 * inject an in-memory fake so `loadDraft`/`saveDraft`/`clearDraft` — the
 * functions that prove two brands' drafts cannot see each other — can run
 * with no DOM, matching this project's "pure-function unit tests only"
 * vitest config (`vitest.config.ts`'s own docblock; there is no jsdom
 * global `localStorage` in that environment to exercise directly).
 */
export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function loadDraft(brandId: number | null, storage: DraftStorage = localStorage): { step: number; form: WizardForm } | null {
  try {
    const raw = storage.getItem(draftKey(brandId))
    if (!raw) return null
    return parseDraft(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveDraft(brandId: number | null, step: number, form: WizardForm, storage: DraftStorage = localStorage): void {
  try {
    storage.setItem(draftKey(brandId), JSON.stringify({ step, form }))
  } catch {
    /* storage unavailable — draft simply won't persist */
  }
}

/** Task 7's apply mutation calls this from its `onSuccess` — a finished
 *  page has nothing left for the draft to protect. */
export function clearDraft(brandId: number | null, storage: DraftStorage = localStorage): void {
  try {
    storage.removeItem(draftKey(brandId))
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/** The exact wire shape `POST /v1/admin/landing-pages/onboarding` expects
 *  (see `LandingOnboardingController::store()`'s validation) — snake_case,
 *  same discipline as `OnboardingPrefill` in `LandingWizard.tsx`: a straight
 *  write of one request, not a layer anything else depends on.
 *
 *  Task 2: `contact` keys are OPTIONAL and, per field, present only when the
 *  tenant's resolved value differs from the effective prefill — see
 *  `contactOverrides()` below. This is belt-and-braces with the server's own
 *  diff in `LandingOnboardingService::contactOverrides()`, not a
 *  replacement for it: the server cannot trust what any caller (this
 *  component, a stale draft, a direct API call) claims was "edited", so it
 *  re-derives the same diff against its own effective prefill before
 *  writing anything. Keeping the client's payload already-diffed just means
 *  the common case (the tenant touched nothing) sends an empty `contact:
 *  {}` rather than the three current effective values relitigated
 *  server-side for no reason. */
export type ApplyPayload = {
  template_key: string
  /** Landing phase 3c (the industry step): which industry's words this page
   *  is written in. OPTIONAL and, like `theme.palette`, present only when
   *  there is a real choice to send — `resolveIndustry` returns `''` when
   *  the response offered no industries at all (an older backend), and an
   *  absent key is exactly what makes `LandingOnboardingService::
   *  chosenIndustry()` fall back to the organisation's own industry, i.e.
   *  the behaviour that shipped before this step existed. */
  industry?: string
  slug: string
  copy: { headline: string; subtext: string }
  /** `palette` is OPTIONAL and present only when the tenant actually chose
   *  one in "Make it yours" (landing phase 3c Task 6, D4) — omitted, this diffs from
   *  `brand_color`/`font_pairing` (both always sent, defaulted at the
   *  component's own call site) on purpose: leaving it out is what lets
   *  `LandingOnboardingService::theme()` apply the industry's own default
   *  palette (`IndustryProfile::for($industry)->defaultPalette`) instead of
   *  every wizard-created page silently getting whichever palette this
   *  frontend module happens to list first. */
  theme: { brand_color: string; font_pairing: FontPairingKey; palette?: PaletteId }
  contact: { phone?: string; email?: string; address?: string }
  sections: { key: string; enabled: boolean }[]
}

/** The effective prefill values `buildPayload` diffs a resolved contact
 *  field against — `OnboardingPrefill`'s own `phone`/`email`/`address`,
 *  copied here rather than imported so this module (already independent of
 *  `LandingWizard.tsx` — see this file's own docblock) stays that way. */
export type PrefillContact = {
  phone: string | null
  email: string | null
  address: string | null
}

/**
 * Only the contact fields whose RESOLVED value (the component's own
 * `form.x ?? prefill.x ?? ''` fallback, already applied by the caller) is
 * both filled and different from the effective prefill — the same "changed
 * AND filled" test `LandingOnboardingService::contactOverrides()` applies
 * server-side, so the two cannot disagree about what counts as "the tenant
 * edited this". A field equal to its prefill (untouched, or typed back to
 * the same value) is omitted entirely rather than sent as `''`: an omitted
 * key and a blank one both mean "no override" to `ContactDetails::resolve()`,
 * but only the omitted form keeps the outgoing request honest about what
 * actually changed.
 */
function contactOverrides(
  resolved: { phone: string; email: string; address: string },
  prefill: PrefillContact,
): ApplyPayload['contact'] {
  const out: ApplyPayload['contact'] = {}

  for (const key of ['phone', 'email', 'address'] as const) {
    const value = resolved[key].trim()
    if (value === '' || value === (prefill[key] ?? '')) continue
    out[key] = value
  }

  return out
}

/**
 * The pure half of the apply call: given every field already resolved to
 * its final value (the component owns the `form.x ?? prefill.x ?? ''`
 * fallback chain — see `LandingWizard.tsx`), turns them into the exact body
 * `apply()` accepts.
 *
 * The one rule worth a function of its own: **`isOfferable` decides
 * `enabled`, never `sectionChoices` alone.** A toggle the wizard rendered
 * disabled can still have a stale `true` sitting in a restored draft (the
 * tenant toggled it on before a service was deleted, say) — RULING 4 exists
 * so the wizard and the editor cannot disagree about which sections are
 * real, and a payload that let a disabled toggle's leftover state slip
 * through as `enabled: true` would create exactly that disagreement, one
 * request later. An unofferable section is always sent `enabled: false`,
 * full stop.
 */
export function buildPayload(args: {
  templateKey: string
  /** Already narrowed by `resolveIndustry` (./industryChoices) to an id the
   *  server actually offered, or `''` when it offered none — see
   *  `ApplyPayload['industry']`. */
  industry?: string
  slug: string
  headline: string
  subtext: string
  brandColor: string
  fontPairing: FontPairingKey
  /** Absent when the tenant never opened the palette picker — see
   *  `ApplyPayload['theme']`'s own comment on why this, alone among the
   *  three theme fields, is never defaulted before reaching here. */
  palette?: PaletteId
  contact: { phone: string; email: string; address: string }
  prefillContact: PrefillContact
  sections: SectionMeta[]
  sectionChoices: Record<string, boolean>
}): ApplyPayload {
  return {
    template_key: args.templateKey,
    ...(args.industry ? { industry: args.industry } : {}),
    slug: args.slug,
    copy: { headline: args.headline, subtext: args.subtext },
    theme: {
      brand_color: args.brandColor,
      font_pairing: args.fontPairing,
      ...(args.palette ? { palette: args.palette } : {}),
    },
    contact: contactOverrides(args.contact, args.prefillContact),
    sections: args.sections.map(section => ({
      key: section.key,
      enabled: isOfferable(section) ? (args.sectionChoices[section.key] ?? true) : false,
    })),
  }
}
