import { describe, expect, it } from 'vitest'
import type { AppointmentSummary, MasterDay, Status } from '../lib/types'
import {
  columnAt, edgeScroll, isDragClick, movedStart, onRelease, pointerStartsDrag, rawMinuteAt, resizedLength, touchStartsDrag, whyNot,
} from './dragMath'

const day: MasterDay = { windows: [{ start: '09:00', end: '13:00' }, { start: '14:00', end: '17:00' }], time_off: [] }
const appt = (id: number, start: string, end: string, status: Status = 'confirmed'): AppointmentSummary => ({
  id, reference: `SVC-${id}`, start, end, duration_minutes: 45, service: { id: 1, name: 'Balayage' }, master: { id: 1, name: 'Emma' },
  client: { id: 5, name: 'Tom', is_member: false }, status, payment: { state: 'not_paid_online' }, revision: 'r',
})
const base = { date: '2026-10-06', start: 600, end: 645, masterId: 1, day, serviceMasterIds: [1], others: [] as AppointmentSummary[], today: '2026-10-06' }

describe('drag maths', () => {
  it('turns a pointer into a snapped start, kept inside the day', () => {
    expect(rawMinuteAt(72, 480)).toBe(540) // 72 px at 1.2 px a minute
    expect(movedStart(605, 0, 45)).toBe(600)
    expect(movedStart(10, 30, 45)).toBe(0)
    expect(movedStart(1430, 0, 45)).toBe(1395)
  })

  it('stretches in 15-minute steps, from 15 minutes to 8 hours, never past midnight', () => {
    expect(resizedLength(600, 691)).toBe(90)
    expect(resizedLength(600, 605)).toBe(15)
    expect(resizedLength(600, 1200)).toBe(480)
    expect(resizedLength(1380, 1500)).toBe(60)
  })

  it('finds the column under the pointer', () => {
    const boxes = [{ left: 56, right: 224 }, { left: 224, right: 392 }]
    expect(columnAt(250, boxes)).toBe(1)
    expect(columnAt(10, boxes)).toBe(-1)
  })

  it('says why a place will not do: a past day, the wrong person, outside the hours, an overlap', () => {
    expect(whyNot({ ...base, date: '2026-10-05' })?.reason).toBe('past_day')
    expect(whyNot({ ...base, serviceMasterIds: [2] })?.reason).toBe('not_eligible')
    expect(whyNot({ ...base, start: 750, end: 795 })?.reason).toBe('outside_hours') // 12:30–13:15 crosses lunch
    const tom = appt(9, '2026-10-06T10:30', '2026-10-06T11:15')
    expect(whyNot({ ...base, others: [tom] })).toEqual({ reason: 'overlap', other: tom })
    expect(whyNot(base)).toBeNull()
  })

  it('counts only what the scheduler counts: a completed or cancelled visit does not block (R3)', () => {
    expect(whyNot({ ...base, others: [appt(9, '2026-10-06T10:30', '2026-10-06T11:15', 'completed')] })).toBeNull()
    expect(whyNot({ ...base, others: [appt(9, '2026-10-06T10:30', '2026-10-06T11:15', 'cancelled')] })).toBeNull()
  })

  it('accepts a drop that ends at midnight in a window that ends at 24:00 (Review Focus 3)', () => {
    const late: MasterDay = { windows: [{ start: '18:00', end: '24:00' }], time_off: [] }
    expect(whyNot({ ...base, day: late, start: 1380, end: 1440 })).toBeNull()
  })

  it('starts a touch drag only after a still press, and a mouse drag after a few pixels (Review Focus 2)', () => {
    expect(touchStartsDrag(450, 3)).toBe(true)
    expect(touchStartsDrag(450, 12)).toBe(false) // a swipe: the page scrolls
    expect(touchStartsDrag(200, 0)).toBe(false)
    expect(pointerStartsDrag(3)).toBe(false) // a click
    expect(pointerStartsDrag(4)).toBe(true)
  })

  it('sends nothing for a release at the card\'s own place or over a place that will not do (Review Focus 1)', () => {
    const from = { colIndex: 0, start: 600, length: 45 }
    expect(onRelease({ ...from, why: null }, from)).toBe('none')
    expect(onRelease({ ...from, start: 660, why: { reason: 'overlap' } }, from)).toBe('none')
    expect(onRelease({ ...from, colIndex: -1, start: 660, why: null }, from)).toBe('none')
    expect(onRelease({ ...from, start: 660, why: null }, from)).toBe('confirm')
    expect(onRelease({ ...from, length: 90, why: null }, from)).toBe('confirm')
  })

  it('ignores only the click that ends a drag, never a later one (Review Focus 1)', () => {
    expect(isDragClick(1000, 1100)).toBe(true) // the browser's click on release over the card
    expect(isDragClick(1000, 1400)).toBe(false) // a drag released elsewhere, then a real click
    expect(isDragClick(null, 1000)).toBe(false)
  })

  it('scrolls the calendar when the pointer nears its edges', () => {
    const box = { top: 100, bottom: 700, left: 0, right: 1000 }
    expect(edgeScroll({ x: 500, y: 690 }, box)).toEqual([0, 12])
    expect(edgeScroll({ x: 10, y: 400 }, box)).toEqual([-12, 0])
    expect(edgeScroll({ x: 500, y: 400 }, box)).toEqual([0, 0])
  })
})
