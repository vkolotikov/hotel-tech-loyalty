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
import { isOfferable, type SectionMeta } from './sections'

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
  /**
   * The OLD photo question — "draw the one-photo control" — and it is
   * published as `images === 1`, not `images > 0`. A multi-photo type sends
   * `false` here deliberately, because the one-photo control names its slot
   * with the bare section key and the endpoints refuse that spelling for a
   * gallery. See `SectionType::payload()`'s own note. Read `image_slots`
   * instead; this field exists so a bundle that predates galleries degrades
   * to "no photo control" rather than to a button that only ever 422s.
   */
  image: boolean
  /**
   * HOW MANY photos one section of this type holds — 0, 1, or 8 for the
   * gallery. `SectionType::payload()`'s `image_slots`, served for the same
   * reason `limit` is: the editor's photo strip has to know the ceiling to
   * say "6 of 8" and to stop offering an Add at the top of it, and a number
   * this side carried itself would be a second copy of the server's.
   *
   * Optional: a backend that predates galleries publishes no such key, and
   * `fieldsForType` then falls back to `image` — one photo or none, exactly
   * what that build's catalogue means.
   */
  image_slots?: number | null
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

/** One editable control on a section row — the served catalogue's field
 *  list, wearing `FIELD_PRESENTATION`'s opinion about how it should look. */
