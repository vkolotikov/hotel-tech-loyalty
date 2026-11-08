import type { TFunction } from 'i18next'
import type { IndustryId } from '../lib/industryHosts'

/**
 * HexaTech Loyalty and HexaTech Content sold on their own (owner 2026-11-02), HexaTech Appointments since
 * 2026-11-04 and HexaTech CRM (the AI chat widget and the CRM) since 2026-11-07, each with its own sign-in and sign-up
 * pages beside the full suite's: /appointments/login, /appointments/register, /loyalty/login, /loyalty/register,
 * /content/login, /content/register, /crm/login, /crm/register (and their forgot /
 * reset password pages). The sign-in screen (Login.tsx) serves them all; this file holds what differs: the
 * addresses, the product's words, and reading the price from the server's catalogue (GET /v1/modules) — never a price
 * of its own.
 */
export type SignupProduct = 'appointments' | 'loyalty' | 'content' | 'crm'

/** The products with their own pages: App\Support\PlanModules::SOLD_ALONE on the server, which also prices them. */
export const SIGNUP_PRODUCTS: readonly SignupProduct[] = ['appointments', 'loyalty', 'content', 'crm']

export type AuthView = 'login' | 'register' | 'forgot-password' | 'reset-password'

/** A product's packages, cheapest first (App\Support\PlanModules::TIERS); Standard is the default. */
export type PackageKey = 'lite' | 'standard' | 'pro'
export const PACKAGES: readonly PackageKey[] = ['lite', 'standard', 'pro']
export const PACKAGE_NAMES: Record<PackageKey, string> = { lite: 'Lite', standard: 'Standard', pro: 'Pro' }

/** One row of GET /v1/modules. */
export interface ModulePlan {
  slug: string
  modules: string[]
  /** module => package, e.g. { loyalty: 'pro' } */
  packages?: Partial<Record<string, PackageKey>>
  monthly_amount: number | null
  /** A year's price, 15 % less a month than monthly; null when billing has none. */
  yearly_amount?: number | null
  currency: string
  trial_days: number
  /** What the plan grants, as billing stores it: limits as numbers in strings, switches as 'true' / 'false'. */
  features?: Record<string, string>
  available: boolean
}

/** The address of a sign-in view, for a product or (null) the full suite. */
export function authPath(product: SignupProduct | null | undefined, view: AuthView): string {
  return product ? `/${product}/${view}` : `/${view}`
}

/** Which view an address shows: /register and /loyalty/register both start the trial. */
export function viewFromPath(pathname: string): 'login' | 'trial' | 'forgot' | 'reset' {
  const rest = pathname.replace(/^\/(appointments|loyalty|content|crm)(?=\/)/, '')
  if (rest.startsWith('/register')) return 'trial'
  if (rest.startsWith('/forgot-password')) return 'forgot'
  if (rest.startsWith('/reset-password')) return 'reset'
  return 'login'
}

/**
 * Where a product's page sends someone who signed in without a ?redirect=: its workspace, when their organisation has
 * it (landingPath still decides what they may reach). Without a user (before the answer) the workspace is assumed.
 */
export function productHome(product: SignupProduct | null | undefined, redirect: string, user?: { workspaces?: Partial<Record<string, unknown>> } | null): string {
  if (!product || redirect !== '/') return redirect
  return user && user.workspaces?.[product] == null ? redirect : `/${product}`
}

/** A monthly price from the catalogue in the visitor's language, e.g. "€85". Null when the server gave none. */
export function formatMonthly(amount: number | null | undefined, currency: string, locale: string): string | null {
  if (amount == null) return null
  const zeroDecimal = ['jpy', 'krw', 'vnd', 'clp', 'isk', 'huf'].includes(currency.toLowerCase())
  const value = zeroDecimal ? amount : amount / 100
  try {
    const whole = Number.isInteger(value)
    return new Intl.NumberFormat(locale || 'en', {
      style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
    }).format(value)
  } catch {
    return `${value} ${currency.toUpperCase()}`
  }
}

/** A plan's slug for one product in one package: `loyalty`, `loyalty_pro` (the server's PlanModules::planSlug). */
export function packageSlug(product: SignupProduct, pkg: PackageKey): string {
  return pkg === 'standard' ? product : `${product}_${pkg}`
}

