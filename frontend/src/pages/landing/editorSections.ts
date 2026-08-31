/**
 * Pure section-list logic for `LandingEditor.tsx` — split out for the same
 * two reasons `sections.ts` and `landingDraft.ts` already are: this repo's
 * vitest is pure-function-only (no jsdom, no React Testing Library — see
 * `vitest.config.ts`'s own docblock), and a `.tsx` file exporting both a
 * component and plain functions breaks Vite Fast Refresh
 * (`react-refresh/only-export-components`, Task 6's report).
 *
 * Two shapes come together here, from two different endpoints, because no
 * single endpoint carries both:
 *  - `GET /v1/admin/landing-pages` (`show`) returns the page's own
 *    `LandingPageSection` rows — `key`, `enabled`, `sort` — the tenant's
 *    actual saved choices.
 *  - `GET /v1/admin/landing-pages/onboarding` returns
 *    `LandingOnboardingService::sections()` — `label`, `source_label`,
 *    `available`, `count` — the SAME resolution (`PageContent`) the
 *    wizard's step 4 reads, gated through the SAME `isOfferable()`
 *    predicate from `./sections`. This build's brief only names `show`,
 *    `update` and the sections endpoint as this screen's interfaces, but
 *    neither of those carries a plain-English label, a source, or an
 *    availability count for any section — only the onboarding response
 *    does, and `LandingPages.tsx` already fetches it (for the wizard
 *    branch) and hands it down here too, rather than this component
 *    issuing a second, duplicate request for the same data.
 */
import { isOfferable, SECTION_ORDER, type SectionKey, type SectionMeta } from './sections'

/** The subset of `LandingPageSection` this editor reads and writes. */
export type PageSection = {
  key: string
  enabled: boolean
  sort: number
  /**
   * The band's colour — one of `App\Landing\SectionType::TONES`' ids, or
   * null.
   *
   * NULL IS A VALUE, not an omission: it means "render this band the way its
   * partial was authored", which is what every row on every page created
   * before this control existed already means. Optional on this type because
   * a response from a backend that predates the column carries no such key
   * at all, which `buildSectionRows` normalises to null.
   */
  tone?: string | null
}

/** The wire shape of one row of `onboarding.sections`. Kept as a separate
 *  copy of `LandingWizard.tsx`'s identically-shaped type rather than a
 *  shared import: each is a straight read of one response, not a layer
 *  other code depends on (same discipline as that file's own
 *  `OnboardingPrefill`/`SectionAvailability`). */
export type SectionAvailability = {
  key: string
  label: string
  source_label: string
  available: boolean
  count: number
  /** See `SectionMeta.reason` in `./sections` -- this is that same field's
   *  wire spelling, carried by every row of this response since Task 4. */
  reason?: string | null
}

/**
 * One row of `onboarding.section_types` — `App\Landing\SectionType::payload()`
 * verbatim, the wire's own spelling.
 *
 * SERVED, NEVER MIRRORED, and that is the whole point of it: which section
 * types exist, which of them a tenant may ADD, what fields each one edits,
 * which ones take a photo, and how many of one kind a page may hold are all
 * facts `SectionType` already holds. A second copy in TypeScript is a copy
 * that can offer a type the add endpoint would then 422 on, or hide one it
 * would have accepted — the identical reasoning `editorCatalog.ts` gives for
 * not mirroring `TEMPLATES`, and `industryChoices.ts` for not mirroring the
 * industry ids.
 *
 * `limit` is `SectionType::MAX_INSTANCES_PER_TYPE` for a repeatable type and
 * `null` for a fixed one — never read as "how many are left", only as the
 * ceiling `addableTypes()` compares a live count against.
 */
export type SectionTypeOption = {
  id: string
  repeatable: boolean
  fields: string[]
  image: boolean
  limit: number | null
  /**
   * Which tone swatch a row of this type shows as chosen while its own
   * `tone` is null — `SectionType::defaultToneFor()`, served.
   *
   * Served rather than derived because the fact behind it is a band
   * modifier class in a stylesheet the admin SPA does not load: `about` is
   * authored `band--paper-2` and `contact` `band--ink`, and the second of
   * those is not a tone at all (the two are the same surface — see the
   * constant's own note). Optional: an older backend publishes no such key,
   * and the picker then lights nothing rather than guessing.
   */
  default_tone?: string | null
}

/** One editable control on a section row — see `SECTION_CONTENT_FIELDS`. */
export type SectionField = { name: string; multiline?: boolean; type?: string; maxLength?: number }

