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
  /**
   * Landing phase 3c / template fidelity 1.1 — WHICH DESIGN CONTROLS THIS
   * TEMPLATE ACTUALLY HONOURS, off the wire.
   *
   * `LandingOnboardingService::TEMPLATES[*].supports`, which transcribes
   * one bool per control from what each template's own layout says it
   * reads. Nocturne Ritual's layout states in words that `theme.palette`,
   * `theme.font_pairing` and section tones are "simply not read here" — and
   * because that fact was prose and nothing else, the editor drew ten
   * palette/type cards and twenty-one tone swatches over a page that
   * ignores every one of them.
   *
   * SERVED, NEVER MIRRORED, and never keyed off a template id in
   * TypeScript: `if (templateKey === 'nocturne_ritual')` would be a second
   * statement of the same fact, in the one place that cannot see the
   * layout it is describing, and the third template would silently inherit
   * the Ruled Page's answers.
   *
   * Optional because a backend that predates 1.1 publishes no such key —
   * see `templateSupports`, which resolves that to "assume it honours
   * everything", the behaviour that build already had.
   */
  supports?: Record<string, boolean> | null
  /**
   * WHETHER A TENANT MAY CHOOSE THIS DESIGN AT ALL - the final scenario,
   * step 2.
   *
   * `LandingOnboardingService::TEMPLATES[*].offerable`, and the SAME fact
   * both create endpoints validate against (`offerableTemplateKeys()`), so a
   * design in the picker and a design the server accepts are one list in
   * both directions.
   *
   * The row for a retired design STAYS on the wire, and that is the point of
   * a flag rather than an omission: pages already on it keep rendering, and
   * everything the editor knows about a page's design - `renders`,
   * `fixed_blocks`, `content_fields`, `image_defaults` - is read off this
   * list by key. A response that simply dropped the row would leave those
   * pages' editors with no facts at all.
   *
   * Optional, and ABSENT MEANS OFFERABLE: a backend that predates the flag
   * has retired nothing, and hiding every design on the strength of a key it
   * never sent would leave a tenant with an empty picker. See
   * `offerableTemplates`.
   */
  offerable?: boolean | null
  /**
   * THE TRADE THIS DESIGN WAS DRAWN FOR - the final scenario, step 1.
   *
   * `LandingOnboardingService::TEMPLATES[*].vertical`, joined against the
   * matching `vertical` on `onboarding.industries[*]` (`INDUSTRY_VERTICALS`
   * there is the one place the two are mapped). A beauty brand is offered
   * the three beauty kits first, a restaurant the three dining ones;
   * everybody may still choose any of them.
   *
   * BOTH SIDES OF THAT COMPARISON ARE SERVED, which is the whole reason this
   * key exists: `if (industry === 'beauty') show nocturne...` on this side
   * would be a second statement of a fact only the registry can hold, and a
   * seventh kit would need a frontend release to be offered to anyone.
   *
   * Null for a design drawn for no trade in particular. Optional for the
   * same reason `offerable` is; see `templateGroups`, which treats a missing
   * vertical as "no trade of its own" and shows one ungrouped list.
   */
  vertical?: string | null
  /**
   * WHICH SECTION TYPES THIS TEMPLATE SHIPS A PARTIAL FOR — derived
   * server-side from `view()->exists()`, never a hand list.
   *
   * Read since template fidelity 2.6 — `templateDrawsBlock` in
   * `builderShape.ts` is what turns it into the sentence a tenant sees on a
   * row this design will silently drop. 3.1's add-picker filter is the
   * other reader still to come.
   */
  renders?: string[] | null
  /**
   * WHICH BLOCKS THIS TEMPLATE PINS, AND WHERE — template fidelity 2.6.
   *
   * `LandingOnboardingService::TEMPLATES[*].fixed_blocks`, a map of section
   * key → placement (`top` | `fixed` | `footer`), transcribed from the one
   * statement that decides it: `$furniture` in the template's own layout,
   * which rejects those keys out of `$mainSections` and draws them where
   * the author put them.
   *
   * Until this crossed the wire, five rows on a Nocturne page carried a
   * live drag handle and two live arrows that moved NOTHING, under a help
   * sentence promising "sections appear on your page from top to bottom"
   * with no exception.
   *
   * The PLACEMENT is a three-word vocabulary this side translates, never a
   * sentence off the wire — see `builderShape.ts`'s `blockPlacement`.
   * Optional for the same reason `supports` is: a backend that predates it
   * has not declined anything, so nothing is suppressed.
   */
  fixed_blocks?: Record<string, string> | null
  /**
   * WHICH BLOCKS THIS TEMPLATE ACTUALLY DRAWS A PHOTOGRAPH IN — template
   * fidelity 4.5, derived server-side from the shipped partial's own
   * allowlisted reads.
   *
   * The narrower fact behind `renders`, and the two came apart the moment a
   * photo SLOT (which belongs to a type, shared by every design) stopped
   * implying a drawn photograph (which belongs to a partial, and does not).
   * `services` carries a band-level plate for the second kit and neither
   * shipped design has one, so its control must not be offered anywhere
   * yet — a control that cannot act is not rendered.
   *
   * Optional for the same reason `renders` is; see `templatePhotoBlocks`.
   */
  photo_blocks?: string[] | null
  /**
   * WHICH OF EACH TYPE'S LEAVES THIS DESIGN ACTUALLY PRINTS — type id → the
   * leaves it draws, `LandingOnboardingService::contentFieldsFor()`, template
   * fidelity 5.x / the plan's open question §7.
   *
   * `photo_blocks` one level finer. A leaf belongs to a TYPE, which every
   * template shares; a drawn leaf belongs to a PARTIAL, which they do not.
   * Nocturne Ritual draws a two-tone heading companion, a story ledger and a
   * footer social column that The Ruled Page draws nowhere; The Ruled Page
   * draws four contact wording overrides the kits' icon-led footer has no
   * room for. Offering either set on the other is a control that cannot act.
   *
   * Optional and null-tolerant for the same reason `renders` is: an older
   * backend has declined nothing, and hiding fields on the strength of a key
   * it never sent would be worse than the state that build shipped.
   */
  content_fields?: Record<string, string[]> | null
  /**
   * THE DESIGN'S OWN PHOTOGRAPHS — slot → URL, template fidelity 4.1.
   *
   * The kit's photographs ship as the template's defaults and stay until a
   * tenant replaces them, so every photo control has two possible subjects
   * and has to say which one it is showing. That is the difference between
   * "Remove photo" and "Restore original", and a copy of this map on this
   * side would be a copy that offers to restore an original that does not
   * exist.
   *
   * Keyed by the ENDPOINTS' own slot spelling (`hero`, `gallery_1.image_3`)
   * so a default and the upload that replaces it name the same thing.
   */
  image_defaults?: Record<string, string> | null
}

