import { params } from '../lib/api'
import { feedPath, type FeedPage, type FeedRange, type FeedRow, type FilterCounts } from '../inbox/feedLogic'
import type { Visitor, VisitorStats } from './types'

/**
 * The Visitors page's decisions, pure for the tests: which list a tab asks for, whether someone is on the site now,
 * and how a visitor is named and placed. The server decides the rest (VisitorController).
 */

/**
 * The page's address parameters: `?tab=` the chosen tab, `?v=` the visitor open in the panel; round 5: `?vtab=` the
 * panel's tab, `?range=` the feed's window on a feed tab.
 */
export const VISITOR_PARAM = { tab: 'tab', visitor: 'v', panelTab: 'vtab', range: 'range' } as const

/** The tabs the Visitors endpoint answers (`visitors?status=…`). */
export const VISITOR_TABS = ['online', 'all', 'offline', 'leads'] as const
/** Round 5: the full admin's Engagement filters, answered by its feed (`engagement/feed?filter=…`). */
export const VISITOR_FEED_TABS = ['hot_lead', 'has_contact', 'missed'] as const
export type VisitorListTab = (typeof VISITOR_TABS)[number]
export type VisitorFeedTab = (typeof VISITOR_FEED_TABS)[number]
export type VisitorTab = VisitorListTab | VisitorFeedTab

export const ALL_VISITOR_TABS: readonly VisitorTab[] = [...VISITOR_TABS, ...VISITOR_FEED_TABS]

/** `?tab=` keeps the chosen tab; who is on the site now when nothing (or nonsense) is asked, as the full admin. */
export function readTab(value: string | null | undefined, feedOn = true): VisitorTab {
  if ((VISITOR_TABS as readonly string[]).includes(value ?? '')) return value as VisitorTab
  if (feedOn && (VISITOR_FEED_TABS as readonly string[]).includes(value ?? '')) return value as VisitorTab
  return 'online'
}

export const isFeedTab = (tab: VisitorTab): tab is VisitorFeedTab => (VISITOR_FEED_TABS as readonly string[]).includes(tab)

export type VisitorsSource = { kind: 'visitors'; path: string } | { kind: 'feed'; path: string }

/** Where a tab's list comes from: the Visitors endpoint, or the feed (in the server's priority order, in the window). */
export function visitorsSource(tab: VisitorTab, search: string, page: number, range: FeedRange): VisitorsSource {
  return isFeedTab(tab)
    ? { kind: 'feed', path: feedPath({ filter: tab, sort: 'priority', range, search, page }) }
    : { kind: 'visitors', path: visitorsPath(tab, search, page) }
}

/** A row of the list: a visitor, with the feed's hot-lead flag and what their latest chat is about. */
export interface VisitorRow extends Visitor {
  hot?: boolean
  intent?: string | null
}

/** A feed row as a visitor of the list (the feed names the page only while they are on the site). */
export function feedVisitor(row: FeedRow): VisitorRow {
  return {
    id: row.id,
    visitor_ip: row.visitor_ip,
    country: row.country,
    city: row.city,
    referrer: null,
    current_page: row.current_page,
    current_page_title: row.current_page_title,
    first_seen_at: row.first_seen_at ?? null,
    last_seen_at: row.last_seen_at,
    visit_count: row.visit_count,
    page_views_count: row.page_views_count,
    messages_count: row.messages_count,
    is_lead: row.is_lead,
    is_online: row.is_online,
    guest_id: row.guest_id,
    display_name: row.display_name,
    email: row.email,
    phone: row.phone,
    guest: row.guest ? { id: row.guest.id, full_name: row.guest.name, email: null, phone: null } : null,
    hot: row.is_hot_lead,
    intent: row.conversation?.intent_tag ?? null,
  }
}

/** The list and its paging, whichever endpoint answered. */
export function feedList(answer: FeedPage | undefined): { rows: VisitorRow[]; meta: FeedPage['meta'] | undefined } {
  return { rows: (answer?.data ?? []).map(feedVisitor), meta: answer?.meta }
}