export type SectionField = {
  name: string
  multiline?: boolean
  type?: string
  maxLength?: number
  /** For `type: 'gallery'` only — how many pictures the strip may hold, off
   *  the served `image_slots`. Never a literal eight: the cap the editor
   *  counts against and the cap the endpoints enforce are one number. */
  slots?: number
}

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
  /** What has to be there before a tenant-added band appears on the page —
   *  `PageContent::count()`'s two arms, named, so the row can say "once you
   *  add some words" for a text block and "once you add a photo" for a
   *  gallery instead of telling a tenant to write copy that would not make
   *  their pictures band render. Always `'words'` for a fixed row, which
   *  never asks. See `writtenBy`. */
  writtenBy: 'words' | 'photos'
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
 * A row present in `pageSections` but naming no type the SERVED catalogue
 * knows, or a fixed row with no matching `availability` entry (a key this
 * build's onboarding response doesn't recognise — should not happen, since
 * both are seeded from the same industry profile, but the wizard applies
 * this same defensiveness to a mismatch it cannot rule out either), is
 * dropped rather than shown with blank copy.
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
    //
    // WHICH ROWS ARE FIXED IS THE SERVED CATALOGUE'S ANSWER (template
    // fidelity 1.3), not a seven-key literal in TypeScript. `SectionType`
    // already publishes `repeatable` per type, and "a fixed band" is
    // exactly "a non-repeatable type named by its own bare id" — the same
    // rule `SectionType::typeOf()` applies server-side. The literal it
    // replaces could only ever recognise the seven keys some industry's
    // `defaultSections` happened to name, so `announcement`, `trust`, `faq`
    // and `footer` — real fixed types the kits draw — were unrecognisable
    // rows this list silently dropped.
    //
    // An EMPTY catalogue therefore yields no rows at all, where the literal
    // used to yield seven. That is the honest degradation rather than a
    // regression: without the catalogue this build knows neither which keys
    // are sections nor what fields any of them edit, so the seven cards it
    // used to draw would now be seven cards with no controls in them. The
    // host (`LandingPages.tsx`) only mounts this screen on a RESOLVED
    // onboarding response, and that response has carried `section_types`
    // since the builder round.
    const fixedType = sectionTypes.find(type => type.id === row.key && !type.repeatable)

    if (fixedType) {
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
        // THE SAME DERIVATION THE INSTANCE ROWS BELOW HAVE ALWAYS USED
        // (template fidelity 1.3, the keystone). The hand-written mirror
        // this replaces had drifted from the catalogue on four types —
        // `hero` was missing its eyebrow, `booking` its two phone-line
        // labels and `contact` its five wording overrides, all of which
        // the shipped partials read and no tenant could fill in — and it
        // was the reason every field a later phase adds would otherwise
        // have needed a frontend release to become visible.
        fields: fieldsForType(fixedType),
        // A fixed row never renders the "not written yet" line, so this is
        // the harmless default rather than a claim about the band.
        writtenBy: 'words',
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
      writtenBy: writtenBy(parsed.type),
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

  return { typeId, index, type, written: instanceIsWritten(key, type, content) }
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
function instanceIsWritten(key: string, type: SectionTypeOption, content?: Record<string, unknown> | null): boolean {
  // A MULTI-PHOTO band is its pictures, so that is what makes it appear —
  // `PageContent::count()`'s `'gallery' =>` arm, which counts the leaves
  // that clear the allowlist and nothing else. A gallery with a caption and
  // no photos does not render, and the row says so.
  if (imageSlotsOf(type) > 1) {
    const section = content != null && typeof content === 'object'
      ? (content as Record<string, unknown>)[key]
      : null

    return gallerySlots(section, key, imageSlotsOf(type)).length > 0
  }

  if (content == null || typeof content !== 'object') return false
  const leaf = (content as Record<string, unknown>)[key]
  if (leaf == null || typeof leaf !== 'object' || Array.isArray(leaf)) return false
  const body = (leaf as Record<string, unknown>).body
  return typeof body === 'string' && body.trim() !== ''
}

/** What has to be there before a tenant-added band appears on the page —
 *  the two arms of `PageContent::count()`, named. Fixed rows never ask. */
export function writtenBy(type: SectionTypeOption): 'words' | 'photos' {
  return imageSlotsOf(type) > 1 ? 'photos' : 'words'
}

/**
 * The controls a band renders, built from the type's OWN catalogue row
 * rather than from a hand-written map.
 *
 * The photo control first when the type takes photos, then the catalogue's
 * `fields` in the order the server listed them — the order the partials
 * themselves read those fields in, so every card reads top-to-bottom the
 * way the band it edits does.
 *
 * Since template fidelity 1.3 this is the ONLY builder of a row's controls,
 * fixed and tenant-added alike. It used to serve the added rows only, with
 * the fixed ones taking a hand-written per-section map — which is how four
 * of the seven fixed cards ended up missing controls their own partials
 * were already reading.
 *
 * WHICH photo control is decided by the served count, not by the type id: a
 * type holding one picture gets `type: 'image'` (the single plate, writing
 * `content.<key>.image_url`) and a type holding more gets `type: 'gallery'`
 * (the strip, writing `content.<key>.image_N`). Those are the only two
 * signals `LandingEditor.tsx`'s field renderer branches on, and a third
 * multi-photo type needs no edit here at all.
 *
 * The photo field is SYNTHESISED here and is never in `fields` on the wire,
 * deliberately: every photo leaf has exactly one writer (the image
 * endpoints) and the plain content save refuses the whole `image_*` family
 * outright — `SectionType::$fields` documents that omission at the source,
 * and this is the frontend half of it.
 *
 * Which fields get a textarea, an email keyboard or a length cap is the one
 * thing the catalogue does not say (it publishes what a partial READS, not
 * how a form should look), so it stays a local editorial choice — see
 * `FIELD_PRESENTATION`, which is now that choice's only home.
 */

/**
 * How many photos a served type holds, from `image_slots` when the backend
 * publishes it and from the legacy `image` bool when it does not.
 *
 * One place, because three call sites want it and each of them getting the
 * fallback slightly differently is how a gallery ends up with a one-photo
 * control on one screen and a strip on another.
 */
export function imageSlotsOf(type: SectionTypeOption): number {
  if (typeof type.image_slots === 'number' && Number.isInteger(type.image_slots) && type.image_slots > 0) {
    return type.image_slots
  }

  return type.image ? 1 : 0
}

export function fieldsForType(type: SectionTypeOption): SectionField[] {
  const slots = imageSlotsOf(type)

  // ONE photo control per row, and which one is decided by the count rather
  // than by the type id: a single plate writes `content.<key>.image_url` and
  // is named by the bare section key, a strip writes `content.<key>.image_N`
  // and names each picture. The two are different controls over different
  // leaves, so a type is offered exactly one of them.
  const photo: SectionField[] =
    slots > 1 ? [{ name: 'gallery', type: 'gallery', slots }]
      : slots === 1 ? [{ name: SINGLE_IMAGE_FIELD, type: 'image' }]
        : []

  return [
    ...photo,
    // The catalogue's own field list, in the order the server sent it, each
    // wearing whatever presentation this screen has an opinion about. The
    // overlay is applied ONLY here, and only to the served names — the two
    // synthesised photo controls above already carry the exact `type` (and,
    // for a strip, the `slots`) their renderer branches on, and letting a
    // by-name overlay speak over those would put two answers on one field.
    ...type.fields.map(name => ({ name, ...(FIELD_PRESENTATION[name] ?? {}) })),
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
 * HOW A FIELD SHOULD LOOK — never WHICH fields exist.
 *
 * This is what is left of `SECTION_CONTENT_FIELDS` after template fidelity
 * 1.3, and the difference is the whole point of that task. That map was
 * keyed by SECTION and listed, by hand, the fields each section's partial
 * reads: a second copy of `App\Landing\SectionType`'s `fields` arrays,
 * written on the far side of the wire, which had already drifted from them
 * on four of the seven sections. `hero.kicker` (the kit's own
 * "Bathing · Bodywork · Rest" eyebrow), `booking.call_label`/`call_short`
 * and `contact`'s five wording overrides are all read by shipped partials
 * and were all unfillable, because this map did not name them.
 *
 * Its own docblock argued that omitting them was deliberate — "a polish
 * surface no worked example in the spec asks for". That reasoning was
 * sound at the time and the owner's instruction ("as close as possible to
 * my templates… all sections") is the worked example it was waiting for.
 *
 * So the LIST is now the served catalogue's, through `fieldsForType()`,
 * exactly as the tenant-added rows have always taken it — and this is the
 * residue: the presentation opinions the catalogue structurally cannot
 * hold, because it publishes what a PARTIAL READS and not how a FORM
 * SHOULD LOOK.
 *
 * KEYED BY FIELD NAME, never by section, and that is load-bearing rather
 * than tidy: `body` means the same thing on `about` as it does on a
 * tenant-added text block, and a per-section key would be the very
 * section-shaped second list this replaced. It also means a field a later
 * phase adds to the catalogue appears in the editor with NO EDIT HERE —
 * which is what makes Phases 3–5's ~45 new fields a backend-only change.
 *
 * `type`/`maxLength` on the contact three mirror
 * `LandingOnboardingController`'s own `contact.email`/`phone`/`address`
 * rules (and, since the phase 3a correctness fix,
 * `LandingPageController::update()`'s identical `content.contact.*` rules)
 * client-side — the same reasoning as the web address input's
 * `maxLength={63}`: stop the obviously-wrong value here rather than
 * round-trip it for a 422. The server-side rule is what actually protects
 * the column; this is only the residual half.
 *
 * `image_url` is here for completeness and is normally unreachable: photo
 * leaves are not in `fields` on the wire at all (they have exactly one
 * writer, the image endpoints, and `update()` refuses the whole `image_*`
 * family), so the plate control is SYNTHESISED by `fieldsForType` and this
 * entry only bites if a future catalogue ever published the leaf as copy.
 */
export const FIELD_PRESENTATION: Record<string, { multiline?: boolean; type?: string; maxLength?: number }> = {
  // Paragraph fields — the ones a partial prints as a block of prose
  // rather than a line. `subtext` joins `body`/`terms` here because every
  // partial that reads it renders a paragraph, and a one-line input for a
  // paragraph is how a tenant learns to write one-line paragraphs.
  body:    { multiline: true },
  terms:   { multiline: true },
  subtext: { multiline: true },

  // App\Landing\ContactDetails' three overridable fields. They bind through
  // the ordinary content mechanism for free — `SectionRow` reads and writes
  // `content[row.key][field.name]`, so a field named `phone` on the
  // `contact` row IS `content.contact.phone` with no new plumbing.
  phone:   { maxLength: 64 },
  email:   { type: 'email', maxLength: 191 },
  address: { maxLength: 191 },

  image_url: { type: 'image' },
}

/** The leaf every SINGLE-photo band stores its picture under —
 *  `SectionType::SINGLE_IMAGE_LEAF`, and the name `fieldsForType`
 *  synthesises its plate control under. Spelled once so the control's name
 *  and `FIELD_PRESENTATION`'s entry for it cannot drift apart. */
const SINGLE_IMAGE_FIELD = 'image_url'

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

/**
 * Whether a content-field name is a PHOTO leaf, and therefore has exactly
 * one writer.
 *
 * `App\Landing\SectionType::isImageField()`, restated — the whole `image_*`
 * family rather than the two spellings this build happens to write, because
 * that is the family `update()` refuses. Anything in it that reached `form`
 * has to be stripped before a save, or the save 422s.
 */
function isImageField(name: string): boolean {
  return name.startsWith('image_')
}

/**
 * The picture leaf a gallery stores its Nth photo under —
 * `SectionType::imageLeaves()`'s multi-photo half, one entry at a time.
 */
export function galleryLeaf(index: number): string {
  return 'image_' + index
}

/** The image endpoints' slot for one gallery picture — `<key>.<leaf>`. */
export function gallerySlotName(sectionKey: string, leaf: string): string {
  return sectionKey + '.' + leaf
}

/** One filled photo in a gallery: which leaf it lives in, how to address it, and what to show. */
export type GalleryPhoto = { leaf: string; slot: string; url: string }

/**
 * A gallery's photos as the strip renders them: leaf order, gaps closed,
 * hostile and non-string leaves absent.
 *
 * `App\Landing\PageContent::galleryImages()`'s answer, re-derived on this
 * side for the same reason `instanceIsWritten` re-derives count()'s
 * predicate: nothing on the wire carries it (the onboarding response
 * structurally cannot — see `buildSectionRows`), and this is what the
 * thumbnails, the count and the remove buttons are all built from.
 *
 * Every url goes through `safeImageUrl`, which mirrors the renderer's own
 * allowlist: `content` is a schemaless column, and a legal-but-unusable leaf
 * handed to `resolveImage()` throws on its unconditional `url.match(...)`
 * and takes the whole editor route down (minor m4's finding, applied here
 * eight leaves at a time).
 *
 * `limit` is the served `image_slots`, never a literal eight: a leaf past
 * the cap is not a picture any endpoint can write or remove, so the strip
 * must not offer a control for one.
 */
export function gallerySlots(section: unknown, sectionKey: string, limit: number): GalleryPhoto[] {
  const fields = sectionFields(section)
  const photos: GalleryPhoto[] = []

  for (let n = 1; n <= limit; n++) {
    const leaf = galleryLeaf(n)
    const url = safeImageUrl(fields[leaf])
    if (url !== null) photos.push({ leaf, slot: gallerySlotName(sectionKey, leaf), url })
  }

  return photos
}

/** One section's field map out of a raw `content` leaf, or `{}` for every
 *  shape that is not one — a bare scalar, an array, null. `content` is a
 *  schemaless column and all three are values it legitimately holds. */
function sectionFields(section: unknown): Record<string, unknown> {
  return section != null && typeof section === 'object' && !Array.isArray(section)
    ? section as Record<string, unknown>
    : {}
}

/**
 * The leaves a gallery has room for, LOWEST FREE FIRST — the client-side
 * twin of `SectionType::nextInstanceKey()`'s allocation rule, and for the
 * same reason: a tenant who adds and removes photos must not burn the
 * namespace, so a gap left by a removal is the next slot filled.
 *
 * `wanted` is how many the tenant just picked. Returning FEWER than that is
 * the cap being reported, not an error: the caller uploads the ones that fit
 * and says plainly why the rest did not.
 *
 * Counts the leaves that are OCCUPIED rather than the ones that are usable:
 * a leaf holding a value `safeImageUrl` rejects is still a leaf an upload
 * would overwrite, and treating it as free would silently destroy it.
 */
export function freeGalleryLeaves(section: unknown, limit: number, wanted: number): string[] {
  const fields = sectionFields(section)
  const free: string[] = []

  for (let n = 1; n <= limit && free.length < wanted; n++) {
    const leaf = galleryLeaf(n)
    if (fields[leaf] === undefined || fields[leaf] === null) free.push(leaf)
  }

  return free
}

/**
 * Fix round 1 (ruling 3b-4), widened for the gallery round: this used to
 * strip the single `image_url` leaf and is now the whole `image_*` family,
 * because that is the family `LandingPageController::update()` refuses.
 *
 * The bug is unchanged in kind and eight times as easy to hit: `form`
 * carries a section's whole content object BY REFERENCE the moment
 * `update()` first clones `page` into it, and `updateContent()`'s spread
 * copies every existing photo leaf along with whichever field the tenant
 * actually meant to change — so editing only a gallery's heading after any
 * photo has been uploaded would put `image_1`…`image_8` on the wire, and
 * D4's refusal is unconditional.
 *
 * This is the one choke point every save and every live-preview render runs
 * `content` through — never applied to `form` at creation (the thumbnails
 * deliberately read the raw query data, never `form`) and never applied
 * inside the photo controls (they never touch `form` at all). Always safe:
 * the server re-hydrates each section's stored photo leaves onto a save that
 * omits them, so stripping here can never lose a picture — only avoid
 * re-sending values the server would refuse outright.
 */
export function stripImageLeaves(content: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (content == null || typeof content !== 'object') return {}

  const out: Record<string, unknown> = {}
  for (const [key, section] of Object.entries(content)) {
    // A non-plain-object section (a bare scalar, the pre-existing
    // "ScalarLeaves" edge case Task 4's own fix round named) has no photo
    // leaf to strip — pass it through exactly as stored rather than
    // inventing an object shape nothing asks for.
    if (section === null || typeof section !== 'object' || Array.isArray(section)) {
      out[key] = section
      continue
    }
    out[key] = Object.fromEntries(
      Object.entries(section as Record<string, unknown>).filter(([field]) => !isImageField(field)),
    )
  }
  return out
}
