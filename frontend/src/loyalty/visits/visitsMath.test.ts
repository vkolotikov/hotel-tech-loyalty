import { describe, expect, it } from 'vitest'
import { money } from '../lib/format'
import type { Can, Ways } from '../lib/types'
import type { DeskAnswer } from './visitsApi'
import {
  amountProblem, circles, currencyDigits, deskButtons, deskSentences, givenSentence, parseAmount, problemSentence, rewardSentence, shownCard, showVisits,
  sourceSentence,
} from './visitsMath'

const ways = (more: Partial<Ways> = {}): Ways => ({
  stamps: false, stamps_per_card: 10, checkin: false, checkin_points: 0, desk_earn: false, cashback: false, cashback_percent: 5, setup_done: true, ...more,
})
const can = (award = true): Can => ({ award, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false })
const member = { id: 30, name: 'Grace', email: null, phone: null, member_number: 'LS-1', tier_id: null, points: 210, lifetime_points: 210, is_active: true, joined_at: null, last_activity_at: null }
const answer = (more: Partial<DeskAnswer> = {}): DeskAnswer => ({
  already_today: false, points: { checkin: 0, purchase: 0, balance: 210 }, stamp: null, credit: null, member, ...more,
})
const card = (count: number, needed = 10, completed: string | null = null) => ({ id: 4, number: 2, stamps_count: count, stamps_needed: needed, completed_at: completed })
const text = (s: { fallback: string; vars?: Record<string, string> }) => s.fallback.replace(/\{\{(\w+)\}\}/g, (_, k) => s.vars?.[k] ?? '')

describe('which desk buttons show', () => {
  it('the panel shows when the venue uses the stamp card, check-in or earning at the desk', () => {
    expect(showVisits(undefined)).toBe(false)
    expect(showVisits(ways())).toBe(false)
    expect(showVisits(ways({ cashback: true }))).toBe(false)
    expect(showVisits(ways({ stamps: true }))).toBe(true)
    expect(showVisits(ways({ checkin: true }))).toBe(true)
    expect(showVisits(ways({ desk_earn: true }))).toBe(true)
  })

  it('Check in and Add a purchase follow their options and need the Award right and an active member', () => {
    expect(deskButtons(ways({ checkin: true }), can(), { is_active: true })).toEqual({ checkIn: true, purchase: false })
    expect(deskButtons(ways({ desk_earn: true }), can(), { is_active: true })).toEqual({ checkIn: false, purchase: true })
    expect(deskButtons(ways({ checkin: true, desk_earn: true }), can(false), { is_active: true })).toEqual({ checkIn: false, purchase: false })
    expect(deskButtons(ways({ checkin: true, desk_earn: true }), can(), { is_active: false })).toEqual({ checkIn: false, purchase: false })
    expect(deskButtons(ways({ checkin: true }), can(), { is_active: true, is_erased: true })).toEqual({ checkIn: false, purchase: false })
    expect(deskButtons(undefined, can(), { is_active: true })).toEqual({ checkIn: false, purchase: false })
  })
})

describe('the card', () => {
  it('draws a circle per stamp needed, filled for each it has', () => {
    expect(circles(3, 5)).toEqual([true, true, true, false, false])
    expect(circles(0, 2)).toEqual([false, false])
    expect(circles(7, 5)).toEqual([true, true, true, true, true])
  })

  it('shows the open card, or an empty one of the venue’s size before the first stamp', () => {
    expect(shownCard({ card: { ...card(7), stamps: [] }, stamps_per_card: 12 })).toEqual({ count: 7, needed: 10, left: 3, number: 2 })
    expect(shownCard({ card: null, stamps_per_card: 12 })).toEqual({ count: 0, needed: 12, left: 12, number: null })
  })
})