/**
 * The four design controls a template can answer for, and the order this
 * module reasons about them in — `LandingOnboardingService::SUPPORT_KEYS`,
 * restated only as the TYPE of the map, never as a copy of its values.
 */
export type TemplateSupport = {
  palette: boolean
  font_pairing: boolean
  tones: boolean
  brand_color: boolean
}

/** Everything on, which is what every template did before 1.1 existed. */
const SUPPORTS_EVERYTHING: TemplateSupport = {
  palette: true, font_pairing: true, tones: true, brand_color: true,
}

/**
 * What the SELECTED template honours, as four bools that are always
 * present.
 *
 * THE ABSENT-KEY DIRECTION IS DELIBERATE AND IT IS THE OPPOSITE OF THE
 * SERVER'S. Server-side, a template row that forgets to declare a control
 * reads as `false`: an author who did not say "yes" has not said yes.
 * Here, a RESPONSE that carries no `supports` at all is an older backend,
 * and the honest answer to "does this build know?" is no — so it falls back
 * to the behaviour that build already had (draw everything) rather than
 * hiding four controls a tenant has been using. The two are different
 * questions: "this template declined" versus "nobody was asked".
 *
 * A key missing from a `supports` map that IS present is a different case
 * again, and takes the server's direction: the row answered, and it did not
 * answer yes.
 */
