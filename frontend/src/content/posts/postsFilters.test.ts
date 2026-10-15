import { describe, expect, it } from 'vitest'
import type { Platform, PostStatus } from '../lib/types'
import { NO_FILTERS, isFiltered, readFilters, withFilter, writeFilters } from './postsFilters'

const statuses: PostStatus[] = ['idea', 'draft', 'published', 'archived']
const platforms: Platform[] = ['instagram', 'linkedin']
const read = (query: string) => readFilters(new URLSearchParams(query), statuses, platforms)

describe('readFilters', () => {
  it('drops numbers too big to be a page or a pillar (the server would refuse them)', () => {
    expect(read('page=99999999999999999999&pillar=1e20')).toMatchObject({ page: 1, pillar_id: null })
    expect(read('pillar=2147483647').pillar_id).toBe(2147483647)
  })

  it('reads a plain address as "not filtered", first page', () => {
    expect(read('')).toEqual(NO_FILTERS)
  })

  it('reads every filter an address names', () => {
    expect(read('q=autumn&status=draft&platform=linkedin&pillar=7&from=2026-10-01&to=2026-10-31&page=3')).toEqual({
      q: 'autumn', status: 'draft', platform: 'linkedin', pillar_id: 7, from: '2026-10-01', to: '2026-10-31', unscheduled: false, page: 3,
    })
  })

  // A shared or hand-edited link never makes the server refuse the list (it would answer 422 for an end before the start).
  it('drops what it cannot use: an unknown status or platform, a bad pillar or page, a bad date, an end before the start', () => {
    expect(read('status=lost&platform=myspace&pillar=-3&page=abc&from=2026-13-40&to=yesterday')).toEqual(NO_FILTERS)
    expect(read('from=2026-10-20&to=2026-10-01')).toMatchObject({ from: '2026-10-20', to: '' })
    expect(read('page=1.5').page).toBe(1)
  })

  it('takes "only posts with no day" over a date range (the two cannot both hold)', () => {
    expect(read('unscheduled=1&from=2026-10-01&to=2026-10-31')).toMatchObject({ unscheduled: true, from: '', to: '' })
  })
})

describe('writeFilters, withFilter and isFiltered', () => {
  it('write only what holds something, so a plain list keeps a plain address', () => {
    expect(writeFilters(NO_FILTERS).toString()).toBe('')
    const full = { q: 'autumn ', status: 'draft', platform: 'instagram', pillar_id: 7, from: '2026-10-01', to: '', unscheduled: false, page: 2 } as const
    expect(writeFilters(full).toString()).toBe('q=autumn+&status=draft&platform=instagram&pillar=7&from=2026-10-01&page=2')
    expect(read(writeFilters(full).toString())).toEqual(full)
  })

  it('start again from the first page when a filter changes, but not when the page does', () => {
    const onPage3 = { ...NO_FILTERS, page: 3 }
    expect(withFilter(onPage3, { status: 'draft' }).page).toBe(1)
    expect(withFilter(onPage3, { page: 4 }).page).toBe(4)
  })

  it('say whether anything filters the list (the page is not a filter)', () => {
    expect(isFiltered({ ...NO_FILTERS, page: 5 })).toBe(false)
    expect(isFiltered({ ...NO_FILTERS, unscheduled: true })).toBe(true)
    expect(isFiltered({ ...NO_FILTERS, q: '  ' })).toBe(false)
  })
})
