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
import { answerFixture, presetFixture } from './fixture'
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

const tab = (name: string, manager = true, data: OptionsAnswer = answerFixture({ can_change: manager })) =>
  wrap(<OptionsPage />, boot(manager), data, `/loyalty/options?tab=${name}`)

describe('Ways to earn (release 7 §1; tabs and checks, owner 2026-10-26)', () => {
  it('opens on the Overview, with a tab per section saying how many of its ways are on', () => {
    const html = page(true)
    expect(html).toContain('role="tablist"')
    expect(html).toMatch(/role="tab" id="options-tab-overview" aria-selected="true"[^>]*tabindex="0"/)
    expect(html).toMatch(/role="tabpanel" aria-labelledby="options-tab-overview"/)
    const tabText = (name: string) => text(html.slice(html.indexOf(`id="options-tab-${name}"`), html.indexOf('</button>', html.indexOf(`id="options-tab-${name}"`))))
    expect(tabText('earn')).toContain('Earn points 2/6')
    expect(tabText('bonus')).toMatch(/Bonuses \d\/3/)
    expect(tabText('rule')).toContain('Rules 1/1')
    // The Overview shows no cards: they are in their sections' tabs.
    expect(html).not.toContain('data-way=')
  })

  it('shows a section’s cards in its tab, in the server’s order, each saying what members get', () => {
    const earn = tab('earn')
    const order = ['earn_rate', 'points_on_spend', 'stamp_card', 'check_in', 'desk_earn', 'cashback']
    const at = order.map(w => earn.indexOf(`data-way="${w}"`))
    expect(at.every(i => i > 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(earn).not.toContain('data-way="welcome_bonus"')
    expect(earn).toMatch(/<section data-group="earn" data-hue="earn"/)
    expect(text(earn)).toMatch(/Earn points 2 of 6 on/)
    const words = text(earn)
    for (const line of ['Earn rate Members get 1 point for every €1 they spend.', 'Points on bookings On Completed bookings earn points at your earn rate.', 'No stamp card.', 'No cashback credit.']) {
      expect(words).toContain(line)
    }
    expect(text(tab('bonus'))).toContain('New members get 500 points when they join.')
    expect(text(tab('rule'))).toContain('Points expire 24 months after they are earned.')
  })

  it('a card says On or Off and what members get; its numbers open with Change, prefilled; one that is off has no Change', () => {
    const bonus = tab('bonus')
    expect(text(card(bonus, 'referrals'))).toContain('Referrals On')
    expect(text(card(bonus, 'referrals'))).toContain('Change Referrals')
    expect(card(bonus, 'referrals')).not.toContain('value="250"')
    const earn = tab('earn')
    expect(text(card(earn, 'stamp_card'))).toContain('Stamp card Off')
    expect(text(card(earn, 'stamp_card'))).not.toContain('Change')
    // Neither the desk nor points on bookings has numbers: the rate is the Earn rate's.
    expect(text(card(earn, 'desk_earn'))).not.toContain('Change')
    expect(text(card(earn, 'points_on_spend'))).not.toContain('Change')
    expect(text(card(earn, 'earn_rate'))).toContain('Change Earn rate')
    expect(card(earn, 'earn_rate')).not.toContain('role="switch"')
    expect(card(earn, 'stamp_card')).toMatch(/^data-way="stamp_card" data-hue="off"/)

    const referrals = card(opened('referrals'), 'referrals')
    expect(referrals).toContain('role="switch" aria-checked="true"')
    expect(text(referrals)).toContain('Points for the member who refers')
    expect(referrals).toContain('value="250"')
    expect(text(referrals)).toContain('After the friend’s first visit')
    expect(text(referrals)).toContain('As soon as the friend joins')
    expect(text(referrals)).toContain('Cancel')
    expect(text(card(opened('earn_rate'), 'earn_rate'))).toContain('Points for each €1 spent')
    // A way that is off shows no numbers even when asked to open: switching it on opens them.
    const stamps = card(opened('stamp_card'), 'stamp_card')
    expect(stamps).toContain('role="switch" aria-checked="false"')
    expect(text(stamps)).not.toContain('Stamps on a card')
  })

  it('an address naming a card opens its tab with that card open', () => {
    const html = wrap(<OptionsPage />, boot(true), answerFixture(), '/loyalty/options?way=referrals')
    expect(html).toMatch(/id="options-tab-bonus" aria-selected="true"/)
    expect(card(html, 'referrals')).toContain('value="250"')
    expect(card(html, 'welcome_bonus')).not.toContain('value="500"')
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
    const html = tab('earn')
    expect((html.match(/role="switch"[^>]*disabled=""/g) ?? []).length).toBe(0)
    expect((html.match(/role="switch"/g) ?? []).length).toBe(5)
    expect(html).not.toContain('type="submit"')
    expect(text(html)).not.toContain('Not saved yet.')
    expect(html).toContain('href="/loyalty/options/setup"')
    expect(text(html)).not.toContain('You see them as they are.')
  })

  it('shows anyone else the options read-only, and says why', () => {
    const data = answerFixture({ can_change: false })
    const html = tab('bonus', false, data)
    expect(text(html)).toContain('Only an owner or a manager can change these. You see them as they are.')
    expect(html).not.toContain('type="submit"')
    expect(html).not.toContain('href="/loyalty/options/setup"')
    expect((html.match(/role="switch"[^>]*disabled=""/g) ?? []).length).toBe(3)
    expect(text(html)).not.toContain('Change')
    expect(text(card(html, 'referrals'))).toContain('250 points')
    expect(card(opened('referrals', data, false), 'referrals')).toMatch(/value="250" disabled=""|disabled="" [^>]*value="250"/)
    // Nothing to turn on either.
    expect(text(page(false, data))).not.toContain('Turn on')
  })

  it('the Overview says what the checks found, each with the card to open, and counts the warnings on its tab', () => {
    const data = answerFixture({
      advice: [
        { code: 'visits_without_source', level: 'warn', way: 'check_in', params: {} },
        { code: 'no_rewards', level: 'warn', way: null, params: {} },
        { code: 'expiry_short', level: 'tip', way: 'points_expiry', params: { months: 3 } },
        { code: 'made_up', level: 'warn', way: null, params: {} },
      ],
    })
    const html = page(true, data)
    const words = text(html)
    expect(words).toContain('Members move up by visits, but nothing records a visit here. Switch on Check-in. Open Check-in')
    expect(words).toContain('Members collect points but the catalogue has nothing to spend them on. Open Rewards')
    expect(words).toContain('Points expire after 3 months, which is short for most members; 12 to 24 is usual. Open Points expiry')
    // A code the workspace has no words for is not shown, nor counted.
    expect(html).not.toContain('made_up')
    expect(html).toMatch(/id="options-tab-overview"[\s\S]*?data-state="pending"[^>]*>2<span class="sr-only"> to check/)
    expect(html).toContain('href="/loyalty/rewards"')
    // Nothing found: all is well, and no count.
    const fine = page(true, answerFixture({ advice: [] }))
    expect(text(fine)).toContain('Everything works together.')
    expect(fine).not.toContain('to check')
  })

  it('offers what the venue’s industry recommends and is off here, each with what members would get and Turn on', () => {
    const html = page(true)
    const words = text(html)
    expect(words).toContain('Recommended for Beauty and spa')
    expect(html).toContain('data-suggest="stamp_card"')
    expect(words).toContain('A card holds 8 stamps; a full card gives 400 points. Turn on Stamp card')
    // On already, or always on: not offered.
    expect(html).not.toContain('data-suggest="referrals"')
    expect(html).not.toContain('data-suggest="earn_rate"')
    // A venue whose industry has no preset, or nothing missing, has no such panel.
    expect(text(page(true, answerFixture({ presets: [presetFixture('hotel_classic', false)] })))).not.toContain('Recommended for')
  })

  it('says what members get today, and the ways switched off, each opening its card; a way that does nothing here says so', () => {
    const data = answerFixture({ not_used: ['points_on_spend'] })
    const html = page(true, data)
    const words = text(html)
    expect(words).toContain('What members get')
    expect(html).toContain('data-gets="earn_rate"')
    expect(html).toContain('data-off="stamp_card"')
    expect(words).toContain('Points on bookings Not used here')
    expect(text(card(tab('earn', true, data), 'points_on_spend'))).toContain('Your venue takes no bookings, so this gives nothing.')
    expect(text(card(tab('earn'), 'points_on_spend'))).not.toContain('takes no bookings')
  })

  it('links the rest of the programme with how many there are', () => {
    const html = page(true)
    const words = text(html)
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
