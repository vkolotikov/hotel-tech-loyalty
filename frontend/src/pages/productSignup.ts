import type { TFunction } from 'i18next'

/**
 * HexaTech Loyalty and HexaTech Content sold on their own (owner 2026-11-02), each with its own sign-in and sign-up
 * pages beside the full suite's: /loyalty/login, /loyalty/register, /content/login, /content/register (and their
 * forgot / reset password pages). The sign-in screen (Login.tsx) serves them all; this file holds what differs: the
 * addresses, the product's words, and reading the price from the server's catalogue (GET /v1/modules) — never a price
 * of its own.
 */
export type SignupProduct = 'loyalty' | 'content'

/** The products with their own pages: App\Support\PlanModules::SOLD_ALONE on the server, which also prices them. */
export const SIGNUP_PRODUCTS: readonly SignupProduct[] = ['loyalty', 'content']

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
  const rest = pathname.replace(/^\/(loyalty|content)(?=\/)/, '')
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
  if (product === 'loyalty') {
    lines.push({ text: members ? t('auth.product.line.members', { n: n(members), defaultValue: 'Up to {{n}} members' }) : t('auth.product.line.members_any', 'Unlimited members'), included: true })
    lines.push({ text: t('auth.product.line.loyalty_core', 'Points, tiers, stamps, rewards and offers'), included: true })
    lines.push({ text: t('auth.product.line.member_app', 'Member app, portal and desk scanning'), included: true })
    lines.push({ text: t('auth.product.line.campaigns', 'Email and SMS campaigns'), included: on(features, 'campaigns') })
    lines.push({ text: t('auth.product.line.push', 'Push messages to the member app'), included: on(features, 'push_notifications') })
    lines.push({ text: t('auth.product.line.wallet', 'Apple and Google Wallet cards, NFC cards'), included: on(features, 'wallet') })
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
  if (staff) lines.push({ text: t('auth.product.line.staff', { n: n(staff), defaultValue: '{{n}} team members' }), included: true })
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
