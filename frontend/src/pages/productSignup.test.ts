import { describe, expect, it } from 'vitest'
import { authPath, formatMonthly, plansFor, productHome, viewFromPath, type ModulePlan } from './productSignup'
import { orderedProducts, planAction, planName, planStatus, productAction, type ModulesState } from './accountProducts'

const plan = (slug: string, modules: string[], amount: number | null, available = true): ModulePlan =>
  ({ slug, modules, monthly_amount: amount, currency: 'eur', trial_days: 7, available })

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
    expect(formatMonthly(8500, 'eur', 'de')).toMatch(/^85\s?€$/)
    expect(formatMonthly(null, 'eur', 'en')).toBeNull()
  })

  it('finds the product alone and with the other one in the catalogue', () => {
    const plans = [plan('loyalty', ['loyalty'], 8500), plan('content', ['content'], 8500), plan('loyalty-content', ['loyalty', 'content'], 17000)]
    expect(plansFor(plans, 'content')).toEqual({ alone: plans[1], other: 'loyalty', together: plans[2] })
    expect(plansFor([], 'loyalty')).toEqual({ alone: null, other: 'content', together: null })
  })
})

const state = (over: Partial<ModulesState> = {}): ModulesState => ({
  organization: { name: 'Cafe' }, on_modules: true, modules: ['loyalty'], landing: 'loyalty',
  plan: { slug: 'loyalty', monthly_amount: 8500, currency: 'eur' },
  subscription: { status: 'TRIALING', active: true, plan_slug: 'loyalty', trial_end: null, period_end: null },
  products: [
    { key: 'appointments', held: false, available: false },
    { key: 'loyalty', held: true },
    { key: 'content', held: false, available: true, monthly_amount: 17000, extra_monthly_amount: 8500, currency: 'eur' },
  ],
  can_manage: true, billing_available: true, ...over,
})

describe('Plan & products decisions', () => {
  it('reads how the plan stands from billing\'s status', () => {
    expect(planStatus(state())).toBe('trial')
    expect(planStatus(state({ subscription: { ...state().subscription, status: 'ACTIVE' } }))).toBe('active')
    expect(planStatus(state({ subscription: { ...state().subscription, status: 'PAST_DUE_GRACE' } }))).toBe('overdue')
    expect(planStatus(state({ subscription: { ...state().subscription, status: 'EXPIRED', active: false } }))).toBe('ended')
    expect(planStatus(state({ subscription: { ...state().subscription, status: null, active: false } }))).toBe('ended')
  })

  it('offers an owner or manager to activate a trial, manage a paid card, or start an ended plan again', () => {
    expect(planAction(state())).toBe('activate')
    expect(planAction(state({ subscription: { ...state().subscription, status: 'ACTIVE' } }))).toBe('portal')
    expect(planAction(state({ subscription: { ...state().subscription, status: 'CANCELED', active: false } }))).toBe('restart')
    expect(planAction(state({ can_manage: false }))).toBeNull()
    expect(planAction(state({ billing_available: false }))).toBeNull()
    expect(planAction(state({ on_modules: false }))).toBeNull()
  })

  it('opens what is held, adds what billing sells, and says why not otherwise', () => {
    const s = state()
    expect(productAction(s.products[1], s)).toBe('open')
    expect(productAction(s.products[2], s)).toBe('add')
    expect(productAction(s.products[0], s)).toBe('unavailable')
    expect(productAction(s.products[2], state({ can_manage: false }))).toBe('ask')
    expect(productAction(s.products[2], state({ subscription: { ...s.subscription, status: 'EXPIRED', active: false } }))).toBe('inactive')
  })

  it('lists the products held first and names the plan by them', () => {
    expect(orderedProducts(state().products).map(p => p.key)).toEqual(['loyalty', 'appointments', 'content'])
    expect(planName(['loyalty', 'content'], { appointments: 'A', loyalty: 'HexaTech Loyalty', content: 'HexaTech Content' })).toBe('HexaTech Loyalty + HexaTech Content')
  })
})