export function templateSupports(options: TemplateOption[], selectedKey: string): TemplateSupport {
  const supports = options.find(o => o.key === selectedKey)?.supports

  if (supports == null || typeof supports !== 'object') return SUPPORTS_EVERYTHING

  return {
    palette: supports.palette === true,
    font_pairing: supports.font_pairing === true,
    tones: supports.tones === true,
    brand_color: supports.brand_color === true,
  }
}

/**
 * Which section types the selected template can draw, or `null` when this
 * response does not say.
 *
 * Null is not "none": a caller that gates a control on this must leave the
 * control alone rather than hide every block, for the same reason
 * `templateSupports` falls back to "everything" — an older backend has not
 * declined anything, it has simply not been asked.
 */
export function templateRenders(options: TemplateOption[], selectedKey: string): string[] | null {
  const renders = options.find(o => o.key === selectedKey)?.renders

  return Array.isArray(renders) ? renders.filter(id => typeof id === 'string') : null
}

/**
 * Which blocks the selected template draws in a place of its own, and
 * where — an empty map when it pins nothing, which is a real answer
 * (`ruled_page` genuinely renders every band in the tenant's own order).
 *
 * A backend that publishes no such key is the SAME empty map here rather
 * than a null: "this build was not told" and "this design pins nothing"
 * both end in the editor suppressing no controls, which is the behaviour
 * that build already had. `templateRenders` above needs the distinction
 * because its two answers differ (hide the row's body vs. leave it alone);
 * this one does not.
 */
export function templateFixedBlocks(options: TemplateOption[], selectedKey: string): Record<string, string> {
  const fixed = options.find(o => o.key === selectedKey)?.fixed_blocks

  if (fixed == null || typeof fixed !== 'object' || Array.isArray(fixed)) return {}

  const out: Record<string, string> = {}
  for (const [key, placement] of Object.entries(fixed)) {
    if (typeof placement === 'string' && placement !== '') out[key] = placement
  }

  return out
}

/**
 * Which blocks the selected template draws a PHOTOGRAPH in, or `null` when
 * this response does not say (template fidelity 4.5).
 *
 * Null is not "none", for exactly the reason `templateRenders` gives: an
 * older backend has not declined anything, and hiding every photo control on
 * the strength of a key it never sent would be worse than the state that
 * build already shipped.
 */
export function templatePhotoBlocks(options: TemplateOption[], selectedKey: string): string[] | null {
  const blocks = options.find(o => o.key === selectedKey)?.photo_blocks

  return Array.isArray(blocks) ? blocks.filter(id => typeof id === 'string') : null
}

/**
 * Which leaves the selected design draws, per type — template fidelity 5.x.
 *
 * Null when the backend published no such fact, which every reader treats as
 * "no opinion, offer everything": see `content_fields` on `TemplateOption`.
 * A type ABSENT from a map that was published is likewise no opinion — it is
 * a type this design does not render at all, and `renders` has already taken
 * its row off the list.
 *
 * Normalised the way every other served list here is, because this one can
 * REMOVE a control: a malformed entry must collapse to "no opinion" rather
 * than to an empty list, which would blank a card.
 */
export function templateContentFields(
  options: TemplateOption[],
  selectedKey: string,
): Record<string, string[]> | null {
  const map = options.find(o => o.key === selectedKey)?.content_fields

  if (map == null || typeof map !== 'object' || Array.isArray(map)) return null

  const out: Record<string, string[]> = {}

  for (const [typeId, leaves] of Object.entries(map)) {
    if (!Array.isArray(leaves)) continue

    out[typeId] = leaves.filter(leaf => typeof leaf === 'string')
  }

  return out
}

