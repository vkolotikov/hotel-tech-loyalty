import { describe, expect, it } from 'vitest'
import { postHome } from './links'

describe('postHome', () => {
  it('opens a post with a day on its week, and one with no day on Posts among the others with no day', () => {
    expect(postHome({ scheduled_date: '2026-10-21' })).toBe('/content?date=2026-10-21')
    expect(postHome({ scheduled_date: null })).toBe('/content/posts?unscheduled=1')
  })
})
