import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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

import { LoyaltyContext } from '../LoyaltyProvider'
import type { Bootstrap, Can, Ways } from '../lib/types'
import { MembersPage } from '../members/MembersPage'
import { NO_FILTERS } from '../members/membersQuery'
import { answerFixture } from './fixture'
import { OPTIONS_KEY } from './optionsApi'
import { OptionsPage } from './OptionsPage'
import type { OptionsAnswer } from './types'
import { WayCard } from './WayCard'

const can = (manager: boolean): Can => ({ award: true, redeem: true, reverse: manager, manage_program: manager, manage_rewards: false, manage_members: manager, view_insights: false, manage_campaigns: manager, manage_app: manager })
const ways = (more: Partial<Ways> = {}): Ways => ({ stamps: false, stamps_per_card: 10, checkin: false, checkin_points: 0, desk_earn: false, cashback: false, cashback_percent: 5, setup_done: false, ...more })
const boot = (manager: boolean, w: Ways | undefined = ways()): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'beauty' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-25', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: manager ? 'manager' : 'staff', can: can(manager) },
  programme: { on: true, tiers: [], ways: w },
  counts: { members: 40, requests_waiting: 0 },
})

function wrap(children: ReactNode, b: Bootstrap, data: OptionsAnswer | null, path = '/loyalty/options') {
  const client = new QueryClient()
  if (data) client.setQueryData(OPTIONS_KEY, data)
  client.setQueryData(['loyalty', 'members', NO_FILTERS], { page: 1, pages: 1, total: 0, members: [], figures: { total: 0, active: 0, new_this_month: 0, average_points: 0, tiers: {} } })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LoyaltyContext.Provider value={{ data: b, isLoading: false, isError: false, error: null, refetch: () => {} }}>{children}</LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const page = (manager: boolean, data: OptionsAnswer | null = answerFixture({ can_change: manager }), w?: Ways) => wrap(<OptionsPage />, boot(manager, w), data)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
/** One card on its own, open as after Change (the tests cannot press it). */
const opened = (way: string, data: OptionsAnswer = answerFixture({ can_change: true }), manage = true) =>
  wrap(<WayCard way={data.ways.find(w => w.key === way)!} answer={data} manage={manage} defaultOpen />, boot(manage), data)
const card = (html: string, way: string) => {
  const start = html.indexOf(`data-way="${way}"`)
  const end = html.indexOf('</form>', start)
  return html.slice(start, end)
}

describe('Ways to earn (release 7 §1)', () => {
  it('shows a card per way in three coloured sections (earn, bonuses, rules), the server’s order within each, each saying what members get', () => {
    const html = page(true)
    // Design pass 2026-10-26 (groups.ts): earn, then bonuses, then rules.
    const order = ['points_on_spend', 'stamp_card', 'check_in', 'desk_earn', 'cashback', 'welcome_bonus', 'birthday_bonus', 'referrals', 'points_expiry']
    const at = order.map(w => html.indexOf(`data-way="${w}"`))
    expect(at.every(i => i > 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)

    const words = text(html)
    for (const title of ['Points on spend', 'Points expiry', 'Welcome bonus', 'Birthday bonus', 'Referrals', 'Stamp card', 'Check-in', 'Earn at the desk', 'Cashback credit']) {
      expect(words).toContain(title)
    }
    expect(words).toContain('Members get 1 point for every €1 they spend.')
    expect(words).toContain('Points expire 24 months after they are earned.')
    expect(words).toContain('New members get 500 points when they join.')
    expect(words).toContain('No stamp card.')
    expect(words).toContain('No cashback credit.')
  })

  it('a card says On or Off and what members get; its numbers open with Change, prefilled; one that is off has no Change', () => {
    const html = page(true)
    // Short cards: the numbers wait behind Change.
    expect(text(card(html, 'referrals'))).toContain('Referrals On')
    expect(text(card(html, 'referrals'))).toContain('Change Referrals')
    expect(card(html, 'referrals')).not.toContain('value="250"')
    expect(text(card(html, 'stamp_card'))).toContain('Stamp card Off')
    expect(text(card(html, 'stamp_card'))).not.toContain('Change')
    // Earning at the desk has no numbers to open.
    expect(text(card(html, 'desk_earn'))).not.toContain('Change')

    const referrals = card(opened('referrals'), 'referrals')
    expect(referrals).toContain('role="switch" aria-checked="true"')
    expect(text(referrals)).toContain('Points for the member who refers')
    expect(referrals).toContain('value="250"')
    expect(text(referrals)).toContain('After the friend’s first visit')
    expect(text(referrals)).toContain('As soon as the friend joins')
    expect(text(referrals)).toContain('Cancel')
    expect(text(card(opened('points_on_spend'), 'points_on_spend'))).toContain('Points for each €1 spent')

    // A way that is off shows no numbers even when asked to open: switching it on opens them.
    const stamps = card(opened('stamp_card'), 'stamp_card')
    expect(stamps).toContain('role="switch" aria-checked="false"')
    expect(text(stamps)).not.toContain('Stamps on a card')
  })

  it('a stamp card that gives a reward picks it from the catalogue', () => {
    const data = answerFixture({ options: { ...answerFixture().options, stamps_enabled: true, stamp_reward_kind: 'reward', stamp_reward_id: 9 } })
    const stamps = card(opened('stamp_card', data), 'stamp_card')
    expect(text(stamps)).toContain('A card holds 10 stamps; a full card gives Spa ritual.')
    expect(text(stamps)).toContain('Reward for a full card')
    expect(stamps).toMatch(/<option value="9" selected="">Spa ritual<\/option>/)
    expect(text(stamps)).not.toContain('Points for a full card')
  })

  it('gives a manager working switches and the wizard; a card shows its Save only once something changed', () => {
    const html = page(true)
    expect((html.match(/role="switch"[^>]*disabled=""/g) ?? []).length).toBe(0)
    expect((html.match(/role="switch"/g) ?? []).length).toBe(9)
    // Untouched cards have nothing to press (WayCard shows Save and "Not saved yet." while a change waits).
    expect(html).not.toContain('type="submit"')
    expect(text(html)).not.toContain('Not saved yet.')
    expect(html).toContain('href="/loyalty/options/setup"')
    expect(text(html)).not.toContain('You see them as they are.')
  })

  it('says each way once: its title and what members get, no line restating it', () => {
    const words = text(page(true))
    expect(words).not.toContain('Points for joining.')
    expect(words).not.toContain('How members earn points and what they get back.')
    expect(words).toContain('Points on spend On Members get 1 point for every €1 they spend.')
  })

  it('shows anyone else the options read-only, and says why', () => {
    const html = page(false)
    expect(text(html)).toContain('Only an owner or a manager can change these. You see them as they are.')
    expect(html).not.toContain('type="submit"')
    expect(html).not.toContain('href="/loyalty/options/setup"')
    expect((html.match(/role="switch"[^>]*disabled=""/g) ?? []).length).toBe(9)
    // Nothing to open: the sentence says the numbers.
    expect(text(html)).not.toContain('Change')
    expect(text(card(html, 'referrals'))).toContain('250 points')
    expect(card(opened('referrals', answerFixture({ can_change: false }), false), 'referrals')).toMatch(/value="250" disabled=""|disabled="" [^>]*value="250"/)
  })

  it('heads each section with its colour and how many of its ways are on, and jumps to each from the top', () => {
    const html = page(true)
    for (const [group, hue] of [['earn', 'earn'], ['bonus', 'bonus'], ['rule', 'rule']]) {
      expect(html).toMatch(new RegExp(`<section id="ways-${group}" data-group="${group}" data-hue="${hue}"`))
      expect(html).toContain(`href="#ways-${group}"`)
    }
    expect(html).toContain('href="#options-parts"')
    const words = text(html)
    expect(words).toMatch(/Earn points \d of 5 on/)
    expect(words).toMatch(/Bonuses \d of 3 on/)
    expect(words).toContain('Rules 1 of 1 on')
    // An off card is grey; an on one wears its section's colour.
    expect(card(html, 'stamp_card')).toMatch(/^data-way="stamp_card" data-hue="off"/)
    expect(card(html, 'referrals')).toMatch(/^data-way="referrals" data-on="" data-hue="bonus"/)
  })

  it('links the rest of the programme with how many there are', () => {
    const html = page(true)
    const words = text(html)
    expect(words).not.toContain('Open Program')
    expect(words).toContain('Tiers 3 In the ladder')
    expect(words).toContain('Rewards 2 In the catalogue')
    expect(words).toContain('Offers 2 Switched on')
    expect(words).toContain('Boosts 1 On now or coming up')
    expect(html).toContain('href="/loyalty/rewards?tab=offers"')
    expect(html).toContain('href="/loyalty/program"')
  })

  it('offers a manager the wizard in a banner until it was applied or skipped', () => {
    expect(text(page(true))).toContain('Set up your programme in a few minutes')
    expect(page(true)).toContain('data-setup-banner')
    expect(page(true, undefined, ways({ setup_done: true }))).not.toContain('data-setup-banner')
    expect(page(false, answerFixture({ can_change: false }))).not.toContain('data-setup-banner')
  })

  it('the Members page carries the same banner for a manager', () => {
    const html = wrap(<MembersPage />, boot(true), null, '/loyalty')
    expect(html).toContain('data-setup-banner')
    expect(text(html)).toContain('Not now')
    expect(html).toContain('href="/loyalty/options/setup"')
    expect(wrap(<MembersPage />, boot(false), null, '/loyalty')).not.toContain('data-setup-banner')
  })

  it('says it is loading before the answer comes', () => {
    expect(text(page(true, null))).toContain('Loading…')
  })
})
