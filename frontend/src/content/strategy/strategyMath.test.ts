import { describe, expect, it } from 'vitest'
import type { StrategySummary } from '../lib/types'
import { GENERATION_STUCK_MS, balanceRows, freshFailure, generationFinished, generationState, pickStrategy, serverClock, strategyTitle, strings } from './strategyMath'

const s = (id: number, status: StrategySummary['status']): StrategySummary => ({ id, title: `S${id}`, summary: null, status, created_at: null })

describe('pickStrategy', () => {
  it('opens on the active strategy, else the one being made, else the newest', () => {
    expect(pickStrategy([s(5, 'generating'), s(4, 'active'), s(3, 'superseded')])?.id).toBe(4)
    expect(pickStrategy([s(5, 'failed'), s(4, 'generating')])?.id).toBe(4)
    expect(pickStrategy([s(5, 'failed'), s(3, 'archived')])?.id).toBe(5)
    expect(pickStrategy([])).toBeNull()
  })
})

describe('balanceRows', () => {
  it('sets each pillar\'s share of this month\'s posts against its share of the target weights, in whole percent', () => {
    const rows = balanceRows({ from: '2026-10-01', to: '2026-10-31', pillars: [
      { id: 1, name: 'Hair care', target_weight: 50, posts: 2 },
      { id: 2, name: 'Colour', target_weight: 30, posts: 2 },
      { id: 3, name: 'Team', target_weight: 20, posts: 0 },
    ] })
    expect(rows.map(r => [r.name, r.actual, r.target])).toEqual([['Hair care', 50, 50], ['Colour', 50, 30], ['Team', 0, 20]])
  })

  it('reads 0 % where there is nothing to share: no posts yet, or no weights set', () => {
    const rows = balanceRows({ from: '2026-10-01', to: '2026-10-31', pillars: [{ id: 1, name: 'A', target_weight: null, posts: 0 }] })
    expect(rows[0]).toMatchObject({ actual: 0, target: 0, posts: 0 })
  })
})

describe('strings', () => {
  it('reads what the AI wrote as a list of lines, whatever shape it came in', () => {
    expect(strings(['a', ' ', 'b', 3])).toEqual(['a', 'b'])
    expect(strings('one line')).toEqual(['one line'])
    expect(strings(null)).toEqual([])
    expect(strings({ a: 1 })).toEqual([])
  })
})

describe('generationState', () => {
  const at = (iso: string) => Date.parse(iso)
  const made = (id: number, status: StrategySummary['status'], created_at: string): StrategySummary => ({ id, title: null, summary: null, status, created_at })

  it('is "none" when no strategy is being made (a failed one is over)', () => {
    expect(generationState([made(4, 'active', '2026-10-15T09:00:00Z'), made(5, 'failed', '2026-10-15T09:05:00Z')], at('2026-10-15T09:10:00Z')))
      .toEqual({ state: 'none' })
  })

  it('is "running" while one is being made, with the minutes since it started', () => {
    expect(generationState([made(6, 'generating', '2026-10-15T09:00:00Z')], at('2026-10-15T09:02:40Z'))).toEqual({ state: 'running', id: 6, minutes: 2 })
  })

  // The server lets a new one start after 15 minutes; the page stops waiting at the same moment.
  it('calls it stuck after 15 minutes, when the page stops waiting and a new one may start', () => {
    const start = at('2026-10-15T09:00:00Z')
    expect(generationState([made(6, 'generating', '2026-10-15T09:00:00Z')], start + GENERATION_STUCK_MS + 1000)).toEqual({ state: 'stuck', id: 6 })
  })

  // Review: a lost job's placeholder kept "may have stopped" on screen after a later strategy was made.
  it('ignores a placeholder that a later strategy has already passed', () => {
    const late = at('2026-10-16T09:00:00Z')
    expect(generationState([made(8, 'active', '2026-10-15T10:00:00Z'), made(7, 'generating', '2026-10-15T09:00:00Z')], late)).toEqual({ state: 'none' })
    expect(generationState([made(9, 'generating', '2026-10-16T08:59:00Z'), made(8, 'active', '2026-10-15T10:00:00Z')], late)).toEqual({ state: 'running', id: 9, minutes: 1 })
  })
})

describe('freshFailure', () => {
  const made = (id: number, status: StrategySummary['status']): StrategySummary => ({ id, title: null, summary: null, status, created_at: null })

  // Review: when a new strategy failed while an older one stayed active, the page said nothing.
  it('is the newest strategy when it failed after the active one (or with none active)', () => {
    expect(freshFailure([made(7, 'failed'), made(6, 'active')])?.id).toBe(7)
    expect(freshFailure([made(5, 'failed')])?.id).toBe(5)
    expect(freshFailure([made(7, 'active'), made(6, 'failed')])).toBeNull()
    expect(freshFailure([made(8, 'generating'), made(7, 'failed'), made(6, 'active')])).toBeNull()
  })
})

describe('strategyTitle', () => {
  const t = (_key: string, english: string) => english
  const made = (status: StrategySummary['status'], title: string | null): StrategySummary => ({ id: 1, title, summary: null, status, created_at: null })

  // The server's placeholder title ("Generating strategy…") is English: the portal names those rows in its own words.
  it('names a strategy being made, or one that could not be made, in the portal\'s words', () => {
    expect(strategyTitle(made('generating', 'Generating strategy…'), t)).toBe('A new strategy, being made')
    expect(strategyTitle(made('failed', 'Generating strategy…'), t)).toBe('A strategy that could not be made')
    expect(strategyTitle(made('active', 'Autumn plan'), t)).toBe('Autumn plan')
    expect(strategyTitle(made('superseded', null), t)).toBe('Untitled strategy')
  })
})

describe('serverClock', () => {
  it('reads the clock the server sent with the list, else the time the list was read', () => {
    expect(serverClock({ now: '2026-10-05T06:00:00.000000Z' }, 123)).toBe(Date.parse('2026-10-05T06:00:00.000000Z'))
    expect(serverClock({}, 123)).toBe(123)
    expect(serverClock(undefined, 123)).toBe(123)
  })

  it('keeps a fresh generation running when this computer\'s clock runs an hour fast', () => {
    const making = [{ id: 9, title: null, summary: null, status: 'generating' as const, created_at: '2026-10-05T05:58:00.000000Z' }]
    const fastDevice = Date.parse('2026-10-05T07:00:00.000000Z')
    expect(generationState(making, fastDevice).state).toBe('stuck')
    expect(generationState(making, serverClock({ now: '2026-10-05T06:00:00.000000Z' }, fastDevice)).state).toBe('running')
  })
})

describe('generationFinished', () => {
  it('is true once a generation that was running is no longer running', () => {
    expect(generationFinished('running', 'none')).toBe(true)
    expect(generationFinished('running', 'stuck')).toBe(true)
    expect(generationFinished('running', 'running')).toBe(false)
    expect(generationFinished('none', 'none')).toBe(false)
  })
})
