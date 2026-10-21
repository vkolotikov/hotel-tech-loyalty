import { formatDate, isDateKey } from '../../workspace/lib/wallClock'
import type { DateKey, PostDetail } from '../lib/types'

export type PanelMode = 'docked' | 'over' | 'full'

/** Where the post panel sits (spec 2026-10-21 §7.1): beside the page from 1280 px, over it from 640 px, the whole screen below. */
export function panelMode(width: number): PanelMode {
  if (width >= 1280) return 'docked'
  if (width >= 640) return 'over'
  return 'full'
}

/** The post's day under the panel's header ("Friday, 23 October 2026"); null for a post without a day. */
export function dayLine(date: DateKey | null, locale: string): string | null {
  if (!date || !isDateKey(date)) return null
  return formatDate(date, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export type PanelTab = 'content' | 'ai' | 'activity'
export const PANEL_TABS: PanelTab[] = ['content', 'ai', 'activity']

/** The tab a key moves to in the panel's tab list (spec 2026-10-21 §7.3): the arrows wrap, Home and End go to the ends. */
export function tabAfter(tab: PanelTab, key: string): PanelTab | null {
  const at = PANEL_TABS.indexOf(tab)
  if (key === 'ArrowRight') return PANEL_TABS[(at + 1) % PANEL_TABS.length]
  if (key === 'ArrowLeft') return PANEL_TABS[(at - 1 + PANEL_TABS.length) % PANEL_TABS.length]
  if (key === 'Home') return PANEL_TABS[0]
  if (key === 'End') return PANEL_TABS[PANEL_TABS.length - 1]
  return null
}

/** The footer's button (spec 2026-10-21 §7.6): Create post before the post exists, Save draft for a draft, else Save. */
export function saveLabelKey(created: boolean, status: string): [string, string] {
  if (!created) return ['content.panel.create', 'Create post']
  return status === 'draft' ? ['content.panel.save_draft', 'Save draft'] : ['content.panel.save', 'Save']
}

/** The ids that tie each tab to its pane. */
export const tabId = (tab: PanelTab) => `content-panel-tab-${tab}`
export const paneId = (tab: PanelTab) => `content-panel-pane-${tab}`

/** What can open a folding section by itself: something to see to in it, and a count a tool bumps when it fills it. */
export interface FoldSignal { alert: boolean; reveal: number }

/** Whether a folding section opens by itself (spec 2026-10-21 §7.4, §7.5): an alert appearing, or a tool filling it. It never closes by itself. */
export function foldOpens(before: FoldSignal, now: FoldSignal): boolean {
  return (now.alert && !before.alert) || now.reveal !== before.reveal
}

/**
 * The tab the panel opens on (spec 2026-10-21 §7.3, final review): a new post on Content (its fields are the point), a
 * post the AI is writing on AI tools (where its progress shows), any other on the tab last used on this device.
 */
export function openingTab(isNew: boolean, aiWriting: boolean, remembered: PanelTab): PanelTab {
  if (isNew) return 'content'
  return aiWriting ? 'ai' : remembered
}

/** The comments on Activity's tab: the post as last read (a comment changes it without a new version), else the panel's copy. */
export function activityCount(read: Pick<PostDetail, 'id' | 'comments_count'> | undefined, post: Pick<PostDetail, 'id' | 'comments_count'> | null): number {
  const source = read && post && read.id === post.id ? read : post
  return source?.comments_count ?? 0
}

/** The hook box's rows where the browser cannot size it to its words: about 34 characters a line, 2 to 6 lines. */
export function hookRows(hook: string): number {
  const lines = hook.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 34)), 0)
  return Math.min(6, Math.max(2, lines))
}
