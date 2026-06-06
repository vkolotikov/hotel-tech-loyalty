/**
 * Per-industry copy for the registration + login flow.
 *
 * Industry Platform Plan Phase 2.
 *
 * Renders branded landing pages on each sub-brand domain so a visitor
 * arriving at `beauty-tech.uk/register` sees beauty-shaped copy + colours
 * instead of the hotel default. The umbrella host `app.hexa-tech.uk` has
 * no `INDUSTRY_COPY` entry — Login.tsx detects the null industry and
 * shows the 4-card industry picker first, then re-renders using the
 * picked industry's copy.
 *
 * Keep verbatim quotes consistent with the landing page at hexa-tech.uk
 * — these strings will be cross-referenced by prospects clicking through
 * the marketing site into the trial.
 *
 * **Cosmetic only.** No copy here gates behaviour; backend validation +
 * the canonical industry id are the contract. If a string is missing for
 * an industry the fallback is the hotel entry (see `industryCopyFor`).
 */
import type { IndustryId } from './industryHosts'

export interface IndustryCopy {
  /** Sub-brand display name (HotelTechAI / BeautyTech.uk / etc.). */
  brand: string
  /** Big hero on the register view. */
  hero: string
  /** One-line positioning under the hero. */
  heroSub: string
  /** Hero bullets (3 short benefits). Mirrors landing-page module rows. */
  heroBullets: string[]
  /** Tab title / browser title. */
  tabTitle: string
  /** Label above the org-name input (currently "hotel_name" in API for legacy). */
  orgLabel: string
  /** Placeholder for the org-name input. */
  orgPlaceholder: string
  /** Plan-card sub-tagline for the trial picker ("For growing X"). */
  planTagline: string
  /** Friendly noun used in trial confirmation copy ("Welcome to your new {noun}"). */
  workspaceNoun: string
}

/**
 * Source of truth for all per-industry registration copy. Hotel is the
 * baseline / fallback. Beauty / Medical / Restaurant are the four GTM
 * sub-brands with full marketing-quality copy.
 *
 * Legal / Real Estate / Education / Fitness carry MINIMAL entries
 * (brand + workspace noun) — enough for the Phase 4 mismatch banner to
 * identify them honestly ("Switch workspace to Legal Workspace?")
 * without the hotel fallback misleadingly labelling them as
 * "HotelTechAI". They reuse the hotel hero copy elsewhere since they
 * have no dedicated marketing landing yet (decision #7).
 */
