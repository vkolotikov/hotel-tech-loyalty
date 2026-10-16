import { describe, expect, it } from 'vitest'
import { postHome, postLink } from './links'

describe('postLink', () => {
  it('links a post with its brand, so a colleague on another brand opens the right one', () => {
    expect(postLink(5, 3)).toBe('/content/posts/5?brand_id=3')
    expect(postLink(5, null)).toBe('/content/posts/5')
  })
})

describe('postHome', () => {
  it('opens a post with a day on its week, and one with no day on Posts among the others with no day', () => {
    expect(postHome({ scheduled_date: '2026-10-21' })).toBe('/content?date=2026-10-21')
    expect(postHome({ scheduled_date: null })).toBe('/content/posts?unscheduled=1')
  })
})
