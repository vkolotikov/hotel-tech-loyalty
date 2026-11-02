import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { authPath, formatMonthly, packageLines, packageSlug, packagesFor, priceFor, productHome, viewFromPath, type ModulePlan } from './productSignup'
import {
  canChangePackage, canRemove, firstPick, orderedProducts, payIntervals, planAction, planName, planStatus, productAction, productName,
  type ModulesState, type PackageOption,
} from './accountProducts'

const t = i18n.t.bind(i18n)
const plan = (slug: string, modules: string[], amount: number | null, available = true, features: Record<string, string> = {}): ModulePlan =>
  ({ slug, modules, monthly_amount: amount, yearly_amount: amount == null ? null : Math.round(amount * 12 * 0.85), currency: 'eur', trial_days: 7, available, features })

describe('a product\'s own sign-in pages', () => {
  it('has its own addresses beside the full suite\'s', () => {
    expect(authPath('loyalty', 'register')).toBe('/loyalty/register')
    expect(authPath('content', 'login')).toBe('/content/login')
    expect(authPath(null, 'forgot-password')).toBe('/forgot-password')
    expect(authPath(undefined, 'reset-password')).toBe('/reset-password')
  })

  it('reads the view from the address, with or without the product', () => {
    expect(viewFromPath('/loyalty/register')).toBe('trial')
    expect(viewFromPath('/register')).toBe('trial')
    expect(viewFromPath('/content/forgot-password')).toBe('forgot')
    expect(viewFromPath('/content/reset-password')).toBe('reset')
    expect(viewFromPath('/loyalty/login')).toBe('login')
    expect(viewFromPath('/login')).toBe('login')
  })

  it('sends someone who signed in on a product page to its workspace unless a link asked for more', () => {
    expect(productHome('loyalty', '/')).toBe('/loyalty')
    expect(productHome('loyalty', '/loyalty/members/4')).toBe('/loyalty/members/4')
    expect(productHome(undefined, '/')).toBe('/')
    expect(productHome('content', '/', { workspaces: { content: { landing: false } } })).toBe('/content')
    // An organisation without Content lands where it always does.
    expect(productHome('content', '/', { workspaces: { appointments: { only: true } } })).toBe('/')
  })

  it('shows the server\'s price in the visitor\'s language and nothing when it gave none', () => {
    expect(formatMonthly(8500, 'eur', 'en')).toBe('€85')
    expect(formatMonthly(8550, 'eur', 'en')).toBe('€85.50')
    expect(formatMonthly(7225, 'eur', 'en')).toBe('€72.25')
    expect(formatMonthly(8500, 'eur', 'de')).toMatch(/^85\s?€$/)
    expect(formatMonthly(null, 'eur', 'en')).toBeNull()
  })

  it('finds a product\'s three packages cheapest first, and prices them monthly or yearly', () => {
    const plans = [plan('loyalty_pro', ['loyalty'], 14900), plan('loyalty', ['loyalty'], 8500), plan('loyalty_lite', ['loyalty'], 4900), plan('content', ['content'], 8500)]
    const { packages, other } = packagesFor(plans, 'loyalty')
    expect(packages.map(p => p.key)).toEqual(['lite', 'standard', 'pro'])
    expect(other).toBe('content')
    expect(packageSlug('loyalty', 'standard')).toBe('loyalty')
    expect(packageSlug('content', 'pro')).toBe('content_pro')
    expect(priceFor(plans[1], 'monthly', 'en')).toEqual({ perMonth: '€85', perYear: null })
    expect(priceFor(plans[1], 'yearly', 'en')).toEqual({ perMonth: '€72.25', perYear: '€867' })
    expect(priceFor({ monthly_amount: 8500, yearly_amount: null, currency: 'eur' }, 'yearly', 'en')).toEqual({ perMonth: '€85', perYear: null })
  })

  it('reads a package\'s lines from what the server says it grants', () => {
    const lite = { max_loyalty_members: '500', max_team_members: '2', campaigns: 'false', wallet: 'false', push_notifications: 'false' }
    const standard = { max_loyalty_members: '2500', max_team_members: '5', campaigns: 'true', wallet: 'true', push_notifications: 'true' }
    const liteLines = packageLines('loyalty', lite, lite, t, 'en')
    expect(liteLines[0]).toEqual({ text: 'Up to 500 members', included: true })
    expect(liteLines.find(l => l.text === 'Email and SMS campaigns')?.included).toBe(false)
    expect(packageLines('loyalty', standard, lite, t, 'en').find(l => l.text === 'Email and SMS campaigns')?.included).toBe(true)
    expect(packageLines('loyalty', standard, lite, t, 'en')[0].text).toBe('Up to 2,500 members')

    const contentLite = { ai_monthly_cost_cents: '800', max_team_members: '2' }
    const contentPro = { ai_monthly_cost_cents: '5000', max_team_members: '15', priority_support: 'priority' }
    expect(packageLines('content', contentPro, contentLite, t, 'en').map(l => l.text)).toContain('6.3× the monthly AI allowance of Lite')
    expect(packageLines('content', contentLite, contentLite, t, 'en').map(l => l.text)).toContain('A monthly AI allowance for a few posts a week')
    expect(packageLines('content', contentPro, contentLite, t, 'en').find(l => l.text === 'Priority support')?.included).toBe(true)
  })
})