/**
 * One row of the editor's section list.
 *
 * Was `SectionMeta & { enabled, sort }` until the builder round, when a page
 * stopped being a fixed set of one-of-a-kind bands: `key` is now a plain
 * string because `text_1` is a legitimate section key and is not in the
 * `SectionKey` union, and the four fields below it carry what a row needs to
 * know about ITSELF that neither endpoint says in so many words.
 */
export type EditorSectionRow = Omit<SectionMeta, 'key'> & {
  key: string
  enabled: boolean
  sort: number
  /** The catalogue TYPE behind the key — `about` for `about`, `text` for
   *  `text_1`. `SectionType::typeOf()`'s answer, re-derived here through
   *  `parseSectionKey` off the SERVED catalogue rather than a second key
   *  grammar written in TypeScript. */
  typeId: string
  /**
   * False for a tenant-added instance row — the ONLY rows the delete
   * endpoint accepts. The fixed bands are seeded when the page is created
   * and may be switched off, never removed
   * (`LandingPageSectionController::destroy()`'s own refusal), so this is
   * what the row list reads to decide whether to draw a Remove control at
   * all rather than offering one the server would refuse.
   */
  fixed: boolean
  /** 1-based position among the rows of the SAME type, in page order — so
   *  the second text block on the page is 2 whatever its key index happens
   *  to be (keys are allocated lowest-free, so a page can legitimately hold
   *  `text_2` and `text_5` and nothing else). Always 1 for a fixed row. */
  ordinal: number
  /** How many rows of this type the page carries. Always 1 for a fixed row.
   *  Paired with `ordinal` so a row can tell whether it needs to number
   *  itself at all — a lone text block is just "Text block". */
  siblings: number
  /** The controls this row renders, in order. See `fieldsForType`. */
  fields: readonly SectionField[]
  /** This row's stored tone, normalised: a string id or null, never
   *  undefined, so the save always says what it means (see
   *  `buildSectionsPayload`). */
  tone: string | null
  /** The swatch to light when `tone` is null — the served
   *  `section_types[*].default_tone` for this row's TYPE. Null when the
   *  backend published none. */
  defaultTone: string | null
}

/**
 * `page.sections`, in the order they will actually render — by `sort`,
 * tied off by `key` so the result is a pure function of its input even if
 * two rows ever share a `sort` value (a state the backend's own validator
 * permits: `sections.*.sort` only requires `0..999`, not uniqueness).
 */
export function orderedSections(sections: PageSection[]): PageSection[] {
  return [...sections].sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key))
}

/**
 * The one predicate both the wizard's step 4 and this row list read
 * (RULING 4 / `./sections`), applied to the CURRENT page's sections merged
 * with the CURRENT onboarding availability — so a section the tenant
 * emptied out since the page was built (e.g. unfeatured every review since
 * the last save) shows disabled here exactly as it would in the wizard,
 * rather than staying stuck on from whenever it was last enabled.
 *
 * A row present in `pageSections` but absent from `SECTION_ORDER`, or with
 * no matching `availability` entry (a key this build's onboarding response
 * doesn't recognise — should not happen, since both are seeded from the
 * same industry profile, but the wizard applies this same defensiveness to
 * a mismatch it cannot rule out either), is dropped rather than shown with
 * blank copy.
 */
