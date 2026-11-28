import { describe, expect, it } from 'vitest'
import {
  areaPath, changeText, dayPhase, DEFAULT_LAYOUT, greetingFor, indexAt, moveWidget, niceTicks, periodFrom, ringArcs,
  sanitizeLayout, scalePoints, smoothPath, sumSeries, sumTotals, sunProgress, toggleWidget, trendOf, venueParts,
  wallMinutes, weatherKind, weatherWords, WIDGETS,
} from './dashboardMath'

describe('the venue\'s clock', () => {
  it('reads the venue\'s wall clock, not the computer\'s', () => {
    const at = new Date('2026-11-09T22:30:15Z')
    expect(venueParts(at, 'Europe/Riga')).toMatchObject({ date: '2026-11-10', hour: 0, minute: 30, second: 15, minutes: 30 })
    expect(venueParts(at, 'America/New_York')).toMatchObject({ date: '2026-11-09', hour: 17, minute: 30 })
  })

  it('falls back to the computer\'s zone for a zone it cannot read', () => {
    expect(venueParts(new Date('2026-11-09T10:00:00Z'), 'Not/AZone').year).toBe(2026)
  })

  it('greets by the venue\'s hour', () => {
    expect(greetingFor(6)).toBe('morning')
    expect(greetingFor(12)).toBe('afternoon')
    expect(greetingFor(19)).toBe('evening')
    expect(greetingFor(2)).toBe('night')
  })

  it('reads the sky from sunrise and sunset', () => {
    const rise = wallMinutes('2026-11-09T07:52')!, set = wallMinutes('2026-11-09T16:14')!
    expect(rise).toBe(472)
    expect(dayPhase(8 * 60, rise, set)).toBe('dawn')
    expect(dayPhase(12 * 60, rise, set)).toBe('day')
    expect(dayPhase(16 * 60, rise, set)).toBe('dusk')
    expect(dayPhase(22 * 60, rise, set)).toBe('night')
    expect(dayPhase(12 * 60, null, null)).toBe('day')
    expect(sunProgress(rise, rise, set)).toBe(0)
    expect(sunProgress(set, rise, set)).toBe(1)
    expect(sunProgress(22 * 60, rise, set)).toBeNull()
    expect(wallMinutes(null)).toBeNull()
  })
})

describe('weather codes', () => {
  it('draws and words each WMO code', () => {
    expect(weatherKind(0)).toBe('clear')
    expect(weatherKind(2)).toBe('partly')
    expect(weatherKind(48)).toBe('fog')
    expect(weatherKind(53)).toBe('drizzle')
    expect(weatherKind(81)).toBe('rain')
    expect(weatherKind(86)).toBe('snow')
    expect(weatherKind(99)).toBe('storm')
    expect(weatherKind(null)).toBe('cloudy')
    expect(weatherWords(61)).toEqual({ key: 'rain', en: 'Rain' })
    expect(weatherWords(1234).key).toBe('unknown')
  })
})

describe('figures', () => {
  it('says how a figure moved', () => {
    expect(trendOf({ current: 120, previous: 100, change: 20 })).toBe('up')
    expect(trendOf({ current: 80, previous: 100, change: -20 })).toBe('down')
    expect(trendOf({ current: 100, previous: 100, change: 0.2 })).toBe('flat')
    expect(trendOf({ current: 5, previous: 0, change: null })).toBe('new')
    expect(trendOf(null)).toBe('flat')
    expect(changeText(12.44)).toBe('+12%')
    expect(changeText(-3.25)).toBe('−3.3%')
    expect(changeText(null)).toBe('')
  })

  it('adds aligned series and totals', () => {
    expect(sumSeries([1, 2, 3], null, [10, 0, 1])).toEqual([11, 2, 4])
    expect(sumSeries(null, undefined)).toBeNull()
    expect(sumTotals({ current: 100, previous: 50, change: 100 }, { current: 20, previous: 50, change: -60 })).toEqual({ current: 120, previous: 100, change: 20 })
    expect(sumTotals({ current: 5, previous: 0, change: null })?.change).toBeNull()
  })
})

