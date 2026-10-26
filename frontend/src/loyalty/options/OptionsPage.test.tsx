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

  it('the Overview says where the programme stands: all set, or how many things to fix, with its figures', () => {
    const fine = text(page(true, answerFixture({ advice: [] })))
    expect(fine).toContain('All set')
    expect(fine).toMatch(/Ways on: \d+ of 10 Tiers: 3 Rewards: 2/)
    expect(fine).not.toContain('Checks')
    const data = answerFixture({
      advice: [
        { code: 'visits_without_source', level: 'warn', way: 'check_in', params: {}, fix: { checkin_enabled: true } },
        { code: 'no_rewards', level: 'warn', way: null, params: {}, fix: null },
        { code: 'expiry_short', level: 'tip', way: 'points_expiry', params: { months: 3 }, fix: { points_expiry_months: 12 } },
        { code: 'made_up', level: 'warn', way: null, params: {}, fix: null },
      ],
    })
    const words = text(page(true, data))
    expect(words).toContain('To fix: 2')
    expect(words).toContain('Tips: 1')
    // The industry's recommendations are counted too.
    expect(words).toContain('Recommended for Beauty and spa: 1')
  })

  it('each check says what is wrong, offers its one-press fix to a manager and the card to open; the tab counts the warnings', () => {
    const data = answerFixture({
      advice: [
        { code: 'visits_without_source', level: 'warn', way: 'check_in', params: {}, fix: { checkin_enabled: true } },
        { code: 'no_rewards', level: 'warn', way: null, params: {}, fix: null },
        { code: 'expiry_short', level: 'tip', way: 'points_expiry', params: { months: 3 }, fix: { points_expiry_months: 12 } },
        { code: 'referrals_give_nothing', level: 'warn', way: 'referrals', params: {}, fix: { referrer_bonus_points: 250, referee_bonus_points: 250 } },
        { code: 'made_up', level: 'warn', way: null, params: {}, fix: null },
      ],
    })
    const html = page(true, data)
    const words = text(html)
    expect(words).toContain('Members move up by visits, but nothing records a visit here. Switch on Check-in. Turn on Check-in Open Check-in')
    expect(words).toContain('Members collect points but the catalogue has nothing to spend them on. Open Rewards')
    expect(words).toContain('Points expire after 3 months, which is short for most members; 12 to 24 is usual. Expire after 12 months Open Points expiry')
    expect(words).toContain('Give 250 points to each')
    // A code the workspace has no words for is not shown, nor counted.
    expect(html).not.toContain('made_up')
    expect(html).toMatch(/id="options-tab-overview"[\s\S]*?data-state="pending"[^>]*>3<span class="sr-only"> to check/)
    expect(html).toContain('href="/loyalty/rewards"')
    // Anyone else sees what is wrong and where, with nothing to press that changes it.
    const readOnly = text(page(false, { ...data, can_change: false }))
    expect(readOnly).toContain('Open Check-in')
    expect(readOnly).not.toContain('Turn on Check-in')
    expect(readOnly).not.toContain('Expire after 12 months')
  })

  it('walks the member’s journey: a map of the steps, then each step with its ways and the parts it leads to', () => {
    const html = page(true, answerFixture({ advice: [] }))
    const words = text(html)
    expect(words).toContain('Your members’ journey')
    const steps = ['join', 'visit', 'celebrate', 'friends', 'move_up', 'spend', 'keep']
    const map = steps.map(s => html.indexOf(`data-map="${s}"`))
    expect(map.every(i => i > 0)).toBe(true)
    expect([...map].sort((a, b) => a - b)).toEqual(map)
    // Each jumps to its step without leaving the page (a "#…" link would, under <base href="/">).
    expect(html).not.toContain('href="#')
    for (const s of steps) expect(html).toContain(`id="step-${s}"`)
    expect(words).toMatch(/1\. Joins Welcome bonus New members get 500 points when they join\./)
    expect(words).toContain('2. Visits and spends Earn rate Members get 1 point for every €1 they spend.')
    expect(words).toContain('Stamp card · Off Recommended No stamp card.')
    expect(words).toContain('5. Moves up Tiers 3 In the ladder')
    expect(words).toContain('6. Spends points Rewards 2 In the catalogue Offers 2 Switched on')
    expect(words).toContain('Boosts 1 On now or coming up')
    expect(html).toContain('href="/loyalty/rewards?tab=offers"')
    expect(html).toContain('href="/loyalty/program"')
    // A step that gives members nothing today is grey on the map.
    const quiet = page(true, answerFixture({ advice: [], options: { ...answerFixture().options, birthday_bonus_points: 0 } }))
    expect(quiet).toMatch(/type="button" data-map="celebrate" data-hue="off"/)
    expect(quiet).toMatch(/type="button" data-map="join" data-live="" data-hue="bonus"/)
  })

  it('marks at its step what the venue’s industry recommends and is off here, with Turn on for a manager', () => {
    const html = page(true)
    const stamp = html.slice(html.indexOf('data-step-way="stamp_card"'), html.indexOf('</li>', html.indexOf('data-step-way="stamp_card"')))
    expect(text(stamp)).toContain('Stamp card · Off Recommended No stamp card.')
    expect(text(stamp)).toContain('Turn on Stamp card')
    // On already, or always on: not marked.
    const referrals = html.slice(html.indexOf('data-step-way="referrals"'), html.indexOf('</li>', html.indexOf('data-step-way="referrals"')))
    expect(text(referrals)).not.toContain('Recommended')
    // Nothing to turn on for anyone else; no recommendations where the industry has no preset.
    expect(text(page(false, answerFixture({ can_change: false })))).not.toContain('Turn on')
    expect(text(page(true, answerFixture({ presets: [presetFixture('hotel_classic', false)] })))).not.toContain('Recommended')
  })

  it('says at its step that a way does nothing at this venue, on the Overview and on its card', () => {
    const data = answerFixture({ not_used: ['points_on_spend'] })
    expect(text(page(true, data))).toContain('Points on bookings Not used here')
    expect(text(card(tab('earn', true, data), 'points_on_spend'))).toContain('Your venue takes no bookings, so this gives nothing.')
    expect(text(card(tab('earn'), 'points_on_spend'))).not.toContain('takes no bookings')
  })

  it('offers a manager the wizard in a banner until it was applied or skipped', () => {
    expect(text(page(true))).toContain('Set up your programme in a few minutes')
    expect(page(true)).toContain('data-setup-banner')
    expect(page(true, undefined, ways({ setup_done: true }))).not.toContain('data-setup-banner')
    expect(page(false, answerFixture({ can_change: false }))).not.toContain('data-setup-banner')
  })

  it('says it is loading before the answer comes', () => {
    expect(text(page(true, null))).toContain('Loading…')
  })
})