export function buildSectionRows(
  pageSections: PageSection[],
  availability: SectionAvailability[],
  /** `onboarding.section_types`. Absent (a frontend running ahead of a
   *  backend that does not serve the catalogue) simply means no instance
   *  row can be recognised — which is the honest answer, since that same
   *  backend has no add endpoint for one to have come from. */
  sectionTypes: SectionTypeOption[] = [],
  /** The page's `content`, read ONLY to answer whether each tenant-added
   *  band has been written into yet — see `instanceIsWritten`. Fixed rows
   *  take that answer off the wire (`availability`) and ignore this. */
  content?: Record<string, unknown> | null,
): EditorSectionRow[] {
  const ordered = orderedSections(pageSections)

  // Counted over the WHOLE ordered list first, so `siblings` is a fact
  // about the page rather than about how far down the list this row sits.
  const perType = new Map<string, number>()
  for (const row of ordered) {
    const parsed = parseSectionKey(row.key, sectionTypes)
    if (parsed) perType.set(parsed.typeId, (perType.get(parsed.typeId) ?? 0) + 1)
  }

  const seen = new Map<string, number>()

  return ordered.flatMap((row): EditorSectionRow[] => {
    // A FIXED band: the onboarding response is the authority on what it is
    // called and whether it has anything to show, exactly as before —
    // `label`, `source_label`, `available`, `count` and `reason` all come
    // from `LandingOnboardingService::sections()`, which is the same
    // `PageContent` resolution the wizard's step 4 reads (RULING 4).
    if ((SECTION_ORDER as readonly string[]).includes(row.key)) {
      const meta = availability.find(a => a.key === row.key)
      if (!meta) return []
      return [{
        key: row.key,
        label: meta.label,
        sourceLabel: meta.source_label,
        available: meta.available,
        count: meta.count,
        reason: meta.reason ?? null,
        enabled: row.enabled,
        sort: row.sort,
        typeId: row.key,
        fixed: true,
        ordinal: 1,
        siblings: 1,
        fields: SECTION_CONTENT_FIELDS[row.key as SectionKey],
        tone: normaliseTone(row.tone),
        // A fixed key IS its type id, so the catalogue lookup is direct.
        defaultTone: defaultToneOf(row.key, sectionTypes),
      }]
    }

    // A TENANT-ADDED band. The onboarding response says nothing about it and
    // never will: `sections()` maps over the INDUSTRY PROFILE's
    // `defaultSections`, which is a list of the bands a new page in that
    // industry is created with — a question that has no answer for a band
    // the tenant added afterwards. So everything a fixed row reads off the
    // wire is derived here instead:
    //
    //  - the LABEL and the source line are the editor's own i18n copy (the
    //    component supplies them; see `instanceRowLabel`). Nothing is being
    //    described in two places by doing that — the wizard cannot offer a
    //    text block at all, so there is no second describer to disagree
    //    with, which is the actual thing RULING 4 protects.
    //  - `available`/`count` are `PageContent::count('text_N')`'s own
    //    predicate, re-derived: a text band renders iff its BODY is filled
    //    (see that method's `'text' =>` arm). The renderer already refuses
    //    to publish a headed band over blank space, so the editor says so
    //    rather than letting the tenant discover it from a preview that
    //    never changes.
    const parsed = parseSectionKey(row.key, sectionTypes, content)
    // Neither a fixed key nor a legal instance key: dropped rather than
    // shown with blank copy, the same defensiveness this function has
    // always applied to a key it does not recognise.
    if (!parsed) return []

    const ordinal = (seen.get(parsed.typeId) ?? 0) + 1
    seen.set(parsed.typeId, ordinal)

    return [{
      key: row.key,
      // Supplied by the component from i18n — see `SectionRow`. Left empty
      // rather than invented here because this module is deliberately
      // free of react-i18next (vitest is node-env, pure-function only).
      label: '',
      sourceLabel: '',
      available: parsed.written,
      count: parsed.written ? 1 : 0,
      reason: null,
      enabled: row.enabled,
      sort: row.sort,
      typeId: parsed.typeId,
      fixed: false,
      ordinal,
      siblings: perType.get(parsed.typeId) ?? 1,
      fields: fieldsForType(parsed.type),
      tone: normaliseTone(row.tone),
      // Off the TYPE (`text`), never the key (`text_1`) — every instance of
      // a repeatable type shares one authored surface, exactly as they
      // share one partial.
      defaultTone: normaliseTone(parsed.type.default_tone),
    }]
  })
}

/** A stored tone as the rest of this module wants it: a non-empty string, or
 *  null. Covers the three ways a row can fail to carry one — the key absent
 *  (a backend that predates the column), an explicit null, and a non-string
 *  leaf out of the raw JSON. */