/** The product's three packages from the catalogue, cheapest first (a package the catalogue lacks is left out), and the other product. */
export function packagesFor(plans: ModulePlan[], product: SignupProduct): { packages: { key: PackageKey; plan: ModulePlan }[]; other: SignupProduct } {
  const other: SignupProduct = product === 'loyalty' ? 'content' : 'loyalty'
  const packages = PACKAGES.flatMap(key => {
    const plan = plans.find(p => p.slug === packageSlug(product, key))
    return plan ? [{ key, plan }] : []
  })
  return { packages, other }
}

/** What a price reads as for an interval: a month's price, and for yearly the month it works out at and the year. */
export function priceFor(plan: Pick<ModulePlan, 'monthly_amount' | 'yearly_amount' | 'currency'>, interval: 'monthly' | 'yearly', locale: string): { perMonth: string | null; perYear: string | null } {
  if (interval === 'yearly' && plan.yearly_amount != null) {
    return { perMonth: formatMonthly(Math.round(plan.yearly_amount / 12), plan.currency, locale), perYear: formatMonthly(plan.yearly_amount, plan.currency, locale) }
  }
  return { perMonth: formatMonthly(plan.monthly_amount, plan.currency, locale), perYear: null }
}

/** A plan limit as the server reads it: a positive whole number, or null for none (PlanLimitGuard). */
export function limitOf(features: Record<string, string> | undefined, key: string): number | null {
  const raw = (features?.[key] ?? '').trim()
  return /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null
}

const on = (features: Record<string, string> | undefined, key: string) => ['true', '1', 'yes'].includes((features?.[key] ?? '').toLowerCase())

export interface PackageLine { text: string; included: boolean }

/**
 * A package's lines, read from what the server says the plan grants. `lite` is the product's Lite package's
 * features, so Content's AI allowance reads as a multiple of the smallest.
 */
export function packageLines(product: SignupProduct, features: Record<string, string> | undefined, lite: Record<string, string> | undefined, t: TFunction, locale: string): PackageLine[] {
  const n = (value: number) => value.toLocaleString(locale || 'en')
  const members = limitOf(features, 'max_loyalty_members')
  const staff = limitOf(features, 'max_team_members')
  const places = limitOf(features, 'max_properties')
  const lines: PackageLine[] = []
  if (product === 'appointments') {
    const bookable = limitOf(features, 'max_booking_staff')
    lines.push({ text: bookable ? t('auth.product.line.bookable', { n: n(bookable), defaultValue: 'Up to {{n}} team members clients can book' }) : t('auth.product.line.bookable_any', 'Any number of team members clients can book'), included: true })
    lines.push({ text: t('auth.product.line.booking_page', 'Your own online booking page and website widget'), included: true })
    lines.push({ text: t('auth.product.line.booking_core', 'Calendar, client records, payments and takings'), included: true })
  } else if (product === 'loyalty') {
    lines.push({ text: members ? t('auth.product.line.members', { n: n(members), defaultValue: 'Up to {{n}} members' }) : t('auth.product.line.members_any', 'Unlimited members'), included: true })
    lines.push({ text: t('auth.product.line.loyalty_core', 'Points, tiers, stamps, rewards and offers'), included: true })
    lines.push({ text: t('auth.product.line.member_app', 'Member app, portal and desk scanning'), included: true })
    lines.push({ text: t('auth.product.line.campaigns', 'Email and SMS campaigns'), included: on(features, 'campaigns') })
    lines.push({ text: t('auth.product.line.push', 'Push messages to the member app'), included: on(features, 'push_notifications') })
    lines.push({ text: t('auth.product.line.wallet', 'Apple and Google Wallet cards, NFC cards'), included: on(features, 'wallet') })
  } else if (product === 'crm') {
    const budget = limitOf(features, 'ai_monthly_cost_cents')
    const base = limitOf(lite, 'ai_monthly_cost_cents')
    const times = budget && base ? Math.round((budget / base) * 10) / 10 : null
    lines.push({ text: t('auth.product.line.crm_chat', 'An AI chat for your website that answers from your knowledge'), included: true })
    lines.push({ text: t('auth.product.line.crm_core', 'Live inbox, visitors, leads, pipeline and tasks'), included: true })
    lines.push({
      text: times && times > 1
        ? t('auth.product.line.ai_times', { x: n(times), defaultValue: '{{x}}× the monthly AI allowance of Lite' })
        : t('auth.product.line.crm_ai_base', 'A monthly AI allowance for the assistant and reply drafts'),
      included: true,
    })
  } else {
    const budget = limitOf(features, 'ai_monthly_cost_cents')
    const base = limitOf(lite, 'ai_monthly_cost_cents')
    const times = budget && base ? Math.round((budget / base) * 10) / 10 : null
    lines.push({ text: t('auth.product.line.content_core', 'Content calendar, AI ideas, captions and images'), included: true })
    lines.push({
      text: times && times > 1
        ? t('auth.product.line.ai_times', { x: n(times), defaultValue: '{{x}}× the monthly AI allowance of Lite' })
        : t('auth.product.line.ai_base', 'A monthly AI allowance for a few posts a week'),
      included: true,
    })
    lines.push({ text: t('auth.product.line.approvals', 'Drafts, approvals and a morning email for the team'), included: true })
  }
  if (staff) {
    lines.push({
      text: product === 'appointments'
        ? t('auth.product.line.sign_ins', { n: n(staff), defaultValue: '{{n}} staff sign-ins' })
        : t('auth.product.line.staff', { n: n(staff), defaultValue: '{{n}} team members' }),
      included: true,
    })
  }
  if (places && places > 1) lines.push({ text: t('auth.product.line.places', { n: n(places), defaultValue: '{{n}} locations' }), included: true })
  lines.push({ text: t('auth.product.line.priority', 'Priority support'), included: (features?.priority_support ?? '') === 'priority' })
  return lines
}

