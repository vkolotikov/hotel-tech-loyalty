/**
 * Sub-domain → industry id map for the HexaTech platform.
 *
 * Industry Platform Plan Phase 1 (foundation).
 *
 * The SPA inspects `window.location.hostname` to pre-fill the registration
 * industry on the four sub-brand domains. The umbrella host returns null
 * which triggers Phase 2's explicit 4-card industry picker. Localhost +
 * any unrecognized host defaults to `hotel` so today's dev flow keeps
 * working without per-developer env overrides.
 *
 * **Four sync points when adding an industry.** All four must stay in
 * lockstep — TypeScript catches three of them, the backend is a manual
 * grep:
 *   1. `IndustryId` union (below)
 *   2. `HOST_INDUSTRY` map (host → id)
 *   3. `INDUSTRY_PRIMARY_DOMAIN` reverse map (TS enforces exhaustiveness)
 *   4. `Organization::INDUSTRIES` constant at
 *      apps/loyalty/backend/app/Models/Organization.php — backend
 *      validation lives here, no TS link to enforce it.
 */

/**
 * Industry id strings — matches `Organization::INDUSTRIES` const on the
 * Laravel side. Keep in sync when adding industries.
 */
export type IndustryId =
  | 'hotel'
  | 'beauty'
  | 'medical'
  | 'restaurant'
  | 'legal'
  | 'real_estate'
  | 'education'
  | 'fitness'

/**
 * Sub-domain detection result. `null` = umbrella host (`app.hexa-tech.uk`)
 * or any host the strict variant can't classify — caller must show the
 * explicit 4-card picker rather than guessing.
 */
export type DetectedIndustry = IndustryId | null

/**
 * Hostname → industry mapping. Use `as const satisfies` so the value
 * shape is type-checked AND keys narrow to literals (catches typo'd
 * keys at edit-time, future-proofs against `noUncheckedIndexedAccess`
 * tsconfig strictness).
 *
 * The four GTM sub-brand domains map to their preset id. The new
 * umbrella SPA host `app.hexa-tech.uk` maps to `null` so Phase 2's
 * register view shows the industry picker (decision #8). The canonical
 * loyalty production host stays as `hotel` because that's where existing
 * customers already land.
 *
 * `www.` prefix is normalised away at lookup time (`stripWww`) — we don't
 * duplicate every entry as `www.X`.
 *
 * Subdomains of these primary hosts (e.g. `staging.beauty-tech.uk`,
 * `preview.med.hexa-tech.uk`) ALSO resolve to the parent industry via the
 * suffix match in `detectIndustryFromHost` — so a staging deploy on a
 * sub-brand TLD doesn't silently fall through to the lenient hotel
 * default. The map itself only carries the canonical primaries.
 */
export const HOST_INDUSTRY = {
  // HotelTechAI sub-brand + canonical loyalty production host.
  'hotel-tech.ai': 'hotel',
  'loyalty.hotel-tech.ai': 'hotel',

  // BeautyTech.uk sub-brand.
  'beauty-tech.uk': 'beauty',

  // MedTechAI sub-brand.
  'med.hexa-tech.uk': 'medical',

  // HospitalityTech sub-brand. Soft-mapped to `restaurant` preset since
  // there is no dedicated `hospitality` preset id today; the preset
  // covers venues + guest-service businesses adequately.
  'hospitality.hexa-tech.uk': 'restaurant',

  // Umbrella SPA host — industry-agnostic. Phase 2 shows the explicit
  // picker on register when this resolves to null.
  'app.hexa-tech.uk': null,
} as const satisfies Record<string, DetectedIndustry>

/**
 * Suffix → industry list for matching subdomains (`staging.beauty-tech.uk`
 * → beauty, `preview.med.hexa-tech.uk` → medical). Keys MUST be in
 * dotted-suffix form so the matcher can do `hostname.endsWith('.' + key)`
 * without false positives — `beauty-tech.uk` wouldn't match itself via
 * suffix (the primary lookup catches that first).
 *
 * Listed longest-first so `med.hexa-tech.uk` matches before any future
 * `hexa-tech.uk` umbrella-suffix entry we might add.
 */
