import { describe, expect, it } from 'vitest'
import { STATUSES, STATUS_TONE, TONE_CLASS, coversSlot, dayOverview, needsAttention } from './status'
import type { Status } from './types'

const now = { date: '2026-10-06', minutes: 10 * 60 + 20 }
const a = (status: Status, start: string) => ({ status, start })

describe('status', () => {
  it('every status has a tone, and every tone its three classes', () => {
    for (const status of STATUSES) {
      const tone = TONE_CLASS[STATUS_TONE[status]]
      expect(tone.text).toMatch(/^text-a-st-/)
      expect(tone.tint).toMatch(/^bg-a-st-.+\/\[0\.12\]$/)
      expect(tone.bar).toMatch(/^border-a-st-/)
    }
    expect(new Set(STATUSES.map(s => STATUS_TONE[s])).size).toBe(STATUSES.length) // no two statuses share a tone
  })

  it('on the grid a completed visit covers its time like a live one; only a cancellation or a no-show leaves it open', () => {
    expect(STATUSES.filter(coversSlot)).toEqual(['pending', 'confirmed', 'in_progress', 'completed'])
  })
})

describe('needsAttention', () => {
  it('a request awaiting confirmation always does', () => {
    expect(needsAttention(a('pending', '2026-10-09T10:00'), now)).toBe(true)
  })

  it('a confirmed appointment does once it is more than 15 minutes late without being started', () => {
    expect(needsAttention(a('confirmed', '2026-10-06T10:00'), now)).toBe(true)  // 20 minutes
    expect(needsAttention(a('confirmed', '2026-10-06T10:05'), now)).toBe(false) // exactly 15
    expect(needsAttention(a('confirmed', '2026-10-06T15:00'), now)).toBe(false)
    expect(needsAttention(a('confirmed', '2026-10-05T15:00'), now)).toBe(true)  // yesterday, never started
    expect(needsAttention(a('confirmed', '2026-10-07T09:00'), now)).toBe(false)
  })

  it('nothing else does', () => {
    for (const status of ['in_progress', 'completed', 'cancelled', 'no_show'] as Status[]) {
      expect(needsAttention(a(status, '2026-10-06T09:00'), now)).toBe(false)
    }
  })
})

describe('dayOverview', () => {
  it('counts one day, leaves cancelled out, and counts a late appointment once', () => {
    expect(dayOverview([
      a('completed', '2026-10-06T09:00'),
      a('confirmed', '2026-10-06T09:30'),   // late → attention, not upcoming
      a('in_progress', '2026-10-06T10:00'),
      a('confirmed', '2026-10-06T15:00'),
      a('pending', '2026-10-06T16:00'),
      a('no_show', '2026-10-06T08:00'),
      a('cancelled', '2026-10-06T12:00'),
      a('confirmed', '2026-10-07T09:00'),
    ], '2026-10-06', now)).toEqual({ total: 6, upcoming: 1, in_progress: 1, completed: 1, attention: 2 })
  })
})
