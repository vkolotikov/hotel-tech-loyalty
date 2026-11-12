import { describe, expect, it } from 'vitest'
import type { DealKpis } from '../deals/dealLogic'
import {
  boardOrder, dealFigures, dealOf, factPatch, fullPagePath, headerActions, leadFigures, leadTabs, pageTab, rowOpens, tabShown, withPageTab,
} from './recordLogic'
import type { LeadDetail } from './leadTypes'

const lead: LeadDetail = {
  id: 41, guest_id: 12, pipeline_id: null, pipeline_stage_id: null, status: 'Proposal', priority: 'High', source: 'chatbot',
  total_value: '1250.00', assigned_to: 'Anna', next_task_type: null, next_task_due: null, next_task_notes: null, next_task_completed: false,
  created_at: '2026-11-01T09:00:00Z', notes: 'Wants May.', inquiry_type: null,
}

describe('a lead\'s record (round 5)', () => {
  it('has Overview, Activity, Tasks, Emails and Files; the Deal once won, right after Overview; the Chat only with one', () => {
    expect(leadTabs({ won: false, chats: 0 }).map(t => t.key)).toEqual(['overview', 'activity', 'tasks', 'emails', 'files'])
    expect(leadTabs({ won: true, chats: 2 }).map(t => t.key)).toEqual(['overview', 'deal', 'activity', 'tasks', 'emails', 'files', 'chat'])
    const counted = leadTabs({ won: false, chats: 1, activities: 7, openTasks: 2, files: 0 })
    expect(counted.find(t => t.key === 'activity')?.count).toBe(7)
    expect(counted.find(t => t.key === 'tasks')?.count).toBe(2)
    expect(counted.find(t => t.key === 'chat')?.count).toBe(1)
    // A count not yet known is left out, not drawn as 0.
    expect(leadTabs({ won: false, chats: 0 }).find(t => t.key === 'files')?.count).toBeUndefined()
  })

  it('shows the tab asked for when the record has it, else Overview', () => {
    const tabs = leadTabs({ won: false, chats: 0 })
    expect(tabShown('tasks', tabs)).toBe('tasks')
    expect(tabShown('deal', tabs)).toBe('overview')
    expect(tabShown(null, tabs)).toBe('overview')
    expect(tabShown('deal', leadTabs({ won: true, chats: 0 }))).toBe('deal')
  })

  it('keeps the full page\'s tab in its address as the panel keeps it, and opens the page on the panel\'s tab', () => {
    expect(pageTab(new URLSearchParams('rtab=files'))).toBe('files')
    expect(pageTab(new URLSearchParams('rtab=<x>'))).toBeNull()
    expect(withPageTab(new URLSearchParams('contact=3'), 'emails').toString()).toBe('contact=3&rtab=emails')
    expect(withPageTab(new URLSearchParams('rtab=emails'), 'overview').toString()).toBe('')
    expect(fullPagePath(41, 'tasks')).toBe('/crm/leads/41?rtab=tasks')
    expect(fullPagePath(41, 'overview')).toBe('/crm/leads/41')
    expect(fullPagePath(41, null)).toBe('/crm/leads/41')
  })

  it('offers won and lost until the lead is there, delete to whoever may, the contact when there is one', () => {
    expect(headerActions('open', true, 12)).toEqual({ won: true, lost: true, remove: true, contact: true })
    expect(headerActions('won', false, null)).toEqual({ won: false, lost: true, remove: false, contact: false })
    expect(headerActions('lost', true, 0)).toMatchObject({ won: true, lost: false, contact: false })
  })

  it('sends one fact changed in place, by the details form\'s rule', () => {
    expect(factPatch(lead, 'value', '900')).toEqual({ body: { total_value: 900 } })
    expect(factPatch(lead, 'value', '1250')).toEqual({ body: null })
    expect(factPatch(lead, 'value', '-5')).toEqual({ body: null, problem: 'number' })
    expect(factPatch(lead, 'value', '')).toEqual({ body: { total_value: null } })
    expect(factPatch(lead, 'owner', '')).toEqual({ body: { assigned_to: null } })
    expect(factPatch(lead, 'priority', 'Low')).toEqual({ body: { priority: 'Low' } })
    expect(factPatch(lead, 'notes', '  Wants June. ')).toEqual({ body: { notes: 'Wants June.' } })
    expect(factPatch(lead, 'source', 'Phone')).toEqual({ body: { source: 'Phone' } })
  })

  it('reads a won lead as a deal: its step and payment as the lead holds them', () => {
    expect(dealOf({ ...lead, fulfillment_stage: 'in_production', payment_status: 'partial', paid_amount: '300' }))
      .toMatchObject({ id: 41, fulfillment_stage: 'in_production', payment_status: 'partial', paid_amount: '300', total_value: '1250.00' })
    expect(dealOf(lead)).toMatchObject({ fulfillment_stage: null, payment_status: null, paid_amount: null })
  })

  it('walks a board column by column for previous and next, leaving out the won and lost drop targets', () => {
    expect(boardOrder([
      { collapsed: false, leads: [{ id: 3 }, { id: 1 }] },
      { collapsed: false, leads: [] },
      { collapsed: false, leads: [{ id: 9 }] },
      { collapsed: true, leads: [{ id: 4 }] },
    ])).toEqual([3, 1, 9])
  })

  it('opens a row on a press of its empty space, not on its links, boxes or menus', () => {
    const at = (own: boolean) => ({ closest: () => (own ? {} : null) })
    expect(rowOpens(at(false), false)).toBe(true)
    expect(rowOpens(at(true), false)).toBe(false)
    expect(rowOpens(at(false), true)).toBe(false)
    expect(rowOpens(null, false)).toBe(false)
  })
})

describe('the pages\' figures (round 5: at most four, never a row of zeros first)', () => {
  it('shows the Leads figures only when there are open leads, and the due and new ones only when they hold some', () => {
    expect(leadFigures(undefined)).toEqual([])
    expect(leadFigures({ total: 0, due_today: 0, overdue: 0, estimated_value: 0, new_this_week: 0 })).toEqual([])
    expect(leadFigures({ total: 9, due_today: 0, overdue: 0, estimated_value: 100, new_this_week: 0 })).toEqual(['open', 'value'])
    expect(leadFigures({ total: 9, due_today: 1, overdue: 8, estimated_value: 100, new_this_week: 4 })).toEqual(['open', 'value', 'due', 'new'])
  })

  it('shows the Deals figures that hold something', () => {
    const f = (count: number) => ({ count, value: count * 100 })
    const none: DealKpis = { total: 0, awaiting_payment: f(0), design_needed: f(0), in_production: f(0), ready_to_ship: f(0), completed_month: f(0) }
    expect(dealFigures(none)).toEqual([])
    expect(dealFigures(undefined)).toEqual([])
    expect(dealFigures({ ...none, total: 3, awaiting_payment: f(3) })).toEqual(['active', 'unpaid'])
    expect(dealFigures({ ...none, total: 5, awaiting_payment: f(1), ready_to_ship: f(2), completed_month: f(4) })).toEqual(['active', 'unpaid', 'ready', 'completed'])
  })
})