describe('the amount of a purchase', () => {
  it('reads a comma or a point and stops on what the server would refuse', () => {
    expect(parseAmount(' 12,50 ')).toBe(12.5)
    expect(parseAmount('1 200.5')).toBe(1200.5)
    expect(parseAmount('ten')).toBeNull()
    expect(amountProblem('', 'EUR')).toBe('amount')
    expect(amountProblem('0', 'EUR')).toBe('amount')
    expect(amountProblem('-3', 'EUR')).toBe('amount')
    expect(amountProblem('1000000.01', 'EUR')).toBe('too_much')
    expect(amountProblem('12.345', 'EUR')).toBe('decimals')
    expect(amountProblem('12.34', 'EUR')).toBeNull()
    expect(amountProblem('1000000', 'EUR')).toBeNull()
  })

  it('takes whole units only in a zero-decimal currency', () => {
    expect(currencyDigits('JPY')).toBe(0)
    expect(currencyDigits('EUR')).toBe(2)
    expect(currencyDigits('not a code')).toBe(2)
    expect(amountProblem('1200.5', 'JPY')).toBe('whole')
    expect(amountProblem('1200', 'JPY')).toBeNull()
    expect(text(problemSentence('whole', 'JPY', 'en'))).toBe('Amounts in JPY are whole numbers.')
    expect(text(problemSentence('too_much', 'EUR', 'en'))).toBe('The amount can be at most €1,000,000.')
  })
})

describe('the desk’s answer in sentences', () => {
  it('a check-in with its points and a stamp', () => {
    const said = deskSentences(answer({ points: { checkin: 10, purchase: 0, balance: 220 }, stamp: { added: true, card: card(7), completed: null } }), 'check_in', 'en')
    expect(said.map(text)).toEqual(['Checked in', '+10 check-in points', '+1 stamp — 7 of 10'])
    expect(said.map(s => s.key)).toEqual(['loyalty.visits.said.checked_in', 'loyalty.visits.said.checkin_points', 'loyalty.visits.said.stamp'])
  })

  it('a stamp that fills the card says what the card gave', () => {
    const points = deskSentences(answer({ stamp: { added: true, card: card(10, 10, '2026-10-05T09:00:00+00:00'), completed: { card_id: 4, number: 2, reward: { kind: 'points', points: 100 } } } }), 'check_in', 'en')
    expect(points.map(text)).toEqual(['Checked in', 'Card complete! +100 points'])
    const reward = deskSentences(answer({ stamp: { added: true, card: card(10, 10, '2026-10-05T09:00:00+00:00'), completed: { card_id: 4, number: 2, reward: { kind: 'reward', redemption_id: 9, reward_name: 'Coffee', code: 'REW-ABCD1234' } } } }), 'check_in', 'en')
    expect(reward.map(text)).toEqual(['Checked in', 'Card complete! Free reward: Coffee'])
  })

  it('a purchase after the day’s check-in: points and credit, no second stamp', () => {
    const said = deskSentences(answer({
      already_today: true, points: { checkin: 0, purchase: 45, balance: 255 },
      stamp: { added: false, reason: 'already_today', card: card(7) }, credit: { line_id: 3, amount: '2.25', balance: '12.40', currency: 'EUR' },
    }), 'purchase', 'en')
    expect(said.map(text)).toEqual(['Already checked in today', '+45 points', '+€2.25 credit'])
  })

  it('a first visit whose stamp a booking of today already gave says so', () => {
    const said = deskSentences(answer({ stamp: { added: false, reason: 'already_today', card: card(3) } }), 'purchase', 'de')
    expect(said.map(text)).toEqual(['Today’s stamp is already on the card'])
  })

  it('writes numbers and money in the member page’s language', () => {
    const said = deskSentences(answer({ points: { checkin: 0, purchase: 1500, balance: 1710 }, credit: { line_id: 3, amount: 75, balance: 75, currency: 'EUR' } }), 'purchase', 'de')
    expect(said.map(text)).toEqual(['+1.500 points', `+${money(75, 'EUR', 'de')} credit`])
  })
})

describe('the history’s words', () => {
  it('names each source and what a card gave or gives', () => {
    expect(text(sourceSentence('check_in'))).toBe('Check-in')
    expect(sourceSentence('stay').key).toBe('loyalty.visits.source.stay')
    expect(text(sourceSentence('something_new'))).toBe('something_new')
    expect(text(givenSentence({ kind: 'points', points: 100 }, 'en'))).toBe('+100 points')
    expect(text(givenSentence({ kind: 'reward', redemption_id: 1, reward_name: 'Coffee', code: 'REW-1', status: 'pending' }, 'en'))).toBe('Free reward: Coffee')
    expect(text(rewardSentence({ kind: 'points', points: 1000 }, 'en'))).toBe('A full card gives 1,000 points.')
    expect(text(rewardSentence({ kind: 'reward', reward_id: 2, reward_name: 'Coffee' }, 'en'))).toBe('A full card gives a free Coffee.')
  })
})
