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

/** One row of GET /v1/modules. */
export interface ModulePlan {
  slug: string
  modules: string[]
  monthly_amount: number | null
  currency: string
  trial_days: number
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

/** Where a product's page sends someone who signed in without a ?redirect=: its workspace (landingPath decides what they may reach). */
export function productHome(product: SignupProduct | null | undefined, redirect: string): string {
  return product && redirect === '/' ? `/${product}` : redirect
}

/** A monthly price from the catalogue in the visitor's language, e.g. "€85". Null when the server gave none. */
export function formatMonthly(amount: number | null | undefined, currency: string, locale: string): string | null {
  if (amount == null) return null
  const zeroDecimal = ['jpy', 'krw', 'vnd', 'clp', 'isk', 'huf'].includes(currency.toLowerCase())
  const value = zeroDecimal ? amount : amount / 100
  try {
    return new Intl.NumberFormat(locale || 'en', {
      style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value)
  } catch {
    return `${value} ${currency.toUpperCase()}`
  }
}

/** The catalogue row for one product alone, and the one for it with the other product. */
export function plansFor(plans: ModulePlan[], product: SignupProduct): { alone: ModulePlan | null; other: SignupProduct; together: ModulePlan | null } {
  const other: SignupProduct = product === 'loyalty' ? 'content' : 'loyalty'
  const alone = plans.find(p => p.slug === product) ?? null
  const together = plans.find(p => p.modules.length === 2 && p.modules.includes(product) && p.modules.includes(other)) ?? null
  return { alone, other, together }
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
  included: string[]
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
      included: [
        t('auth.product.loyalty.included_1', 'Members, tiers, points and stamp cards'),
        t('auth.product.loyalty.included_2', 'Rewards, offers and member benefits'),
        t('auth.product.loyalty.included_3', 'Your own member app and wallet cards'),
        t('auth.product.loyalty.included_4', 'Email, push and SMS campaigns'),
        t('auth.product.loyalty.included_5', 'Desk scanning, events and insights'),
      ],
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
    included: [
      t('auth.product.content.included_1', 'A content calendar built around your goals'),
      t('auth.product.content.included_2', 'AI post ideas and captions in your brand voice'),
      t('auth.product.content.included_3', 'AI images and visual briefs'),
      t('auth.product.content.included_4', 'Drafts, approvals and a team inbox'),
      t('auth.product.content.included_5', "A morning email with the day's posts"),
    ],
    tabTitle: t('auth.product.content.tab_title', 'HexaTech Content — Sign in'),
  }
}

/** The words both products' pages share. */
export function sharedProductWords(t: TFunction) {
  return {
    perMonth: t('auth.product.per_month', 'per month'),
    trial: (days: number) => t('auth.product.trial', { days, defaultValue: '{{days}}-day free trial, no card needed' }),
    addLater: (other: string, price: string) => t('auth.product.add_later', { other, price, defaultValue: 'Need {{other}} too? Add it any time from Plan & products for {{price}} more a month.' }),
    unavailable: (product: string) => t('auth.product.unavailable', { product, defaultValue: '{{product}} cannot be bought online yet. Please contact HexaTech and we will set it up for you.' }),
    fullSuite: t('auth.product.full_suite', 'Looking for the full HexaTech suite?'),
    seePlans: t('auth.product.see_plans', 'See all plans'),
    included: t('auth.product.included', "What's included"),
  }
}