function normaliseTone(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** The served default tone for a type id, or null when the catalogue does
 *  not name it. */
function defaultToneOf(typeId: string, sectionTypes: SectionTypeOption[]): string | null {
  return normaliseTone(sectionTypes.find(type => type.id === typeId)?.default_tone)
}

/**
 * THE KEY GRAMMAR, and the one place this side of the wire spells it:
 * `App\Landing\SectionType::typeOf()`'s rule, read off the SERVED catalogue.
 *
 * A repeatable type's instances are `<id>_<n>`, n from 1 to that type's own
 * published `limit`, no leading zero — so `text_1` resolves and `text`,
 * `text_0`, `text_01` and `text_7` do not, exactly as the server decides.
 * The bound comes from `limit` rather than a literal six, and the type list
 * from `sectionTypes` rather than a literal `['text']`, so a second
 * repeatable type (or a raised cap) needs no release on this side at all.
 *
 * `written` is deliberately NOT part of the grammar — it is folded in here
 * only because every caller that parses a key also wants it, and it needs
 * the page's content to answer. Callers that have no content pass none and
 * get `false`, which no caller reads as a claim about the key's validity.
 */
export function parseSectionKey(
  key: string,
  sectionTypes: SectionTypeOption[],
  content?: Record<string, unknown> | null,
): { typeId: string; index: number; type: SectionTypeOption; written: boolean } | null {
  const match = /^([a-z][a-z0-9_]*)_([1-9][0-9]*)$/.exec(key)
  if (!match) return null

  const [, typeId, digits] = match
  const type = sectionTypes.find(o => o.id === typeId)
  if (!type || !type.repeatable) return null

  const index = Number(digits)
  if (type.limit != null && index > type.limit) return null

  return { typeId, index, type, written: instanceIsWritten(key, content) }
}

/**
 * Whether a tenant-added band would actually appear on the page —
 * `App\Landing\PageContent::count()`'s `'text' =>` arm, restated: a filled
 * BODY, and nothing else. An eyebrow, a heading or a photo with no body is a
 * fragment rather than a section, and the renderer omits it.
 *
 * Restated rather than served because `onboarding.sections` structurally
 * cannot carry it (see `buildSectionRows`), and this is the one fact the
 * editor would otherwise be silently wrong about — a tenant who adds a
 * block, uploads a photo, and sees nothing change in the preview has been
 * told nothing at all about why.
 */
function instanceIsWritten(key: string, content?: Record<string, unknown> | null): boolean {
  if (content == null || typeof content !== 'object') return false
  const leaf = (content as Record<string, unknown>)[key]
  if (leaf == null || typeof leaf !== 'object' || Array.isArray(leaf)) return false
  const body = (leaf as Record<string, unknown>).body
  return typeof body === 'string' && body.trim() !== ''
}

/**
 * The controls a tenant-added band renders, built from the type's OWN
 * catalogue row rather than from a hand-written map.
 *
 * `image_url` first when the type takes a photo, then the catalogue's
 * `fields` in the order the server listed them — which is the order
 * `SECTION_CONTENT_FIELDS` already puts `hero` and `about` in, so a text
 * block's card reads like the two cards above it rather than like a
 * different screen.
 *
 * The photo field is SYNTHESISED here and is never in `fields` on the wire,
 * deliberately: `image_url` has exactly one writer (the image endpoints) and
 * the plain content save refuses the key outright — `SectionType::$fields`
 * documents that omission at the source, and this is the frontend half of
 * it. `type: 'image'` is the one signal `LandingEditor.tsx`'s field renderer
 * branches on.
 *
 * Which fields get a textarea is the one thing the catalogue does not say
 * (it publishes what a partial READS, not how a form should look), so it
 * stays a local editorial choice — the same one `SECTION_CONTENT_FIELDS`
 * already makes for `about.body` and `booking.terms`.
 */
const MULTILINE_FIELDS: ReadonlySet<string> = new Set(['body', 'terms'])

export function fieldsForType(type: SectionTypeOption): SectionField[] {
  return [
    ...(type.image ? [{ name: 'image_url', type: 'image' }] : []),
    ...type.fields.map(name => (MULTILINE_FIELDS.has(name) ? { name, multiline: true } : { name })),
  ]
}

/**
 * Swap a section with its neighbour in the CURRENT order and renumber
 * every row's `sort` to a clean `0..n-1` sequence — never a raw swap of
 * two `sort` values, which would drift out of a clean sequence after a
 * few moves and make the NEXT move's neighbour lookup (which reads
 * `sort`, not array position) land on the wrong row. A move off either
 * end is a no-op: there is nothing to swap the first row up into, or the
 * last row down into.
 */
export function moveSection(sections: PageSection[], key: string, direction: 'up' | 'down'): PageSection[] {
  const ordered = orderedSections(sections)
  const i = ordered.findIndex(s => s.key === key)
  if (i === -1) return sections

  const j = direction === 'up' ? i - 1 : i + 1
  if (j < 0 || j >= ordered.length) return sections

  const next = [...ordered]
  const swap = next[i]
  next[i] = next[j]
  next[j] = swap

  return next.map((s, idx) => ({ ...s, sort: idx }))
}

/**
 * Drop one section at a position — the drag half of the same operation
 * `moveSection` is the keyboard half of, and it renumbers `0..n-1` the same
 * way and for the same reason.
 *
 * `toIndex` is where the row should END UP in the visible list, and it is
 * applied by REMOVING the row first and inserting into what is left. That is
 * what makes a drop read the way the cursor promised in both directions
 * without the caller having to compensate: dragging row 1 onto row 4 leaves
 * it after the row that was 4th (everything above closed up behind it), and
 * dragging row 4 onto row 1 leaves it above the row that was 1st.
 *
 * Out-of-range indices are clamped rather than refused: a drop can land on
 * the list's padding, and the nearest legal position is what the tenant was
 * plainly aiming at. Dropping a row on itself is a genuine no-op and returns
 * the input array untouched, so a mis-click never flips `dirty` and never
 * announces a move that did not happen.
 */
export function moveSectionTo(sections: PageSection[], key: string, toIndex: number): PageSection[] {
  const ordered = orderedSections(sections)
  const from = ordered.findIndex(s => s.key === key)
  if (from === -1) return sections

  const to = Math.max(0, Math.min(ordered.length - 1, toIndex))
  if (to === from) return sections

  const next = [...ordered]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)

  return next.map((s, idx) => ({ ...s, sort: idx }))
}

