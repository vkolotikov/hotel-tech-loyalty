import { amount, formatParam, type ExportFormat } from '../leads/leadLogic'
import { columnsOf } from '../leads/listLogic'
import type { LeadRow } from '../leads/leadTypes'

/**
 * Deals (the main platform's Deals & fulfilment, round 2): a deal is a won lead (DealController: a fulfilment step, the
 * status `Confirmed` or a won stage), walked through its fulfilment steps and its payment. These are the page's
 * decisions as pure functions: what `GET deals` is asked, the steps in order, what a payment change sends, what is still
 * owed and which columns show. The figures are the server's (`deals/kpis`).
 */

/** A row of `GET deals`: the lead with its fulfilment and payment. */
export interface DealRow extends LeadRow {
  fulfillment_stage: string | null
  payment_status: string | null
  paid_amount: string | number | null
  fulfillment_started_at?: string | null
  fulfillment_completed_at?: string | null
  inquiry_type?: string | null
  event_name?: string | null
  property?: { id: number; name: string } | null
}

export interface StageFigure { count: number; value: number }

/** `GET deals/kpis` (DealController::kpis); `total` is the deals not yet completed. */
export interface DealKpis {
  total?: number
  /** Deals not paid in full, whatever their step (the "Not paid in full" tile). */
  awaiting_payment: StageFigure
  /** The step "Awaiting payment" itself, what its pill lists (since 2026-11-08; absent from an older server). */
  payment_pending?: StageFigure
  design_needed: StageFigure
  in_production: StageFigure
  ready_to_ship: StageFigure
  completed_month: StageFigure
}

export const FULFILMENT = ['payment_pending', 'design_needed', 'design_sent', 'in_production', 'ready_to_ship', 'completed'] as const
export type Fulfilment = (typeof FULFILMENT)[number]

export const PAYMENTS = ['pending', 'invoice_sent', 'partial', 'paid', 'refunded'] as const
export type Payment = (typeof PAYMENTS)[number]

/** The quick filters (the full admin's Deals pills, with the Ready step the server filters too). */
export const DEAL_FILTERS = ['all', 'payment_pending', 'design_needed', 'in_production', 'ready_to_ship', 'overdue', 'high_value'] as const
export type DealFilter = (typeof DEAL_FILTERS)[number]

export const DEAL_SORTS = ['due_date', 'amount', 'created'] as const
export type DealSort = (typeof DEAL_SORTS)[number]

export interface DealView {
  filter: DealFilter
  sort: DealSort
  page: number
  q: string
  /** A payment state (`?payment=`), or '' for any. */
  payment: string
  /** An owner's name, or '' for anyone. */
  owner: string
}

export const NO_DEAL_VIEW: DealView = { filter: 'all', sort: 'due_date', page: 1, q: '', payment: '', owner: '' }

const read = (sp: URLSearchParams, key: string): string => sp.get(key) ?? ''

export const isFulfilment = (v: string | null | undefined): v is Fulfilment => (FULFILMENT as readonly string[]).includes(v ?? '')
export const isPayment = (v: string | null | undefined): v is Payment => (PAYMENTS as readonly string[]).includes(v ?? '')

/** The view an address holds; round 1's Pipeline addresses (`?deal=`, `?dsort=`, `?dpage=`) still read. */
export function readDealView(sp: URLSearchParams): DealView {
  const filter = read(sp, 'filter') || read(sp, 'deal')
  const sort = read(sp, 'sort') || read(sp, 'dsort')
  const page = Number(read(sp, 'page') || read(sp, 'dpage'))
  return {
    filter: (DEAL_FILTERS as readonly string[]).includes(filter) ? (filter as DealFilter) : 'all',
    sort: (DEAL_SORTS as readonly string[]).includes(sort) ? (sort as DealSort) : 'due_date',
    page: Number.isInteger(page) && page > 1 ? page : 1,
    q: read(sp, 'q'),
    payment: isPayment(read(sp, 'payment')) ? read(sp, 'payment') : '',
    owner: read(sp, 'owner'),
  }
}

