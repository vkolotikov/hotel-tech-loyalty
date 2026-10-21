import { addDays, formatDate, isDateKey, venueNow } from '../../workspace/lib/wallClock'
import { errorKey } from '../lib/errors'
import type { BioPayload, Channel, DateKey, Platform, PromotionBody, PromotionPreview, PromotionRun, Site, SitePage, SitePageKind, SitePayload } from '../lib/types'

/** Release 6's numbers (spec 2026-10-20 §D8); the server holds them too. */
export const POLL_MS = 4000
/** While nothing runs, the website and the promotion are read once a minute, so another tab's scan or promotion shows up. */
export const IDLE_POLL_MS = 60_000
export const MAX_PAGES = 20
export const MAX_PER_PAGE = 15
export const MAX_POSTS = 200
export const MAX_DAYS = 183
export const MAX_PER_WEEK = 21
export const DEFAULT_PER_PAGE = 10
export const DEFAULT_PER_WEEK = 3

type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string

export const isScanning = (payload: SitePayload | undefined): boolean => payload?.site?.status === 'scanning'
export const isPromoting = (run: PromotionRun | undefined): boolean => run?.status === 'running'
/** A promotion seen running that has finished: the plan and the pages' numbers are read again. */
export const promotionEnded = (prev: PromotionRun | undefined, next: PromotionRun | undefined): boolean =>
  isPromoting(prev) && next?.status === 'finished'

export interface PromoteForm {
  perPage: number
  platforms: Platform[]
  from: DateKey
  to: DateKey
  perWeek: number
  usePicture: boolean
  instructions: string
}

/** The dialog's first period (spec §4.2): from tomorrow, as many weeks as the posts need at the pace, at most 183 days. */
export function defaultPeriod(today: DateKey, total: number, perWeek: number): { from: DateKey; to: DateKey } {
  const from = addDays(today, 1)
  const weeks = Math.max(1, Math.ceil(total / Math.max(1, perWeek)))
  return { from, to: addDays(from, Math.min(weeks * 7, MAX_DAYS) - 1) }
}

export function newForm(today: DateKey, pages: number, platforms: Platform[]): PromoteForm {
  const { from, to } = defaultPeriod(today, pages * DEFAULT_PER_PAGE, DEFAULT_PER_WEEK)
  return { perPage: DEFAULT_PER_PAGE, platforms, from, to, perWeek: DEFAULT_PER_WEEK, usePicture: true, instructions: '' }
}

export const PROBLEMS = ['no_pages', 'too_many_pages', 'no_channels', 'per_page', 'per_week', 'too_many_posts', 'order', 'too_long', 'past'] as const
export type PromoteProblem = (typeof PROBLEMS)[number]
export const PROBLEM_TEXT: Record<PromoteProblem, string> = {
  no_pages: 'Choose at least one page.',
  too_many_pages: 'Choose at most 20 pages.',
  no_channels: 'Choose at least one channel.',
  per_page: 'Posts per page: from 1 to 15.',
  per_week: 'At most per week: from 1 to 21.',
  too_many_posts: 'One promotion writes at most 200 posts.',
  order: 'The last day cannot be before the first.',
  too_long: 'The period can be at most 183 days.',
  past: 'These days are already over.',
}

const days = (from: DateKey, to: DateKey) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1

/** What stops the dialog before anything is sent (spec §4.2); the server checks again. */
export function promoteProblems(pages: number, form: PromoteForm, today: DateKey): PromoteProblem[] {
  const out: PromoteProblem[] = []
  if (pages < 1) out.push('no_pages')
  if (pages > MAX_PAGES) out.push('too_many_pages')
  if (form.platforms.length === 0) out.push('no_channels')
  const perPage = Number.isInteger(form.perPage) && form.perPage >= 1 && form.perPage <= MAX_PER_PAGE
  if (!perPage) out.push('per_page')
  if (!(Number.isInteger(form.perWeek) && form.perWeek >= 1 && form.perWeek <= MAX_PER_WEEK)) out.push('per_week')
  if (perPage && pages * form.perPage > MAX_POSTS) out.push('too_many_posts')
  if (!isDateKey(form.from) || !isDateKey(form.to) || form.to < form.from) out.push('order')
  else if (form.to < today) out.push('past')
  else if (days(form.from > today ? form.from : today, form.to) > MAX_DAYS) out.push('too_long')
  return out
}

/** What the preview is asked (final review, 6-2): only what decides the days — not the instructions or the picture. */
export function previewBody(pageIds: number[], form: PromoteForm): PromotionBody {
  return { page_ids: pageIds, posts_per_page: form.perPage, platforms: form.platforms, from: form.from, to: form.to, per_week: form.perWeek }
}

