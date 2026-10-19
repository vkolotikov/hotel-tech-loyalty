import { describe, expect, it } from 'vitest'
import { initialPoster, scheduleBody } from './ideasMath'

const team = [{ id: 3, name: 'Mia', role: 'manager' as const }, { id: 7, name: 'Sam', role: 'staff' as const }]

describe('Schedule and who posts it (spec 2026-10-19 §4.1)', () => {
  it('starts on the post’s own poster when they are on the team, else on nobody', () => {
    expect(initialPoster({ poster_id: 7 }, team)).toBe('7')
    expect(initialPoster({ poster_id: 9 }, team)).toBe('')
    expect(initialPoster({ poster_id: null }, team)).toBe('')
    expect(initialPoster({}, team)).toBe('')
  })

  it('sends the day and the time, and who posts it only when the person changed it', () => {
    const post = { updated_at: '2026-10-05T06:00:00.000000Z' }
    expect(scheduleBody(post, { date: '2026-10-09', time: '18:00' }, '7', '7')).toEqual({ updated_at: post.updated_at, scheduled_date: '2026-10-09', scheduled_time: '18:00' })
    expect(scheduleBody(post, { date: '2026-10-09', time: '' }, '3', '7')).toEqual({ updated_at: post.updated_at, scheduled_date: '2026-10-09', scheduled_time: null, poster_id: 3 })
    expect(scheduleBody(post, { date: '2026-10-09', time: '' }, '', '7')).toEqual({ updated_at: post.updated_at, scheduled_date: '2026-10-09', scheduled_time: null, poster_id: null })
  })
})
