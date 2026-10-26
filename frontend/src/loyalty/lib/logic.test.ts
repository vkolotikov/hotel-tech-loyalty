import { describe, expect, it } from 'vitest'
import { failureOf, loyaltyUrl, membersParams } from './api'
import { errorKey } from './errors'
import { amountOf, dayOf, money, points, signedPoints, when } from './format'
import { NO_FILTERS, filtersFrom, searchFor, toggleTier, withChange } from '../members/membersQuery'
import { balanceAfter, lineType, offersReverse, pointsProblem } from '../member/memberMath'
import { requestActions, tabAfter, tabFrom } from '../requests/requestMath'
import { findActions, findGroups, settledMembers } from '../find/findItems'
import type { Can, LedgerLine, MemberRow } from './types'

const all: Can = { award: true, redeem: true, reverse: true, manage_program: true, manage_rewards: true, manage_members: true, view_insights: true, manage_campaigns: true, manage_app: true }
const staff: Can = { award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false }

describe('the calls (spec 2026-10-21 §6.2)', () => {
  it('name brand_id=all, so the full admin\'s brand choice never narrows the programme', () => {
    expect(loyaltyUrl('members')).toBe('/v1/admin/loyalty/members?brand_id=all')
    expect(loyaltyUrl('find?q=ad')).toBe('/v1/admin/loyalty/find?q=ad&brand_id=all')
  })

  it('send only the filters that hold something', () => {
    expect(membersParams(NO_FILTERS)).toEqual({})
    expect(membersParams({ q: ' ada ', tier_id: 2, state: 'all', sort: 'points', page: 3 })).toEqual({ q: 'ada', tier_id: 2, state: 'all', sort: 'points', page: 3 })
  })

  it('read a refusal by its code, a form by its fields, and keep what it carries', () => {
    expect(failureOf({ response: { status: 422, data: { error: 'not_enough_points', message: 'x', balance: 200 } } })).toEqual({ status: 422, code: 'not_enough_points', extra: { balance: 200 } })
    expect(failureOf({ response: { status: 422, data: { message: 'x', errors: { reason: ['r'] } } } }).code).toBe('invalid')
    expect(failureOf({ response: { status: 404, data: { message: 'No query results' } } }).code).toBe('not_found')
    expect(failureOf(new Error('down')).code).toBe('network')
  })

  it('turn a refusal into the family\'s words, or its general line', () => {
    expect(errorKey('reverse', failureOf({ response: { status: 409, data: { error: 'already_reversed' } } }))).toEqual(['loyalty.reverse.error.already_reversed', 'This line was already reversed.'])
    expect(errorKey('scan', failureOf({ response: { status: 404, data: { error: 'something_new' } } }))[0]).toBe('loyalty.scan.error.unknown')
  })
})

describe('the members list in the address (spec §4.2)', () => {
  it('reads what it can use and drops the rest', () => {
    expect(filtersFrom('?q=ada&tier=2&state=inactive&sort=name&page=3', [1, 2])).toEqual({ q: 'ada', tier_id: 2, state: 'inactive', sort: 'name', page: 3 })
    expect(filtersFrom('?tier=9&state=gone&sort=up&page=x', [1, 2])).toEqual(NO_FILTERS)
  })

  it('writes only what differs from the plain list, and comes back the same', () => {
    expect(searchFor(NO_FILTERS)).toBe('')
    const f = { q: 'ada', tier_id: 2, state: 'all' as const, sort: 'points' as const, page: 2 }
    expect(filtersFrom(searchFor(f), [2])).toEqual(f)
  })

  it('starts again on page 1 after any change, and a tier\'s chip toggles', () => {
    const on = { ...NO_FILTERS, page: 4 }
    expect(withChange(on, { sort: 'name' }).page).toBe(1)
    expect(toggleTier(on, 2).tier_id).toBe(2)
    expect(toggleTier({ ...on, tier_id: 2 }, 2).tier_id).toBeNull()
  })
})

describe('the points dialog (spec §4.3)', () => {
  it('stops on what the server would refuse, before sending', () => {
    expect(pointsProblem('award', '', 'Welcome', 100)).toBe('points')
    expect(pointsProblem('award', '1.5', 'Welcome', 100)).toBe('points')
    expect(pointsProblem('award', '0', 'Welcome', 100)).toBe('points')
    expect(pointsProblem('award', '100001', 'Welcome', 100)).toBe('too_many')
    expect(pointsProblem('redeem', '101', 'Coffee', 100)).toBe('over_balance')
    expect(pointsProblem('award', '50', ' ', 100)).toBe('reason')
    expect(pointsProblem('redeem', '100', 'Coffee', 100)).toBeNull()
  })

  it('shows the balance after it', () => {
    expect(balanceAfter('award', 200, '300')).toBe(500)
    expect(balanceAfter('redeem', 200, '50')).toBe(150)
    expect(balanceAfter('award', 200, '')).toBeNull()
    // Never a balance below zero from a redemption the dialog will not send.
    expect(balanceAfter('redeem', 200, '201')).toBeNull()
  })

  it('offers Reverse to a manager on a line that can be reversed only', () => {
    const line: LedgerLine = { id: 1, type: 'earn', points: 300, balance_after: 500, description: 'x', by: null, at: null, is_reversed: false, reversal_of_id: null, can_reverse: true }
    expect(offersReverse(line, all)).toBe(true)
    expect(offersReverse(line, staff)).toBe(false)
    expect(offersReverse({ ...line, can_reverse: false }, all)).toBe(false)
  })

  it('names a line\'s kind, or Other', () => {
    expect(lineType('redeem')).toBe('redeem')
    expect(lineType('migration')).toBe('other')
  })
})