/**
 * Cancel and Remove hand the keyboard back to Remove draft posts; once the page's last drafts are gone that button goes
 * with them, and the keyboard goes to the row's Hide posts instead of the page's top (release check, 6-2). Here, not in
 * PageRow.tsx: a component file exports only components (fast refresh).
 */
export function focusBack(row: ParentNode | null | undefined): void {
  const target = row?.querySelector<HTMLElement>('[data-remove-trigger]') ?? row?.querySelector<HTMLElement>('[data-posts-toggle]')
  target?.focus()
}

/** The problems shown under the form: a number field being retyped (empty) says nothing yet; Promote stays off (final review, 6-2). */
export function shownProblems(problems: readonly PromoteProblem[], blank: { perPage: boolean; perWeek: boolean }): PromoteProblem[] {
  return problems.filter(p => !(p === 'per_page' && blank.perPage) && !(p === 'per_week' && blank.perWeek))
}

/** Which number fields are being retyped: empty while the keyboard is in them; a field left empty says its problem (fixes-batch review). */
export function retyping(typed: { perPage: string; perWeek: string }, editing: 'perPage' | 'perWeek' | null): { perPage: boolean; perWeek: boolean } {
  return { perPage: editing === 'perPage' && typed.perPage.trim() === '', perWeek: editing === 'perWeek' && typed.perWeek.trim() === '' }
}

/** Platforms whose posts cannot hold a working link: their text says "link in bio" (ContentPlatformRules::NO_LINKS). */
const NO_LINKS: readonly Platform[] = ['instagram', 'tiktok']

/**
 * Should the dialog say that Instagram and TikTok posts need the link-in-bio page: one of them is chosen and the page is
 * not on or does not show the latest posts (final review, 6-1). Not while the page is still loading.
 */
export function bioNote(platforms: readonly Platform[], bio: BioPayload | undefined): boolean {
  return bio !== undefined && platforms.some(p => NO_LINKS.includes(p)) && !(bio.page?.is_on && bio.page.show_posts)
}

const KINDS: SitePageKind[] = ['article', 'page']

/** The tab a key moves to in the kinds-of-pages tab list (arrows wrap, Home and End), or null for other keys (final review, 6-2). */
export function tabAfter(current: SitePageKind, key: string): SitePageKind | null {
  const at = KINDS.indexOf(current)
  if (key === 'ArrowRight') return KINDS[(at + 1) % KINDS.length]
  if (key === 'ArrowLeft') return KINDS[(at + KINDS.length - 1) % KINDS.length]
  if (key === 'Home') return KINDS[0]
  if (key === 'End') return KINDS[KINDS.length - 1]
  return null
}

/**
 * The preview is asked only when the settled body it would send is the body on screen and the form has no problem: a
 * body settled before the brand's channels came would send none (release check, 6-2).
 */
export const askPreview = (problems: readonly string[], settled: string, current: string): boolean =>
  problems.length === 0 && settled === current

/** The read to catch up on when this tab is refused because another tab is scanning or promoting (final review, 6-2). */
export function catchUp(code: string): Array<'site' | 'promotion'> {
  if (code === 'already_scanning' || code === 'scan_running') return ['site']
  if (code === 'already_promoting') return ['promotion']
  return []
}

/** A scan seen running that has ended: the brand (its filled fields and readiness) is read again. */
export const scanEnded = (prev: SitePayload | undefined, next: SitePayload | undefined): boolean =>
  isScanning(prev) && next !== undefined && !isScanning(next)

/** "Update the company summary" to start: ticked unless someone edited the summary by hand (spec §D7). */
export const updateDefault = (site: Site | null): boolean => !(site?.summary_edited ?? false)

/** The address field to start: the site's, else the organisation's website (with https:// when it has no scheme). */
export function startAddress(payload: SitePayload): string {
  if (payload.site?.url) return payload.site.url
  const suggested = (payload.suggested_url ?? '').trim()
  if (suggested === '') return ''
  return /^https?:\/\//i.test(suggested) ? suggested : `https://${suggested}`
}

/** The chosen pages still on the list (a new scan can remove some). */
export const stillThere = (chosen: number[], pages: SitePage[]): number[] => chosen.filter(id => pages.some(p => p.id === id))

/** The Plan's note when a promotion ends: the posts added, or that none were (final review, 6-2). */
export function planNote(run: PromotionRun, t: Translate): { tone: 'info' | 'danger'; text: string } {
  const line = runLine(run, t)
  return { tone: run.status !== 'idle' && run.created_count > 0 ? 'info' : 'danger', text: line?.text ?? t('content.promote.run.none', 'No promotion posts were written.') }
}