const option = (pkg: 'lite' | 'standard' | 'pro', available = true, extra: number | null = 0): PackageOption =>
  ({ package: pkg, plan_slug: `x_${pkg}`, available, monthly_amount: 8500, yearly_amount: 86700, extra_monthly_amount: extra, currency: 'eur', features: {} })

const state = (over: Partial<ModulesState> = {}): ModulesState => ({
  organization: { name: 'Cafe' }, on_modules: true, modules: ['loyalty'], packages: { loyalty: 'standard' }, landing: 'loyalty',
  plan: { slug: 'loyalty', monthly_amount: 8500, yearly_amount: 86700, currency: 'eur' },
  subscription: { status: 'TRIALING', active: true, plan_slug: 'loyalty', trial_end: null, period_end: null },
  products: [
    { key: 'appointments', held: false, package: null, can_remove: false, options: [option('standard', false)] },
    { key: 'loyalty', held: true, package: 'standard', can_remove: false, options: [option('lite', true, -3600), option('pro', true, 6400)] },
    { key: 'content', held: false, package: null, can_remove: false, options: [option('lite'), option('standard'), option('pro')] },
  ],
  can_manage: true, billing_available: true, yearly_discount_percent: 15, ...over,
})

describe('Plan & products decisions', () => {
  it('reads how the plan stands from billing\'s status', () => {
    expect(planStatus(state())).toBe('trial')
    expect(planStatus(state({ subscription: { ...state().subscription, status: 'ACTIVE' } }))).toBe('active')
    expect(planStatus(state({ subscription: { ...state().subscription, status: 'PAST_DUE_GRACE' } }))).toBe('overdue')
    expect(planStatus(state({ subscription: { ...state().subscription, status: 'EXPIRED', active: false } }))).toBe('ended')
  })

  it('offers an owner or manager to activate a trial, manage a paid card, or start an ended plan again, monthly or yearly', () => {
    expect(planAction(state())).toBe('activate')
    expect(planAction(state({ subscription: { ...state().subscription, status: 'ACTIVE' } }))).toBe('portal')
    expect(planAction(state({ subscription: { ...state().subscription, status: 'CANCELED', active: false } }))).toBe('restart')
    expect(planAction(state({ can_manage: false }))).toBeNull()
    expect(planAction(state({ billing_available: false }))).toBeNull()
    expect(payIntervals(state())).toEqual(['MONTHLY', 'YEARLY'])
    expect(payIntervals(state({ plan: { slug: 'loyalty', monthly_amount: 8500, yearly_amount: null, currency: 'eur' } }))).toEqual(['MONTHLY'])
  })

  it('opens what is held, adds what billing sells, and says why not otherwise', () => {
    const s = state()
    expect(productAction(s.products[1], s)).toBe('open')
    expect(productAction(s.products[2], s)).toBe('add')
    expect(productAction(s.products[0], s)).toBe('unavailable')
    expect(productAction(s.products[2], state({ can_manage: false }))).toBe('ask')
    expect(productAction(s.products[2], state({ subscription: { ...s.subscription, status: 'EXPIRED', active: false } }))).toBe('inactive')
  })

  it('changes a package and removes a product only where the server allows it', () => {
    const s = state()
    expect(canChangePackage(s.products[1], s)).toBe(true)
    expect(canChangePackage(s.products[1], state({ can_manage: false }))).toBe(false)
    expect(canChangePackage(s.products[2], s)).toBe(false)
    expect(canRemove(s.products[1], s)).toBe(false)
    expect(canRemove({ ...s.products[1], can_remove: true }, s)).toBe(true)
    expect(firstPick(s.products[2].options!)).toBe('standard')
    expect(firstPick([option('lite', false), option('pro')])).toBe('pro')
    expect(firstPick([option('lite', false)])).toBeNull()
  })

  it('lists the products held first and names the plan by its packages', () => {
    const names = { appointments: 'A', loyalty: 'HexaTech Loyalty', content: 'HexaTech Content' }
    const pkgs = { lite: 'Lite', standard: 'Standard', pro: 'Pro' } as const
    expect(orderedProducts(state().products).map(p => p.key)).toEqual(['loyalty', 'appointments', 'content'])
    expect(planName({ content: 'lite', loyalty: 'pro' }, names, pkgs)).toBe('HexaTech Loyalty Pro + HexaTech Content Lite')
    expect(planName(['loyalty', 'content'], names, pkgs)).toBe('HexaTech Loyalty + HexaTech Content')
    expect(productName('loyalty', names, 'standard', pkgs)).toBe('HexaTech Loyalty')
  })
})
