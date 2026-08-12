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
 * 2026-06-07 rebuild — HexaTech rebrand pass. The pricing surface went
 * through two iterations on the same day:
 *
 *   (i) First pass: industry-neutral labels, dropped white-label, added
 *   Engagement Hub / Wallet / Mobile / Multi-brand, added `admin_ai`
 *   Enterprise-only row, SLA promoted to its own row.
 *
 *   (ii) Tightening pass (this version):
 *   - **Dropped `nfc`** — physical NFC cards row removed entirely. Buyers
 *     who care can ask; the digital Wallet row still covers Apple/Google
 *     pass distribution.
 *   - **Added `campaigns`** — email campaigns + block builder (shipped
 *     2026-05). Surfaced on Growth + Enterprise.
 *   - **Added `reviews`** — review forms + post-stay sweep (shipped per
 *     CLAUDE.md "Reviews" surface). Surfaced on Growth + Enterprise.
 *   - **Added `time_management`** — the Planner module, sold publicly as
 *     "Time Management Platform" per the landing site (CLAUDE.md):
 *     smart scheduling + team automation + backlog + recurring tasks
 *     + drag-drop. **Enterprise only.**
 *   - **Uniform support** — every plan now reads "Email, online or in
 *     person" on the support row. The tier differentiation moved to the
 *     SLA row (Enterprise-only). Removed "Dedicated manager" /
 *     "onboarding" from the support cell — they were noise next to the
 *     channel-based phrasing the user wants.
 *
 * **Backend gates shipped 2026-06-07 (v2).** Three Enterprise-only rows
 * now carry matching runtime enforcement on the loyalty backend:
 *   - `brands` — `BrandController::store` rejects the second + subsequent
 *     brand creation with 402 when `!hasFeature('brands')`. The auto-
 *     created default brand on every org is exempt.
 *   - `admin_ai` — every /v1/admin/crm-ai/* route is wrapped in
 *     `feature:admin_ai` middleware. (The earlier service-level gate in
 *     CrmAiService was removed in audit follow-up: it broke the public
 *     widget's lead-extraction path which legitimately uses Claude.)
 *   - `time_management` — every /v1/admin/planner/* route is wrapped in
 *     `feature:time_management` middleware. PlannerPresetController stays
 *     ungated so an org can pre-stage a preset before upgrading.
 *
 * **Backend gates shipped 2026-06-08 (v3).** Five Growth+/Enterprise
 * rows now also carry matching enforcement, closing the
 * marketing-vs-reality gap the audit flagged:
 *   - `campaigns` — /v1/admin/email-campaigns/* (CRUD + send + test).
 *   - `reviews`   — /v1/admin/reviews/* (forms, submissions, integrations,
 *     invitations). Public submit at /v1/public/reviews/* stays open.
 *   - `engagement`— /v1/admin/engagement/* (unified hub feed + KPIs +
 *     brief). Legacy /v1/admin/chat-inbox/* + /v1/admin/visitors/* stay
 *     open as detail-level endpoints for the drawer.
 *   - `wallet`    — /v1/admin/wallet-config/*. Member-facing pass
 *     generation at /v1/member/* stays open so existing members can
 *     keep adding their loyalty card.
 *   - `chatbot`   — /v1/admin/chatbot-config/*, /v1/admin/popup-rules/*,
 *     /v1/admin/knowledge/*. Public widget at /v1/widget/* stays open
 *     so a downgraded org's chatbot keeps running on their site.
 *
 *   All 8 keys ship in the SaaS plan_features catalog via
 *   `2026_06_07_120000_add_v2_pricing_features.php` (3 v2 keys) and
 *   `2026_06_08_130000_add_v3_pricing_features.php` (5 v3 keys). The
 *   loyalty backend reads `$org->hasFeature('key')` from cached
 *   entitlements (refreshed every 5 min by SaasAuthMiddleware, faster
 *   via the Stripe-webhook cache-bust path on plan change).
 *
 * Plan slugs (`starter`, `growth`, `enterprise`) are intentionally
 * unchanged — they're hardcoded in 4 backend sites (AuthController trial
 * validator + getTrialPlanLimits + getTrialFeatures match arms + the
 * SaaS Plan model lookup convention).
 */
export const ALL_FEATURES = [
  // Day-to-day operations
  { key: 'crm',             label: 'Customer CRM & lead pipeline' },
  { key: 'loyalty',         label: 'Loyalty program' },
  { key: 'member_portal',   label: 'Member web portal & self-signup' },
  { key: 'booking',         label: 'Booking engine & payments' },

  // Customer engagement
  { key: 'chatbot',         label: 'Website chatbot (AI)' },
  { key: 'engagement',      label: 'Live chat inbox & lead tracking' },
  { key: 'campaigns',       label: 'Email campaigns & segments' },
  { key: 'content_planner', label: 'AI Content Planner (social media)' },
  { key: 'reviews',         label: 'Reviews & feedback' },
  { key: 'wallet',          label: 'Digital wallet cards (Apple + Google)' },
  { key: 'mobile',          label: 'Member mobile app + push' },

  // Insight & analytics
  { key: 'analytics',       label: 'Dashboards & analytics' },

  // Scale & ops
  { key: 'properties',      label: 'Multi-location support' },
  { key: 'brands',          label: 'Multi-brand portfolios' },
  { key: 'time_management', label: 'Time Management Platform' },

  // Power tier (Enterprise upsell drivers)
  { key: 'api',             label: 'API access & integrations' },
  { key: 'admin_ai',        label: 'Staff AI copilot' },

  // Service tier (uniform channel set; SLA is the Enterprise-only differentiator)
  { key: 'support',         label: 'Support' },
  { key: 'sla',             label: 'Uptime SLA' },
] as const

