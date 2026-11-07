import { params } from '../lib/api'
import type { Visitor, VisitorStats } from './types'

/**
 * The Visitors page's decisions, pure for the tests: which list a tab asks for, whether someone is on the site now,
 * and how a visitor is named and placed. The server decides the rest (VisitorController).
 */

/** The page's address parameters: `?tab=` the chosen tab, `?v=` the visitor open at a glance. */
export const VISITOR_PARAM = { tab: 'tab', visitor: 'v' } as const

export const VISITOR_TABS = ['online', 'all', 'offline', 'leads'] as const
export type VisitorTab = (typeof VISITOR_TABS)[number]

/** `?tab=` keeps the chosen tab; who is on the site now when nothing (or nonsense) is asked, as the full admin. */
export function readTab(value: string | null | undefined): VisitorTab {
  return (VISITOR_TABS as readonly string[]).includes(value ?? '') ? (value as VisitorTab) : 'online'
}

/** `?v=12` opens visitor 12. */
export function readVisitorId(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,10}$/.test(value)) return null
  const id = Number(value)
  return id > 0 ? id : null
}

/** The list's address: `visitors?status=online|offline|all&lead_only=1&search=&page=`. Leads are every lead, online or not. */
export function visitorsPath(tab: VisitorTab, search: string, page = 1): string {
  return `visitors${params({
    status: tab === 'leads' ? 'all' : tab,
    lead_only: tab === 'leads',
    search: search.trim(),
    page: page > 1 ? page : undefined,
  })}`
}

/** The count beside each tab, from the list's `stats`. */
export function tabCounts(stats: VisitorStats | undefined): Partial<Record<VisitorTab, number>> {
  if (!stats) return {}
  return { online: stats.online, all: stats.total, offline: stats.offline, leads: stats.leads }
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
