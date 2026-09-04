/**
 * The shape shared between the wizard's step 4 (offer a section) and the
 * editor's section list (show it as on/off), so the two screens cannot
 * describe the same page differently.
 */
/**
 * THERE IS NO `SECTION_ORDER` AND NO `SectionKey` HERE ANY MORE, and both
 * absences are load-bearing (template fidelity 1.3, then 3.1).
 *
 * They were a seven-key literal — `hero`, `services`, `about`, `team`,
 * `reviews`, `booking`, `contact` — and a union type over it. 1.3 took the
 * editor's row list off them (a page's bands are the SERVED catalogue's
 * types in the page's own stored `sort` order, and a tenant-added `text_1`
 * or a design-seeded `announcement` is a legitimate band no literal here has
 * ever heard of). 3.1 took the wizard's step 4 off them too: it iterates the
 * served `onboarding.sections` rows in wire order, which is the industry
 * profile's own `defaultSections` — the thing the literal was a copy of.
 *
 * `key` below is therefore a plain `string`. Anything that needs to know
 * whether a key names a real section asks the served catalogue
 * (`parseSectionKey`), and anything that needs to know which bands a NEW
 * page in an industry gets asks the served `industries[].sections`
 * (`sectionsForIndustry`). Re-introducing either of these would be a second
 * answer to a question the server already answers.
 */
export type SectionMeta = {
  key: string
  label: string
  sourceLabel: string
  available: boolean
  count: number
  /**
   * The backend's own explanation for a section that is unavailable for a
   * reason no amount of writing ever fixes — today only `booking`, whose
   * gate is the org's industry (`LandingOnboardingService::SECTION_COPY`'s
   * `reason` template, sprintf'd against the profile's own CTA text). `null`
   * for every offerable section and for every unavailable section whose
   * absence is already self-explanatory from `sourceLabel` alone (an empty
   * Services screen needs no essay).
   */
  reason?: string | null
}

/**
 * Sections whose content lives as ROWS somewhere else in the product —
 * Services, Team, Reviews. These are the ones the spec's "an empty section
 * is never offered as a choice" rule is actually about, and its own
 * examples are both of this kind: "Treatments — 12 from your Services";
 * "no featured reviews means the reviews toggle is off and says why".
 *
 * Every other section's content is either words the tenant TYPES directly
 * (the hero headline, the about paragraph, contact details) or a fixed
 * feature with nothing to be empty (the booking button). None of those has
 * a source table to hold zero rows — `about`'s count is always 0 on a
 * brand-new page, so gating it the same way as `reviews` would mean the
 * tenant could never write the about copy that would make it available in
 * the first place.
 *
 * Membership here — not a hand list repeated at each call site — is what
 * keeps the wizard's step 4 and the editor's section list from disagreeing
 * about which rule applies to which section.
 */
const DATA_BACKED_SECTIONS: ReadonlySet<string> = new Set(['services', 'team', 'reviews'])

/**
 * Takes a plain `string`, not a `SectionKey`, since the builder round: a
 * page can now carry TENANT-ADDED instance rows (`text_1`…`text_6`, see
 * `App\Landing\SectionType`'s key grammar) whose keys are not in the fixed
 * union — and the honest answer for every one of them is the same "no" this
 * already gives `hero`. Widening the parameter rather than widening
 * `SectionKey` itself keeps the wizard's own step 4, which only ever deals
 * in the seven fixed keys, exactly as type-safe as it was.
 */
export function isDataBackedSection(key: string): boolean {
  return DATA_BACKED_SECTIONS.has(key)
}

/**
 * Sections whose `available` can be permanently false for a reason no
 * amount of writing ever fixes -- today just `booking`, gated on the org's
 * industry (Task 4 / `PageContent::count('booking')`: hotel only). There is
 * no row to add (unlike services/team/reviews) and no copy to type (unlike
 * hero/about/contact) that would ever flip this back to true this session
 * -- the gate is a fact about the tenant's business, not about what they
 * have written so far.
 *
 * Ruling 3a-2: since Task 4 the backend legitimately reports
 * `available:false` for a non-hotel org's booking row, but `isOfferable`
 * put booking in the always-offerable bucket below -- so a beauty tenant's
 * wizard offered a Booking toggle the renderer would never honour. The
 * wizard and the rendered page must agree by construction (the same rule
 * `isDataBackedSection` exists to enforce for services/team/reviews), so
 * `isOfferable` now reads `available` for this set too.
 */
const INDUSTRY_GATED_SECTIONS: ReadonlySet<string> = new Set(['booking'])