export const INDUSTRY_COPY: Partial<Record<IndustryId, IndustryCopy>> = {
  hotel: {
    brand: 'HotelTechAI',
    hero: 'One platform. More bookings. Stronger loyalty.',
    heroSub: 'For hotels, resorts and hospitality operators that want better guest communication, stronger direct bookings and smarter customer journeys.',
    heroBullets: [
      'AI assistant answers, qualifies and books — instantly',
      'PMS-synced booking engine + Stripe payments',
      'Loyalty program with tiers, points and wallet passes',
    ],
    tabTitle: 'HotelTechAI — Sign in',
    orgLabel: 'Hotel name',
    orgPlaceholder: 'e.g. Marriott Downtown',
    planTagline: 'For growing hotels',
    workspaceNoun: 'hotel workspace',
  },
  beauty: {
    brand: 'BeautyTech.uk',
    hero: 'One platform. Better bookings. Loyal clients.',
    heroSub: 'For beauty, spa and wellness businesses that need bookings, client communication, CRM and loyalty in one digital system.',
    heroBullets: [
      'AI assistant books appointments + answers service questions',
      'Online booking with deposits + Stripe payments',
      'Client loyalty: visits, points, rewards and wallet passes',
    ],
    tabTitle: 'BeautyTech.uk — Sign in',
    orgLabel: 'Salon / studio name',
    orgPlaceholder: 'e.g. The Gloss Atelier',
    planTagline: 'For growing salons + spas',
    workspaceNoun: 'salon workspace',
  },
  medical: {
    brand: 'MedTechAI',
    hero: 'One platform. Smoother appointments. Clearer operations.',
    heroSub: 'For clinics and medical service providers that want smoother appointment journeys, patient communication and operational clarity.',
    heroBullets: [
      'AI assistant books appointments + answers service / hours / insurance questions (never medical advice)',
      'Online appointment booking + Stripe payments',
      'Patient CRM with history, follow-ups and recall reminders',
    ],
    tabTitle: 'MedTechAI — Sign in',
    orgLabel: 'Clinic / practice name',
    orgPlaceholder: 'e.g. Riverside Dental',
    planTagline: 'For growing clinics + practices',
    workspaceNoun: 'clinic workspace',
  },
  restaurant: {
    brand: 'HospitalityTech',
    hero: 'One platform. Better reservations. Loyal regulars.',
    heroSub: 'For restaurants, venues and guest-service businesses that want better reservations, customer engagement and repeat visits.',
    heroBullets: [
      'AI assistant takes reservations + answers menu / hours questions',
      'Table + venue booking with deposits + Stripe payments',
      'Loyalty for regulars: visits, perks and wallet passes',
    ],
    tabTitle: 'HospitalityTech — Sign in',
    orgLabel: 'Restaurant / venue name',
    orgPlaceholder: 'e.g. The Tasting Room',
    planTagline: 'For growing restaurants + venues',
    workspaceNoun: 'venue workspace',
  },
  // Minimal entries for the 4 settings-only industries. The mismatch
  // banner reads `brand` + `workspaceNoun`; without these, the hotel
  // fallback would mislabel a legal-configured org as "HotelTechAI" in
  // the cross-domain switch prompt. Hero / form / tabTitle reuse the
  // hotel copy because these industries have no dedicated marketing
  // landing yet (decision #7) — a future ship can expand them.
  legal: {
    brand: 'Legal Workspace',
    hero: 'One platform. More matters. Stronger client follow-up.',
    heroSub: 'For law firms managing consultations, client communication and matter pipelines in one workspace.',
    heroBullets: [
      'AI assistant qualifies enquiries + schedules consultations',
      'Consultation booking + Stripe payments',
      'Client CRM with matter history and follow-ups',
    ],
    tabTitle: 'Legal Workspace — Sign in',
    orgLabel: 'Firm name',
    orgPlaceholder: 'e.g. Hartman & Reed',
    planTagline: 'For growing firms',
    workspaceNoun: 'firm workspace',
  },
  real_estate: {
    brand: 'Real Estate Workspace',
    hero: 'One platform. More viewings. Closer client follow-up.',
    heroSub: 'For agencies managing listings, viewings and client relationships in one workspace.',
    heroBullets: [
      'AI assistant qualifies leads + schedules viewings',
      'Viewing scheduler + deposit collection',
      'Client CRM with listing history and follow-ups',
    ],
    tabTitle: 'Real Estate Workspace — Sign in',
    orgLabel: 'Agency name',
    orgPlaceholder: 'e.g. Harbor & Hill Realty',
    planTagline: 'For growing agencies',
    workspaceNoun: 'agency workspace',
  },
  education: {
    brand: 'Education Workspace',
    hero: 'One platform. More enrolments. Stronger student journeys.',
    heroSub: 'For schools and tutors managing lessons, student communication and recurring sessions in one workspace.',
    heroBullets: [
      'AI assistant answers enrolment questions + schedules lessons',
      'Lesson booking + Stripe payments',
      'Student CRM with attendance and progress notes',
    ],
    tabTitle: 'Education Workspace — Sign in',
    orgLabel: 'School / tutor name',
    orgPlaceholder: 'e.g. North Bay Academy',
    planTagline: 'For growing schools + tutors',
    workspaceNoun: 'school workspace',
  },
  fitness: {
    brand: 'Fitness Workspace',
    hero: 'One platform. More classes. Stronger member engagement.',
    heroSub: 'For studios and gyms managing classes, memberships and recurring sessions in one workspace.',
    heroBullets: [
      'AI assistant answers class questions + books trial sessions',
      'Class booking + Stripe payments',
      'Member CRM with attendance and loyalty',
    ],
    tabTitle: 'Fitness Workspace — Sign in',
    orgLabel: 'Studio / gym name',
    orgPlaceholder: 'e.g. Iron + Steel Gym',
    planTagline: 'For growing studios + gyms',
    workspaceNoun: 'studio workspace',
  },
}

/**
 * Resolve copy for an industry, falling back to hotel when:
 *   - industry is null (umbrella host before picker resolves)
 *   - industry is an id without dedicated copy (legal / real_estate /
 *     education / fitness — Settings-only industries inherit hotel chrome
 *     until they get GTM treatment).
 *
 * Never throws. Callers always get a usable IndustryCopy object.
 */
export function industryCopyFor(industry: IndustryId | null | undefined): IndustryCopy {
  if (industry && INDUSTRY_COPY[industry]) {
    return INDUSTRY_COPY[industry]!
  }
  return INDUSTRY_COPY.hotel!
}

/**
 * Industries that get rendered as cards on the umbrella picker.
 * Excludes Settings-only industries because we don't have dedicated
 * sub-brand domains or marketing for them yet (decision #7).
 */
export const PICKER_INDUSTRIES: ReadonlyArray<IndustryId> = [
  'hotel', 'beauty', 'medical', 'restaurant',
] as const
