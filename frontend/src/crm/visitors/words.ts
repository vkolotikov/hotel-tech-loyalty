import type { Tone } from '../ui/StatTile'
import type { VisitorConversation } from './types'
import type { PanelTab, Presence, VisitorTab } from './visitorsLogic'

/**
 * The English defaults of the words the Visitors page builds at run time (t(`crm.visitors.tab.${key}`) and the like);
 * the locale files hold the same keys in all five languages, and visitorsWords.test.ts checks every key here is there.
 */
export const TAB_DEFAULTS: Record<VisitorTab, string> = {
  online: 'On the site now',
  all: 'Everyone',
  offline: 'Away',
  leads: 'Leads',
  hot_lead: 'Hot leads',
  has_contact: 'Has contact',
  missed: 'Missed',
}

/** Round 5: the panel's tabs (crm.visitors.ptab.<key>). */
export const PANEL_TAB_DEFAULTS: Record<PanelTab, string> = {
  overview: 'Overview',
  chats: 'Chats',
  pages: 'Pages',
}

export const PRESENCE_DEFAULTS: Record<Presence, string> = {
  online: 'On the site now',
  recent: 'Here recently',
  away: 'Away',
}

export const PRESENCE_TONE: Record<Presence, Tone> = {
  online: 'success',
  recent: 'pending',
  away: 'neutral',
}

export const STATUS_DEFAULTS: Record<VisitorConversation['status'], string> = {
  active: 'Active',
  waiting: 'Waiting',
  resolved: 'Resolved',
  archived: 'Archived',
}

export const STATUS_TONE: Record<VisitorConversation['status'], Tone> = {
  waiting: 'pending',
  active: 'progress',
  resolved: 'success',
  archived: 'neutral',
}
