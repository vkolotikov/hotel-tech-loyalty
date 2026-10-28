import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoyaltyContext } from '../LoyaltyProvider'
import type { Bootstrap } from '../lib/types'
import { answerFixture } from '../options/fixture'
import type { OptionsAnswer } from '../options/types'
import { OPTIONS_KEY } from '../options/optionsApi'
import { EarnPage } from './EarnPage'

vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => (typeof fallback === 'string' ? fallback : key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars?.[name] ?? '')),
  i18n: { language: 'en' },
}) }))
vi.mock('../../lib/api', () => ({ api: {}, resolveImage: (url: string | null) => url }))
const boot: Bootstrap = {
  name: 'Loyalty', organization: { id: 1, name: 'Northstar Club', industry: 'hotel' }, accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-28', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true }, staff: { id: 1, name: 'Alex', role: 'manager', can: { award: true, redeem: true, reverse: true, manage_program: true, manage_rewards: true, manage_members: true, view_insights: true, manage_campaigns: true, manage_app: true } },
  programme: { on: true, tiers: [], ways: { stamps: false, stamps_per_card: 10, checkin: false, checkin_points: 0, desk_earn: false, cashback: false, cashback_percent: 5, setup_done: true } },
  counts: { members: 3, requests_waiting: 0 },
}
function page(search = '', answer: OptionsAnswer | null = answerFixture({ setup_done: true })) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (answer) client.setQueryData(OPTIONS_KEY, answer)
  const html = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/loyalty/options' + search]}><LoyaltyContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}><EarnPage /></LoyaltyContext.Provider></MemoryRouter></QueryClientProvider>)
  client.clear()
  return html
}

describe('WE01–03 server integration', () => {
  it('retains all six existing earning methods, setup and checks on the new root', () => {
    const html = page()
    for (const key of ['earn_rate', 'points_on_spend', 'stamp_card', 'check_in', 'desk_earn', 'cashback']) expect(html).toContain(`data-way="${key}"`)
    expect(html).toContain('/loyalty/options/setup')
    expect(html).toContain('/loyalty/options?tab=overview')
    expect(html).toContain('Stamp card')
    expect(html).not.toContain('Booking stamps')
  })
  it('uses the server rate and currency, bounded controls and an explicitly illustrative preview', () => {
    const data = answerFixture(); data.options.points_per_currency = 2.25; data.fields.points_per_currency.max = 6
    const html = page('?way=earn_rate', data)
    expect(html).toContain('value="2.25"')
    expect(html).toContain('min="0.01" max="6" step="0.01"')
    expect(html).toContain('112 points')
    expect(html).toContain('Base earning · example only')
    expect(html).not.toContain('10 points</button>')
    expect(html).toContain('Completed bookings and desk purchases when enabled')
  })
  it('permissions disable controls and remove every write action, including the separate rules form', () => {
    const data = answerFixture({ can_change: false })
    const purchase = page('?way=earn_rate', data), bonus = page('?tab=bonus', data)
    expect(purchase).toContain('Only an owner or a manager')
    expect(purchase).toMatch(/aria-label="Points for each €1 spent"[^>]*disabled=""/)
    expect(purchase).not.toContain('Save changes')
    expect(bonus).not.toContain('Save bonus')
    expect(bonus).not.toContain('Save rules')
    expect(page('', data)).not.toContain('+ Add earning rule')
  })
  it('keeps referrals and conditional stamp reward fields reachable by existing bookmarks', () => {
    const data = answerFixture(); data.options.stamps_enabled = true; data.options.stamp_reward_kind = 'reward'; data.options.stamp_reward_id = 9
    expect(page('?way=referrals', data)).toContain('Points for the member who refers')
    const html = page('?way=stamp_card', data)
    expect(html).toContain('Spa ritual')
    expect(html).toContain('value="9" selected=""')
    expect(html).not.toContain('data-field="stamp_reward_points"')
  })
  it('keeps arbitrary valid expiry months and only server qualification choices', () => {
    const data = answerFixture(); data.options.points_expiry_months = 7; data.options.tier_progress_by = 'visits'
    data.ways.push({ key: 'tier_progress', switch: null, zero_off: null, fields: ['tier_progress_by'] })
    data.fields.tier_progress_by = { type: 'enum', default: 'points', choices: ['points', 'visits'], min: null, max: null, when: null }
    const html = page('?tab=bonus', data)
    expect(html).toContain('value="custom" selected=""')
    expect(html).toContain('value="7"')
    expect(html).toContain('value="0">Never')
    expect(html).toContain('value="visits" selected=""')
    expect(html).not.toContain('value="spend"')
  })
  it('shows filtered empty, actual empty and loading states without fixture rows', () => {
    expect(page('?q=missing')).toContain('No earning methods match these filters.')
    expect(page('', answerFixture({ ways: [] }))).toContain('No earning methods are available.')
    const loading = page('', null)
    expect(loading).not.toContain('data-way=')
    expect(loading).not.toContain('5 points')
  })
  it('preserves unknown server methods and the original checks/journey route', () => {
    const data = answerFixture(); data.ways.push({ key: 'future_method', fields: [], switch: null, zero_off: null })
    expect(page('?tab=more', data)).toContain('data-way="future_method"')
    expect(page('?tab=overview', data)).toContain('options-tab-overview')
  })
})
