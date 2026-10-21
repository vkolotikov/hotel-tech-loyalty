import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoyaltyContext, type LoyaltyContextValue } from './LoyaltyProvider'
import { LoyaltyShell } from './LoyaltyShell'
import { areaOf } from './shell/areaOf'
import type { Bootstrap } from './lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))
vi.mock('../lib/logout', () => ({ logoutAndRedirect: vi.fn() }))
vi.mock('../i18n', () => ({ SUPPORTED_LANGUAGES: [{ code: 'en', label: 'English' }, { code: 'ru', label: 'Русский' }] }))
vi.mock('../lib/api', () => ({ api: {}, resolveImage: (url: string | null | undefined) => url ?? null }))

const boot: Bootstrap = {
  name: 'HexaTech Loyalty',
  organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  accent: '#7c5cff',
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-05', currency: 'EUR' },
  features: { campaigns: true, wallet: true },
  staff: { id: 4, name: 'Vitalij K', role: 'super_admin', can: { award: true, redeem: true, reverse: true, manage_program: true, manage_rewards: true, manage_members: true, view_insights: true, manage_campaigns: true, manage_app: true } },
  programme: { on: true, tiers: [{ id: 1, name: 'Silver', color: '#9ca3af', min_points: 0, is_active: true }] },
  counts: { members: 120, requests_waiting: 3 },
}

function render(value: Partial<LoyaltyContextValue> = {}, data: Partial<Bootstrap> = {}, at = '/loyalty') {
  const full: LoyaltyContextValue = { data: { ...boot, ...data }, isLoading: false, isError: false, error: null, refetch: () => {}, ...value }
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/loyalty/*" element={
            <LoyaltyContext.Provider value={full}><LoyaltyShell><p>page body</p></LoyaltyShell></LoyaltyContext.Provider>
          } />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const refused = (code: string) => ({ response: { status: 403, data: { error: code } } })

describe('LoyaltyShell (spec 2026-10-21 §4)', () => {
  it('is its own token scope in the cards frame, names the product and the organisation, and draws the page', () => {
    const html = render()
    expect(html).toContain('data-workspace=""')
    expect(html).toContain('data-loyalty=""')
    expect(html).toContain('data-rail-variant="cards"')
    expect(html).toContain('HexaTech Loyalty')
    expect(html).toContain('Lumière Salon')
    expect(html).toContain('page body')
  })

  it('lists the areas, Requests with what waits, and the managers\' areas only for whoever may use them (release 2 §3)', () => {
    const html = render()
    for (const area of ['Members', 'Requests', 'Program', 'Rewards', 'Campaigns', 'Insights', 'Scan', 'Card &amp; app']) expect(html).toContain(area)
    const staffCan = { ...boot.staff.can, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false }
    const staff = render({}, { staff: { ...boot.staff, role: 'staff', can: staffCan } })
    for (const area of ['Members', 'Requests', 'Program', 'Rewards', 'Scan']) expect(staff).toContain(area)
    for (const area of ['href="/loyalty/campaigns"', 'href="/loyalty/insights"', 'href="/loyalty/app"']) expect(staff).not.toContain(area)
    expect(render({}, { staff: { ...boot.staff, role: 'staff', can: { ...staffCan, view_insights: true } } })).toContain('href="/loyalty/insights"')
    expect(html).toMatch(/data-nav-count=""[^>]*>3<\/span>/)
    expect(render({}, { counts: { members: 1, requests_waiting: 0 } })).not.toContain('data-nav-count')
  })

  it('keeps the desk\'s areas in the phone\'s top bar and puts the others in the phone menu', () => {
    const html = render()
    const menu = html.slice(html.indexOf('data-phone-areas'))
    const bar = html.slice(html.indexOf('<header'), html.indexOf('data-phone-areas'))
    for (const to of ['/loyalty/requests', '/loyalty/scan']) expect(bar).toContain(`href="${to}"`)
    for (const to of ['/loyalty/program', '/loyalty/rewards', '/loyalty/campaigns', '/loyalty/insights', '/loyalty/app']) {
      expect(bar).not.toContain(`href="${to}"`)
      expect(menu).toContain(`href="${to}"`)
    }
  })

  it('names the organisation\'s owner as such at the foot', () => {
    expect(render()).toContain('Owner')
  })

  it('puts the page in the breadcrumb', () => {
    expect(render({}, {}, '/loyalty/requests')).toMatch(/aria-current="page"[^>]*>Requests</)
    expect(render({}, {}, '/loyalty/members/12')).toMatch(/aria-current="page"[^>]*>Members</)
  })

  it('says when the programme has no active tier, in the words for who is reading', () => {
    expect(render({}, { programme: { on: false, tiers: [] } })).toContain('Add or switch on a tier under Program')
    const staffCan = { award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false }
    expect(render({}, { programme: { on: false, tiers: [] }, staff: { ...boot.staff, role: 'staff', can: staffCan } })).toContain('your manager has not set up its tiers')
  })

  it('turns a switch-off or a lapsed subscription into a calm notice with the way back, and no page', () => {
    const off = render({ data: undefined, isError: true, error: refused('workspace_disabled') })
    expect(off).toContain('switched off for your organisation')
    expect(off).toContain('Open the full admin')
    expect(off).not.toContain('page body')
    expect(render({ data: undefined, isError: true, error: refused('subscription_required') })).toContain('subscription is not active')
  })

  it('says it is loading, and offers Try again when the first read fails', () => {
    expect(render({ data: undefined, isLoading: true })).toContain('Loading…')
    expect(render({ data: undefined, isError: true, error: { response: { status: 500, data: {} } } })).toContain('Try again')
  })
})

describe('the area an address shows', () => {
  it('is Members for the list, a member\'s page and anything unknown', () => {
    expect(areaOf('/loyalty')).toBe('members')
    expect(areaOf('/loyalty/members/5')).toBe('members')
    expect(areaOf('/loyalty/nowhere')).toBe('members')
    expect(areaOf('/loyalty/requests')).toBe('requests')
    expect(areaOf('/loyalty/rewards')).toBe('rewards')
    expect(areaOf('/loyalty/members/duplicates')).toBe('members')
    expect(areaOf('/loyalty/campaigns/4')).toBe('campaigns')
    expect(areaOf('/loyalty/insights')).toBe('insights')
    expect(areaOf('/loyalty/app')).toBe('app')
  })
})