/**
 * The spec's rule, in one place: an empty DATA-BACKED section is never
 * offered as a choice. Both the wizard's step 4 and the editor's section
 * list ask this, and they must agree -- a section the wizard hid must not
 * reappear as an editable-but-empty row.
 *
 * A section the tenant writes into directly (hero, about, contact) is
 * always offerable regardless of `available`: `count` there reflects what
 * has been written SO FAR, not permission to write it. This is why Ruling
 * 3a-2 is scoped to `INDUSTRY_GATED_SECTIONS` rather than applied to every
 * non-data-backed key: on a brand-new page `about`'s `available` is false
 * by construction (nothing has been typed into it yet -- see
 * `LandingOnboardingTest::test_every_sections_availability_matches_the_renderers_own_answer`,
 * where a fixture with no page content at all still expects `has('about')
 * === false` for every fresh page). Gating `about` on `available` the same
 * way as `booking` would permanently disable its wizard toggle for every
 * first-run tenant in every industry -- the opposite of what the wizard's
 * own "Nothing to show yet" copy is for (offer it, invite them to write
 * it), and the exact regression this comment exists to head off.
 */
/**
 * The builder round widened the PARAMETER to anything carrying the three
 * fields this actually reads, so an editor row keyed `text_1` can be asked
 * the same question as a `SectionMeta` keyed `about`. The rule itself is
 * unchanged, and it already gives the right answer for a tenant-added band
 * without a fourth branch: an added text block is in neither set above, so
 * it falls through to `true` exactly like `hero`/`about`/`contact` — which
 * is correct for the same reason it is correct for them. Its content is
 * words the tenant types, `count` reflects what has been written SO FAR,
 * and gating it on `available` would mean a band they just added could
 * never be written into.
 */
export function isOfferable(s: { key: string; available: boolean; count: number }): boolean {
  if (isDataBackedSection(s.key)) return s.available && s.count > 0
  if (INDUSTRY_GATED_SECTIONS.has(s.key)) return s.available
  return true
}

/**
 * What a "not offerable" row explains, in one place both the wizard's step
 * 4 and the editor's section list read (RULING 4's own discipline, applied
 * to this string the same way it is applied to the toggle itself): the
 * backend's own authored `reason` when the row carries one, else the
 * generic `defaultValue`-style text neither screen can improve on for a
 * section with no authored reason.
 *
 * Every prefill row has shipped `reason` (`booking` gets a sentence naming
 * what online booking needs — a service linked to a team member with
 * working hours, since template fidelity phase 6 made the gate a capability
 * test; everything else carries `null`) since Task 4, but nothing on this
 * side of the wire read it until this fix — a beauty tenant saw the generic
 * "Add some from your booking button" instruction for a feature they could
 * not see how to turn on. Pulled out as its own function (rather than inlined at each of
 * the two render call sites) because this repo's vitest is
 * pure-function-only — no jsdom, no React Testing Library — so this is the
 * one place the preference itself, not just the mapping that feeds it, can
 * actually be proven by a test.
 */
export function unavailableReason(section: Pick<SectionMeta, 'reason'>, generic: string): string {
  return section.reason ?? generic
}

/**
 * WHERE A BAND'S SUBSTANCE COMES FROM — the third member of the
 * `isDataBackedSection`/`isOfferable` family, and template fidelity 2.3's
 * one new fact.
 *
 * Three answers, because there are three tenants: one who only ever changes
 * words, one who only ever swaps photographs, and one whose content is
 * already in the product and only needs pointing at.
 *
 *  - `workspace` — services/team/reviews/contact. The rows live on another
 *    screen; the card here is a switch and a heading over them.
 *  - `photos`    — the band IS its pictures. `writtenBy` is the row's own
 *    copy of `PageContent::count()`'s two arms, so this is the same
 *    question the renderer asks about whether the band appears at all.
 *  - `write`     — everything else: words the tenant types.
 *
 * ONE ANSWER PER ROW, deliberately, because this is what the card's BADGE
 * says and a badge that hedges says nothing. The Photos FILTER is
 * deliberately wider than `=== 'photos'` — a hero is a words-led band with
 * a photograph in it, and "all the pictures on my page" has to include that
 * picture. See `rowHasPhotos` in `builderShape.ts`, which owns that wider
 * question, and keeps this one honest by not being it.
 *
 * Takes the fields it actually reads rather than a whole row, the same
 * widening `isOfferable` already took, so a tenant-added `text_1` and a
 * fixed `about` can be asked the same question.
 */
export type SectionGroup = 'write' | 'photos' | 'workspace'

/**
 * Sections whose card is a pointer at another screen. `contact` joins the
 * three `DATA_BACKED_SECTIONS` here and only here: its values are not rows
 * anywhere, but they are resolved from the tenant's Properties screen
 * (`App\Landing\ContactDetails::resolve()`) and the editor already tells
 * the tenant so in as many words. For the question this answers — "would I
 * find this on another screen?" — the honest answer for contact is yes.
 */
const WORKSPACE_SECTIONS: ReadonlySet<string> = new Set([...DATA_BACKED_SECTIONS, 'contact'])

export function sectionGroup(row: { key: string; writtenBy?: 'words' | 'photos' }): SectionGroup {
  if (WORKSPACE_SECTIONS.has(row.key)) return 'workspace'

  return row.writtenBy === 'photos' ? 'photos' : 'write'
}