export interface ProductCopy {
  brand: string
  monogram: string
  badge: string
  hero: string
  heroSub: string
  bullets: string[]
  loginSubtitle: string
  registerTitle: string
  trialBanner: string
  tabTitle: string
}

/** Each product's words. Literal keys, so the locale sweep (localeCompleteness.test.ts) checks every one. */
export function productCopy(product: SignupProduct, t: TFunction): ProductCopy {
  if (product === 'appointments') {
    return {
      brand: 'HexaTech Appointments',
      monogram: 'HA',
      badge: t('auth.product.appointments.badge', 'Online booking for service businesses'),
      hero: t('auth.product.appointments.hero', 'Let clients book you, day and night.'),
      heroSub: t('auth.product.appointments.hero_sub', 'An online booking page, a calendar for your whole team and client records in one workspace, for salons, clinics, studios and more.'),
      bullets: [
        t('auth.product.appointments.bullet_1', 'Your own booking page and a widget for your website'),
        t('auth.product.appointments.bullet_2', "A calendar for every team member's hours, breaks and time off"),
        t('auth.product.appointments.bullet_3', 'Client records, payments and takings at the desk'),
      ],
      loginSubtitle: t('auth.product.appointments.login_subtitle', 'Sign in to HexaTech Appointments'),
      registerTitle: t('auth.product.appointments.register_title', 'Start your HexaTech Appointments trial'),
      trialBanner: t('auth.product.appointments.trial_banner', 'Your trial includes everything in HexaTech Appointments.'),
      tabTitle: t('auth.product.appointments.tab_title', 'HexaTech Appointments — Sign in'),
    }
  }
  if (product === 'loyalty') {
    return {
      brand: 'HexaTech Loyalty',
      monogram: 'HL',
      badge: t('auth.product.loyalty.badge', 'Loyalty programme for service businesses'),
      hero: t('auth.product.loyalty.hero', 'Turn first visits into regulars.'),
      heroSub: t('auth.product.loyalty.hero_sub', 'Points, tiers, rewards and a member app in your colours, run from one workspace, for hotels, salons, clinics, restaurants and more.'),
      bullets: [
        t('auth.product.loyalty.bullet_1', 'Points, tiers, stamps and rewards your guests understand'),
        t('auth.product.loyalty.bullet_2', 'A member app and wallet cards with your brand'),
        t('auth.product.loyalty.bullet_3', 'Email, push and SMS campaigns that bring them back'),
      ],
      loginSubtitle: t('auth.product.loyalty.login_subtitle', 'Sign in to HexaTech Loyalty'),
      registerTitle: t('auth.product.loyalty.register_title', 'Start your HexaTech Loyalty trial'),
      trialBanner: t('auth.product.loyalty.trial_banner', 'Your trial includes everything in HexaTech Loyalty.'),
      tabTitle: t('auth.product.loyalty.tab_title', 'HexaTech Loyalty — Sign in'),
    }
  }
  if (product === 'crm') {
    return {
      brand: 'HexaTech CRM',
      monogram: 'CR',
      badge: t('auth.product.crm.badge', 'AI website chat and CRM'),
      hero: t('auth.product.crm.hero', 'Answer every visitor. Follow up every lead.'),
      heroSub: t('auth.product.crm.hero_sub', 'An AI chat on your website that answers from your own knowledge, a live inbox for your team, and the leads, pipeline and tasks that turn chats into customers.'),
      bullets: [
        t('auth.product.crm.bullet_1', 'An AI assistant on your website, day and night, in your words'),
        t('auth.product.crm.bullet_2', 'One inbox: take over any chat, with AI-drafted replies'),
        t('auth.product.crm.bullet_3', 'Leads, a pipeline and follow-ups so nobody is forgotten'),
      ],
      loginSubtitle: t('auth.product.crm.login_subtitle', 'Sign in to HexaTech CRM'),
      registerTitle: t('auth.product.crm.register_title', 'Start your HexaTech CRM trial'),
      trialBanner: t('auth.product.crm.trial_banner', 'Your trial includes everything in HexaTech CRM.'),
      tabTitle: t('auth.product.crm.tab_title', 'HexaTech CRM — Sign in'),
    }
  }
  return {
    brand: 'HexaTech Content',
    monogram: 'HC',
    badge: t('auth.product.content.badge', 'AI social media planner'),
    hero: t('auth.product.content.hero', 'Plan a month of social posts in an afternoon.'),
    heroSub: t('auth.product.content.hero_sub', 'An AI content planner that knows your brand: ideas, captions, images and a calendar your team approves.'),
    bullets: [
      t('auth.product.content.bullet_1', 'A content calendar built around your goals and key dates'),
      t('auth.product.content.bullet_2', 'AI captions and images in your brand voice'),
      t('auth.product.content.bullet_3', 'Drafts, approvals and a morning email for the team'),
    ],
    loginSubtitle: t('auth.product.content.login_subtitle', 'Sign in to HexaTech Content'),
    registerTitle: t('auth.product.content.register_title', 'Start your HexaTech Content trial'),
    trialBanner: t('auth.product.content.trial_banner', 'Your trial includes everything in HexaTech Content.'),
    tabTitle: t('auth.product.content.tab_title', 'HexaTech Content — Sign in'),
  }
}