/** Where a key sits in the ordered list, or -1. The one thing an
 *  announcement ("moved to position 3 of 8") and a drop target both need,
 *  asked of the ordered list rather than of raw `sort` values. */
export function sectionIndex(sections: PageSection[], key: string): number {
  return orderedSections(sections).findIndex(s => s.key === key)
}

/**
 * Drop one section ONTO ANOTHER — the form every caller in the UI actually
 * wants, and the only one that stays correct when the rendered list is
 * shorter than the page.
 *
 * `moveSectionTo` counts positions in the FULL ordered list; the editor
 * renders `buildSectionRows`' output, which can legitimately be shorter. A
 * page keeps its `booking` row after its industry is switched to one whose
 * profile has no booking band, for instance — the row is still there, still
 * sorted, and simply not drawn. Handing that screen's array index to
 * `moveSectionTo` would then move the dragged row to the wrong place, off by
 * however many rows above it are hidden.
 *
 * Naming the TARGET instead is immune to all of it: "put this one where that
 * one is" means the same thing in both lists, and the undrawn rows keep
 * their relative places around the result.
 */
export function moveSectionToKey(sections: PageSection[], key: string, targetKey: string): PageSection[] {
  const to = sectionIndex(sections, targetKey)

  return to === -1 ? sections : moveSectionTo(sections, key, to)
}

/**
 * Put a newly created row into the working copy at the bottom of the page,
 * matching where `LandingPageSectionController::store()` has already put it
 * server-side (`max(sort) + 1`, clamped to the 0..999 window `update()`
 * validates).
 *
 * The row is APPENDED locally rather than taken from the response's page,
 * on purpose: the tenant may be sitting on unsaved reorder edits whose
 * `sort` values no longer match the server's at all, and adopting a server
 * `sort` computed against a different sequence would drop the new band into
 * the middle of their arrangement. Appending is the one placement that is
 * right under both sequences, and the next save writes the whole order back
 * anyway.
 */
export function appendSection(sections: PageSection[], key: string): PageSection[] {
  const highest = sections.reduce((max, s) => Math.max(max, s.sort), -1)

  // `tone: null` explicitly, matching what `store()` just inserted: a new
  // band arrives on its type's authored colour, and the picker lights that
  // swatch rather than nothing until the tenant chooses.
  return [...sections, { key, enabled: true, sort: Math.min(999, highest + 1), tone: null }]
}

/** Drop a row the server has already deleted. No renumbering: the gap it
 *  leaves in the `sort` sequence changes nothing about the ORDER, and
 *  renumbering here would queue a spurious diff for every remaining row on
 *  a page the tenant has not otherwise touched. */
export function removeSection(sections: PageSection[], key: string): PageSection[] {
  return sections.filter(s => s.key !== key)
}

/**
 * Drop a deleted section's copy out of the working `content`.
 *
 * `destroy()` unsets `content.<key>` server-side, but the editor's own
 * unsaved `form.content` can still be holding a clone of it from before the
 * removal — and `PUT /v1/admin/landing-pages` replaces `content` WHOLESALE,
 * so the next save would write the dead leaf straight back. Harmless to the
 * renderer (which never reads content without a row) and not harmless at
 * all to the tenant: keys are allocated lowest-free, so the very next text
 * block they add would inherit the words they just deleted.
 */
