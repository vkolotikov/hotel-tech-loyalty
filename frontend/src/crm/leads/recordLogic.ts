import type { DealKpis, DealRow } from '../deals/dealLogic'
import { detailsDraft, detailsPatch, type DetailsDraft } from './leadLogic'
import type { LeadDetail, LeadKpis, StageKind } from './leadTypes'

/**
 * Round 5 (owner 2026-11-12, "opening tabs, slides or popups … minimize copy"): a lead is one record — the same frame
 * in the panel over a list and on its own page — with its parts as tabs. These are that record's decisions as pure
 * functions (the frontend tests render to a string and cannot press anything): which tabs it has and in what order,
 * which header actions apply, what a fact changed in place sends, the lead read as a deal, the full page's tab in the
 * address, and which of the Leads and Deals pages' figures are worth showing.
 */

export const LEAD_TABS = ['overview', 'deal', 'activity', 'tasks', 'emails', 'files', 'chat'] as const
export type LeadTab = (typeof LEAD_TABS)[number]

export interface TabFacts {
  /** The lead is won: it is a deal, with its step and payment. */
  won: boolean
  /** The website chats its contact had (`chat-history`); the Chat tab shows only with one. */
  chats: number
  /** The timeline's entries (the server's total), the open tasks and the files, when known. */
  activities?: number
  openTasks?: number
  files?: number
}

/**
 * The record's tabs in order: Overview; the Deal right after it once the lead is won (a won lead's work is its steps
 * and its payment); Activity, Tasks, Emails, Files; the Chat only when the contact wrote to the website chat. A count
 * shows only once known.
 */
export function leadTabs(facts: TabFacts): { key: LeadTab; count?: number }[] {
  const tabs: { key: LeadTab; count?: number }[] = [{ key: 'overview' }]
  if (facts.won) tabs.push({ key: 'deal' })
  tabs.push({ key: 'activity', count: facts.activities }, { key: 'tasks', count: facts.openTasks }, { key: 'emails' }, { key: 'files', count: facts.files })
  if (facts.chats > 0) tabs.push({ key: 'chat', count: facts.chats })
  return tabs
}

/** The tab to show: the one asked for when the record has it, else the first (Overview). */
export function tabShown(asked: string | null | undefined, tabs: readonly { key: string }[]): string {
  return tabs.some(tab => tab.key === asked) ? (asked as string) : (tabs[0]?.key ?? 'overview')
}

/** The full page's tab in its address (`/crm/leads/12?rtab=tasks`), read by the rule the panel's address keeps. */
export function pageTab(sp: URLSearchParams): string | null {
  const tab = sp.get('rtab')
  return tab && /^[a-z_]{1,20}$/.test(tab) ? tab : null
}

/** The full page's address on another tab; Overview, the first, is left out. */
export function withPageTab(sp: URLSearchParams, tab: string): URLSearchParams {
  const next = new URLSearchParams(sp)
  if (tab === 'overview' || !/^[a-z_]{1,20}$/.test(tab)) next.delete('rtab')
  else next.set('rtab', tab)
  return next
}

/** "Open as a page": the lead's own page on the tab the panel shows. */
export function fullPagePath(id: number, tab: string | null | undefined): string {
  return tab && tab !== 'overview' && /^[a-z_]{1,20}$/.test(tab) ? `/crm/leads/${id}?rtab=${tab}` : `/crm/leads/${id}`
}

/** Which of the header's actions apply: won and lost each until the lead is there, delete for whoever may delete. */
export function headerActions(kind: StageKind, canDelete: boolean, guestId: number | null | undefined): { won: boolean; lost: boolean; remove: boolean; contact: boolean } {
  return { won: kind !== 'won', lost: kind !== 'lost', remove: canDelete, contact: typeof guestId === 'number' && guestId > 0 }
}

export type FactKey = 'value' | 'priority' | 'owner' | 'source' | 'type' | 'notes'

const FACT_FIELD: Record<FactKey, keyof DetailsDraft> = { value: 'value', priority: 'priority', owner: 'owner', source: 'source', type: 'type', notes: 'notes' }

/**
 * One fact changed in place (as the full admin's InquiryDrawer does): `PUT inquiries/{id}` with that field only, by the
 * rule of the whole details form (an emptied box clears it; a value must be a number of zero or more). `body` is null
 * when nothing changed.
 */
export function factPatch(lead: Parameters<typeof detailsDraft>[0], key: FactKey, raw: string): { body: Record<string, unknown> | null; problem?: 'number' } {
  return detailsPatch(lead, { ...detailsDraft(lead), [FACT_FIELD[key]]: raw })
}

/** The lead read as a deal (the Deal tab and the payment dialog): its step and payment as `GET inquiries/{id}` holds them. */
export function dealOf(lead: LeadDetail): DealRow {
  return {
    ...lead,
    fulfillment_stage: lead.fulfillment_stage ?? null,
    payment_status: lead.payment_status ?? null,
    paid_amount: lead.paid_amount ?? null,
  }
}

/** What a row holds of its own (a link, a box, a menu): a press there is that thing's, not "open the lead". */
const ROW_OWN = 'a,button,input,select,textarea,label,[role="menu"],[role="dialog"]'

/** A press on a row's empty space opens its record; one on a link, a box or a menu of the row does not. */
export function rowOpens(target: { closest: (selector: string) => unknown } | null, prevented: boolean): boolean {
  return !prevented && !!target && !target.closest(ROW_OWN)
}

/** The ids a board shows, column by column (won and lost are drop targets, with no cards), for the panel's previous and next. */
export function boardOrder(columns: readonly { collapsed: boolean; leads: readonly { id: number }[] }[]): number[] {
  return columns.flatMap(column => (column.collapsed ? [] : column.leads.map(lead => lead.id)))
}

/* ─── The pages' figures (at most four, never a row of zeros first) ───────── */

export type LeadFigure = 'open' | 'value' | 'due' | 'new'

/**
 * The Leads page's figures: nothing while there is no open lead (the list says so); else the open leads and their
 * value, the follow-ups due and the week's new leads only when there are some.
 */
export function leadFigures(kpis: LeadKpis | null | undefined): LeadFigure[] {
  if (!kpis || !(kpis.total > 0)) return []
  const out: LeadFigure[] = ['open', 'value']
  if (kpis.due_today + kpis.overdue > 0) out.push('due')
  if (kpis.new_this_week > 0) out.push('new')
  return out
}

export type DealFigure = 'active' | 'unpaid' | 'ready' | 'completed'

/**
 * The Deals page's figures: the deals in progress, those not paid in full, those ready and this month's completed —
 * each only when there are some (the step pills carry the other steps' counts).
 */
export function dealFigures(kpis: DealKpis | null | undefined): DealFigure[] {
  if (!kpis) return []
  const out: DealFigure[] = []
  if ((kpis.total ?? 0) > 0) out.push('active')
  if (kpis.awaiting_payment.count > 0) out.push('unpaid')
  if (kpis.ready_to_ship.count > 0) out.push('ready')
  if (kpis.completed_month.count > 0) out.push('completed')
  return out
}