/** The visitor panel's tabs (round 5). */
export const PANEL_TABS = ['overview', 'chats', 'pages'] as const
export type PanelTab = (typeof PANEL_TABS)[number]

export function readPanelTab(value: string | null | undefined): PanelTab {
  return (PANEL_TABS as readonly string[]).includes(value ?? '') ? (value as PanelTab) : 'overview'
}

/** `?v=12` opens visitor 12. */
export function readVisitorId(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,10}$/.test(value)) return null
  const id = Number(value)
  return id > 0 ? id : null
}

/** The list's address: `visitors?status=online|offline|all&lead_only=1&search=&page=`. Leads are every lead, online or not. */
export function visitorsPath(tab: VisitorListTab, search: string, page = 1): string {
  return `visitors${params({
    status: tab === 'leads' ? 'all' : tab,
    lead_only: tab === 'leads',
    search: search.trim(),
    page: page > 1 ? page : undefined,
  })}`
}

/** The count beside each tab: the Visitors endpoint's `stats`, and the feed's own counts for its tabs. */
export function tabCounts(stats: VisitorStats | undefined, feed?: FilterCounts): Partial<Record<VisitorTab, number>> {
  const out: Partial<Record<VisitorTab, number>> = stats ? { online: stats.online, all: stats.total, offline: stats.offline, leads: stats.leads } : {}
  for (const tab of VISITOR_FEED_TABS) if (typeof feed?.[tab] === 'number') out[tab] = feed[tab]
  return out
}

/** The server counts a visitor online for 90 s after their last sign of life (VisitorController::ONLINE_THRESHOLD_SECONDS). */
export const ONLINE_SECONDS = 90
/** Seen within the last half hour: "recently", worth a hello while they may still be reading. */
export const RECENT_SECONDS = 30 * 60

export type Presence = 'online' | 'recent' | 'away'

/** On the site now, recently, or away — from when they were last seen, so the dot ages between two reads. */
export function presence(lastSeen: string | null | undefined, now: number = Date.now()): Presence {
  const at = lastSeen ? Date.parse(lastSeen) : NaN
  if (Number.isNaN(at)) return 'away'
  const seconds = (now - at) / 1000
  if (seconds < ONLINE_SECONDS) return 'online'
  if (seconds < RECENT_SECONDS) return 'recent'
  return 'away'
}

/** The visitor's name as far as it is known: their own, their contact's, their email or phone; null for an unknown one. */
export function visitorName(v: Pick<Visitor, 'display_name' | 'guest' | 'email' | 'phone'>): string | null {
  const name = v.display_name?.trim() || v.guest?.full_name?.trim() || v.email?.trim() || v.phone?.trim()
  return name || null
}

/** Where they are: "Riga, Latvia", or null. */
export function placeOf(v: Pick<Visitor, 'city' | 'country'>): string | null {
  return [v.city, v.country].filter(part => part && part.trim()).join(', ') || null
}

/** Whether the visitor left a way to reach them. */
export function hasContact(v: Pick<Visitor, 'email' | 'phone' | 'guest'>): boolean {
  return Boolean(v.email || v.phone || v.guest?.email || v.guest?.phone)
}

/** A page address as its path ("/rooms/suite"), the whole address when it cannot be read. */
export function pathOf(url: string): string {
  try {
    const u = new URL(url)
    return `${u.pathname}${u.search}` || '/'
  } catch {
    return url
  }
}

/** The page they are on, by its title when the site gave one. */
export function pageLabel(title: string | null | undefined, url: string | null | undefined): string | null {
  return title?.trim() || (url ? pathOf(url) : null)
}

/** A link only for a web address: what a visitor's browser reported is never followed under another scheme. */
export function webHref(url: string | null | undefined): string | null {
  return url && /^https?:\/\/[^\s]+$/i.test(url.trim()) ? url.trim() : null
}

/** The site an address belongs to ("www.google.com"), the whole address when it cannot be read. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}
