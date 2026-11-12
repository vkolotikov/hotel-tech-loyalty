import { describe, expect, it } from 'vitest'
import {
  OWN_TTL_MS, START, alertTarget, badgeCount, sawHot, shouldNotify, shouldSound, step, stripBadge, titleWith, toggleState,
  type AlertState, type OwnNote, type Reading,
} from './alertsLogic'

const now = 1_000_000

/** A run of polls from the start, returning every poll's alerts and the state after the last. */
function run(readings: Reading[], key = 'all', own: OwnNote[] = []): { state: AlertState; alerts: ReturnType<typeof step>['alerts'][] } {
  let state = START
  let notes = own
  const alerts: ReturnType<typeof step>['alerts'][] = []
  readings.forEach((reading, i) => {
    const result = step(state, reading, key, notes, now + i * 15_000)
    state = result.state
    notes = result.own
    alerts.push(result.alerts)
  })
  return { state, alerts }
}

describe('the alerts across HexaTech CRM (round 5)', () => {
  it('says nothing on the first look, whatever is waiting', () => {
    const { state, alerts } = run([{ waiting: 4, hot: 3 }])
    expect(alerts).toEqual([[]])
    expect(badgeCount(state)).toBe(0)
  })

  it('alerts when the chats waiting rise, with the rise and the total, and puts the total in the title', () => {
    const { state, alerts } = run([{ waiting: 2, hot: null }, { waiting: 3, hot: null }])
    expect(alerts[1]).toEqual([{ signal: 'waiting', rise: 1, total: 3 }])
    expect(state.armed).toBe(true)
    expect(badgeCount(state)).toBe(3)
  })

  it('says nothing when they stay or fall, and counts a later rise from the new level', () => {
    const { alerts } = run([{ waiting: 3, hot: null }, { waiting: 3, hot: null }, { waiting: 1, hot: null }, { waiting: 2, hot: null }])
    expect(alerts.slice(1)).toEqual([[], [], [{ signal: 'waiting', rise: 1, total: 2 }]])
  })

  it('alerts a new hot lead, and counts it in the title until Visitors is looked at', () => {
    const { state, alerts } = run([{ waiting: 0, hot: 3 }, { waiting: 0, hot: 5 }])
    expect(alerts[1]).toEqual([{ signal: 'hot', rise: 2 }])
    expect(badgeCount(state)).toBe(2)
    const seen = sawHot(state)
    expect(badgeCount(seen)).toBe(0)
    expect(seen.armed).toBe(false)
  })

  it('starts the hot leads from their own first answer (the hub answers later, or not at all)', () => {
    const { alerts } = run([{ waiting: 1, hot: null }, { waiting: 1, hot: 4 }, { waiting: 1, hot: 4 }, { waiting: 1, hot: null }])
    expect(alerts.flat()).toEqual([])
  })

  it('takes the title back when nothing is left waiting', () => {
    const { state } = run([{ waiting: 1, hot: null }, { waiting: 2, hot: null }, { waiting: 1, hot: null }, { waiting: 0, hot: null }])
    expect(state.armed).toBe(false)
    expect(badgeCount(state)).toBe(0)
  })

  it('never alerts for the person’s own doing, each note counted once', () => {
    const own: OwnNote[] = [{ signal: 'hot', at: now }]
    const first = run([{ waiting: 0, hot: 3 }, { waiting: 0, hot: 4 }], 'all', own)
    expect(first.alerts[1]).toEqual([])
    const twice = run([{ waiting: 0, hot: 3 }, { waiting: 0, hot: 4 }, { waiting: 0, hot: 5 }], 'all', own)
    expect(twice.alerts[2]).toEqual([{ signal: 'hot', rise: 1 }])
    const more = run([{ waiting: 0, hot: 3 }, { waiting: 0, hot: 5 }], 'all', own)
    expect(more.alerts[1]).toEqual([{ signal: 'hot', rise: 1 }])
  })

  it('forgets an own note that the counts never showed', () => {
    const old: OwnNote[] = [{ signal: 'hot', at: now - OWN_TTL_MS - 1 }]
    const { alerts } = run([{ waiting: 0, hot: 3 }, { waiting: 0, hot: 4 }], 'all', old)
    expect(alerts[1]).toEqual([{ signal: 'hot', rise: 1 }])
  })

  it('starts again without alerting when the brand changes', () => {
    let state = step(START, { waiting: 1, hot: 1 }, 'all', [], now).state
    const moved = step(state, { waiting: 9, hot: 9 }, '4', [], now + 15_000)
    expect(moved.alerts).toEqual([])
    state = moved.state
    expect(step(state, { waiting: 10, hot: 9 }, '4', [], now + 30_000).alerts).toEqual([{ signal: 'waiting', rise: 1, total: 10 }])
  })

  it('puts the count before the title once, and takes it off', () => {
    expect(titleWith('HexaTech CRM', 3)).toBe('(3) HexaTech CRM')
    expect(titleWith('(3) HexaTech CRM', 4)).toBe('(4) HexaTech CRM')
    expect(titleWith('(4) HexaTech CRM', 0)).toBe('HexaTech CRM')
    expect(titleWith('HexaTech CRM', 120)).toBe('(99+) HexaTech CRM')
    expect(stripBadge('(12) HexaTech CRM')).toBe('HexaTech CRM')
    expect(stripBadge('Plan (2026) review')).toBe('Plan (2026) review')
  })

  it('chimes only with the inbox’s sound on, and leaves a waiting chat on the inbox to the inbox’s own chime', () => {
    const waiting = [{ signal: 'waiting' as const, rise: 1, total: 2 }]
    const hot = [{ signal: 'hot' as const, rise: 1 }]
    expect(shouldSound(waiting, { soundOn: true, onInbox: false })).toBe(true)
    expect(shouldSound(waiting, { soundOn: true, onInbox: true })).toBe(false)
    expect(shouldSound(hot, { soundOn: true, onInbox: true })).toBe(true)
    expect(shouldSound(hot, { soundOn: false, onInbox: false })).toBe(false)
    expect(shouldSound([], { soundOn: true, onInbox: false })).toBe(false)
  })

  it('shows a desktop notification only when switched on here, allowed, and the person looks elsewhere', () => {
    const alerts = [{ signal: 'hot' as const, rise: 1 }]
    expect(shouldNotify(alerts, { permission: 'granted', wanted: true, focused: false })).toBe(true)
    expect(shouldNotify(alerts, { permission: 'granted', wanted: true, focused: true })).toBe(false)
    expect(shouldNotify(alerts, { permission: 'granted', wanted: false, focused: false })).toBe(false)
    expect(shouldNotify(alerts, { permission: 'default', wanted: true, focused: false })).toBe(false)
    expect(shouldNotify([], { permission: 'granted', wanted: true, focused: false })).toBe(false)
  })

  it('asks the browser only from the switch, and only the first time', () => {
    expect(toggleState('default', false)).toEqual({ on: false, action: 'ask', reason: 'off' })
    expect(toggleState('granted', true)).toEqual({ on: true, action: 'off', reason: 'on' })
    expect(toggleState('granted', false)).toEqual({ on: false, action: 'on', reason: 'off' })
    expect(toggleState('denied', true)).toEqual({ on: false, action: 'none', reason: 'blocked' })
    expect(toggleState('unsupported', true)).toEqual({ on: false, action: 'none', reason: 'unsupported' })
  })

  it('leads to the waiting chats, or to the hot leads', () => {
    expect(alertTarget([{ signal: 'hot', rise: 1 }, { signal: 'waiting', rise: 1, total: 1 }])).toBe('/crm/inbox?status=waiting')
    expect(alertTarget([{ signal: 'hot', rise: 1 }])).toBe('/crm/visitors?tab=hot_lead')
  })
})
