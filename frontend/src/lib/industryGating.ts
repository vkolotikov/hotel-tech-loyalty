/**
 * Industry-specific sidebar + Settings gating.
 *
 * Industry Platform Plan Phase 4.
 *
 * Per-industry "this is irrelevant to your business" hide rules,
 * applied on top of the existing org-wide `hidden_nav_groups`
 * (Settings → Sidebar Menu) and per-staff `allowed_nav_groups`
 * (Settings → Team) whitelists. **Union, never replace** —
 * customisations the admin has made via Settings stay in effect; the
 * industry rules add to what's hidden, never undo a hide.
 *
 * **Decision #4 + #5 (apps/loyalty/INDUSTRY_PLATFORM_PLAN.md)**:
 * every industry keeps the full module set. The booking module stays
 * for all four GTM industries — only the underlying view flips (Phase
 * 7 owns the controller swap from Smoobu-flavoured BookingMirror to
 * the services-engine view). Chat / Engagement / Chatbot stay
 * available even for medical; medical safety lives in the AI prompt
 * layer (Phase 7 hard guardrail), not the sidebar. Only items that
 * are genuinely irrelevant to a vertical get hidden here.
 *
 * **No identity changes**. The maps are keyed on the canonical
 * English `defaultLabel` for groups + items (matching Layout.tsx
 * navGroups) and `tab.id` for Settings tabs (matching Settings.tsx
 * TABS). Saved `hidden_nav_groups` storage continues to use the
 * canonical strings; saved deep-link `?tab=` URLs continue to use the
 * canonical tab ids. Industry switch never silently changes meaning.
 *
 * **Hotel orgs see zero changes**. All HOTEL_* entries are empty.
 * Existing hotel customers experience the platform exactly as before.
 */
import { useMemo } from 'react'
import { useAuthStore } from '../stores/authStore'
import type { IndustryId } from './industryHosts'

/**
 * Nav groups (Layout.tsx navGroups[].defaultLabel) hidden by industry
 * default. Admin can override via Settings → Sidebar Menu the same way
 * they always could — union semantics mean the org-wide list keeps
 * adding to what's hidden, never undoes an industry default.
 *
 * Each entry should be a `defaultLabel` from the navGroups array in
 * Layout.tsx, NOT a translated or industry-relabelled version. The
 * Layout.tsx visibility filter applies industry hides BEFORE label
 * resolution so this stays language-stable.
 */
const INDUSTRY_HIDDEN_GROUPS: Record<IndustryId, ReadonlyArray<string>> = {
  hotel: [],
  beauty: [],
  medical: [
    // Medical has no patient loyalty program (decision #5). The whole
    // Members & Loyalty group hides — tiers / points / rewards /
    // campaigns are irrelevant to a clinical practice.
    'Members & Loyalty',
  ],
  restaurant: [],
  // GTM-deferred industries — no extra hides until product-market fit
  // is validated per industry. Customers can still hide groups via
  // Settings → Sidebar Menu the normal way.
  legal: [],
  real_estate: [],
  education: [],
  fitness: [],
}

/**
 * Per-industry nav-item hide list. Items are matched by Layout.tsx
 * navGroup.items[].defaultLabel — the canonical English label. The
 * Layout.tsx render filter checks this list AFTER the per-group hide
 * and the per-item role/product/feature gates.
 */
const INDUSTRY_HIDDEN_ITEMS: Record<IndustryId, ReadonlyArray<string>> = {
  hotel: [],
  beauty: [
    // B2B sales pipeline is irrelevant to walk-in service businesses.
    // Customers + Leads still cover individual-client follow-up.
    'Deals',
  ],
  medical: [
    // Deals = B2B sales pipeline (companies, contracts). A clinic
    // doesn't sell deals; patient inquiries flow through Leads.
    'Deals',
    // NFC card scanner — clinics don't issue member cards.
    'Scan',
  ],
  restaurant: [
    // Restaurants typically don't need a separate NFC-card scanner
    // surface. Regulars get points via the POS / loyalty card lookup
    // on the Members page directly.
    'Scan',
  ],
  legal: [],
  real_estate: [],
  education: [],
  fitness: [],
}

/**
 * Settings tab ids (Settings.tsx TABS[].id) hidden by industry.
 * Stays keyed on `id` rather than `label` so `?tab=member_app` deep-
 * link URLs survive industry switches — and so the Phase 3 vocabulary
 * relabel of the tab label doesn't accidentally drift this list out
 * of sync.
 */
const INDUSTRY_HIDDEN_SETTINGS_TABS: Record<IndustryId, ReadonlyArray<string>> = {
  hotel: [],
  beauty: [
    // Phase 7 ships the Appointment Engine settings parity that
    // replaces the Smoobu-flavoured Booking Engine tab for non-hotel
    // industries. Until then the tab is hidden so a beauty admin
    // doesn't land on a hotel-shaped PMS-sync UI.
    'booking',
  ],
  medical: [
    'loyalty',     // No patient loyalty program — decision #5
    'mobile_app',  // Member App tab — no patient mobile app in v1
    'booking',     // Same as beauty — Phase 7 ships the Appointment Engine settings
  ],
  restaurant: [
    'booking',
  ],
  legal: ['booking', 'loyalty', 'mobile_app'],
  real_estate: ['booking', 'loyalty', 'mobile_app'],
  education: ['booking', 'mobile_app'],
  fitness: ['booking'],
}

/** Hook — returns the list of canonical group defaultLabels hidden by industry. */
export function useIndustryHiddenGroups(): ReadonlyArray<string> {
  const industry = useAuthStore(s => s.user?.industry)
  return useMemo(() => (industry ? INDUSTRY_HIDDEN_GROUPS[industry] : []) ?? [], [industry])
}

/** Hook — returns the list of canonical nav-item defaultLabels hidden by industry. */
export function useIndustryHiddenItems(): ReadonlyArray<string> {
  const industry = useAuthStore(s => s.user?.industry)
  return useMemo(() => (industry ? INDUSTRY_HIDDEN_ITEMS[industry] : []) ?? [], [industry])
}

/** Hook — returns the list of Settings tab ids hidden by industry. */
export function useIndustryHiddenSettingsTabs(): ReadonlyArray<string> {
  const industry = useAuthStore(s => s.user?.industry)
  return useMemo(() => (industry ? INDUSTRY_HIDDEN_SETTINGS_TABS[industry] : []) ?? [], [industry])
}
