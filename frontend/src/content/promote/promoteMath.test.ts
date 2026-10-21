import { describe, expect, it } from 'vitest'
import { errorKey } from '../lib/errors'
import type { BioPayload, Channel, PromotionRun, Site, SitePage } from '../lib/types'
import {
  DEFAULT_PER_PAGE, DEFAULT_PER_WEEK, askPreview, bioNote, catchUp, defaultPeriod, isPromoting, isScanning, newForm, pageNumbers, planNote, previewBody, previewLine,
  promotablePlatforms, promoteProblems, promotionBody, promotionEnded, retyping, runLine, scanEnded, shownProblems, siteLine, startAddress, stillThere, summaryNote, tabAfter, updateDefault,
} from './promoteMath'

const t = (_key: string, fallback: string, vars?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
const site = (more: Partial<Site> = {}): Site => ({
  url: 'https://lumiere.example', status: 'ready', error: null, scanned_at: '2026-10-20T09:00:00.000000Z', articles_count: 42, pages_count: 12,
  summary: null, summary_updated_at: null, summary_edited: false, summary_note: null, ...more,
})
const page = (more: Partial<SitePage> = {}): SitePage => ({
  id: 1, kind: 'article', url: 'https://lumiere.example/blog/a', title: 'A', description: null, image_url: null, published_at: null,
  seen: true, posts: 0, published: 0, clicks: 0, last_promoted_at: null, ...more,
})
type Run = Exclude<PromotionRun, { status: 'idle' }>
const finished = (more: Partial<Run> = {}): Run => ({
  status: 'finished', batch: 'b', created_count: 4, wanted_count: 4, finished_at: '2026-10-20T10:00:00.000000Z',
  pages: [{ page_id: 1, title: 'A', status: 'done', posts_wanted: 2, posts_made: 2, error: null }], ...more,
})

describe('the promote rules (spec 2026-10-20 §4.2, §5)', () => {
  it('starts from tomorrow for as many weeks as the posts need at the pace, at most 183 days', () => {
    expect(defaultPeriod('2026-10-20', 30, 3)).toEqual({ from: '2026-10-21', to: '2026-12-29' })
    expect(defaultPeriod('2026-10-20', 2, 3)).toEqual({ from: '2026-10-21', to: '2026-10-27' })
    expect(defaultPeriod('2026-10-20', 200, 1)).toEqual({ from: '2026-10-21', to: '2027-04-21' })
    const form = newForm('2026-10-20', 3, ['instagram'])
    expect([form.perPage, form.perWeek, form.usePicture, form.instructions]).toEqual([DEFAULT_PER_PAGE, DEFAULT_PER_WEEK, true, ''])
    expect(form.from).toBe('2026-10-21')
  })

  it('names every problem before anything is sent', () => {
    const ok = newForm('2026-10-20', 2, ['instagram'])
    expect(promoteProblems(2, ok, '2026-10-20')).toEqual([])
    expect(promoteProblems(0, ok, '2026-10-20')).toEqual(['no_pages'])
    expect(promoteProblems(21, ok, '2026-10-20')).toContain('too_many_pages')
    expect(promoteProblems(2, { ...ok, platforms: [] }, '2026-10-20')).toEqual(['no_channels'])
    expect(promoteProblems(2, { ...ok, perPage: 16 }, '2026-10-20')).toEqual(['per_page'])
    expect(promoteProblems(2, { ...ok, perWeek: 0 }, '2026-10-20')).toEqual(['per_week'])
    expect(promoteProblems(14, { ...ok, perPage: 15 }, '2026-10-20')).toContain('too_many_posts')
    expect(promoteProblems(2, { ...ok, to: '2026-10-01' }, '2026-10-20')).toEqual(['order'])
    expect(promoteProblems(2, { ...ok, from: '2026-09-01', to: '2026-09-30' }, '2026-10-20')).toEqual(['past'])
    expect(promoteProblems(2, { ...ok, to: '2027-06-01' }, '2026-10-20')).toEqual(['too_long'])
  })

  it('sends the pages in order and leaves out empty instructions', () => {
    const form = { ...newForm('2026-10-20', 2, ['instagram', 'linkedin']), instructions: '  ' }
    expect(promotionBody([5, 3], form)).toEqual({ page_ids: [5, 3], posts_per_page: 10, platforms: ['instagram', 'linkedin'], from: form.from, to: form.to, per_week: 3, use_picture: true })
    expect(promotionBody([5], { ...form, instructions: ' Mention the offer ' }).instructions).toBe('Mention the offer')
  })

  it('offers the active channels once each, never the blog', () => {
    const channel = (platform: string, active = true) => ({ id: 1, platform, active } as unknown as Channel)
    expect(promotablePlatforms([channel('instagram'), channel('blog'), channel('instagram'), channel('linkedin', false), channel('facebook')])).toEqual(['instagram', 'facebook'])
  })

  it('says a page’s numbers, or that it is not promoted yet', () => {
    expect(pageNumbers(page(), t)).toBe('Not promoted yet')
    expect(pageNumbers(page({ posts: 10, published: 4, clicks: 37 }), t)).toBe('Posts: 10 · Published: 4 · Clicks: 37')
  })

  // Final review (6-2) M10: clearing a number field to type another showed its problem mid-edit.
  it('says nothing yet about a number field being retyped', () => {
    expect(shownProblems(['per_page', 'order'], { perPage: true, perWeek: false })).toEqual(['order'])
    expect(shownProblems(['per_page', 'per_week'], { perPage: false, perWeek: true })).toEqual(['per_page'])
    expect(shownProblems(['per_page'], { perPage: false, perWeek: false })).toEqual(['per_page'])
    // Fixes-batch review: only while the keyboard is in the field; a field left empty says its problem.
    expect(retyping({ perPage: '', perWeek: '3' }, 'perPage')).toEqual({ perPage: true, perWeek: false })
    expect(retyping({ perPage: '', perWeek: '3' }, null)).toEqual({ perPage: false, perWeek: false })
    expect(retyping({ perPage: '', perWeek: '' }, 'perWeek')).toEqual({ perPage: false, perWeek: true })
    expect(retyping({ perPage: '4', perWeek: '3' }, 'perPage')).toEqual({ perPage: false, perWeek: false })
  })

  // Final review (6-1): Instagram and TikTok posts point to the link in bio, which must be on and show the posts.
  it('says when Instagram or TikTok posts have no link-in-bio page showing them', () => {
    const bio = (page: BioPayload['page']): BioPayload => ({ page, buttons: [], url: null, suggested_name: 'lumiere', base_url: 'https://sites.hexa-tech.uk/links/' })
    const on = { is_on: true, slug: 'lumiere', title: null, line: null, show_posts: true }
    expect(bioNote(['instagram'], bio(null))).toBe(true)
    expect(bioNote(['tiktok', 'linkedin'], bio({ ...on, show_posts: false }))).toBe(true)
    expect(bioNote(['instagram'], bio({ ...on, is_on: false }))).toBe(true)
    expect(bioNote(['instagram'], bio(on))).toBe(false)
    expect(bioNote(['linkedin', 'facebook'], bio(null))).toBe(false)
    expect(bioNote(['instagram'], undefined)).toBe(false)
  })

  // Final review (6-2) M6: Remove draft posts had no words for a brand not set up.
  it('has words for Remove draft posts on a brand not set up', () => {
    expect(errorKey('drafts', 'no_profile')).toEqual(['content.drafts.error.no_profile', 'This brand is not set up yet.'])
  })

  // Fixes-batch review: robots_unreachable also stands for a robots.txt that never answered.
  it('says a robots.txt could not be read, an error or no answer', () => {
    expect(errorKey('site', 'robots_unreachable')[1]).toBe("The website's robots.txt could not be read (an error or no answer), so Content read nothing. Try again later.")
  })

  // Final review (6-2) M11: the tabs follow the arrow keys, Home and End, as a tab list should.
  it('moves between the kinds of pages with the arrow keys', () => {
    expect(tabAfter('article', 'ArrowRight')).toBe('page')
    expect(tabAfter('page', 'ArrowRight')).toBe('article')
    expect(tabAfter('article', 'ArrowLeft')).toBe('page')
    expect(tabAfter('page', 'Home')).toBe('article')
    expect(tabAfter('article', 'End')).toBe('page')
    expect(tabAfter('article', 'Enter')).toBeNull()
  })

  it('says how the website stands', () => {
    expect(siteLine(null, t, 'en-GB', 'Europe/London')).toBeNull()
    expect(siteLine(site({ status: 'new', scanned_at: null }), t, 'en-GB', 'Europe/London')).toBeNull()
    expect(siteLine(site({ status: 'scanning' }), t, 'en-GB', 'Europe/London')?.text).toContain('Reading your website')
    expect(siteLine(site(), t, 'en-GB', 'Europe/London')).toEqual({ tone: 'info', text: 'Scanned 20 October. Articles: 42 · Pages: 12' })
    // Release check (6-2): a short month that ends in a dot ("20 окт.", "20. Okt.") met the sentence's own full stop.
    for (const locale of ['ru', 'de', 'fr', 'es']) expect(siteLine(site(), t, locale, 'Europe/London')?.text).not.toContain('..')
    expect(siteLine(site({ status: 'failed', error: 'site_blocked' }), t, 'en-GB', 'Europe/London')).toEqual({ tone: 'danger', text: "The website's robots.txt does not let Content read it." })
    // Final review (6-2) M5: the scan's day is the venue's, not the UTC day of its instant.
    const late = site({ scanned_at: '2026-10-20T23:30:00.000000Z' })
    expect(siteLine(late, t, 'en-GB', 'Europe/Riga')?.text).toContain('Scanned 21 October.')
    expect(siteLine(late, t, 'en-GB', 'America/New_York')?.text).toContain('Scanned 20 October.')
    expect(summaryNote(site({ summary_note: 'ai_budget_used_up' }), t)).toContain('budget')
    expect(summaryNote(site(), t)).toBeNull()
  })

  it('follows a promotion: running, then what it added and what failed', () => {
    const running: PromotionRun = { ...finished(), status: 'running', finished_at: null, pages: [
      { page_id: 1, title: 'A', status: 'done', posts_wanted: 2, posts_made: 2, error: null },
      { page_id: 2, title: 'B', status: 'writing', posts_wanted: 2, posts_made: 0, error: null },
    ] }
    expect(runLine({ status: 'idle' }, t)).toBeNull()
    expect(runLine(running, t)?.text).toBe('The AI is writing promotion posts. Pages done: 1 of 2')
    expect(runLine(finished(), t)).toEqual({ tone: 'success', text: 'Promotion posts added to your plan as drafts: 4', failures: [] })
    const mixed = finished({ created_count: 2, pages: [
      { page_id: 1, title: 'A', status: 'done', posts_wanted: 2, posts_made: 2, error: null },
      { page_id: 2, title: 'B', status: 'failed', posts_wanted: 2, posts_made: 0, error: 'ai_failed' },
      { page_id: 3, title: 'C', status: 'stopped', posts_wanted: 2, posts_made: 0, error: null },
    ] })
    expect(runLine(mixed, t)).toEqual({ tone: 'warning', text: 'Promotion posts added to your plan as drafts: 2',
      failures: ['B: The AI could not write these posts.', 'Pages not written after Stop: 1'] })
    expect(runLine(finished({ created_count: 0 }), t)?.text).toBe('No promotion posts were written.')
    expect(isPromoting(running)).toBe(true)
    expect(promotionEnded(running, finished())).toBe(true)
    expect(promotionEnded(finished(), finished())).toBe(false)
    expect(isScanning({ site: site({ status: 'scanning' }), suggested_url: null, pages: [] })).toBe(true)
  })

  // Final review (6-2): what the preview is asked is only what changes its answer; instructions and the picture do not.
  it('asks the preview only what decides the days', () => {
    const form = { ...newForm('2026-10-20', 2, ['instagram']), instructions: 'Mention the offer', usePicture: false }
    expect(previewBody([5, 3], form)).toEqual({ page_ids: [5, 3], posts_per_page: 10, platforms: ['instagram'], from: form.from, to: form.to, per_week: 3 })
  })

  // Release check (6-2): the dialog opened before the brand's channels came, so the first settled body had none; once
  // they came the form was fine but the settled body was still the empty one, and the server refused it (a red flash).
  it('asks the preview only once the body it would send is the one on screen and has no problem', () => {
    const empty = JSON.stringify(previewBody([5], newForm('2026-10-20', 1, [])))
    const ready = JSON.stringify(previewBody([5], newForm('2026-10-20', 1, ['instagram'])))
    expect(askPreview([], empty, ready)).toBe(false)
    expect(askPreview([], ready, ready)).toBe(true)
    expect(askPreview(['no_channels'], empty, empty)).toBe(false)
  })

  it('tells a tab that was refused because another tab is working which read to catch up', () => {
    expect(catchUp('already_scanning')).toEqual(['site'])
    expect(catchUp('scan_running')).toEqual(['site'])
    expect(catchUp('already_promoting')).toEqual(['promotion'])
    expect(catchUp('bad_address')).toEqual([])
  })

  it('knows when a scan seen running has ended', () => {
    const scanning = { site: site({ status: 'scanning' }), suggested_url: null, pages: [] }
    expect(scanEnded(scanning, { site: site(), suggested_url: null, pages: [] })).toBe(true)
    expect(scanEnded(scanning, scanning)).toBe(false)
    expect(scanEnded(undefined, { site: site(), suggested_url: null, pages: [] })).toBe(false)
  })

  it('follows the stored summary and address until the manager changes them', () => {
    expect(updateDefault(site({ summary_edited: true }))).toBe(false)
    expect(updateDefault(site())).toBe(true)
    expect(updateDefault(null)).toBe(true)
    expect(startAddress({ site: site({ url: 'https://lumiere.example/blog' }), suggested_url: 'lumiere.lv', pages: [] })).toBe('https://lumiere.example/blog')
    expect(startAddress({ site: null, suggested_url: 'lumiere.lv', pages: [] })).toBe('https://lumiere.lv')
    expect(startAddress({ site: null, suggested_url: 'http://lumiere.lv', pages: [] })).toBe('http://lumiere.lv')
    expect(startAddress({ site: null, suggested_url: null, pages: [] })).toBe('')
  })

  it('keeps only the chosen pages still on the list', () => {
    expect(stillThere([1, 2, 9], [page({ id: 2 }), page({ id: 1 })])).toEqual([1, 2])
  })

  it('gives the Plan a note that says nothing was added when nothing was', () => {
    expect(planNote(finished(), t)).toEqual({ tone: 'info', text: 'Promotion posts added to your plan as drafts: 4' })
    expect(planNote(finished({ created_count: 0 }), t)).toEqual({ tone: 'danger', text: 'No promotion posts were written.' })
  })

  it('says what the preview found', () => {
    expect(previewLine({ wanted: 30, fit: 30, first_date: '2026-10-21', last_date: '2026-12-28', weeks: 10 }, t, 'en-GB'))
      .toEqual({ fits: true, text: 'Posts: 30 · 21 Oct – 28 Dec' })
    expect(previewLine({ wanted: 30, fit: 18, first_date: '2026-10-21', last_date: '2026-11-30', weeks: 6 }, t, 'en-GB'))
      .toEqual({ fits: false, text: 'Posts that fit in these days: 18 of 30. Choose a longer period, a higher pace or fewer posts.' })
  })
})
