import { amount, defaultPipeline, moveTo, resolveStage, sortedStages, type StageMove } from '../leads/leadLogic'
import type { LeadRow, Pipeline, Stage } from '../leads/leadTypes'

/**
 * The Pipeline area's decisions, as pure functions: which pipeline is shown, which leads it holds, one column per
 * stage with its count and value, where a card can move and what moving it does, and the won deals' fulfilment and
 * payment steps (DealController). A lead's stage is read as the Leads area reads it (`resolveStage`).
 */

/** At most this many open leads are drawn on the board (the most recently changed first). */
export const BOARD_LIMIT = 200

/** `GET inquiries` for the board: the open leads, most recently changed first. */
export function boardQuery(): Record<string, string | number | boolean> {
  return { active_only: true, sort: 'updated_at', dir: 'desc', per_page: BOARD_LIMIT }
}

/** The pipeline an address names (`?p=<id>`), else the default one. */
export function pickPipeline(pipelines: readonly Pipeline[] | null | undefined, wanted: number | null): Pipeline | null {
  return (pipelines ?? []).find(p => p.id === wanted) ?? defaultPipeline(pipelines)
}

/** A lead is on a pipeline's board when it belongs to it; one without a pipeline is the default one's. */
export function onPipeline(lead: Pick<LeadRow, 'pipeline_id'>, pipeline: Pipeline, isDefault: boolean): boolean {
  return lead.pipeline_id === pipeline.id || (lead.pipeline_id == null && isDefault)
}

export interface Column {
  stage: Stage
  leads: LeadRow[]
  /** How many leads the column holds: the cards here; for won and lost, the server's count of the stage. */
  count: number
  /** The cards' value added up, in the venue's currency. */
  value: number
  /** Won and lost are drawn narrow: closed leads are not on the board, the column is where a card is dropped. */
  collapsed: boolean
}

export function sumValue(leads: readonly Pick<LeadRow, 'total_value'>[]): number {
  return Math.round(leads.reduce((sum, lead) => sum + (amount(lead.total_value) ?? 0), 0) * 100) / 100
}

/**
 * One column per stage, in order. A card whose stage the pipeline does not know (renamed away, imported) waits in
 * the first open column rather than vanishing.
 */
export function boardColumns(pipeline: Pipeline, leads: readonly LeadRow[], isDefault: boolean): Column[] {
  const stages = sortedStages(pipeline.stages)
  const firstOpen = stages.find(s => s.kind === 'open') ?? null
  const byStage = new Map<number, LeadRow[]>(stages.map(s => [s.id, []]))
  for (const lead of leads) {
    if (!onPipeline(lead, pipeline, isDefault)) continue
    const stage = resolveStage(lead, stages) ?? firstOpen
    if (stage) byStage.get(stage.id)?.push(lead)
  }
  return stages.map(stage => {
    const cards = byStage.get(stage.id) ?? []
    const collapsed = stage.kind !== 'open'
    return {
      stage,
      leads: cards,
      count: collapsed ? Math.max(cards.length, stage.inquiries_count ?? 0) : cards.length,
      value: sumValue(cards),
      collapsed,
    }
  })
}

/** The board's open part, added up: how many open leads and what they are worth. */
export function openTotals(columns: readonly Column[]): { count: number; value: number } {
  const open = columns.filter(c => !c.collapsed)
  return { count: open.reduce((n, c) => n + c.count, 0), value: Math.round(open.reduce((n, c) => n + c.value, 0) * 100) / 100 }
}

/** Where a card can go: every other stage of its pipeline, in order. */
export function moveTargets(lead: Pick<LeadRow, 'status' | 'pipeline_stage_id'>, stages: readonly Stage[]): Stage[] {
  const current = resolveStage(lead, stages)
  return sortedStages(stages).filter(s => s.id !== current?.id)
}

