import { describe, expect, it } from 'vitest'
import type { LeadRow, Pipeline, Stage } from '../leads/leadTypes'
import {
  BOARD_LIMIT, boardColumns, boardQuery, dealsQuery, fulfilmentProgress, moveCard, moveTargets, nextFulfilment, onPipeline,
  openTotals, paymentBody, phoneColumn, pickPipeline, stillOwed, sumValue, withMoved,
} from './board'

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

describe('won deals', () => {
  it('asks GET deals as the full admin\'s filters do', () => {
    expect(dealsQuery('all', 1)).toEqual({ page: 1, per_page: 20, sort: 'due_date' })
    expect(dealsQuery('design_needed', 2, 'amount')).toEqual({ page: 2, per_page: 20, sort: 'amount', stage: 'design_needed' })
    expect(dealsQuery('high_value', 1)).toMatchObject({ focus: 'high_value' })
  })

  it('walks the fulfilment steps in order', () => {
    expect(nextFulfilment(null)).toBe('payment_pending')
    expect(nextFulfilment('in_production')).toBe('ready_to_ship')
    expect(nextFulfilment('completed')).toBeNull()
    expect(fulfilmentProgress(null)).toEqual({ done: 0, total: 5 })
    expect(fulfilmentProgress('design_sent')).toEqual({ done: 2, total: 5 })
    expect(fulfilmentProgress('completed')).toEqual({ done: 5, total: 5 })
  })

  it('sends a payment state with an amount of zero or more', () => {
    expect(paymentBody('partial', '120,5')).toEqual({ payment_status: 'partial', paid_amount: 120.5 })
    expect(paymentBody('paid', '')).toEqual({ payment_status: 'paid' })
    expect(paymentBody('paid', '-1')).toBeNull()
    expect(paymentBody('nope', '1')).toBeNull()
  })

  it('says what is still owed, never below zero', () => {
    expect(stillOwed('1000.00', '250')).toBe(750)
    expect(stillOwed(100, 150)).toBe(0)
    expect(stillOwed(null, 10)).toBeNull()
  })
})
