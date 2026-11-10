import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PortalContext } from '../PortalProvider'
import type { PortalBootstrap, Reward } from '../lib/types'
import { Rewards } from '../pages/Rewards'
import en from '../i18n/design.en.json'
import de from '../i18n/design.de.json'
import fr from '../i18n/design.fr.json'
import es from '../i18n/design.es.json'
import ru from '../i18n/design.ru.json'

vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: (key: string, fallback?: string, args?: Record<string, unknown>) => Object.entries(args ?? {}).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), fallback ?? key),
  i18n: { language: 'en' },
}) }))
vi.mock('../../lib/api', () => ({ api: {} }))

const reward = (extra: Partial<Reward> = {}): Reward => ({ id: 1, name: 'Coffee reward', points_cost: 100, can_afford: true, claimed_by_me: 0, remaining_for_me: 1, in_stock: true, ...extra })
function render(rows: Reward[], tab = '', loyalty = true) {
  const client = new QueryClient()
  client.setQueryData(['portal-rewards'], { rewards: rows, current_points: 500 })
  client.setQueryData(['portal-benefits'], { tier: 'Silver', benefits: [{ tier_benefit_id: 1, name: 'Welcome drink', requestable: false, fulfillment_mode: 'automatic' }] })
  client.setQueryData(['portal-offers'], { general: [{ id: 4, title: 'Spring offer', type: 'percent_discount', value: 15 }], personalized: [] })
  const data = { venue: { currency: 'EUR' }, capabilities: { loyalty }, member: { current_points: 500, membership_mode: 'assigned' } } as PortalBootstrap
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/portal/rewards' + tab]}><PortalContext.Provider value={{ data, isLoading: false, isError: false, error: null, refetch: () => {} }}><Rewards /></PortalContext.Provider></MemoryRouter></QueryClientProvider>)
}

describe('simplified portal rewards', () => {
  it('presents benefits, points rewards and member offers together', () => {
    const html = render([reward()])
    for (const text of ['Welcome drink', 'Coffee reward', 'Spring offer', 'Available now', 'My codes']) expect(html).toContain(text)
    expect(html.match(/<article /g)).toHaveLength(3)
    expect(html).not.toContain('role="tablist"')
  })
  it('never offers redemption for a server refusal, even when the displayed balance could pay', () => {
    for (const extra of [{ can_afford: false }, { remaining_for_me: 0 }, { in_stock: false }]) {
      const html = render([reward(extra)])
      expect(html).not.toMatch(/>Redeem(?:\s|<)/)
      expect(html).toContain('More rewards')
    }
  })
  it('keeps old catalogue links useful and opens saved-code bookmarks', () => {
    const html = render([reward()], '?tab=catalogue')
    expect(html.indexOf('Coffee reward')).toBeLessThan(html.indexOf('Welcome drink'))
    expect(render([reward()], '?tab=codes')).toContain('<dialog')
  })
  it('keeps assigned membership benefits while points are disabled, including after cached loyalty reads', () => {
    const html = render([reward()], '?tab=benefits', false)
    expect(html).toContain('Welcome drink')
    expect(html).toContain('Show card')
    expect(html).not.toContain('Coffee reward')
    expect(html).not.toContain('Spring offer')
    expect(html).not.toContain('You have')
  })
})

it('carries every new sentence and interpolation in all five languages', () => {
  for (const bundle of [de, fr, es, ru]) {
    expect(Object.keys(bundle).sort()).toEqual(Object.keys(en).sort())
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(bundle[key].trim(), key).not.toBe('')
      const holes = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
      expect(holes(bundle[key]), key).toEqual(holes(en[key]))
    }
  }
})