const SUFFIX_INDUSTRY: Array<readonly [string, DetectedIndustry]> = [
  ['med.hexa-tech.uk', 'medical'],
  ['hospitality.hexa-tech.uk', 'restaurant'],
  ['app.hexa-tech.uk', null],
  ['hotel-tech.ai', 'hotel'],
  ['beauty-tech.uk', 'beauty'],
]

/** Localhost / dev / loopback hostnames that default to `hotel`. */
const LOCAL_HOSTS = new Set<string>([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
])

/** Normalise a hostname: lowercase, drop trailing dot, drop leading `www.`. */
function normaliseHost(hostname: string): string {
  let h = (hostname || '').toLowerCase().replace(/\.$/, '')
  if (h.startsWith('www.')) h = h.slice(4)
  return h
}

/**
 * Resolve a hostname to an industry id, or null when the host is the
 * umbrella and the caller should prompt the user.
 *
 * Resolution order:
 *   1. Exact match against `HOST_INDUSTRY` (primary domain).
 *   2. Suffix match against `SUFFIX_INDUSTRY` (sub-brand subdomains like
 *      `staging.beauty-tech.uk` resolve to `beauty`; this prevents staging
 *      deploys silently falling through to the lenient hotel default).
 *   3. Localhost / IP-loopback → 'hotel'.
 *   4. Anything else → 'hotel' (lenient default — keeps the dev flow +
 *      any unmapped staging host working without picker friction).
 *
 * Use `detectIndustryFromHostStrict` when you want unmapped hosts to
 * return null instead of falling through to hotel.
 */
export function detectIndustryFromHost(hostname: string): DetectedIndustry {
  const h = normaliseHost(hostname)

  if (h in HOST_INDUSTRY) {
    return HOST_INDUSTRY[h as keyof typeof HOST_INDUSTRY]
  }

  for (const [suffix, industry] of SUFFIX_INDUSTRY) {
    if (h.endsWith('.' + suffix)) {
      return industry
    }
  }

  if (LOCAL_HOSTS.has(h)) {
    return 'hotel'
  }

  return 'hotel'
}

/**
 * Strict variant — returns null on any host that isn't explicitly mapped
 * or matched via a sub-brand suffix. Phase 2's register view uses this
 * to force the picker on the umbrella AND any preview host that hasn't
 * been added to the map yet.
 *
 * Localhost still maps to 'hotel' so local dev is friction-free.
 */
export function detectIndustryFromHostStrict(hostname: string): DetectedIndustry {
  const h = normaliseHost(hostname)

  if (h in HOST_INDUSTRY) {
    return HOST_INDUSTRY[h as keyof typeof HOST_INDUSTRY]
  }

  for (const [suffix, industry] of SUFFIX_INDUSTRY) {
    if (h.endsWith('.' + suffix)) {
      return industry
    }
  }

  if (LOCAL_HOSTS.has(h)) {
    return 'hotel'
  }

  return null
}

/**
 * Convenience wrapper that reads `window.location.hostname`. Returns
 * `'hotel'` (lenient) or `null` (strict) during SSR / Node test runs
 * where `window` is not defined — honours the strict flag so test
 * authors get the documented contract.
 */
export function detectIndustryFromWindow(strict: boolean = false): DetectedIndustry {
  if (typeof window === 'undefined' || !window.location) {
    return strict ? null : 'hotel'
  }
  const host = window.location.hostname || ''
  return strict ? detectIndustryFromHostStrict(host) : detectIndustryFromHost(host)
}

/**
 * Reverse lookup — the canonical primary domain for an industry. Used by
 * sign-up branding code that wants to render "you're signing up on
 * beauty-tech.uk" copy when the user arrived from the umbrella picker.
 *
 * Industries without a dedicated sub-brand domain fall back to the
 * umbrella host. Note this can read as circular UX ("sign up on
 * app.hexa-tech.uk" → click → umbrella picker again); Phase 2/3 consumers
 * should gate on a non-null GTM check rather than rendering this blindly.
 */
export const INDUSTRY_PRIMARY_DOMAIN: Record<IndustryId, string> = {
  hotel: 'hotel-tech.ai',
  beauty: 'beauty-tech.uk',
  medical: 'med.hexa-tech.uk',
  restaurant: 'hospitality.hexa-tech.uk',
  legal: 'app.hexa-tech.uk',
  real_estate: 'app.hexa-tech.uk',
  education: 'app.hexa-tech.uk',
  fitness: 'app.hexa-tech.uk',
}
