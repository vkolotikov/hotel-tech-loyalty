/**
 * Shared plan feature taxonomy + per-plan included-feature map.
 *
 * Source of truth for the feature comparison table in BOTH:
 *   - Billing.tsx (admin Settings → Billing & Subscription)
 *   - Login.tsx (the public /register trial-view plan picker)
 *
 * Keep in sync with the SaaS backend's seeded PlanFeature rows so what's
 * shown at signup matches what the SaaS BootstrapController eventually
 * returns as the org's entitlements. Note: this file is the BUYER-facing
 * surface — the SaaS catalog may grant additional dead-write features
 * (`custom_branding`, `ai_avatars`, etc.) that no consumer reads; those
 * are deliberately NOT surfaced here.
 *
 * 2026-06-07 rebuild — HexaTech rebrand pass. Notable choices:
 *
 *   - **Industry-neutral labels**: "Guest CRM" → "Customer CRM". The
 *     platform now sells into hotels + salons + clinics + restaurants +
 *     4 more verticals. Industry-aware vocabulary swap (Phase 3) flexes
 *     the in-product nouns at runtime; here we use the canonical English.
 *   - **Dropped `branding` (white-label).** The SaaS plan_features seed
 *     still grants `custom_branding=true` for Enterprise but no consumer
 *     in the loyalty app reads it (entitlement audit confirmed it's a
 *     dead-write key) — cleaning the SaaS seed is a separate ship.
 *   - **Added 4 shipped-but-missing rows**: engagement (live chat inbox
 *     + lead tracking, shipped 2026-05), wallet (Apple+Google passes,
 *     shipped 2026-05), mobile (was implicit, now called out), brands
 *     (multi-brand portfolio, shipped 2026-05).
 *   - **Added `admin_ai`**: the Anthropic-Claude staff AI copilot —
 *     **Enterprise only**. Previously absent from the comparison; the
 *     `chatbot` row stays for the website-visitor (OpenAI) chatbot.
 *     Renamed to "Website chatbot (AI)" to make the visitor-vs-staff
 *     distinction explicit.
 *   - **SLA gets its own row.** Procurement-driven Enterprise buyers
 *     scan for SLA in side-by-side comparisons; folding it into the
 *     support tier string would have hidden it. Adversarial review
 *     called this out as a load-bearing signal worth its own checkmark.
 *   - **Wallet vs NFC differentiated**: "Digital wallet cards (Apple +
 *     Google)" vs "Physical NFC cards" — adjacent rows previously read
 *     as the same feature twice to non-technical buyers.
 *   - **Mobile + push folded into one row**: "Member mobile app + push"
 *     surfaces the push-notification value that was hidden inside the
 *     bare mobile row.
 *
 * **Marketing-vs-reality gap (documented for follow-up):**
 *   - `brands` row is Enterprise-only here, but `BrandController::store`
 *     in the loyalty backend does NOT cap brand count by feature flag
 *     today. A Growth org can create a second brand and everything will
 *     work. Backend gating ticket needed before this becomes a real
 *     sales boundary.
 *   - `admin_ai` row is Enterprise-only here, but `CrmAiService::call()`
 *     has no feature-flag check today. Every plan can call it (subject
 *     to `ai_monthly_cost_cents` + `ai_allowed_models` caps which exist
 *     on all plans). Backend gating ticket needed.
 *   These two are marketing-only positioning until the backend gates
 *   ship — surface is honest about Enterprise's intended differentiation,
 *   but support needs to know not to deny use to lower tiers yet.
 *
 * Plan slugs (`starter`, `growth`, `enterprise`) are intentionally
 * unchanged — they're hardcoded in 4 backend sites (AuthController trial
 * validator + getTrialPlanLimits + getTrialFeatures match arms + the
 * SaaS Plan model lookup convention). Renaming is high-blast-radius;
 * the user-visible name lives in the SaaS `plan.name` column instead.
 */
export const ALL_FEATURES = [
  // Day-to-day operations
  { key: 'crm',         label: 'Customer CRM' },
  { key: 'loyalty',     label: 'Loyalty program' },
  { key: 'booking',     label: 'Booking engine & payments' },

  // Customer engagement
  { key: 'chatbot',     label: 'Website chatbot (AI)' },
  { key: 'engagement',  label: 'Live chat inbox & lead tracking' },
  { key: 'wallet',      label: 'Digital wallet cards (Apple + Google)' },
  { key: 'nfc',         label: 'Physical NFC cards' },
  { key: 'mobile',      label: 'Member mobile app + push' },

  // Insight & analytics
  { key: 'analytics',   label: 'Analytics & AI insights' },

  // Scale
  { key: 'properties',  label: 'Multi-location support' },
  { key: 'brands',      label: 'Multi-brand portfolios' },

  // Power tier (Enterprise upsell drivers)
  { key: 'api',         label: 'API access & integrations' },
  { key: 'admin_ai',    label: 'Staff AI copilot' },

  // Service tier (always shown — value flexes per plan)
  { key: 'support',     label: 'Support' },
  { key: 'sla',         label: 'Uptime SLA' },
] as const

export type FeatureKey = (typeof ALL_FEATURES)[number]['key']

export const PLAN_FEATURES: Record<string, Record<string, string | boolean>> = {
  starter: {
    crm:        'Up to 500 profiles',
    loyalty:    'Basic — 1 tier',
    booking:    false,
    chatbot:    false,
    engagement: false,
    wallet:     false,
    nfc:        false,
    mobile:     true,
    analytics:  false,
    properties: 'Single location',
    brands:     false,
    api:        false,
    admin_ai:   false,
    support:    'Email support',
    sla:        false,
  },
  growth: {
    crm:        'Unlimited profiles',
    loyalty:    'Up to 5 tiers',
    booking:    'With online payments',
    chatbot:    true,
    engagement: true,
    wallet:     true,
    nfc:        true,
    mobile:     true,
    analytics:  true,
    properties: 'Up to 3 locations',
    brands:     false,
    api:        false,
    admin_ai:   false,
    support:    'Email & chat support',
    sla:        false,
  },
  enterprise: {
    crm:        'Unlimited profiles',
    loyalty:    'Custom tiers & rules',
    booking:    'With online payments',
    chatbot:    true,
    engagement: true,
    wallet:     true,
    nfc:        true,
    mobile:     true,
    analytics:  true,
    properties: 'Unlimited locations',
    brands:     'Unlimited brand portfolios',
    api:        true,
    // Detail string carries the model attribution for AI-aware buyers
    // who'll recognise Anthropic Claude as a tool signal. Headline
    // stays "Staff AI copilot" so non-technical buyers read the
    // value first, the geek-credential second.
    admin_ai:   'Anthropic Claude · 35+ CRM tools',
    support:    'Dedicated manager · onboarding',
    sla:        '99.9% uptime',
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
 *
 * Industry-neutral phrasing — these run at signup-time across hotels,
 * salons, clinics, restaurants and 4 more verticals. The per-industry
 * tagline lives in `lib/industryCopy.ts` and overrides this on the
 * "Most Popular" plan via `industryCopy.planTagline`.
 */
export const PLAN_TAGLINES: Record<string, string> = {
  starter:    'For single-location service businesses getting started with customer data, basic loyalty and the member mobile app.',
  growth:     'For growing businesses that need bookings, AI chat and member engagement. Adds the booking engine, website chatbot, live chat inbox, Wallet/NFC cards, analytics and member push.',
  enterprise: 'For multi-location and multi-brand operators. Adds unlimited locations, brand portfolios, API access, the staff AI copilot and dedicated support with a 99.9% uptime SLA.',
}