export type FeatureKey = (typeof ALL_FEATURES)[number]['key']

export const PLAN_FEATURES: Record<string, Record<string, string | boolean>> = {
  starter: {
    // Caps are the REAL enforced numbers from PlanLimitGuard /
    // getTrialPlanLimits — the previous "Unlimited profiles" on every
    // tier contradicted the hard 500-member cap Starter actually
    // enforces with a 402.
    crm:             'Up to 500 members · CSV import',
    loyalty:         'Tiers, points & rewards',
    member_portal:   true,
    booking:         false,
    chatbot:         false,
    engagement:      false,
    campaigns:       false,
    content_planner: false,
    reviews:         false,
    wallet:          false,
    mobile:          true,
    analytics:       'Core dashboards',
    properties:      'Single location',
    brands:          false,
    time_management: false,
    api:             false,
    admin_ai:        false,
    support:         'Email, online or in person',
    sla:             false,
  },
  growth: {
    crm:             'Up to 5,000 members · CSV import',
    loyalty:         'Plus discounts, offers & benefits',
    member_portal:   true,
    booking:         'With online payments',
    chatbot:         true,
    engagement:      true,
    campaigns:       true,
    content_planner: 'Posts, calendar & AI images',
    reviews:         true,
    wallet:          true,
    mobile:          true,
    // Split from the old single "Analytics & AI insights ✗/✓" row: the
    // dashboards themselves are open to every plan; the AI layer is the
    // Growth differentiator (matches the enforced ai_insights flag).
    analytics:       'Full analytics + AI insights',
    properties:      'Up to 3 locations',
    brands:          false,
    time_management: false,
    // The backend has always granted api_access to Growth
    // (getTrialFeatures + SaaS catalog). The card said Enterprise-only,
    // contradicting what buyers actually receive.
    api:             'Lead intake & member API',
    admin_ai:        false,
    support:         'Email, online or in person',
    sla:             false,
  },
  enterprise: {
    crm:             'Unlimited members · CSV import',
    loyalty:         'Custom rules, benefits & approvals',
    member_portal:   true,
    booking:         'With online payments',
    chatbot:         true,
    engagement:      true,
    campaigns:       true,
    content_planner: 'Everything in Growth + strategy AI',
    reviews:         true,
    wallet:          true,
    mobile:          true,
    analytics:       'Everything + retention & points liability',
    properties:      'Unlimited locations',
    brands:          'Unlimited brand portfolios',
    time_management: 'Staff scheduling & team automation',
    api:             'Full API + integrations',
    // Detail string carries the model attribution for AI-aware buyers
    // who'll recognise Anthropic Claude as a tool signal. Headline
    // stays "Staff AI copilot" so non-technical buyers read the
    // value first, the geek-credential second.
    admin_ai:        'Anthropic Claude · 35+ CRM tools',
    support:         'Email, online or in person',
    sla:             '99.9% uptime',
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
  growth:     'For growing businesses that need bookings, AI chat and member engagement. Adds the booking engine, website chatbot, live chat inbox, email campaigns, reviews, Wallet passes, analytics and member push.',
  enterprise: 'For multi-location and multi-brand operators. Adds unlimited locations, brand portfolios, the Time Management Platform for staff scheduling, API access, the staff AI copilot and a 99.9% uptime SLA.',
}

type TFn = (key: string, defaultValue: string) => string

/**
 * Localised feature label. Falls back to the English label baked into
 * ALL_FEATURES, so an untranslated locale still renders real copy
 * rather than a raw key.
 */
export function featureLabel(key: string, t: TFn): string {
  const en = ALL_FEATURES.find(f => f.key === key)?.label ?? key
  return t('auth.plans.feature.' + key, en)
}

/**
 * Localised detail suffix (the "— Up to 500 members" half of a row).
 * `value` is whatever PLAN_FEATURES holds, so an unknown SaaS plan slug
 * with no translation still shows its own English detail.
 */
export function featureDetail(slug: string, key: string, value: string, t: TFn): string {
  return t('auth.plans.detail.' + slug + '.' + key, value)
}

/** Localised plan tagline, keyed by slug; falls back to the given copy. */
export function planTagline(slug: string, fallback: string, t: TFn): string {
  return t('auth.plans.tagline.' + slug, fallback)
}
