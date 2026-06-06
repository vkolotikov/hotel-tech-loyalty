/**
 * Industry-aware vocabulary layer.
 *
 * Industry Platform Plan Phase 3.
 *
 * The same data fields (`reservations` table, `loyalty_members` table,
 * etc.) get displayed under different nouns depending on the org's
 * industry: a hotel sees "Reservations / Members / Rooms & Services",
 * a beauty salon sees "Appointments / Clients / Treatments", a clinic
 * sees "Appointments / Patients / Procedures", a restaurant sees
 * "Table reservations / Regulars / Tables".
 *
 * **No backend table renames.** Backend column names stay
 * (`reservations`, `loyalty_members`, `booking_mirror`). Vocabulary is
 * presentation-layer only — a swap at render time.
 *
 * **No i18n key changes.** Existing `t()` calls keep their i18n key +
 * English fallback. Consumers use `vocab(label) ?? t(key, fallback)` so
 * the vocab override wins when set; otherwise the i18n chain renders.
 *
 * **EN-only first ship** (Plan §3 + cross-cutting concerns line 470).
 * Russian / German / French / Spanish vocabulary is a follow-up wave —
 * a Russian beauty admin today sees "Clients" (English) rather than
 * the Russian "Участники" they'd get for a generic Member label. This
 * is a deliberate trade-off for the first ship; the RU/DE/FR/ES
 * vocabulary entries land in a Phase 3.x follow-up alongside the
 * remaining surfaces (Bookings / Customers / Inquiries / hubs / button
 * copy / empty-state copy) not wrapped here. Hotel orgs (all
 * languages) are entirely unaffected — VOCABULARY.hotel is empty so
 * vocab() returns null and the i18n chain wins.
 *
 * **Whitelist identity preserved.** Saved per-org `hidden_nav_groups`
 * and per-staff `allowed_nav_groups` arrays are keyed on the canonical
 * English `defaultLabel`. Vocabulary returns a relabelled DISPLAY
 * string while consumers of identity (Layout.tsx visibility checks,
 * MenuSettings/TeamSettings storage) keep using the canonical key.
 * Switching industry never silently changes what an org has hidden.
 *
 * **No group/item label collisions.** A nav group whose label
 * overlaps with a child item creates a duplicate visual label in the
 * sidebar (e.g. group "Appointments" containing item "Appointments"
 * — confusing). Group-level entries are only added when they don't
 * collide with their children's industry-specific labels. Beauty +
 * restaurant deliberately leave the GROUP "Bookings" canonical to
 * avoid duplicating with their child "Reservations" → "Appointments"
 * / "Table reservations" item labels. The group header reads
 * industry-neutral "Bookings" while the items underneath flex.
 */
import { useMemo } from 'react'
import { useAuthStore } from '../stores/authStore'
import type { IndustryId } from './industryHosts'

/**
 * Per-industry override maps. Key = canonical English `defaultLabel`
 * (matches Layout.tsx nav config + Settings.tsx tab list + page
 * titles). Value = industry-specific display label.
 *
 * `hotel` has no overrides — the canonical labels ARE the hotel
 * labels. Missing entries on a per-industry map fall through to the
 * i18n / canonical English chain via the `vocab(label) ?? t(...)`
 * fallback pattern. **Never use identity mappings** ('Members':
 * 'Members') — they break the i18n chain for that specific industry
 * + label because vocab returns a non-null string and short-circuits
 * the `?? t(...)` fallback.
 *
 * Stay aligned with the Vocabulary Swap Table in
 * apps/loyalty/CLAUDE.md. When you add an override here, update the
 * doc table.
 */
