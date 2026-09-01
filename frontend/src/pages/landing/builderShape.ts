/**
 * THE SHAPE OF THE BUILDER — template fidelity phase 2, as pure functions.
 *
 * The survey that opened this phase measured the screen it replaces: about
 * a hundred always-visible controls down one four-thousand-pixel column,
 * with the live preview parked at the bottom of it on any viewport under
 * 1280px. Phase 1 deleted the controls that did nothing. This module holds
 * the decisions that give what is left a shape — which tab a row belongs
 * to, which card is open, which rows a filter is showing, what one line a
 * collapsed card says about itself, and which of its controls this design
 * would honour if the tenant pressed them.
 *
 * ALL OF IT IS DATA, NONE OF IT IS REACT, and that is not tidiness: this
 * repo's vitest is node-env with no jsdom and no React Testing Library (see
 * `vitest.config.ts`), so a decision made inside a component is a decision
 * no test in this repository can reach. Every rule below is therefore a
 * function `LandingEditor.tsx` calls rather than a condition it contains,
 * and `builderShape.test.ts` is where the rules are actually proven.
 *
 * NOTHING HERE COMPARES A TEMPLATE ID. Which blocks a design draws, and
 * which of them it pins in a place of its own, are SERVED facts
 * (`templates[*].renders`, `templates[*].fixed_blocks` — see
 * `editorCatalog.ts`). `if (templateKey === 'nocturne_ritual')` on this side
 * of the wire would be a second statement of something only the layout can
 * know, and the third template would silently inherit the second one's
 * answers.
 */
import { sectionGroup, type SectionGroup } from './sections'
import type { EditorSectionRow } from './editorSections'

// ─── 2.1 — three tabs ───────────────────────────────────────────────────

/**
 * The three questions a tenant arrives with, in the order they arrive in
 * them: what does my page SAY, what does it LOOK like, and can the public
 * see it.
 *
 * `content` is the default because it is the one every tenant returns for:
 * the design is chosen once and publishing is pressed once, but the words
 * and the photographs are why anyone opens this screen a second time.
 */
export type BuilderTab = 'content' | 'design' | 'publish'

export const BUILDER_TABS: readonly BuilderTab[] = ['content', 'design', 'publish']

export const DEFAULT_BUILDER_TAB: BuilderTab = 'content'

/**
 * Which tab a `?tab=` value names.
 *
 * The value comes from the URL, so it is whatever anybody typed, pasted or
 * bookmarked from an older build: anything this build does not recognise
 * lands on the default rather than on a blank column. The reverse direction
 * (writing the param) is the component's, through the same list.
 */
export function resolveBuilderTab(param: string | null | undefined): BuilderTab {
  return BUILDER_TABS.includes(param as BuilderTab) ? (param as BuilderTab) : DEFAULT_BUILDER_TAB
}

// ─── 2.2 — one card open at a time ──────────────────────────────────────

/**
 * SINGLE-EXPAND, and the reason is the preview beside it: the card being
 * edited and the pane showing the result must have one subject between
 * them. Two open cards and the pane can only be about one of them, which is
 * how a tenant ends up typing into the Services card while watching the
 * hero.
 *
 * Pressing the open card's own header closes it — a card can be closed, so
 * "nothing is open" is a state, not an accident.
 */
export function nextExpanded(current: string | null, key: string): string | null {
  return current === key ? null : key
}

/**
 * Keeps the open card inside the list that is actually on screen.
 *
 * A filter (2.3), a removed band, or a template change can all take the
 * open row out of the rendered list — and an `expanded` key pointing at a
 * row nobody can see is a card that reopens by itself the moment the filter
 * is cleared, over a subject the tenant has long since left.
 */
export function expandedWithin(expanded: string | null, visibleKeys: readonly string[]): string | null {
  return expanded !== null && visibleKeys.includes(expanded) ? expanded : null
}

// ─── 2.3 — badges and filter chips, never a regrouped list ──────────────

/**
 * The four chips, in the order they are drawn.
 *
 * A FILTER, EMPHATICALLY NOT A REGROUPING. The list's vertical order IS the
 * page's vertical order — that is the whole meaning of the drag handle, the
 * arrows and the sentence above them — so splitting it into "blocks you
 * write" and "blocks from your workspace" would make the list lie about the
 * page and make a cross-group drag either impossible or meaningless. A chip
 * hides rows; it never moves one, and while one is active the reorder
 * affordances are withdrawn and say why (see `reorderableUnderFilter`).
 */
export type SectionFilter = 'all' | 'write' | 'photos' | 'workspace'

export const SECTION_FILTERS: readonly SectionFilter[] = ['all', 'write', 'photos', 'workspace']

/** What a row needs to carry to be filtered, badged or summarised. The
 *  editor hands whole `EditorSectionRow`s; the tests hand the fields the
 *  rule actually reads, which is also what documents that it reads no
 *  others. */
export type ShapedRow = Pick<EditorSectionRow,
  'key' | 'typeId' | 'fields' | 'enabled' | 'available' | 'count' | 'fixed' | 'writtenBy' | 'sourceLabel'>