/**
 * The design's own photographs for the selected template, slot → URL — an
 * empty map when it ships none, which is a real answer (The Ruled Page is a
 * typographic design and genuinely has none).
 *
 * A backend that publishes no such key is the SAME empty map, and for the
 * same reason `templateFixedBlocks` collapses its two nulls: "this build was
 * not told" and "this design has none" both end in every photo control
 * saying "Remove photo" and meaning it, which is the behaviour that build
 * already had.
 */
export function templateImageDefaults(options: TemplateOption[], selectedKey: string): Record<string, string> {
  const defaults = options.find(o => o.key === selectedKey)?.image_defaults

  if (defaults == null || typeof defaults !== 'object' || Array.isArray(defaults)) return {}

  const out: Record<string, string> = {}
  for (const [slot, url] of Object.entries(defaults)) {
    if (typeof url === 'string' && url !== '') out[slot] = url
  }

  return out
}

/**
 * The OTHER templates that would draw a block this one will not — so the
 * sentence on a dropped row can name a real way out ("switch to Luma Garden
 * to show it") instead of telling a tenant to go and look.
 *
 * Off the served `renders` for every row, so a third template appears in
 * that sentence with no edit here. A template that publishes no `renders`
 * is not counted: it has not claimed it draws anything, and naming it would
 * be sending somebody to a design that may drop the block too.
 *
 * OFFERABLE ONLY (the final scenario, step 2). A way out has to be a way a
 * tenant can actually take: naming a design the picker no longer lists — and
 * both create endpoints now refuse — would be an instruction that dead-ends
 * in a picker with no such card in it.
 */
export function templatesDrawing(options: TemplateOption[], typeId: string, exceptKey: string): TemplateOption[] {
  return offerableTemplates(options).filter(o =>
    o.key !== exceptKey
    && Array.isArray(o.renders)
    && o.renders.includes(typeId),
  )
}

/**
 * The designs a tenant may actually choose from — every served row that has
 * not been retired from the offer.
 *
 * ABSENT MEANS OFFERABLE, the opposite direction from the server's own
 * default for `supports`, and for the reason `templateSupports` gives about
 * the same asymmetry: server-side a row that did not say yes has not said
 * yes; here a RESPONSE that says nothing at all is an older backend, and the
 * honest fallback is the behaviour that build already had. Withholding every
 * design because a key was missing would leave a tenant with nothing to pick.
 */
export function offerableTemplates(options: TemplateOption[]): TemplateOption[] {
  return options.filter(o => o.offerable !== false)
}

/**
 * WHY A GROUP OF DESIGNS IS BEING SHOWN — a three-word vocabulary the panel
 * turns into a heading, never a sentence computed here.
 *
 *  - `own`   — drawn for this tenant's own trade. Shown first.
 *  - `other` — drawn for another trade, and still theirs to choose.
 *  - `all`   — no trade of their own, so no split would be honest: one list.
 */
export type TemplateGroupKind = 'own' | 'other' | 'all'

export type TemplateGroup = {
  kind: TemplateGroupKind
  cards: TemplateCard[]
}

/**
 * THE DESIGNS ON OFFER, THEIR OWN TRADE'S FIRST — the final scenario's
 * step 1, as data.
 *
 * `vertical` is the SELECTED industry's own, read off
 * `onboarding.industries[*].vertical` at the call site; each design's is read
 * off its own served row. Both ends are served, so no template id and no
 * industry id is ever compared in this file — grep it and there is none. A
 * seventh kit, or a whole new trade, is a change to `LandingOnboardingService`
 * alone.
 *
 * NOBODY IS EVER OFFERED NOTHING. That is the rule this function exists to
 * keep, and it is why the split is "first" rather than "only":
 *
 *  - a tenant whose trade HAS kits sees those three under "made for your
 *    trade", and the rest under "other designs" — because a restaurant owner
 *    who prefers a beauty kit's layout is not wrong, and hiding it would be
 *    the product overruling them;
 *  - a tenant whose trade has NO kits yet (seven industries of the nine —
 *    hotels, clinics, gyms, schools, law firms, agencies and everyone under
 *    "something else") sees every design under ONE neutral heading. A "made
 *    for your trade" heading over an empty group, followed by everything
 *    under "other designs", would tell them the product has nothing for them
 *    — which is both discouraging and untrue: any of the six will render
 *    their words, their photographs and their accent.
 *
 * An empty offer returns no groups at all rather than an empty heading, so
 * the panel can decline to draw a picker rather than draw an empty one.
 */
