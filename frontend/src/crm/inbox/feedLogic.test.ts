import { describe, expect, it } from 'vitest'
import { FEED_INTENTS, feedName, feedPath, filterCountsPath, readCounts, readIntent, readRange } from './feedLogic'
import { INTENTS } from './inboxLogic'

describe('the Engagement feed (round 5)', () => {
  it('knows the intents the server filters by, each with the inbox’s own words', () => {
    expect([...FEED_INTENTS]).toEqual(['booking_inquiry', 'info_request', 'complaint', 'cancellation', 'support'])
    for (const intent of FEED_INTENTS) expect(INTENTS).toContain(intent)
  })

  it('reads ?intent= and ?range= strictly', () => {
    expect(readIntent('complaint')).toBe('complaint')
    expect(readIntent('spam')).toBeNull()
    expect(readIntent(null)).toBeNull()
    expect(readRange('week')).toBe('week')
    expect(readRange('year')).toBe('all')
    expect(readRange(undefined)).toBe('all')
  })

  it('asks the feed for the filter, the order, the window, the search and the page', () => {
    expect(feedPath({ filter: 'priority', sort: 'priority', range: 'all' })).toBe('engagement/feed?filter=priority&sort=priority&range=all')
    expect(feedPath({ filter: 'complaint', sort: 'recent', range: 'today', search: ' ada ', page: 2 }))
      .toBe('engagement/feed?filter=complaint&sort=recent&range=today&search=ada&page=2')
    expect(feedPath({ filter: 'hot_lead', sort: 'priority', range: 'month', page: 1 })).toBe('engagement/feed?filter=hot_lead&sort=priority&range=month')
    expect(filterCountsPath('week')).toBe('engagement/filter-counts?range=week')
  })

  it('keeps only whole counts from the filter counts', () => {
    expect(readCounts({ data: { priority: 7, complaint: 0, missed: -1, online: 'x', hot_lead: 4 } })).toEqual({ priority: 7, complaint: 0, hot_lead: 4 })
    expect(readCounts(undefined)).toEqual({})
    expect(readCounts({ data: null })).toEqual({})
  })

  it('names a row by what is known, never by the server’s English "Anonymous · …"', () => {
    const row = { display_name: null, guest: null, email: null, phone: null }
    expect(feedName({ ...row, display_name: 'Ada' })).toBe('Ada')
    expect(feedName({ ...row, guest: { id: 1, name: 'Ada Lovelace' } })).toBe('Ada Lovelace')
    expect(feedName({ ...row, email: 'ada@example.com' })).toBe('ada@example.com')
    expect(feedName({ ...row, phone: '+371' })).toBe('+371')
    expect(feedName({ ...row, display_name: '  ' })).toBeNull()
  })
})