/**
 * Does this row put a picture on the page?
 *
 * ANY photo control, single plate or gallery strip, off the row's own
 * synthesised field list (`fieldsForType`) — so the three slots Phase 4
 * adds to `services`, `team` and `booking` join the Photos chip with no
 * edit here, which is the whole reason this asks the fields rather than the
 * key.
 *
 * Deliberately WIDER than `sectionGroup(row) === 'photos'`. That answers
 * "what is this band made of" and is what the badge prints; a hero is a
 * words-led band and its badge should say so. This answers "is one of my
 * pictures in here", and the answer for a hero is yes — the chip is the
 * "all the pictures on my page" screen the owner asked for, built out of
 * the same cards rather than a second editor.
 */
export function rowHasPhotos(row: Pick<ShapedRow, 'fields'>): boolean {
  return row.fields.some(field => field.type === 'image' || field.type === 'gallery')
}

/** The badge a card wears — one answer, off `sectionGroup`. */
export function rowGroup(row: Pick<ShapedRow, 'key' | 'writtenBy'>): SectionGroup {
  return sectionGroup(row)
}

/**
 * Whether a chip shows a row.
 *
 * `all` is everything. `write` and `workspace` are `sectionGroup`'s own
 * answers. `photos` is the wide question above, which is why a hero appears
 * under both Words and Photos: it genuinely holds both, and a tenant who
 * came to swap the hero photograph must find it under Photos.
 */
export function matchesFilter(row: ShapedRow, filter: SectionFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'photos') return rowHasPhotos(row)

  return rowGroup(row) === filter
}

/** How many rows each chip would show. Rendered on the chip, so a chip that
 *  would show nothing can be disabled with its number visible rather than
 *  vanishing — a control that disappears is a control a tenant looks for. */
export function filterCounts(rows: readonly ShapedRow[]): Record<SectionFilter, number> {
  return {
    all: rows.length,
    write: rows.filter(r => matchesFilter(r, 'write')).length,
    photos: rows.filter(r => matchesFilter(r, 'photos')).length,
    workspace: rows.filter(r => matchesFilter(r, 'workspace')).length,
  }
}

/** The rows a chip leaves on screen, IN PAGE ORDER — never re-sorted. The
 *  filter subtracts; it has no opinion about sequence. */
export function visibleRows<T extends ShapedRow>(rows: readonly T[], filter: SectionFilter): T[] {
  return rows.filter(row => matchesFilter(row, filter))
}

/**
 * Reordering is only offered over the WHOLE list.
 *
 * Dragging row 3 above row 1 in a list with rows 2, 4 and 5 hidden is an
 * operation with no honest meaning — the tenant would be moving a band past
 * bands they cannot see. So while a chip is active the handle, the arrows
 * and the drop targets are all withdrawn together, and the list says so in
 * one sentence rather than accepting a gesture and doing something else
 * with it.
 */
export function reorderableUnderFilter(filter: SectionFilter): boolean {
  return filter === 'all'
}

// ─── 2.4 — thumbnails ───────────────────────────────────────────────────

/** Where the wireframes live, under the app's own public tree — same origin
 *  as the admin bundle that loads them, so there is no CSP question and no
 *  cross-origin fetch against the landing host. */
const THUMB_BASE = '/landing/thumbs'

/**
 * The wireframe for one block on one design, or null when either half of
 * the question is missing.
 *
 * PER TEMPLATE × TYPE, because that is the whole point of it: "Highlights"
 * and "Offer bar" are honest words that tell a salon owner nothing about
 * which stripe of the dark page they are about to edit, and the owner's
 * entire pitch is that tenants pick THESE designs. A generic icon set would
 * name the block a second time; a picture of the band answers a different
 * question.
 *
 * The template key is INTERPOLATED, never compared — see this module's
 * header. Both halves are checked against a conservative key shape first,
 * because they arrive off the wire and this string becomes a URL.
 *
 * A missing file is not an error and needs no manifest here: the `<img>`
 * falls back to a generic wireframe, which doubles as the honest signal for
 * "this design does not draw this block" (2.6).
 */
const SAFE_KEY = /^[a-z][a-z0-9_]*$/

export function sectionThumbUrl(templateKey: string, typeId: string): string | null {
  if (!SAFE_KEY.test(templateKey) || !SAFE_KEY.test(typeId)) return null

  return `${THUMB_BASE}/${templateKey}/${typeId}.svg`
}

// ─── 2.6 — telling the truth about what this design draws ───────────────

/**
 * Where a design pins a block it will not let the tenant move — the served
 * `fixed_blocks` value, narrowed to the three placements the editor has a
 * sentence for. `null` means "this design does not pin it", which is the
 * answer for every row on a template that pins nothing.
 */
export type BlockPlacement = 'top' | 'fixed' | 'footer'

const PLACEMENTS: readonly string[] = ['top', 'fixed', 'footer']