/** What dropping or choosing a stage does (the lead page's rule): won and lost open their own flows. */
export function moveCard(lead: Pick<LeadRow, 'status' | 'pipeline_stage_id'>, target: Stage, stages: readonly Stage[]): StageMove {
  return moveTo(lead, target, stages)
}

/** The board's cache after a card moved to an open stage, so it shows there before the server answers. */
export function withMoved<T extends { data: LeadRow[] }>(page: T | undefined, leadId: number, status: string): T | undefined {
  if (!page) return page
  return { ...page, data: page.data.map(lead => (lead.id === leadId ? { ...lead, status } : lead)) }
}

/** The stage the phone shows (one at a time): the chosen one, else the first open stage with cards, else the first. */
export function phoneColumn(columns: readonly Column[], chosen: number | null): Column | null {
  return columns.find(c => c.stage.id === chosen)
    ?? columns.find(c => !c.collapsed && c.leads.length > 0)
    ?? columns.find(c => !c.collapsed)
    ?? columns[0]
    ?? null
}

/* ─── Won deals: fulfilment and payment (DealController) ─────────────────── */

export const FULFILMENT = ['payment_pending', 'design_needed', 'design_sent', 'in_production', 'ready_to_ship', 'completed'] as const
export type Fulfilment = (typeof FULFILMENT)[number]

export const PAYMENTS = ['pending', 'invoice_sent', 'partial', 'paid', 'refunded'] as const
export type Payment = (typeof PAYMENTS)[number]

/** The filters of the won deals' list, as the full admin's Deals page has them (`GET deals`). */
export const DEAL_FILTERS = ['all', 'payment_pending', 'design_needed', 'in_production', 'overdue', 'high_value'] as const
export type DealFilter = (typeof DEAL_FILTERS)[number]

export function dealsQuery(filter: DealFilter, page: number, sort: 'due_date' | 'amount' | 'created' = 'due_date'): Record<string, string | number> {
  const q: Record<string, string | number> = { page, per_page: 20, sort }
  if (filter === 'payment_pending' || filter === 'design_needed' || filter === 'in_production') q.stage = filter
  if (filter === 'overdue' || filter === 'high_value') q.focus = filter
  return q
}

export const isFulfilment = (v: string | null | undefined): v is Fulfilment => (FULFILMENT as readonly string[]).includes(v ?? '')
export const isPayment = (v: string | null | undefined): v is Payment => (PAYMENTS as readonly string[]).includes(v ?? '')

/** The next fulfilment step after the current one (the first for a deal that has none), none after completed. */
export function nextFulfilment(current: string | null | undefined): Fulfilment | null {
  if (!isFulfilment(current)) return FULFILMENT[0]
  const i = FULFILMENT.indexOf(current)
  return i < FULFILMENT.length - 1 ? FULFILMENT[i + 1] : null
}

/** How far a deal is: steps done of the five before completed (all five once completed). */
export function fulfilmentProgress(current: string | null | undefined): { done: number; total: number } {
  const total = FULFILMENT.length - 1
  if (current === 'completed') return { done: total, total }
  return { done: isFulfilment(current) ? FULFILMENT.indexOf(current) : 0, total }
}

/** `PATCH deals/{id}/payment`: the status, and the amount paid when one is typed (zero or more). */
export function paymentBody(status: string, paid: string): { payment_status: Payment; paid_amount?: number } | null {
  if (!isPayment(status)) return null
  const clean = paid.replace(',', '.').trim()
  if (clean === '') return { payment_status: status }
  const n = Number(clean)
  if (!Number.isFinite(n) || n < 0) return null
  return { payment_status: status, paid_amount: Math.round(n * 100) / 100 }
}

/** What is still owed on a deal (never below zero), or null when its value is unknown. */
export function stillOwed(value: string | number | null | undefined, paid: string | number | null | undefined): number | null {
  const total = amount(value)
  if (total === null) return null
  return Math.max(0, Math.round((total - (amount(paid) ?? 0)) * 100) / 100)
}
