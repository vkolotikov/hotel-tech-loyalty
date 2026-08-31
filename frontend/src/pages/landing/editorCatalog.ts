/**
 * The editor's two CATALOGUE controls, as data (landing phase 3c, Plan A —
 * industry + template in the Design panel).
 *
 * A tenant asked to "return to the wizard and change data or template,
 * industry". The editor already covered every other wizard answer — contact
 * fields, section toggles and order, palette, type pairing, brand colour,
 * photos — and those two alone were choose-once-at-creation. Rather than
 * send anyone back through a modal wizard, they became two more controls
 * where the other design choices already live.
 *
 * Everything here is pure — no React, no DOM, no i18next — because this
 * repo's vitest config is node-env, pure-function-only (see
 * `vitest.config.ts`'s own docblock). `DesignPanel.tsx` renders what these
 * functions return; `editorCatalog.test.ts` is what actually proves the card
 * data, the narrowing and the save payload.
 *
 * NEITHER LIST IS MIRRORED HERE, for the same reason `industryChoices.ts`
 * next door mirrors no industry ids: both catalogues are SERVED. The
 * industries come from `LandingOnboardingService::industries()` (built off
 * `Organization::INDUSTRIES`) and the templates from that same service's own
 * `TEMPLATES` constant, both carried on the `GET
 * /v1/admin/landing-pages/onboarding` response the host page
 * (`LandingPages.tsx`) already fetches once and hands down. So a second
 * template — or a tenth industry — appears in this panel with no frontend
 * release at all, and an id this build has never heard of can never be sent
 * back as a choice the endpoint would 422 on.
 */
import type { IndustryOption } from './industryChoices'

/**
 * One row of `onboarding.templates` — `LandingOnboardingService::TEMPLATES`
 * verbatim, the wire's own spelling.
 *
 * `name` and `blurb` arrive UNTRANSLATED and are rendered that way, the same
 * rule the industry vocabulary and the section labels already cross this
 * wire under: they describe the page a tenant is choosing, written once, in
 * English, next to the views they describe. (`LandingWizard.tsx` imports
 * this type rather than declaring a second copy of it — it still POSTS
 * `template_key` even though it no longer ASKS about it.)
 */
export type TemplateOption = {
  key: string
  name: string
  blurb: string
}

/** What one template card needs, with nothing left for the component to
 *  derive — the same shape-per-card discipline `industryCards()` follows. */
export type TemplateCard = {
  key: string
  name: string
  blurb: string
  selected: boolean
}

/**
 * Whether the template picker is worth rendering at all.
 *
 * Today `TEMPLATES` has exactly one row (`ruled_page`), and a choice with
 * one option is not a choice — it is the screen the wizard's own first step
 * used to be, which the first tenant to test it read as broken, correctly.
 * So the picker appears only once there is something to pick BETWEEN, and
 * the day a second template ships it appears on its own: a data change in
 * `LandingOnboardingService::TEMPLATES`, not a UI change here.
 */
export function showTemplatePicker(options: TemplateOption[]): boolean {
  return options.length > 1
}

/**
 * Which template the panel is actually showing as selected.
 *
 * Same narrowing `resolveIndustry` (./industryChoices) does on the other
 * axis, and for the same reason: `chosen` is whatever the editor's unsaved
 * form holds and `current` whatever the saved row holds, and either can name
 * a key a later backend release removed. A value the server is no longer
 * offering never wins, so the panel can never draw a selection that is not
 * on screen — and `catalogPayload` below can never send one back.
 *
 * Returns `''` when neither is offered (including the older-backend case
 * where the response carried no templates at all), which is exactly the
 * state `showTemplatePicker` is already hiding the control for.
 */
export function resolveTemplateKey(
  options: TemplateOption[],
  chosen: string | undefined,
  current: string | undefined,
): string {
  const offered = (key: string | undefined): boolean =>
    typeof key === 'string' && options.some(o => o.key === key)

  if (offered(chosen)) return chosen as string
  if (offered(current)) return current as string

  return ''
}

/** The cards, in the order the server listed them (`TEMPLATES`' own order —
 *  the order the wizard showed them in before it stopped asking). */
export function templateCards(options: TemplateOption[], selectedKey: string): TemplateCard[] {
  return options.map(option => ({
    key: option.key,
    name: option.name,
    blurb: option.blurb,
    selected: option.key === selectedKey,
  }))
}

/**
 * Whether to show the industry-change warning.
 *
 * ONCE, and only when the tenant has actually moved OFF the industry the
 * page is currently filed under — never as a standing caption under a
 * picker that is sitting exactly where it was found. The panel opens
 * pre-selected on the saved industry, so this is false on arrival and stays
 * false for every tenant who came to the Design panel for a palette.
 *
 * `saved` empty (a response that carried no industry, or a page shape older
 * than this field) means there is nothing to have moved off: no warning,
 * because "you are changing your industry" would be a claim this build
 * cannot actually support.
 */
export function industryHasChanged(selected: string | undefined, saved: string | undefined): boolean {
  return typeof selected === 'string'
    && selected !== ''
    && typeof saved === 'string'
    && saved !== ''
    && selected !== saved
}

/**
 * The two catalogue keys `PUT /v1/admin/landing-pages` should carry, given
 * what the editor's form holds and what is actually saved.
 *
 * A key is present ONLY when the tenant genuinely moved it AND the server is
 * still offering the value they moved it to. Two independent narrowings,
 * each earning its place:
 *
 *  - UNCHANGED IS OMITTED. `theme`/`content`/`slug` are all sent whole on
 *    every save (see `LandingEditor.tsx`'s `saveMut`) because they are
 *    replaced wholesale server-side and a partial body would erase the rest.
 *    These two are the opposite: `industry` is not even a column this
 *    endpoint writes — it moves the ORGANISATION, through
 *    `LandingOnboardingService::syncOrganizationIndustry()`, which resyncs
 *    every landing page under that org. That is a real write with a real
 *    sweep behind it, and re-sending the value the org is already on with
 *    every headline edit would be asking for it on every save. (The server
 *    no-ops an unchanged industry anyway — this is the client half of the
 *    same discipline, exactly like `contactOverrides` in `landingDraft.ts`
 *    diffing against the prefill the server also re-diffs.)
 *
 *  - AN UNOFFERED VALUE IS DROPPED. The same "narrow before it reaches the
 *    wire" rule `themePayload` applies to a palette id and `mergeFormDraft`
 *    to a restored draft: a value the catalogue no longer lists is refused
 *    by the endpoint with a 422, and a save the tenant cannot explain is
 *    worse than a control that quietly declines to send a choice it could
 *    not have offered in the first place.
 */
export function catalogPayload(args: {
  industries: IndustryOption[]
  templates: TemplateOption[]
  /** What the editor's form currently holds (its own clone of the saved row
   *  with whatever the tenant has changed on top). */
  industry: string | undefined
  templateKey: string | undefined
  /** What the SAVED row holds — the query's `page`, never `form`. */
  savedIndustry: string | undefined
  savedTemplateKey: string | undefined
}): { industry?: string; template_key?: string } {
  const out: { industry?: string; template_key?: string } = {}

  if (typeof args.industry === 'string'
    && args.industry !== ''
    && args.industry !== args.savedIndustry
    && args.industries.some(o => o.id === args.industry)
  ) {
    out.industry = args.industry
  }

  if (typeof args.templateKey === 'string'
    && args.templateKey !== ''
    && args.templateKey !== args.savedTemplateKey
    && args.templates.some(o => o.key === args.templateKey)
  ) {
    out.template_key = args.templateKey
  }

  return out
}