export function blockPlacement(fixedBlocks: Record<string, string>, key: string): BlockPlacement | null {
  const placement = fixedBlocks[key]

  return PLACEMENTS.includes(placement) ? (placement as BlockPlacement) : null
}

/**
 * Will this design put this block on the page at all?
 *
 * Three arms, and their ORDER is the correctness of the whole feature:
 *
 *  1. `renders` absent (an older backend) — YES. It has not declined
 *     anything; hiding a row's controls on a build that was never asked
 *     would be worse than the dead control this fact exists to remove.
 *  2. PINNED — YES, whatever `renders` says. A pinned block is drawn
 *     somewhere the design chose, and that place need not be its own
 *     partial: this kit's contact details are printed inside the footer
 *     hub, so it ships no `contact.blade.php` and `renders` does not list
 *     it. "This design does not show this block" would be a plain lie about
 *     a tenant's phone number, which is on the page.
 *  3. Otherwise — whether the served list names this row's TYPE. `gallery_1`
 *     asks about `gallery`, exactly as the renderer resolves the partial by
 *     type and not by key.
 */
export function templateDrawsBlock(
  renders: string[] | null,
  fixedBlocks: Record<string, string>,
  row: Pick<ShapedRow, 'key' | 'typeId'>,
): boolean {
  if (renders === null) return true
  if (blockPlacement(fixedBlocks, row.key) !== null) return true

  return renders.includes(row.typeId)
}

/**
 * Whether this row's move controls should exist at all.
 *
 * The help sentence over the list promises "sections appear on your page
 * from top to bottom" with no exception, and five rows on the shipped kit
 * carry a drag handle and two arrows that move nothing — the layout rejects
 * those keys out of its ordered loop and draws them where the author put
 * them. A control that cannot act is not rendered, and its absence is
 * explained in one sentence; `blockPlacement` is what supplies the
 * sentence.
 *
 * A row the design will not draw at all keeps its arrows: its position is
 * still real on any design that does draw it, and its stored order is what
 * a template switch would honour.
 */
export function rowCanMove(fixedBlocks: Record<string, string>, row: Pick<ShapedRow, 'key'>): boolean {
  return blockPlacement(fixedBlocks, row.key) === null
}

// ─── 2.2 — the one line a collapsed card says about itself ──────────────

/**
 * What a collapsed card says under its name, as a decision rather than a
 * sentence: the component owns the words (and their five translations),
 * this owns which of them applies.
 *
 * ONE LINE, because the card is now closed by default and this is all a
 * tenant has to go on when deciding whether to open it. The order below is
 * the priority, most-surprising first:
 *
 *  1. `not_drawn` — this design will not put the band on the page. Nothing
 *     else about the row matters until that is dealt with.
 *  2. `unavailable` — the backend's own reason (booking on a non-hotel org,
 *     an empty Services screen). The row cannot be switched on at all.
 *  3. `hidden` — the tenant switched it off. True of a row that is
 *     otherwise perfectly fine, and the single most common "why is it not
 *     on my page" question there is.
 *  4. `needs_words`/`needs_photos` — a band the tenant added and has not
 *     filled in. `PageContent::count()` refuses to publish it, and this is
 *     the only place a tenant ever finds that out.
 *  5. `counted` — rows from another screen, with the number. "12 from your
 *     Treatments" is the sentence that makes the Services card a pointer
 *     rather than a dead end.
 *  6. `source` — a fixed band whose content comes from somewhere named.
 *  7. `own_words`/`own_photos` — a written band the tenant owns outright.
 */
export type RowStatus =
  | { kind: 'not_drawn' }
  | { kind: 'unavailable' }
  | { kind: 'hidden' }
  | { kind: 'needs_words' }
  | { kind: 'needs_photos' }
  | { kind: 'counted'; count: number; source: string }
  | { kind: 'source'; source: string }
  | { kind: 'own_words' }
  | { kind: 'own_photos' }

/**
 * @param offerable `isOfferable(row)` — passed in rather than re-derived so
 *   the row's summary and the row's toggle cannot disagree about whether
 *   the band can be switched on.
 * @param dataBacked `isDataBackedSection(row.key)` — same reasoning: the
 *   list already asks it, and a count is only meaningful for a section
 *   backed by rows elsewhere in the product.
 */
export function rowStatus(
  row: ShapedRow,
  opts: { drawn: boolean; offerable: boolean; dataBacked: boolean },
): RowStatus {
  if (!opts.drawn) return { kind: 'not_drawn' }
  if (!opts.offerable) return { kind: 'unavailable' }
  if (!row.enabled) return { kind: 'hidden' }

  if (!row.fixed && !row.available) {
    return row.writtenBy === 'photos' ? { kind: 'needs_photos' } : { kind: 'needs_words' }
  }

  if (row.fixed) {
    return opts.dataBacked
      ? { kind: 'counted', count: row.count, source: row.sourceLabel }
      : { kind: 'source', source: row.sourceLabel }
  }

  return row.writtenBy === 'photos' ? { kind: 'own_photos' } : { kind: 'own_words' }
}
