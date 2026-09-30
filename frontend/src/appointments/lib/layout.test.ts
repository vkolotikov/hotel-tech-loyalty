import { describe, expect, it } from 'vitest'
import { DEFAULT_END, DEFAULT_START, PX_PER_MIN, cardDensity, dayRange, freeSlotStarts, offHours, placeAppointments } from './layout'
import type { MasterDay } from './types'

const day = (windows: [string, string][]): MasterDay => ({ windows: windows.map(([start, end]) => ({ start, end })), time_off: [] })
const at = (start: string, end: string, id = start) => ({ id, start: `2026-10-06T${start}`, end: `2026-10-06T${end}` })

describe('dayRange', () => {
  it('is 08:00–19:00 when nothing needs more', () => {
    expect(dayRange([day([['09:00', '17:00']])], [], '2026-10-06')).toEqual({ startMin: DEFAULT_START, endMin: DEFAULT_END })
  })

  it('widens the day to fit early and late appointments', () => {
    expect(dayRange([day([['09:00', '17:00']])], [at('07:30', '08:15'), at('20:00', '21:30')], '2026-10-06'))
      .toEqual({ startMin: 7 * 60, endMin: 22 * 60 })
  })

  it('widens to the working hours, on whole hours, and never past midnight', () => {
    expect(dayRange([day([['06:30', '23:30']])], [], '2026-10-06')).toEqual({ startMin: 6 * 60, endMin: 24 * 60 })
  })

  it('ignores appointments on another day', () => {
    expect(dayRange([], [{ start: '2026-10-07T05:00', end: '2026-10-07T06:00' }], '2026-10-06')).toEqual({ startMin: DEFAULT_START, endMin: DEFAULT_END })
  })
})

describe('placeAppointments', () => {
  it('positions a card by its start and duration', () => {
    const [placed] = placeAppointments([at('10:00', '10:45')], '2026-10-06', 8 * 60)
    expect(placed).toMatchObject({ top: 120 * PX_PER_MIN, height: 45 * PX_PER_MIN, lane: 0, lanes: 1 })
  })

  it('places overlapping appointments in separate lanes', () => {
    const placed = placeAppointments([at('10:00', '11:00', 'a'), at('10:30', '11:30', 'b')], '2026-10-06', 480)
    expect(placed.map(p => [p.item.id, p.lane, p.lanes])).toEqual([['a', 0, 2], ['b', 1, 2]])
  })

  it('reuses a lane once it is free and sizes the whole cluster alike', () => {
    const placed = placeAppointments([at('10:00', '11:00', 'a'), at('10:30', '11:30', 'b'), at('11:00', '12:00', 'c')], '2026-10-06', 480)
    expect(placed.map(p => [p.item.id, p.lane, p.lanes])).toEqual([['a', 0, 2], ['b', 1, 2], ['c', 0, 2]])
  })

  it('gives back the full width after a cluster ends', () => {
    const placed = placeAppointments([at('10:00', '11:00', 'a'), at('10:30', '11:30', 'b'), at('13:00', '14:00', 'c')], '2026-10-06', 480)
    expect(placed[2]).toMatchObject({ lane: 0, lanes: 1 })
  })

  it('leaves out other days, and clips an appointment that runs past midnight', () => {
    const placed = placeAppointments([
      { id: 'late', start: '2026-10-06T23:00', end: '2026-10-07T00:30' },
      { id: 'tomorrow', start: '2026-10-07T09:00', end: '2026-10-07T10:00' },
    ], '2026-10-06', 480)
    expect(placed).toHaveLength(1)
    expect(placed[0].height).toBe(60 * PX_PER_MIN)
  })

  it('never draws a card too short to read', () => {
    const [placed] = placeAppointments([at('10:00', '10:05')], '2026-10-06', 480)
    expect(placed.height).toBeGreaterThanOrEqual(22)
  })
})

describe('freeSlotStarts', () => {
  it('offers every half hour inside working hours that no appointment touches', () => {
    const starts = freeSlotStarts(day([['09:00', '17:00']]), [at('10:00', '10:45')], '2026-10-06')
    expect(starts.slice(0, 4)).toEqual([540, 570, 660, 690]) // 09:00, 09:30, then 11:00 (10:00 and 10:30 are touched)
    expect(starts[starts.length - 1]).toBe(16 * 60 + 30)
    expect(starts).not.toContain(600)
    expect(starts).not.toContain(630)
  })

  it('offers nothing outside the windows, in a gap between them, or without a schedule', () => {
    const starts = freeSlotStarts(day([['09:00', '13:00'], ['14:00', '17:00']]), [], '2026-10-06')
    expect(starts).toContain(750) // 12:30
    expect(starts).not.toContain(780) // 13:00
    expect(starts).toContain(840) // 14:00
    expect(freeSlotStarts(undefined, [], '2026-10-06')).toEqual([])
    expect(freeSlotStarts(day([]), [], '2026-10-06')).toEqual([])
  })

  it('starts on the half hour even when the window does not', () => {
    expect(freeSlotStarts(day([['09:15', '10:30']]), [], '2026-10-06')).toEqual([570, 600])
  })
})

describe('cardDensity', () => {
  const px = (minutes: number) => minutes * PX_PER_MIN

  it('an hour has room for time, client and service', () => {
    expect(cardDensity(px(60))).toBe('full')
    expect(cardDensity(px(50))).toBe('full')
  })

  it('40 and 45 minutes show time and client, never a clipped third line', () => {
    expect(cardDensity(px(45))).toBe('two')
    expect(cardDensity(px(40))).toBe('two')
  })

  it('half an hour still shows time and client, set tighter', () => {
    expect(cardDensity(px(30))).toBe('tight')
  })

  it('anything shorter is one line', () => {
    expect(cardDensity(px(20))).toBe('line')
    expect(cardDensity(22)).toBe('line') // the minimum height a card is drawn at
  })
})

describe('offHours', () => {
  it('is everything in the frame that is not a working window', () => {
    expect(offHours(day([['09:00', '13:00'], ['14:00', '17:00']]), 480, 1140)).toEqual([[480, 540], [780, 840], [1020, 1140]])
    expect(offHours(undefined, 480, 1140)).toEqual([[480, 1140]])
    expect(offHours(day([['08:00', '19:00']]), 480, 1140)).toEqual([])
  })
})