describe('a request\'s steps (spec §4.4)', () => {
  it('approve or decline while it waits, mark done or decline once approved, nothing after', () => {
    expect(requestActions('pending')).toEqual(['approve', 'decline'])
    expect(requestActions('eligible')).toEqual(['approve', 'decline'])
    expect(requestActions('approved')).toEqual(['done', 'decline'])
    expect(requestActions('fulfilled')).toEqual([])
    expect(requestActions('cancelled')).toEqual([])
  })

  it('reads the tab from the address', () => {
    expect(tabFrom('?tab=done')).toBe('done')
    expect(tabFrom('?tab=nope')).toBe('waiting')
  })

  it('moves between the tabs with the arrows, Home and End', () => {
    expect(tabAfter('waiting', 'ArrowRight')).toBe('approved')
    expect(tabAfter('waiting', 'ArrowLeft')).toBe('done')
    expect(tabAfter('approved', 'End')).toBe('done')
    expect(tabAfter('done', 'Home')).toBe('waiting')
    expect(tabAfter('done', 'a')).toBeNull()
  })
})

describe('Find (spec §4.8)', () => {
  const nav = [{ to: '/loyalty', label: 'Members' }, { to: '/loyalty/rewards', label: 'Rewards' }]
  const words = { scan: 'Scan a card', goTo: 'Go to', toDark: 'Switch to dark', toLight: 'Switch to light', collapse: 'Collapse menu', expand: 'Expand menu', shortcuts: 'Keyboard shortcuts' }
  const member: MemberRow = { id: 7, name: 'Ada Lovelace', email: 'ada@example.test', phone: null, member_number: 'LS-000007', tier_id: 1, points: 1500, lifetime_points: 1500, is_active: true, joined_at: null, last_activity_at: null }

  it('offers Scan, the areas, the look and the list of shortcuts; the side panel only where it is', () => {
    const narrow = findActions({ nav, dark: false, wide: false, slim: false, words }).map(a => a.label)
    expect(narrow).toEqual(['Scan a card', 'Go to Members', 'Go to Rewards', 'Switch to dark', 'Keyboard shortcuts'])
    expect(findActions({ nav, dark: true, wide: true, slim: true, words }).map(a => a.label)).toContain('Expand menu')
    // The Guide (owner 2026-10-26), where the workspace names it.
    expect(findActions({ nav, dark: false, wide: false, slim: false, words: { ...words, guide: 'Guide' } }).find(a => a.label === 'Guide')).toMatchObject({ go: { to: '/loyalty/guide' } })
  })

  it('lists the matching actions, then the members found, each opening its page', () => {
    const actions = findActions({ nav, dark: false, wide: false, slim: false, words })
    const groups = findGroups({ query: 'rew', actions, members: [member], labels: { actions: 'Actions', members: 'Members', points: n => `${n} pts` } })
    expect(groups.map(g => g.title)).toEqual(['Actions', 'Members'])
    expect(groups[0].items.map(i => i.label)).toEqual(['Go to Rewards'])
    expect(groups[1].items[0]).toMatchObject({ label: 'Ada Lovelace', sub: 'LS-000007 · 1500 pts', go: { to: '/loyalty/members/7' } })
  })

  it('shows only the answer to the words now in the box', () => {
    expect(settledMembers('ad', 'ad', [member])).toEqual([member])
    expect(settledMembers('ada', 'ad', [member])).toEqual([])
    expect(settledMembers('a', 'a', [member])).toEqual([])
  })
})

describe('numbers and times', () => {
  it('group points the way the language does, with a true minus sign', () => {
    expect(points(1500, 'en')).toBe('1,500')
    expect(signedPoints(300, 'en')).toBe('+300')
    expect(signedPoints(-1500, 'en')).toBe('−1,500')
  })

  it('show an instant on the venue\'s clock, never the browser\'s', () => {
    expect(when('2026-10-05T21:30:00Z', 'en-GB', 'Europe/Riga')).toContain('00:30')
    expect(dayOf('2026-10-05T21:30:00Z', 'Europe/Riga')).toBe('2026-10-06')
    expect(dayOf('2026-10-05T21:30:00Z', 'America/New_York')).toBe('2026-10-05')
  })

  it('write money in the venue\'s currency, cents only when there are some (release 2 §8)', () => {
    expect(money(25, 'EUR', 'en')).toBe('€25')
    expect(money(25.5, 'EUR', 'en')).toBe('€25.50')
    expect(money(25.5, 'EUR', 'fr').replace(/\s/g, ' ')).toBe('25,50 €')
    expect(money(10, 'XX1', 'en')).toBe('10 XX1')
    expect(amountOf('fixed_amount', 25, 'GBP', 'en')).toBe('£25')
    expect(amountOf('cashback', 5, 'USD', 'en')).toBe('$5')
    expect(amountOf('percent_discount', 15, 'EUR', 'en')).toBe('15')
    expect(amountOf('points_multiplier', 1.5, 'EUR', 'en')).toBe('1.5')
  })
})
