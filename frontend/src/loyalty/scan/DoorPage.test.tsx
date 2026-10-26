import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {}, resolveImage: (url: string | null | undefined) => url ?? null }))

import { LoyaltyContext, type LoyaltyContextValue } from '../LoyaltyProvider'
import type { Bootstrap, MemberRow } from '../lib/types'
import { DoorChooser, DoorPage } from './DoorPage'
import type { EventRow, PlaceRow } from './scanApi'
import { answerVerdict, failureVerdict } from './verdict'
import { DoorVerdict } from './VerdictCard'

const boot: Bootstrap = {
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'club' },
  accent: '#7c3aed',
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-25', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: 'staff', can: { award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false } },
  programme: { on: true, tiers: [] },
  counts: { members: 40, requests_waiting: 0 },
}
const ready: LoyaltyContextValue = { data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }

function render(node: ReactElement, at = '/loyalty/scan/door', loyalty: LoyaltyContextValue = ready) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[at]}>
        <LoyaltyContext.Provider value={loyalty}>{node}</LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const member: MemberRow = {
  id: 7, name: 'Ada Lovelace', email: null, phone: null, member_number: 'LS-001007', tier_id: 2, points: 1200, lifetime_points: 3000,
  is_active: true, joined_at: null, last_activity_at: null,
}

describe('door mode (release 8 §2)', () => {
  it('wears the workspace’s own tokens outside the shell, full screen, while the bootstrap loads', () => {
    const html = render(<DoorPage />, '/loyalty/scan/door?place=3', { ...ready, data: undefined, isLoading: true })
    expect(html).toMatch(/^<div data-workspace="" data-loyalty="" data-door="" data-theme="light"/)
    expect(html).toContain('fixed inset-0')
    expect(text(html)).toContain('Starting door mode…')
  })

  it('says it could not start, with a way to try again and a way back', () => {
    const html = render(<DoorPage />, '/loyalty/scan/door', { ...ready, data: undefined, isError: true, error: new Error('down') })
    const words = text(html)
    expect(words).toContain('Door mode could not start')
    expect(words).toContain('Try again')
    expect(html).toContain('href="/loyalty/scan"')
  })

  it('at a place: ready for the next member, the ways to scan, a reader field that keeps the soft keyboard down, sound off, Exit', () => {
    const html = render(<DoorPage />, '/loyalty/scan/door?place=3')
    const words = text(html)
    expect(words).toContain('Ready — scan the next member')
    for (const part of ['Start the camera', 'Sound off', 'Exit', 'Check']) expect(words).toContain(part)
    expect(html).toMatch(/<input[^>]*inputmode="none"[^>]*autofocus|<input[^>]*autofocus[^>]*inputmode="none"/i)
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*?Sound off/)
    expect(html).toContain('aria-live="assertive"')
    // Nothing starts on its own: the camera waits for a tap; no menus.
    expect(html).not.toContain('<video')
    expect(html).not.toContain('data-rail')
    expect(words).not.toContain('Leave door mode?')
  })

  it('without a place or an event, asks where this screen lets members in', () => {
    const words = text(render(<DoorPage />, '/loyalty/scan/door?desk'))
    expect(words).toContain('Door mode')
    expect(words).toContain('Choose where this screen lets members in.')
    expect(words).toContain('Back to Scan')
  })

  it('the choice: each place and each event open today, in big buttons; none, with "Set up places" for a manager', () => {
    const places: PlaceRow[] = [{ id: 3, name: 'VIP lounge', admits: 'all', tiers: [], is_active: true }]
    const events: EventRow[] = [{ id: 5, title: 'Wine tasting', starts_at: '2026-10-25T18:00', ends_at: '2026-10-25T23:00', place: null, location: null, status: 'published' }]
    const words = text(render(<DoorChooser choices={{ places, events, loading: false, failed: false, canSetUp: true }} onChoose={() => {}} />))
    for (const part of ['Places', 'VIP lounge', 'Events today', 'Wine tasting', '18:00–23:00']) expect(words).toContain(part)
    expect(words).not.toContain('Set up places')

    // The place scanned for was removed: door mode is back at the choice, and says why.
    expect(text(render(<DoorChooser choices={{ places, events, loading: false, failed: false, canSetUp: false }} onChoose={() => {}} gone="place" />)))
      .toContain('This place no longer exists. Choose another place, or the desk.')

    const none = render(<DoorChooser choices={{ places: [], events: [], loading: false, failed: false, canSetUp: true }} onChoose={() => {}} />)
    expect(text(none)).toContain('There is no place, and no event today, to scan for.')
    expect(none).toContain('href="/loyalty/program#places"')
  })
})

describe('the door’s verdict', () => {
  const facts = { locale: 'en', today: '2026-10-25', nowWall: '2026-10-25T19:00', timeZone: 'Europe/Riga' }

  it('fills the screen in its tone: the icon, huge words, the member on a card, the countdown', () => {
    const view = answerVerdict({
      member,
      verdict: { granted: true, reason: 'welcome', valid_until: '2026-10-30', expires_in_days: 5, tier: { id: 2, name: 'Gold', color: '#d4a017' }, allowed_tiers: [], place: { id: 3, name: 'VIP lounge' } },
      benefits: [{ name: 'Free drink', value: null, category: 'perk' }],
    }, facts)
    const html = render(<DoorVerdict view={view} drain={false} />)
    const words = text(html)
    expect(html).toContain('data-tone="warning"')
    expect(html).toContain('absolute inset-0')
    expect(html).toContain('l-verdict-bar')
    for (const part of ['Welcome', 'Membership ends in 5 days.', 'Ada Lovelace', 'Gold', 'LS-001007', 'Free drink']) expect(words).toContain(part)
    // At the door the name is read, not followed.
    expect(html).not.toContain('href=')
  })

  it('a refusal and an unknown card are red; no connection is grey and says so', () => {
    const denied = answerVerdict({ member, verdict: { granted: false, reason: 'member_off', valid_until: null, expires_in_days: null, tier: null, allowed_tiers: [] } }, facts)
    const html = render(<DoorVerdict view={denied} drain />)
    expect(html).toContain('data-tone="denied"')
    expect(text(html)).toContain('No access')
    expect(text(html)).toContain('This membership is switched off.')
    expect(html).toMatch(/transition-duration:\s*4000ms/)

    const unknown = render(<DoorVerdict view={failureVerdict({ status: 410, code: 'used_up', extra: {} })} drain={false} />)
    expect(unknown).toContain('data-tone="denied"')
    expect(text(unknown)).toContain('Card not recognised')

    const offline = render(<DoorVerdict view={failureVerdict({ status: 0, code: 'network', extra: {} })} drain={false} />)
    expect(offline).toContain('data-tone="trouble"')
    expect(text(offline)).toContain('No connection. Try again.')
  })
})