export function templateGroups(
  options: TemplateOption[],
  selectedKey: string,
  vertical: string | null | undefined,
): TemplateGroup[] {
  const offered = offerableTemplates(options)

  if (offered.length === 0) return []

  if (typeof vertical === 'string' && vertical !== '') {
    const own = offered.filter(o => o.vertical === vertical)

    if (own.length > 0) {
      const other = offered.filter(o => o.vertical !== vertical)

      return [
        { kind: 'own', cards: templateCards(own, selectedKey) },
        ...(other.length > 0 ? [{ kind: 'other' as const, cards: templateCards(other, selectedKey) }] : []),
      ]
    }
  }

  return [{ kind: 'all', cards: templateCards(offered, selectedKey) }]
}

/**
 * WHAT CHANGING DESIGN WOULD DO TO THIS PAGE'S BLOCKS — the final scenario,
 * step 5, as two lists of type ids.
 *
 * A design is a composition, not a skin. Moving a page between two of them
 * changes which of its bands appear at all, and a tenant who is not told that
 * is a tenant who presses Save and finds a band gone with no explanation
 * anywhere on the screen.
 *
 *  - `dropped` — blocks this page HAS, which the design it is on draws and
 *    the new one does not. Their rows and every word in them are kept (the
 *    server's design change is purely additive), which is what the warning
 *    says; they simply stop appearing until the tenant moves back.
 *  - `added` — blocks the new design draws that the current one does not and
 *    this page has no row for. The server seeds exactly these on the save
 *    (`LandingOnboardingService::addMissingSections`), so naming them is a
 *    promise the write actually keeps.
 *
 * "Draws" is `renders` UNION the keys of `fixed_blocks`, the same union the
 * server takes and for the same reason: every kit prints its contact details
 * inside the footer hub and ships no contact partial, so `renders` alone
 * would report `contact` as dropped on every single design change.
 *
 * NO OPINION IS NO WARNING. Where either design publishes no `renders` (an
 * older backend), both lists come back empty rather than guessed — a warning
 * naming the wrong blocks is worse than the plain "this changes your layout"
 * the panel says anyway.
 */
export function designChangeImpact(args: {
  options: TemplateOption[]
  fromKey: string
  toKey: string
  /** The page's own rows as TYPE ids — a `text_1` row is a `text`. */
  rowTypeIds: string[]
}): { dropped: string[]; added: string[] } {
  const drawn = (key: string): Set<string> | null => {
    const renders = templateRenders(args.options, key)

    if (renders === null) return null

    return new Set([...renders, ...Object.keys(templateFixedBlocks(args.options, key))])
  }

  const from = drawn(args.fromKey)
  const to = drawn(args.toKey)

  if (from === null || to === null || args.fromKey === args.toKey) return { dropped: [], added: [] }

  const has = new Set(args.rowTypeIds)

  return {
    dropped: [...has].filter(id => from.has(id) && !to.has(id)),
    added: [...to].filter(id => !from.has(id) && !has.has(id)),
  }
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
 * A choice with one option is not a choice — it is the screen the wizard's
 * own first step used to be, which the first tenant to test it read as
 * broken, correctly. So the picker appears only once there is something to
 * pick BETWEEN.
 *
 * Counted over the OFFER (the final scenario, step 2), not over every served
 * row: a response carrying six designs plus one retired one offers six, and a
 * build where retiring designs left only one on the menu should stop drawing
 * a picker for exactly the reason it always did.
 */
export function showTemplatePicker(options: TemplateOption[]): boolean {
  return offerableTemplates(options).length > 1
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
