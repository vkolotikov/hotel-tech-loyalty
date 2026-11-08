import { describe, expect, it } from 'vitest'
import type { LeadRow, Pipeline, Stage } from './leadTypes'
import {
  BOARD_LIMIT, boardColumns, boardQuery, moveCard, moveTargets, onPipeline, openTotals, phoneColumn, pickPipeline, readView,
  sumValue, withMoved, withView,
} from './board'
import { NO_FILTERS } from './leadLogic'

const stage = (id: number, name: string, kind: Stage['kind'], sort: number, extra: Partial<Stage> = {}): Stage => ({ id, name, kind, sort_order: sort, color: null, ...extra })
const SALES: Pipeline = {
  id: 1, name: 'Sales', is_default: true, sort_order: 0,
  stages: [stage(1, 'New', 'open', 0), stage(2, 'Proposal', 'open', 1), stage(8, 'Won', 'won', 8, { inquiries_count: 14 }), stage(9, 'Lost', 'lost', 9, { inquiries_count: 3 })],
}
const GROUPS: Pipeline = { id: 2, name: 'Groups', is_default: false, sort_order: 1, stages: [stage(21, 'Asked', 'open', 0), stage(22, 'Won', 'won', 1)] }

const lead = (id: number, status: string, extra: Partial<LeadRow> = {}): LeadRow => ({
  id, guest_id: id, pipeline_id: null, pipeline_stage_id: null, status, priority: null, source: null, total_value: null,
  assigned_to: null, next_task_type: null, next_task_due: null, next_task_notes: null, next_task_completed: false,
  created_at: null, ...extra,
})

describe('which pipeline and which leads', () => {
  it('asks for the open leads, most recently changed first, up to the board\'s limit', () => {
    expect(boardQuery()).toEqual({ active_only: true, sort: 'updated_at', dir: 'desc', per_page: BOARD_LIMIT })
    // With no filter set it asks exactly what round 1's board asked (the cached board stays the same board).
    expect(boardQuery(NO_FILTERS, 'Anna')).toEqual(boardQuery())
  })

  it('narrows the board by the list\'s search and panel filters, never by its follow-up filter, sort or page', () => {
    const q = boardQuery({ ...NO_FILTERS, q: ' ada ', owner: 'me', priority: 'High', phone: 'yes', due: 'overdue', sort: 'value', page: 3, from: '2026-11-07', to: '2026-11-01' }, 'Anna')
    expect(q).toEqual({
      active_only: true, sort: 'updated_at', dir: 'desc', per_page: BOARD_LIMIT,
      search: 'ada', assigned_to: 'Anna', priority: 'High', has_phone: 'yes', date_from: '2026-11-01', date_to: '2026-11-07',
    })
  })

  it('reads the view from the address and drops what belongs to another view', () => {
    expect(readView(new URLSearchParams(''))).toBe('list')
    expect(readView(new URLSearchParams('view=team'))).toBe('team')
    expect(readView(new URLSearchParams('view=nope'))).toBe('list')
    const board = withView(new URLSearchParams('page=3&due=1&q=ada&p=2'), 'board')
    expect(board.toString()).toBe('q=ada&p=2&view=board')
    expect(withView(board, 'team').has('p')).toBe(false)
    expect(withView(board, 'list').toString()).toBe('q=ada')
  })

  it('shows the pipeline the address names, else the default one', () => {
    expect(pickPipeline([GROUPS, SALES], 2)?.id).toBe(2)
    expect(pickPipeline([GROUPS, SALES], 99)?.id).toBe(1)
    expect(pickPipeline([], null)).toBeNull()
  })

  it('puts a lead without a pipeline on the default board only', () => {
    expect(onPipeline({ pipeline_id: null }, SALES, true)).toBe(true)
    expect(onPipeline({ pipeline_id: null }, GROUPS, false)).toBe(false)
    expect(onPipeline({ pipeline_id: 2 }, GROUPS, false)).toBe(true)
    expect(onPipeline({ pipeline_id: 2 }, SALES, true)).toBe(false)
  })
})

describe('columns', () => {
  const leads = [
    lead(1, 'New', { total_value: '100.00' }),
    lead(2, 'proposal', { total_value: 250.5 }),
    lead(3, 'Renamed away', { total_value: '50' }),
    lead(4, 'New', { pipeline_id: 2 }),
    lead(5, 'Proposal', { total_value: null }),
  ]

  it('draws one column per stage with its cards, count and value; an unknown stage waits in the first column', () => {
    const columns = boardColumns(SALES, leads, true)
    expect(columns.map(c => [c.stage.name, c.leads.map(l => l.id), c.count, c.value, c.collapsed])).toEqual([
      ['New', [1, 3], 2, 150, false],
      ['Proposal', [2, 5], 2, 250.5, false],
      ['Won', [], 14, 0, true],
      ['Lost', [], 3, 0, true],
    ])
    expect(openTotals(columns)).toEqual({ count: 4, value: 400.5 })
  })

  it('shows the other pipeline\'s own leads on its board', () => {
    const columns = boardColumns(GROUPS, leads, false)
    expect(columns[0].leads.map(l => l.id)).toEqual([4])
    expect(sumValue([{ total_value: '0.1' }, { total_value: '0.2' }])).toBe(0.3)
  })

  it('moves a card anywhere but where it is; won and lost open their flows', () => {
    const stages = SALES.stages
    expect(moveTargets(lead(1, 'New'), stages).map(s => s.name)).toEqual(['Proposal', 'Won', 'Lost'])
    expect(moveCard(lead(1, 'New'), stages[1], stages)).toEqual({ kind: 'stage', status: 'Proposal' })
    expect(moveCard(lead(1, 'New'), stages[2], stages)).toEqual({ kind: 'won' })
    expect(moveCard(lead(1, 'New'), stages[3], stages)).toEqual({ kind: 'lost' })
    expect(moveCard(lead(1, 'New'), stages[0], stages)).toEqual({ kind: 'none' })
  })

  it('shows a moved card in its new stage before the server answers', () => {
    const page = { data: [lead(1, 'New'), lead(2, 'New')], total: 2 }
    expect(withMoved(page, 2, 'Proposal')?.data.map(l => l.status)).toEqual(['New', 'Proposal'])
    expect(withMoved(undefined, 2, 'Proposal')).toBeUndefined()
  })

  it('shows the phone the chosen stage, else the first open stage with cards', () => {
    const columns = boardColumns(SALES, [lead(7, 'Proposal')], true)
    expect(phoneColumn(columns, null)?.stage.name).toBe('Proposal')
    expect(phoneColumn(columns, 8)?.stage.name).toBe('Won')
    expect(phoneColumn(boardColumns(SALES, [], true), null)?.stage.name).toBe('New')
    expect(phoneColumn([], null)).toBeNull()
  })
})
