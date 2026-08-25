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
const DATA_BACKED_SECTIONS: ReadonlySet<SectionKey> = new Set(['services', 'team', 'reviews'])

export function isDataBackedSection(key: SectionKey): boolean {
  return DATA_BACKED_SECTIONS.has(key)
}

/**
 * The spec's rule, in one place: an empty DATA-BACKED section is never
 * offered as a choice. Both the wizard's step 4 and the editor's section
 * list ask this, and they must agree -- a section the wizard hid must not
 * reappear as an editable-but-empty row.
 *
 * A section the tenant writes into directly (hero, about, contact) or that
 * has no source table at all (booking) is always offerable: `count` there
 * reflects what has been written or configured SO FAR, not permission to
 * write it.
 */
export function isOfferable(s: SectionMeta): boolean {
  if (!isDataBackedSection(s.key)) return true
  return s.available && s.count > 0
}
