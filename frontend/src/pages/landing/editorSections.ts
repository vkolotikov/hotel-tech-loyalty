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

export type EditorSectionRow = SectionMeta & { enabled: boolean; sort: number }

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
export function buildSectionRows(pageSections: PageSection[], availability: SectionAvailability[]): EditorSectionRow[] {
  return orderedSections(pageSections).flatMap(row => {
    if (!(SECTION_ORDER as readonly string[]).includes(row.key)) return []
    const meta = availability.find(a => a.key === row.key)
    if (!meta) return []
    return [{
      key: row.key as SectionKey,
      label: meta.label,
      sourceLabel: meta.source_label,
      available: meta.available,
      count: meta.count,
      reason: meta.reason ?? null,
      enabled: row.enabled,
      sort: row.sort,
    }]
  })
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

/** Flip one section's `enabled` flag. Every other row, and this row's own
 *  position, is untouched — reordering and enabling are independent
 *  actions on independent fields. */
export function toggleSection(sections: PageSection[], key: string): PageSection[] {
  return sections.map(s => (s.key === key ? { ...s, enabled: !s.enabled } : s))
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
export function buildSectionsPayload(rows: EditorSectionRow[]): { key: string; enabled: boolean; sort: number }[] {
  return rows.map(row => ({
    key: row.key,
    enabled: isOfferable(row) ? row.enabled : false,
    sort: row.sort,
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
 */
export const SECTION_CONTENT_FIELDS: Record<SectionKey, readonly { name: string; multiline?: boolean; type?: string; maxLength?: number }[]> = {
  hero:     [{ name: 'headline' }, { name: 'subtext' }],
  services: [{ name: 'kicker' }, { name: 'heading' }, { name: 'subtext' }],
  about:    [{ name: 'kicker' }, { name: 'lead' }, { name: 'body', multiline: true }],
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
