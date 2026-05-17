/**
 * Shared plan feature taxonomy + per-plan included-feature map.
 *
 * Source of truth for the feature comparison table in BOTH:
 *   - Billing.tsx (admin Settings → Billing & Subscription)
 *   - Login.tsx (the public /register trial-view plan picker)
 *
 * Keep in sync with the SaaS backend's seeded PlanFeature rows so what's
 * shown at signup matches what the SaaS BootstrapController eventually
 * returns as the org's entitlements.
 */
export const ALL_FEATURES = [
  { key: 'crm',         label: 'Guest CRM' },
  { key: 'loyalty',     label: 'Loyalty program' },
  { key: 'booking',     label: 'Booking engine' },
  { key: 'chatbot',     label: 'AI chatbot for website' },
  { key: 'properties',  label: 'Multi-property support' },
  { key: 'analytics',   label: 'Advanced analytics & AI insights' },
  { key: 'nfc',         label: 'NFC member cards' },
  { key: 'api',         label: 'API access & integrations' },
  { key: 'branding',    label: 'White-label branding' },
  { key: 'support',     label: 'Priority support' },
  { key: 'sla',         label: 'SLA guarantee (99.9%)' },
  { key: 'onboarding',  label: 'Dedicated onboarding' },
] as const

export type FeatureKey = (typeof ALL_FEATURES)[number]['key']

export const PLAN_FEATURES: Record<string, Record<string, string | boolean>> = {
  starter: {
    crm:        'Up to 500 profiles',
    loyalty:    'Basic (1 tier)',
    booking:    false,
    chatbot:    false,
    properties: 'Single property',
    analytics:  false,
    nfc:        false,
    api:        false,
    branding:   false,
    support:    'Email support',
    sla:        false,
    onboarding: false,
  },
  growth: {
    crm:        'Unlimited profiles',
    loyalty:    'Up to 5 tiers',
    booking:    'With online payments',
    chatbot:    true,
    properties: 'Up to 3 properties',
    analytics:  true,
    nfc:        true,
    api:        false,
    branding:   false,
    support:    'Email & chat',
    sla:        false,
    onboarding: false,
  },
  enterprise: {
    crm:        'Unlimited profiles',
    loyalty:    'Custom tiers & rules',
    booking:    'With online payments',
    chatbot:    true,
    properties: 'Unlimited',
    analytics:  true,
    nfc:        true,
    api:        true,
    branding:   true,
    support:    'Dedicated manager',
    sla:        true,
    onboarding: true,
  },
}

/** Plan slugs we currently sell, in display order. */
export const PLAN_DISPLAY_ORDER = ['starter', 'growth', 'enterprise'] as const

/** Which plan slug to badge as "Most Popular". */
export const POPULAR_PLAN_SLUG = 'growth' as const

/**
 * Short marketing tagline for each plan — shown above the feature list
 * on the trial registration page (the admin Billing page already shows
 * the SaaS-supplied `plan.description`, so this is a duplicate fallback
 * for the trial view where plan loading races with first render).
 */
export const PLAN_TAGLINES: Record<string, string> = {
  starter:    'For boutique hotels and single properties getting started with guest data and a basic loyalty program.',
  growth:     'For growing groups that need bookings and AI. Everything in Starter plus booking engine, AI chatbot, analytics, push campaigns, custom branding and the member mobile app.',
  enterprise: 'For multi-property operators. Everything in Growth, unlimited properties and members, full API access and webhooks, NFC card support, advanced analytics and dedicated priority support.',
}