/** The press as the server takes it: the pages in the order shown, instructions only when written. */
export function promotionBody(pageIds: number[], form: PromoteForm): PromotionBody {
  const instructions = form.instructions.trim()
  return {
    page_ids: pageIds, posts_per_page: form.perPage, platforms: form.platforms, from: form.from, to: form.to, per_week: form.perWeek,
    use_picture: form.usePicture, ...(instructions !== '' ? { instructions } : {}),
  }
}

/** The channels a promotion may use (spec §D9): the brand's active ones, once each, never the blog. */
export function promotablePlatforms(channels: Channel[]): Platform[] {
  const out: Platform[] = []
  for (const channel of channels) {
    if (channel.active && channel.platform !== 'blog' && !out.includes(channel.platform)) out.push(channel.platform)
  }
  return out
}

/** A page's numbers (spec §4.6). */
export function pageNumbers(page: SitePage, t: Translate): string {
  if (page.posts === 0 && page.clicks === 0) return t('content.promote.not_promoted', 'Not promoted yet')
  return t('content.promote.numbers', 'Posts: {{posts}} · Published: {{published}} · Clicks: {{clicks}}', { posts: page.posts, published: page.published, clicks: page.clicks })
}

/** The website's line (spec §5): reading, scanned (with its numbers), or why the scan failed; nothing before a scan. */
export function siteLine(site: Site | null, t: Translate, locale: string, timeZone: string): { tone: 'info' | 'danger'; text: string } | null {
  if (site === null || site.status === 'new') return null
  if (site.status === 'scanning') return { tone: 'info', text: t('content.site.scanning', 'Reading your website… This takes a minute or two. You can leave this page.') }
  if (site.status === 'failed') {
    const [key, text] = errorKey('site', site.error ?? 'scan_failed')
    return { tone: 'danger', text: t(key, text) }
  }
  // The venue's day of the scan (final review, 6-2: its UTC day), and the month in full: a short one ends in a dot in
  // several languages ("20 окт."), which met the sentence's own.
  const date = site.scanned_at ? formatDate(venueNow(timeZone, new Date(site.scanned_at)).date, locale, { day: 'numeric', month: 'long' }) : ''
  return { tone: 'info', text: t('content.site.scanned', 'Scanned {{date}}. Articles: {{articles}} · Pages: {{pages}}', { date, articles: site.articles_count, pages: site.pages_count }) }
}

/** Why the last scan did not update the company summary; null when it did (or was not asked to). */
export function summaryNote(site: Site | null, t: Translate): string | null {
  if (!site?.summary_note) return null
  const [key, text] = errorKey('summary', site.summary_note)
  return t(key, text)
}

/** The promotion's line (spec §5): while it writes, the pages done; when it finished, the posts added and what failed. */
export function runLine(run: PromotionRun, t: Translate): { tone: 'info' | 'success' | 'warning'; text: string; failures: string[] } | null {
  if (run.status === 'idle') return null
  const failures = run.pages.filter(p => p.status === 'failed' || p.error === 'ai_incomplete').map(p => {
    const [key, text] = errorKey('promotion', p.error ?? 'unknown')
    return t('content.promote.run.page_failed', '{{title}}: {{reason}}', { title: p.title ?? '—', reason: t(key, text) })
  })
  if (run.status === 'running') {
    const done = run.pages.filter(p => p.status !== 'queued' && p.status !== 'writing').length
    return { tone: 'info', text: t('content.promote.run.writing', 'The AI is writing promotion posts. Pages done: {{done}} of {{count}}', { done, count: run.pages.length }), failures }
  }
  const stopped = run.pages.filter(p => p.status === 'stopped').length
  if (stopped > 0) failures.push(t('content.promote.run.stopped', 'Pages not written after Stop: {{count}}', { count: stopped }))
  if (run.created_count === 0) return { tone: 'warning', text: t('content.promote.run.none', 'No promotion posts were written.'), failures }
  return {
    tone: failures.length > 0 ? 'warning' : 'success',
    text: t('content.promote.run.done', 'Promotion posts added to your plan as drafts: {{count}}', { count: run.created_count }),
    failures,
  }
}

/** What the preview found (spec §4.2): the posts and their days, or how many fit. */
export function previewLine(preview: PromotionPreview, t: Translate, locale: string): { fits: boolean; text: string } {
  if (preview.fit < preview.wanted || preview.first_date === null || preview.last_date === null) {
    return { fits: false, text: t('content.promote.dialog.short', 'Posts that fit in these days: {{fit}} of {{wanted}}. Choose a longer period, a higher pace or fewer posts.', { fit: preview.fit, wanted: preview.wanted }) }
  }
  const day = (date: DateKey) => formatDate(date, locale, { day: 'numeric', month: 'short' })
  return { fits: true, text: t('content.promote.dialog.fits', 'Posts: {{count}} · {{from}} – {{to}}', { count: preview.wanted, from: day(preview.first_date), to: day(preview.last_date) }) }
}
