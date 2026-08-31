/**
 * The shape shared between the wizard's step 4 (offer a section) and the
 * editor's section list (show it as on/off), so the two screens cannot
 * describe the same page differently. `SECTION_ORDER` is the template
 * order every list of sections renders in.
 */
export type SectionKey = 'hero' | 'services' | 'about' | 'team' | 'reviews' | 'booking' | 'contact'

export const SECTION_ORDER: SectionKey[] = ['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact']

export type SectionMeta = {
  key: SectionKey
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
 * Every prefill row has shipped `reason` (industry-gated `booking` gets the
 * "online booking currently supports hotel stays" sentence; everything else
 * carries `null`) since Task 4, but nothing on this side of the wire read
 * it until this fix — a beauty tenant saw the generic "Add some from your
 * booking button" instruction for a feature no amount of writing would ever
 * turn on. Pulled out as its own function (rather than inlined at each of
 * the two render call sites) because this repo's vitest is
 * pure-function-only — no jsdom, no React Testing Library — so this is the
 * one place the preference itself, not just the mapping that feeds it, can
 * actually be proven by a test.
 */
export function unavailableReason(section: Pick<SectionMeta, 'reason'>, generic: string): string {
  return section.reason ?? generic
}
