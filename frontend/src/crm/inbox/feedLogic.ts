import { params } from '../lib/api'

/**
 * Round 5 (owner 2026-11-12, "implement all features we have in our main platform"): the full admin's priority and
 * intent feed — its Engagement hub, `engagement/feed` and `engagement/filter-counts` (EngagementController,
 * EngagementFeedService) — in the inbox and on Visitors. The feed has one row per visitor with their latest chat, the
 * server's priority order and its hot-lead flag; every rule of it stays the server's. Pure, for the tests.
 */

/** The intents the feed filters by, as the server names them (EngagementController::feed's `filter`). */
export const FEED_INTENTS = ['booking_inquiry', 'info_request', 'complaint', 'cancellation', 'support'] as const
export type FeedIntent = (typeof FEED_INTENTS)[number]

/** Every filter the feed takes. */
export type FeedFilter =
  | 'priority' | 'all' | 'online' | 'has_contact' | 'active_chat' | 'hot_lead' | 'anonymous' | 'resolved' | 'missed'
  | FeedIntent

/** The feed's time windows (`range`), the visitor's last activity or a chat in it; all time when nothing is asked. */
export const FEED_RANGES = ['all', 'today', 'week', 'month'] as const
export type FeedRange = (typeof FEED_RANGES)[number]

export type FeedSort = 'priority' | 'recent'

export function readIntent(value: string | null | undefined): FeedIntent | null {
  return (FEED_INTENTS as readonly string[]).includes(value ?? '') ? (value as FeedIntent) : null
}

export function readRange(value: string | null | undefined): FeedRange {
  return (FEED_RANGES as readonly string[]).includes(value ?? '') ? (value as FeedRange) : 'all'
}

/** `engagement/feed?filter=&sort=&range=&search=&page=` (50 a page, the server's default). */
export function feedPath(input: { filter: FeedFilter; sort: FeedSort; range: FeedRange; search?: string; page?: number }): string {
  return `engagement/feed${params({
    filter: input.filter,
    sort: input.sort,
    range: input.range,
    search: (input.search ?? '').trim(),
    page: input.page && input.page > 1 ? input.page : undefined,
  })}`
}

/** `engagement/filter-counts?range=`: how many visitors each filter holds in the window. */
export function filterCountsPath(range: FeedRange): string {
  return `engagement/filter-counts${params({ range })}`
}

export type FilterCounts = Partial<Record<FeedFilter, number>>

/** The counts as the endpoint answers them (`{data: {priority: 7, …}}`), only whole numbers. */
export function readCounts(answer: { data?: unknown } | undefined): FilterCounts {
  const data = answer?.data && typeof answer.data === 'object' ? (answer.data as Record<string, unknown>) : {}
  return Object.fromEntries(Object.entries(data).filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) as FilterCounts
}

/** One row of `engagement/feed` (EngagementFeedService::toRow), as the CRM reads it. */
export interface FeedRow {
  id: number
  display_name: string | null
  email: string | null
  phone: string | null
  is_lead: boolean
  is_online: boolean
  country: string | null
  city: string | null
  visitor_ip: string | null
  current_page: string | null
  current_page_title: string | null
  visit_count: number
  page_views_count: number
  messages_count: number
  last_seen_at: string | null
  first_seen_at?: string | null
  guest_id: number | null
  guest: { id: number; name: string | null } | null
  conversation: {
    id: number
    status: 'active' | 'waiting' | 'resolved' | 'archived'
    last_message_preview: string | null
    last_message_sender: string | null
    last_message_at: string | null
    lead_captured: boolean
    ai_enabled: boolean
    assigned_to: number | null
    unread_admin_count: number
    intent_tag: string | null
  } | null
  is_hot_lead: boolean
  priority_score: number
}

export interface FeedPage {
  data: FeedRow[]
  meta: { current_page: number; last_page: number; per_page: number; total: number }
}

/**
 * A feed row's name as far as it is known — never the server's `effective_name`, whose "Anonymous · Riga" is English;
 * null for someone unknown (the page says "Visitor" in the person's language).
 */
export function feedName(row: Pick<FeedRow, 'display_name' | 'guest' | 'email' | 'phone'>): string | null {
  return row.display_name?.trim() || row.guest?.name?.trim() || row.email?.trim() || row.phone?.trim() || null
}