/** The words both products' pages share. */
export function sharedProductWords(t: TFunction) {
  return {
    perMonth: t('auth.product.per_month', 'per month'),
    trial: (days: number) => t('auth.product.trial', { days, defaultValue: '{{days}}-day free trial, no card needed' }),
    addLater: (other: string, price: string) => t('auth.product.add_later', { other, price, defaultValue: 'Need {{other}} too? Add it any time from Plan & products, from {{price}} more a month.' }),
    unavailable: (product: string) => t('auth.product.unavailable', { product, defaultValue: '{{product}} cannot be bought online yet. Please contact HexaTech and we will set it up for you.' }),
    choosePackage: t('auth.product.choose_package', 'Choose your package'),
    billing: t('auth.product.billing', 'Billing period'),
    save: t('auth.product.save', { percent: 15, defaultValue: 'Save {{percent}}%' }),
    billedYearly: (price: string) => t('auth.product.billed_yearly', { price, defaultValue: '{{price}} billed yearly' }),
    fullSuite: t('auth.product.full_suite', 'Looking for the full HexaTech suite?'),
    seePlans: t('auth.product.see_plans', 'See all plans'),
  }
}

/**
 * The two-step trial sign-up's words (owner 2026-11-03: every trial starts on Standard, monthly; two steps only).
 * Literal keys, so the locale sweep checks every one.
 */
