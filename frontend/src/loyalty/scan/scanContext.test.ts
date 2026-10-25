import { describe, expect, it } from 'vitest'
import type { EventRow, PlaceRow } from './scanApi'
import {
  CONTEXT_KEY, DESK, activePlaces, checkInOpen, contextFromSearch, contextSearch, doorPath, eventHours, loadContext, openEvents,
  opensAt, parseContext, resolveContext, sameContext, saveContext, serialiseContext, venueWallNow,
} from './scanContext'

const place = (id: number, over: Partial<PlaceRow> = {}): PlaceRow => ({ id, name: `Place ${id}`, admits: 'all', tiers: [], is_active: true, ...over })
const event = (id: number, over: Partial<EventRow> = {}): EventRow => ({
  id, title: `Event ${id}`, starts_at: '2026-10-25T18:00', ends_at: '2026-10-25T23:00', place: null, location: null, status: 'published', ...over,
})

describe('the remembered context (release 8 §2)', () => {
  it('reads what it wrote, and anything else as the desk', () => {
    for (const c of [DESK, { kind: 'place', id: 3 }, { kind: 'event', id: 12 }] as const) expect(parseContext(serialiseContext(c))).toEqual(c)
    expect(serialiseContext({ kind: 'place', id: 3 })).toBe('{"kind":"place","id":3}')
    for (const raw of [null, undefined, '', 'nope', '{"kind":"place"}', '{"kind":"place","id":0}', '{"kind":"place","id":"3"}', '{"kind":"room","id":3}', '{"kind":"event","id":1.5}', 'null', '[]']) {
      expect(parseContext(raw), String(raw)).toEqual(DESK)
    }
  })

  it('loads and saves under loyalty:scan-context, and survives a storage that is missing or throws', () => {
    const box = new Map<string, string>()
    const storage = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => { box.set(k, v) } }
    expect(loadContext(storage)).toEqual(DESK)
    saveContext({ kind: 'event', id: 7 }, storage)
    expect(box.get(CONTEXT_KEY)).toBe('{"kind":"event","id":7}')
    expect(loadContext(storage)).toEqual({ kind: 'event', id: 7 })

    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadContext(broken)).toEqual(DESK)
    expect(() => saveContext({ kind: 'place', id: 1 }, broken)).not.toThrow()
    expect(loadContext(null)).toEqual(DESK)
    expect(() => saveContext(DESK, null)).not.toThrow()
  })

  it('an address may name the context (an event’s Start check-in, door mode’s bookmark)', () => {
    expect(contextFromSearch('?event=5')).toEqual({ kind: 'event', id: 5 })
    expect(contextFromSearch('place=3')).toEqual({ kind: 'place', id: 3 })
    expect(contextFromSearch('?desk')).toEqual(DESK)
    expect(contextFromSearch('')).toBeNull()
    expect(contextFromSearch('?place=0')).toBeNull()
    expect(contextFromSearch('?place=abc')).toBeNull()
    expect(contextFromSearch('?event=-2')).toBeNull()
    expect(contextSearch({ kind: 'place', id: 3 })).toBe('?place=3')
    expect(contextSearch(DESK)).toBe('')
    expect(doorPath({ kind: 'event', id: 9 })).toBe('/loyalty/scan/door?event=9')
    expect(doorPath(DESK)).toBe('/loyalty/scan/door')
    expect(sameContext({ kind: 'place', id: 3 }, { kind: 'place', id: 3 })).toBe(true)
    expect(sameContext({ kind: 'place', id: 3 }, { kind: 'event', id: 3 })).toBe(false)
    expect(sameContext(DESK, { kind: 'desk' })).toBe(true)
  })
})