const VOCABULARY: Record<IndustryId, Record<string, string>> = {
  hotel: {
    // Canonical labels are the hotel labels. Intentionally empty.
  },
  beauty: {
    // Nav groups — only override when there's no group/item collision.
    // GROUP "Bookings" stays canonical because it contains item
    // "Reservations" → "Appointments"; relabelling both makes the
    // sidebar read "APPOINTMENTS > Appointments" (duplicate).
    'Members & Loyalty': 'Clients & Loyalty',
    // Nav items
    'Members':           'Clients',
    'Reservations':      'Appointments',
    'Services':          'Treatments',
    'Rooms & Services':  'Treatments',
    'Masters':           'Stylists',
    'Extras':            'Add-ons',
    'Properties':        'Salons',
    // Settings tab labels — canonical strings exactly match Settings.tsx
    // TABS[].label entries.
    'Hotel Info':        'Business Info',
    'Loyalty Program':   'Client Perks',
    'Booking Engine':    'Appointment Engine',
    'Member App':        'Client App',
    // Sidebar wordmark (Layout.tsx)
    'Hotel Loyalty':     'Salon Loyalty',
  },
  medical: {
    'Members & Loyalty': 'Patients',
    'CRM & Marketing':   'Patient CRM',
    'Members':           'Patients',
    'Reservations':      'Appointments',
    'Services':          'Procedures',
    'Rooms & Services':  'Procedures',
    'Masters':           'Practitioners',
    'Properties':        'Clinics',
    'Hotel Info':        'Practice Info',
    'Booking Engine':    'Appointment Engine',
    'Member App':        'Patient App',
    'Team & Roles':      'Practitioners & Roles',
    'Hotel Loyalty':     'Patient Care',
  },
  restaurant: {
    // GROUP "Members & Loyalty" → "Regulars" reads cleanly: the
    // group "Regulars" contains "Regulars" (the members list) +
    // "Program" + "Rewards" + "Campaigns" — only one collision at
    // the top item, and "Regulars" works as both the section + the
    // members list for a restaurant.
    'Members & Loyalty': 'Regulars',
    // GROUP "Bookings" stays canonical to avoid colliding with item
    // "Reservations" → "Table reservations".
    'Members':           'Regulars',
    'Reservations':      'Table reservations',
    'Rooms & Services':  'Tables',
    'Masters':           'Staff',
    'Properties':        'Venues',
    'Hotel Info':        'Venue Info',
    'Loyalty Program':   'Regulars Program',
    'Member App':        'Regulars App',
    'Hotel Loyalty':     'Regulars Program',
  },
  // GTM-deferred industries (decision #7) — Settings-only, no
  // dedicated sub-brand. Sparse overrides only; no identity
  // mappings (which would break the i18n chain).
  legal: {
    'Members':           'Clients',
    'Reservations':      'Consultations',
    'Hotel Info':        'Firm Info',
  },
  real_estate: {
    'Members':           'Clients',
    'Reservations':      'Viewings',
    'Properties':        'Listings',
    'Hotel Info':        'Agency Info',
  },
  education: {
    'Members':           'Students',
    'Reservations':      'Lessons',
    'Hotel Info':        'School Info',
  },
  fitness: {
    // No 'Members' override — "Members" IS the right word for a gym.
    // An identity mapping would break i18n for fitness orgs.
    'Reservations':      'Classes',
    'Properties':        'Locations',
    'Hotel Info':        'Studio Info',
  },
}

/**
 * Lookup function returned by `useVocabulary()`. Pass the canonical
 * English `defaultLabel` and get back the industry-specific display
 * label. Returns null when no override exists, so the caller can
 * fall back to its own translation (the typical pattern is
 * `vocab(defaultLabel) ?? t(labelKey, defaultLabel)` to preserve the
 * i18n chain when no industry override applies).
 */
export type Vocabulary = (defaultLabel: string) => string | null

/**
 * Pure lookup factory — no React hook semantics. Used in code paths
 * that don't have a React context (route maps, audit-log formatters,
 * mailers — though server-side rendering of these is owned by
 * Phase 8 in PHP, not here).
 *
 * `null` / `undefined` industry returns the noop lookup (every key
 * returns null → caller falls back to defaultLabel). This is the
 * legacy-session safety net: a stale auth store from before Phase 1
 * has `user.industry === undefined`; we render canonical English
 * rather than crash or default-to-beauty.
 */
export function vocabularyFor(industry: IndustryId | null | undefined): Vocabulary {
  const map = industry && VOCABULARY[industry] ? VOCABULARY[industry] : null
  return (defaultLabel: string) => {
    if (!map) return null
    return map[defaultLabel] ?? null
  }
}

/**
 * React hook — reads industry from the auth store and returns a
 * memoised lookup. Recomputes only when the industry actually
 * changes (cheap — no network call; vocabulary is a static map).
 */
export function useVocabulary(): Vocabulary {
  const industry = useAuthStore(s => s.user?.industry)
  return useMemo(() => vocabularyFor(industry), [industry])
}

/**
 * Convenience wrapper: resolve a label with the standard fallback
 * chain. Vocabulary → i18n → defaultLabel. Most consumers inline the
 * `vocab(x) ?? t(y, z)` pattern directly today; this helper exists
 * for future callers who want to centralise the fallback order (e.g.
 * a future RU/DE/FR/ES vocabulary wave that wants to flip the order
 * to "i18n wins, vocab is industry override").
 *
 *   const groupLabel = resolveLabel(t, vocab, labelKey, defaultLabel)
 *
 * `t` is the react-i18next translator (typed loosely as `(key: string,
 * fallback: string) => string` to avoid a circular import on the
 * full TFunction type).
 */
export function resolveLabel(
  t: (key: string, fallback: string) => string,
  vocab: Vocabulary,
  labelKey: string,
  defaultLabel: string,
): string {
  const override = vocab(defaultLabel)
  if (override !== null) return override
  return t(labelKey, defaultLabel)
}