export function signupWords(t: TFunction) {
  return {
    step: (n: number) => t('auth.product.signup.step', { n, total: 2, defaultValue: 'Step {{n}} of {{total}}' }),
    accountTitle: (days: number) => t('auth.product.signup.account_title', { days, defaultValue: 'Start your {{days}}-day free trial' }),
    businessTitle: t('auth.product.signup.business_title', 'About your business'),
    businessSubtitle: (product: string) => t('auth.product.signup.business_subtitle', { product, defaultValue: 'A few details to set up {{product}} for you.' }),
    continue: t('auth.product.signup.continue', 'Continue'),
    back: t('auth.product.signup.back', 'Back'),
    start: t('auth.product.signup.start', 'Start my free trial'),
    sending: t('auth.product.signup.sending', 'Sending your code…'),
    businessName: t('auth.product.signup.business_name', 'Business name'),
    businessPlaceholder: t('auth.product.signup.business_placeholder', 'e.g. Seaside Spa'),
    phonePlaceholder: t('auth.product.signup.phone_placeholder', 'Phone number'),
    countryCode: t('auth.product.signup.country_code', 'Country code'),
    businessType: t('auth.product.signup.business_type', 'Type of business'),
    industryHint: t('auth.product.signup.industry_hint', 'We set up your workspace for it. You can change it later in Settings.'),
    chooseIndustry: t('auth.product.signup.choose_industry', 'Please choose your type of business.'),
    invalidEmail: t('auth.product.signup.invalid_email', 'Please enter a valid email address.'),
    shortPassword: t('auth.product.signup.short_password', 'Your password needs at least 8 characters.'),
    showPassword: t('auth.product.signup.show_password', 'Show password'),
    hidePassword: t('auth.product.signup.hide_password', 'Hide password'),
    industry: {
      hotel: t('auth.product.signup.industry.hotel', 'Hotel or rental'),
      beauty: t('auth.product.signup.industry.beauty', 'Salon or spa'),
      medical: t('auth.product.signup.industry.medical', 'Clinic'),
      restaurant: t('auth.product.signup.industry.restaurant', 'Restaurant or café'),
      fitness: t('auth.product.signup.industry.fitness', 'Gym or studio'),
      education: t('auth.product.signup.industry.education', 'School or courses'),
      legal: t('auth.product.signup.industry.legal', 'Law firm'),
      real_estate: t('auth.product.signup.industry.real_estate', 'Real estate'),
      services: t('auth.product.signup.industry.services', 'Other services'),
      other: t('auth.product.signup.industry.other', 'Something else'),
    } as Record<string, string>,
  }
}

/** What a product's trial asks billing for: always Standard, monthly (owner 2026-11-03); the package is chosen at its end. */
export function productTrialTerms(product: SignupProduct): { plan: string; billing_interval: 'MONTHLY' } {
  return { plan: packageSlug(product, 'standard'), billing_interval: 'MONTHLY' }
}

/**
 * The order of the sign-up's business types for a product (owner 2026-11-04): its most likely customers first,
 * "Something else" always last. Each is a reordering of PICKER_INDUSTRIES (lib/industryCopy), which the test checks.
 */
export function industryOrder(product: SignupProduct): IndustryId[] {
  if (product === 'appointments') return ['beauty', 'medical', 'fitness', 'education', 'services', 'legal', 'real_estate', 'restaurant', 'hotel', 'other']
  if (product === 'loyalty') return ['hotel', 'beauty', 'restaurant', 'fitness', 'medical', 'education', 'services', 'legal', 'real_estate', 'other']
  if (product === 'crm') return ['hotel', 'beauty', 'medical', 'real_estate', 'legal', 'services', 'education', 'fitness', 'restaurant', 'other']
  return ['hotel', 'beauty', 'restaurant', 'medical', 'fitness', 'real_estate', 'education', 'legal', 'services', 'other']
}

/** A sign-up email the server will take: something@domain.tld, no spaces. */
export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/** Step 1's check before moving on: the email's form, then the 8-character password minimum. */
export function accountStepProblem(email: string, password: string): 'email' | 'password' | null {
  if (!looksLikeEmail(email)) return 'email'
  if (password.length < 8) return 'password'
  return null
}