export function removeSectionContent(
  content: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> {
  if (content == null || typeof content !== 'object') return {}

  const out = { ...content }
  delete out[key]

  return out
}

/** What one entry of the "Add a section" control needs, with nothing left
 *  for the component to derive — the same shape-per-card discipline
 *  `editorCatalog.ts`'s `templateCards()` follows. */
export type AddableType = {
  id: string
  /** How many of this type the page already carries, and the ceiling. */
  used: number
  limit: number
  /** null when the button is live. Otherwise WHICH refusal applies, so the
   *  component can render the matching sentence rather than this module
   *  carrying English (or five translations of it). */
  disabledReason: 'type_limit' | 'page_full' | null
  /** The page cap, carried so the 'page_full' sentence can name the real
   *  number rather than a copy of a server constant. */
  pageLimit: number | null
}

/**
 * The types a tenant may add, and why any of them is greyed out.
 *
 * Both caps are the SERVER'S, read off the wire — the per-type `limit` from
 * `section_types`, the page cap from `onboarding.max_sections` — never
 * copies of `SectionType::MAX_INSTANCES_PER_TYPE`/`MAX_SECTIONS_PER_PAGE`
 * written out again in TypeScript. A greyed-out button explaining a limit
 * this build believes in and the server does not is worse than no button.
 *
 * Counted over the RAW page rows, never over `buildSectionRows`' output:
 * `store()` counts rows, and a row this build failed to recognise still
 * occupies a place on the page. Counting the rendered list instead would let
 * the editor offer an add the server then refuses, which is the exact
 * disagreement serving the catalogue exists to prevent.
 *
 * `pageLimit` unknown (a backend that does not publish it) drops the
 * page-cap gate rather than guessing a number: the add still goes to the
 * server, which refuses it with its own already-friendly sentence.
 */
export function addableTypes(
  sectionTypes: SectionTypeOption[],
  pageSections: PageSection[],
  pageLimit: number | null,
): AddableType[] {
  const full = pageLimit != null && pageSections.length >= pageLimit

  return sectionTypes
    .filter(type => type.repeatable)
    .map(type => {
      const limit = type.limit ?? 0
      const used = pageSections.filter(s => parseSectionKey(s.key, sectionTypes)?.typeId === type.id).length

      return {
        id: type.id,
        used,
        limit,
        // The per-type cap is named FIRST when both apply: it is the more
        // specific of the two answers, and it is the one whose fix ("remove
        // one of these") is the thing the tenant is already looking at.
        disabledReason: used >= limit ? 'type_limit' : full ? 'page_full' : null,
        pageLimit,
      } satisfies AddableType
    })
}

/**
 * What a tenant-added row is called in the list.
 *
 * A lone block is just its type's name — numbering one of anything is noise.
 * From two upward each is numbered by its POSITION on the page, never by its
 * key index: keys are allocated lowest-free server-side, so a page can
 * honestly hold `text_2` and `text_5` and nothing else, and calling those
 * "Text block 2" and "Text block 5" would be showing a tenant an internal
 * allocation as if it meant something.
 */
export function instanceRowLabel(typeName: string, ordinal: number, siblings: number): string {
  return siblings > 1 ? `${typeName} ${ordinal}` : typeName
}

/** Flip one section's `enabled` flag. Every other row, and this row's own
 *  position, is untouched — reordering and enabling are independent
 *  actions on independent fields. */
export function toggleSection(sections: PageSection[], key: string): PageSection[] {
  return sections.map(s => (s.key === key ? { ...s, enabled: !s.enabled } : s))
}

/**
 * Put one section on a colour. Every other row, and this row's own position
 * and enabled flag, is untouched — same discipline as `toggleSection` above,
 * and for the same reason: colour, order and visibility are three
 * independent choices about one band.
 *
 * `null` is a legitimate argument, not a way of saying "leave it": it puts
 * the band back on the colour its partial was authored with (the server
 * clears the column; `SectionType::bandClass()` then falls through to the
 * authored class). Nothing here writes an id it has not been handed — the
 * caller passes a tone the SERVED list offered, and the endpoint refuses
 * anything else.
 */
export function setSectionTone(sections: PageSection[], key: string, tone: string | null): PageSection[] {
  return sections.map(s => (s.key === key ? { ...s, tone } : s))
}

/**
 * The exact wire body `PUT /v1/admin/landing-pages/sections` accepts.
 *
 * Takes `EditorSectionRow[]` — the ALREADY-MERGED rows `buildSectionRows`
 * produces — rather than raw `PageSection[]`, so this is the one place the
 * `isOfferable` gate is applied to an outgoing save, exactly mirroring
 * `landingDraft.ts`'s `buildPayload()` for the wizard's apply call: a
 * toggle this build renders forced-off and disabled must not be able to
 * reach the server as `enabled: true` off a stale value sitting in the
 * working state (the tenant enabled Reviews when it had four, then
 * unfeatured all four without ever touching the toggle again) — RULING 4
 * exists so the wizard and the editor cannot disagree about which
 * sections are real, and a save that let a disabled row's leftover `true`
 * through would create exactly that disagreement.
 */
export function buildSectionsPayload(
  rows: EditorSectionRow[],
): { key: string; enabled: boolean; sort: number; tone: string | null }[] {
  return rows.map(row => ({
    key: row.key,
    enabled: isOfferable(row) ? row.enabled : false,
    sort: row.sort,
    // ALWAYS SENT, and always as a string or an explicit null — never
    // omitted and never `undefined`. `update()` server-side distinguishes an
    // absent `tone` ("this caller does not deal in colours; leave what is
    // stored alone") from an explicit null ("put this band back to its own
    // colour"), and this editor is the second: it renders the tenant's whole
    // section list from the saved rows, so what it sends IS the intended
    // state of every row it names. Sending `undefined` would silently take
    // the first path — JSON.stringify drops the key — and the "reset to the
    // page's own colour" swatch would appear to do nothing.
    tone: row.tone,
  }))
}

/**
 * The inline copy fields each section's Blade partial actually reads off
 * `$page->content[key]` — see
 * `resources/views/landing/ruled_page/sections/*.blade.php`. Not every
 * field every partial *could* read: `contact.blade.php` also honours
 * `address_label`/`phone_label`/`email_label`/`closed_label`/`map_label`
 * overrides, and `booking.blade.php` a `call_label`/`call_short` — those
 * are secondary label overrides with a sensible built-in default already,
 * and are left for a later pass rather than widening this one screen's
 * surface for a polish case no worked example in the spec asks for.
 * `services`/`team`/`reviews` are data-backed (RULING 4); their copy
 * fields are only ever shown once the section is actually offerable, same
 * as the toggle itself.
 *
 * Task 2: `contact`'s `phone`/`email`/`address` are NOT a fourth kind of
 * label override like the ones the paragraph above sets aside — they are
 * `App\Landing\ContactDetails`'s own three overridable fields, and they
 * bind through this exact mechanism (`content.contact.phone`, etc.) for
 * free: `SectionRow` already reads/writes `content[row.key][field.name]`,
 * so a section-content field named `phone` on the `contact` row IS
 * `content.contact.phone` with no new plumbing. Left in the same order
 * `ContactDetails`'s constructor and the wizard's own step 2 use.
 *
 * `type`/`maxLength` mirror `LandingOnboardingController`'s own
 * `contact.email`/`contact.phone`/`contact.address` rules (and, since the
 * phase 3a correctness fix, `LandingPageController::update()`'s identical
 * `content.contact.*` rules) client-side — the same reasoning as the web
 * address input's `maxLength={63}` a few lines below this file's sibling
 * component: stop the obviously-wrong value here rather than round-trip it
 * to the server for a 422. The server-side rule is what actually protects
 * the column; this is only the residual "catch it before the network
 * round-trip" half.
 *
 * Task 6: `hero` and `about` each also carry an `image_url` field with
 * `type: 'image'` — the one signal `LandingEditor.tsx`'s field renderer
 * needs to branch to the photo control instead of a text input/textarea.
 * Unlike every other field here, `image_url` is NOT a `content[key]` leaf
 * this screen ever reads or writes through the ordinary save path: Task 4's
 * `POST/DELETE .../image` endpoints are its one and only writer (D4), and
 * the server refuses the key outright on the plain `update()` route — this
 * descriptor exists purely so the row list still renders a control for it,
 * never so it flows through `updateContent`/`form`.
 *
 * Builder round: the FIXED rows still read this map rather than the served
 * `section_types` catalogue, and that is deliberate rather than an oversight
 * about mirroring. The catalogue publishes every field a partial reads —
 * including `contact`'s five label overrides and `booking`'s two, which the
 * paragraph above sets aside ON PURPOSE as a polish surface no worked
 * example asks for. Deriving the fixed rows from it would silently widen
 * seven cards by nine controls. The TENANT-ADDED rows have no such curated
 * history to preserve and are derived straight from the catalogue
 * (`fieldsForType`), which is where "do not mirror the server's list"
 * actually bites: a second repeatable type appears with its own fields, and
 * its own photo control, with no release on this side.
 */
export const SECTION_CONTENT_FIELDS: Record<SectionKey, readonly SectionField[]> = {
  hero:     [{ name: 'image_url', type: 'image' }, { name: 'headline' }, { name: 'subtext' }],
  services: [{ name: 'kicker' }, { name: 'heading' }, { name: 'subtext' }],
  about:    [{ name: 'image_url', type: 'image' }, { name: 'kicker' }, { name: 'lead' }, { name: 'body', multiline: true }],
  team:     [{ name: 'kicker' }, { name: 'heading' }, { name: 'subtext' }],
  reviews:  [{ name: 'kicker' }],
  booking:  [{ name: 'kicker' }, { name: 'heading' }, { name: 'terms', multiline: true }],
  contact:  [
    { name: 'kicker' },
    { name: 'phone', maxLength: 64 },
    { name: 'email', type: 'email', maxLength: 191 },
    { name: 'address', maxLength: 191 },
  ],
}

/**
 * Fix round 1 (ruling 3b-4), the Critical this round's review reproduced:
 * `LandingEditor.tsx`'s `form` carries a section's whole content object BY
 * REFERENCE the moment `update()` first clones `page` into it, and
 * `updateContent()`'s spread (`{ ...(f.content?.[sectionKey] ?? {}), … }`)
 * copies that section's EXISTING `image_url` leaf right along with
 * whichever field the tenant actually meant to change — so editing only
 * `hero.headline` after a photo has ever been uploaded still puts
 * `image_url` on the wire. `LandingPageController::update()`'s D4 refusal
 * is unconditional (any `content.*.image_url` key 422s, regardless of
 * value), so that save would fail outright.
 *
 * This is the one choke point `saveMut.mutationFn` runs every save's
 * `content` through before the PUT — never applied to `form` at creation
 * (the thumbnail deliberately reads `page.content`, the raw query data,
 * never `form`; scrubbing `form` itself would be a second, redundant place
 * this same guarantee could drift) and never applied inside `ImageField`'s
 * own upload/remove calls (they never touch `form` at all). Always safe:
 * the server re-hydrates each section's stored `image_url` onto a save
 * that omits it (Task 4's own amendment), so stripping it here can never
 * lose a photo — only avoid re-sending a value the server would refuse
 * outright.
 */
/**
 * Minor m4: `LandingEditor.tsx`'s row list reads `imageUrl` straight off the
 * QUERY's raw `page.content[row.key].image_url` (the thumbnail's own
 * comment explains why it must be the raw query, never `form`) — and this
 * feature's whole standing threat model, all through Task 4/6, has been
 * that `content` is a schemaless JSON column a pre-existing row, a raw
 * import, or a hand-edit can leave in a shape `ScalarLeaves`'s depth-2
 * check permits (any SCALAR is a legal leaf) but that is not actually a
 * usable image URL — a number, a boolean, an empty string. `ImageField`
 * hands that value straight to `resolveImage()`, which calls
 * `url.match(...)` unconditionally: a truthy non-string leaf throws a
 * TypeError there and takes the whole editor route down with it.
 *
 * Mirrors `App\Landing\PageContent::imageUrl()`'s own allowlist exactly —
 * same two accepted prefixes, same rejection of anything else — so the
 * admin screen and the public renderer agree on what a "real" image_url
 * looks like. Deliberately narrower than `resolveImage()` itself: this is
 * the one gate that decides whether a value is safe to hand `resolveImage()`
 * at all, not a second implementation of what it does with a safe one.
 */
export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  return /^(https?:\/\/|\/storage\/)/.test(value) ? value : null
}

export function stripImageUrlLeaves(content: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (content == null || typeof content !== 'object') return {}

  const out: Record<string, unknown> = {}
  for (const [key, section] of Object.entries(content)) {
    // A non-plain-object section (a bare scalar, the pre-existing
    // "ScalarLeaves" edge case Task 4's own fix round named) has no
    // `image_url` key to strip — pass it through exactly as stored rather
    // than inventing an object shape nothing asks for.
    if (section === null || typeof section !== 'object' || Array.isArray(section)) {
      out[key] = section
      continue
    }
    const copy = { ...(section as Record<string, unknown>) }
    delete copy.image_url
    out[key] = copy
  }
  return out
}