describe('chart paths', () => {
  it('scales into the box, a flat series on the floor', () => {
    const pts = scalePoints([0, 5, 10], 100, 50, 0)
    expect(pts.map(p => p.x)).toEqual([0, 50, 100])
    expect(pts.map(p => p.y)).toEqual([50, 25, 0])
    expect(scalePoints([0, 0], 100, 50, 0).every(p => p.y === 50)).toBe(true)
  })

  it('never overshoots below the floor between points', () => {
    const pts = scalePoints([10, 0, 10, 0, 10], 100, 50, 0)
    const d = smoothPath(pts)
    const ys = [...d.matchAll(/[ ,](-?[\d.]+)(?=[ CLZ]|$)/g)].map(m => Number(m[1]))
    expect(Math.max(...ys)).toBeLessThanOrEqual(50)
    expect(areaPath(pts, 50).endsWith('Z')).toBe(true)
  })

  it('finds the day under the pointer', () => {
    expect(indexAt(0, 100, 30, 0)).toBe(0)
    expect(indexAt(100, 100, 30, 0)).toBe(29)
    expect(indexAt(50, 100, 3, 0)).toBe(1)
  })

  it('rounds an axis up', () => {
    expect(niceTicks(2700)).toEqual([0, 1000, 2000, 3000])
    expect(niceTicks(0)).toEqual([0, 1])
  })

  it('cuts a ring into its shares', () => {
    const arcs = ringArcs([{ key: 'a', value: 3 }, { key: 'b', value: 1 }, { key: 'c', value: 0 }], 0)
    expect(arcs.map(a => a.key)).toEqual(['a', 'b'])
    expect(arcs[0]).toMatchObject({ start: 0, length: 0.75 })
    expect(arcs[1].start).toBe(0.75)
    expect(ringArcs([])).toEqual([])
  })
})

describe('the person\'s own dashboard', () => {
  it('keeps known widgets once and puts a new one in its default place', () => {
    const stored = { order: ['activity', 'now', 'now', 'gone', 'kpis'], hidden: ['tasks', 'tasks', 'nope'] }
    const layout = sanitizeLayout(stored)
    expect(new Set(layout.order).size).toBe(WIDGETS.length)
    expect(layout.order.slice(0, 2)).toEqual(['activity', 'now'])
    // `live` follows `now` by default.
    expect(layout.order.indexOf('live')).toBe(layout.order.indexOf('now') + 1)
    expect(layout.hidden).toEqual(['tasks'])
    expect(sanitizeLayout('garbage')).toEqual(DEFAULT_LAYOUT)
  })

  it('hides, shows and moves', () => {
    const hidden = toggleWidget(DEFAULT_LAYOUT, 'pipeline')
    expect(hidden.hidden).toEqual(['pipeline'])
    expect(toggleWidget(hidden, 'pipeline').hidden).toEqual([])
    const moved = moveWidget(DEFAULT_LAYOUT, 'live', -1)
    expect(moved.order.slice(0, 2)).toEqual(['live', 'now'])
    expect(moveWidget(DEFAULT_LAYOUT, 'now', -1)).toBe(DEFAULT_LAYOUT)
    // Among the widgets the organisation has: past one it does not.
    const among = DEFAULT_LAYOUT.order.filter(w => w !== 'schedule')
    const past = moveWidget(DEFAULT_LAYOUT, 'loyalty', -1, among)
    expect(past.order.indexOf('loyalty')).toBeLessThan(past.order.indexOf('pipeline'))
  })

  it('reads a period of 7, 30 or 90 days', () => {
    expect(periodFrom('7')).toBe(7)
    expect(periodFrom(90)).toBe(90)
    expect(periodFrom('365')).toBe(30)
  })
})