/** The address for a view; defaults are left out. */
export function writeDealView(view: DealView, current: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const next = new URLSearchParams(current)
  for (const key of ['deal', 'dsort', 'dpage']) next.delete(key)
  const set = (key: string, value: string) => { if (value) next.set(key, value); else next.delete(key) }
  set('filter', view.filter === 'all' ? '' : view.filter)
  set('sort', view.sort === 'due_date' ? '' : view.sort)
  set('page', view.page > 1 ? String(view.page) : '')
  set('q', view.q.trim())
  set('payment', view.payment)
  set('owner', view.owner)
  return next
}

/** A change to the view starts again from the first page, unless it is the page that changes. */
export function withDealView(view: DealView, patch: Partial<DealView>): DealView {
  return { ...view, ...patch, page: 'page' in patch ? (patch.page ?? 1) : 1 }
}

/** `GET deals` for a filter, a page and a sort (round 1's call), and the search, payment and owner when set. */
export function dealsQuery(filter: DealFilter, page: number, sort: DealSort = 'due_date', extra: { q?: string; payment?: string; owner?: string } = {}): Record<string, string | number> {
  const q: Record<string, string | number> = { page, per_page: 20, sort }
  if (filter === 'payment_pending' || filter === 'design_needed' || filter === 'in_production' || filter === 'ready_to_ship') q.stage = filter
  if (filter === 'overdue' || filter === 'high_value') q.focus = filter
  if (extra.q?.trim()) q.search = extra.q.trim()
  if (extra.payment) q.payment = extra.payment
  if (extra.owner) q.owner = extra.owner
  return q
}

/**
 * The won leads as a file (`GET inquiries/export`, the full admin exports `status=Confirmed`): its Excel workbook, or
 * CSV; with the search and the owner when set. Round 5: asked of the export itself (it was asked of `GET inquiries`,
 * which answers JSON, so the CSV came out empty).
 */
export function dealsExportQuery(view: DealView, format: ExportFormat = 'xlsx'): Record<string, string> {
  return {
    status: 'Confirmed',
    ...formatParam(format),
    ...(view.q.trim() ? { search: view.q.trim() } : {}),
    ...(view.owner ? { assigned_to: view.owner } : {}),
  }
}

/** How many of the toolbar's filters are set (search, payment, owner). */
export function dealFilterCount(view: DealView): number {
  return [view.q.trim(), view.payment, view.owner].filter(Boolean).length
}

/** A filter pill's count where the server's figure counts exactly what the filter lists; none otherwise. */
export function filterCount(filter: DealFilter, kpis: DealKpis | null | undefined): number | undefined {
  if (!kpis) return undefined
  if (filter === 'design_needed' || filter === 'in_production' || filter === 'ready_to_ship') return kpis[filter]?.count
  if (filter === 'payment_pending') return kpis.payment_pending?.count
  return undefined
}

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

/** Paid in full: the state `paid` and the deal's whole value as paid (just the state when its value is unknown). */
export function paidInFullBody(value: string | number | null | undefined): { payment_status: 'paid'; paid_amount?: number } {
  const total = amount(value)
  return total === null ? { payment_status: 'paid' } : { payment_status: 'paid', paid_amount: total }
}

/** What is still owed on a deal (never below zero), or null when its value is unknown. */
export function stillOwed(value: string | number | null | undefined, paid: string | number | null | undefined): number | null {
  const total = amount(value)
  if (total === null) return null
  return Math.max(0, Math.round((total - (amount(paid) ?? 0)) * 100) / 100)
}

/** What a deal is for: the room type, the enquiry type, or the event (the full admin's "Product"). */
export function dealItem(deal: Pick<DealRow, 'room_type_requested' | 'inquiry_type' | 'event_name'>): string | null {
  return deal.room_type_requested || deal.inquiry_type || deal.event_name || null
}

/* ─── Columns (crm-settings deal_fields, the full admin's own switch) ────── */

export type DealColumn = 'product_details' | 'amount' | 'payment' | 'fulfillment' | 'next_action' | 'due_date' | 'owner'
export const DEAL_COLUMNS: readonly DealColumn[] = ['product_details', 'amount', 'payment', 'fulfillment', 'next_action', 'due_date', 'owner']
export const DEAL_COLUMN_DEFAULTS: Record<DealColumn, boolean> = {
  product_details: true, amount: true, payment: true, fulfillment: true, next_action: true, due_date: true, owner: true,
}

export function dealColumns(settings: Record<string, unknown> | null | undefined): Record<DealColumn, boolean> {
  return columnsOf(settings, 'deal_fields', DEAL_COLUMN_DEFAULTS)
}
