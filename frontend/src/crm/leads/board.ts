import { amount, dateRange, defaultPipeline, moveTo, resolveStage, sortedStages, type LeadFilters, type StageMove } from './leadLogic'
import type { LeadRow, Pipeline, Stage } from './leadTypes'

/**
 * The Leads board's decisions (round 1's Pipeline, moved into Leads in round 2 as its Board view, `?view=board`), as
 * pure functions: which pipeline is shown, which leads it holds, one column per stage with its count and value, where a
 * card can move and what moving it does. A lead's stage is read as the list reads it (`resolveStage`).
 */

/** At most this many open leads are drawn on the board (the most recently changed first). */
export const BOARD_LIMIT = 200

export type View = 'list' | 'board' | 'team'
export const VIEWS: readonly View[] = ['list', 'board', 'team']

/** The view an address holds (`?view=board|team`), the list otherwise. */
export function readView(sp: URLSearchParams): View {
  const v = sp.get('view')
  return v === 'board' || v === 'team' ? v : 'list'
}

/** The address for another view: the list's own paging and follow-up filter do not carry over to a board. */
export function withView(sp: URLSearchParams, view: View): URLSearchParams {
  const next = new URLSearchParams(sp)
  if (view === 'list') next.delete('view'); else next.set('view', view)
  if (view !== 'list') { next.delete('page'); next.delete('due') }
  if (view !== 'board') next.delete('p')
  return next
}

/**
 * `GET inquiries` for the board and the team: the open leads, most recently changed first, narrowed by the list's
 * search and panel filters (not its follow-up filter or sort, which belong to the list). With no filter it asks what
 * round 1's board asked.
 */
export function boardQuery(filters?: LeadFilters, me = ''): Record<string, string | number | boolean> {
  const q: Record<string, string | number | boolean> = { active_only: true, sort: 'updated_at', dir: 'desc', per_page: BOARD_LIMIT }
  if (!filters) return q
  const put = (key: string, value: string) => { if (value) q[key] = value }
  put('search', filters.q.trim())
  put('status', filters.status)
  put('source', filters.source)
  put('assigned_to', filters.owner === 'me' ? me : filters.owner)
  put('priority', filters.priority)
  put('inquiry_type', filters.type)
  put('country', filters.country)
  put('has_phone', filters.phone)
  const range = dateRange(filters.from, filters.to)
  if (range.date_from) q.date_from = range.date_from
  if (range.date_to) q.date_to = range.date_to
  return q
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