describe('what one can scan for', () => {
  it('today’s events open now or later, soonest first: published, not over, not starting tomorrow', () => {
    const list = [
      event(1, { starts_at: '2026-10-25T20:00', ends_at: '2026-10-25T22:00' }),
      event(2, { starts_at: '2026-10-25T09:00', ends_at: '2026-10-25T12:00' }), // over
      event(3, { status: 'cancelled' }),
      event(4, { status: 'draft' }),
      event(5, { starts_at: '2026-10-25T18:00', ends_at: '2026-10-26T02:00' }), // runs past midnight
      event(6, { starts_at: '2026-10-26T10:00', ends_at: '2026-10-26T12:00' }), // tomorrow
      event(7, { starts_at: '2026-10-24T22:00', ends_at: '2026-10-25T16:00' }), // since yesterday, still on
    ]
    expect(openEvents(list, '2026-10-25T15:30').map(e => e.id)).toEqual([7, 5, 1])
    expect(openEvents(list, '2026-10-25T23:30').map(e => e.id)).toEqual([5])
  })

  it('only the places switched on', () => {
    expect(activePlaces([place(1), place(2, { is_active: false }), place(3)]).map(p => p.id)).toEqual([1, 3])
  })

  it('resolves a remembered place or event against the lists, and falls back to the desk when it is gone', () => {
    const places = [place(1), place(2, { is_active: false })]
    const events = [event(5)]
    expect(resolveContext({ kind: 'place', id: 1 }, places, events)).toEqual({ context: { kind: 'place', id: 1 }, place: places[0], event: null, pending: false })
    expect(resolveContext({ kind: 'place', id: 2 }, places, events).context).toEqual(DESK)
    expect(resolveContext({ kind: 'place', id: 9 }, places, events).context).toEqual(DESK)
    expect(resolveContext({ kind: 'event', id: 5 }, places, events)).toEqual({ context: { kind: 'event', id: 5 }, place: null, event: events[0], pending: false })
    expect(resolveContext({ kind: 'event', id: 6 }, places, events).context).toEqual(DESK)
    // Not loaded yet (or could not be): the wanted context is kept, and said to be pending.
    expect(resolveContext({ kind: 'place', id: 9 }, undefined, events)).toEqual({ context: { kind: 'place', id: 9 }, place: null, event: null, pending: true })
    expect(resolveContext({ kind: 'event', id: 6 }, places, undefined).pending).toBe(true)
    expect(resolveContext(DESK, undefined, undefined)).toEqual({ context: DESK, place: null, event: null, pending: false })
  })
})

describe('an event’s times, on the venue’s wall clock', () => {
  it('its hours as written, never converted', () => {
    expect(eventHours({ starts_at: '2026-10-25T18:00', ends_at: '2026-10-25T23:30' })).toBe('18:00–23:30')
  })

  it('check-in opens two hours before the start, on the day before when the start is early', () => {
    expect(opensAt('2026-10-25T18:00')).toBe('2026-10-25T16:00')
    expect(opensAt('2026-10-25T02:00')).toBe('2026-10-25T00:00')
    expect(opensAt('2026-10-25T01:15')).toBe('2026-10-24T23:15')
    expect(opensAt('2026-11-01T00:30')).toBe('2026-10-31T22:30')
  })

  it('is open from then to its end, and only when published', () => {
    const e = event(1)
    expect(checkInOpen(e, '2026-10-25T15:59')).toBe(false)
    expect(checkInOpen(e, '2026-10-25T16:00')).toBe(true)
    expect(checkInOpen(e, '2026-10-25T22:59')).toBe(true)
    expect(checkInOpen(e, '2026-10-25T23:00')).toBe(false)
    expect(checkInOpen({ ...e, status: 'cancelled' }, '2026-10-25T19:00')).toBe(false)
  })

  it('the venue’s now as its wall clock, in its own zone', () => {
    const at = new Date('2026-10-25T22:30:00Z')
    expect(venueWallNow('Europe/Riga', at)).toBe('2026-10-26T00:30')
    expect(venueWallNow('America/New_York', at)).toBe('2026-10-25T18:30')
    expect(venueWallNow('Not/AZone', at)).toBe('2026-10-25T22:30')
  })
})
