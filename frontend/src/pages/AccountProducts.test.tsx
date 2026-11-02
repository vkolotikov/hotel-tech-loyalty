import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import { AccountProducts } from './AccountProducts'
import type { ModulesState } from './accountProducts'

const auth = vi.hoisted(() => ({
  token: 'test-session' as string | null,
  user: { id: 7, email: 'owner@example.test', user_type: 'staff', workspaces: { loyalty: { landing: true, only: true } } },
}))
vi.mock('../stores/authStore', () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => selector ? selector(auth) : auth
  useAuthStore.setState = vi.fn()
  return { useAuthStore }
})
vi.mock('../lib/api', () => ({ api: { get: vi.fn(() => new Promise(() => {})), post: vi.fn() } }))

afterEach(() => { auth.token = 'test-session' })

const opt = (pkg: 'lite' | 'standard' | 'pro', amount: number, extra: number, available = true) =>
  ({ package: pkg, plan_slug: `p_${pkg}`, available, monthly_amount: amount, yearly_amount: Math.round(amount * 12 * 0.85), extra_monthly_amount: extra, currency: 'eur', features: {} })

const loyaltyOnly: ModulesState = {
  organization: { name: 'Loyal Cafe' }, on_modules: true, modules: ['loyalty'], packages: { loyalty: 'standard' }, landing: 'loyalty',
  plan: { slug: 'loyalty', monthly_amount: 8500, yearly_amount: 86700, currency: 'eur' },
  subscription: { status: 'TRIALING', active: true, plan_slug: 'loyalty', trial_end: '2026-11-09T12:00:00Z', period_end: null },
  products: [
    { key: 'appointments', held: false, package: null, can_remove: false, options: [opt('standard', 0, 0, false)] },
    { key: 'loyalty', held: true, package: 'standard', can_remove: false, options: [opt('lite', 4900, -3600), opt('pro', 14900, 6400)] },
    { key: 'content', held: false, package: null, can_remove: false, options: [opt('lite', 12400, 3900), opt('standard', 17000, 8500), opt('pro', 23400, 14900)] },
  ],
  can_manage: true, billing_available: true, yearly_discount_percent: 15,
}

function render(data: ModulesState | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  if (data) client.setQueryData(['account-products'], data)
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={['/account/products']}>
      <QueryClientProvider client={client}><AccountProducts /></QueryClientProvider>
    </MemoryRouter>,
  )
  client.clear()
  return html
}

describe('Plan & products', () => {
  it('shows a Loyalty-only plan, its price and trial, and offers Content for the server\'s difference', () => {
    const html = render(loyaltyOnly)
    expect(html).toContain('Plan &amp; products')
    expect(html).toContain('Loyal Cafe')
    expect(html).toContain('HexaTech Loyalty')
    expect(html).toContain('€85')
    expect(html).toContain('Free trial until')
    expect(html).toContain('Pay monthly: €85')
    expect(html).toContain('Pay yearly: €867 (Save 15%)')
    expect(html).toContain('or €867 a year (Save 15%)')
    expect(html).toContain('Package: Standard')
    expect(html).toContain('Change package')
    expect(html).toContain('Add from €39 a month')
    expect(html).toContain('Not available online yet')
    expect(html).toContain('href="/loyalty"')
  })

  it('tells staff who may not change the plan to ask, with no buttons that would be refused', () => {
    const html = render({ ...loyaltyOnly, can_manage: false })
    expect(html).toContain('Ask an owner or a manager to add it')
    expect(html).toContain('Only an owner or a manager can change the plan.')
    expect(html).not.toContain('Pay monthly')
    expect(html).not.toContain('Change package')
    expect(html).not.toContain('Add from €39 a month')
  })

  it('sends a full customer to Billing in the full admin', () => {
    const html = render({ ...loyaltyOnly, on_modules: false, modules: ['appointments', 'loyalty', 'content'], plan: null,
      packages: {}, products: loyaltyOnly.products.map(p => ({ key: p.key, held: true })) })
    expect(html).toContain('Your plan includes every product')
    expect(html).toContain('href="/billing"')
  })

  it('needs a sign-in', () => {
    auth.token = null
    expect(render(undefined)).toBe('')
  })
})
