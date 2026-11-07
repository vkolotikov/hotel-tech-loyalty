import { describe, expect, it } from 'vitest'
import {
  dealColumns, dealFilterCount, dealItem, dealsExportQuery, dealsQuery, filterCount, fulfilmentProgress, NO_DEAL_VIEW,
  nextFulfilment, paidInFullBody, paymentBody, readDealView, stillOwed, withDealView, writeDealView, type DealKpis,
} from './dealLogic'

const fig = (count: number, value = 0) => ({ count, value })
const KPIS: DealKpis = { awaiting_payment: fig(4, 900), design_needed: fig(2), in_production: fig(3), ready_to_ship: fig(1), completed_month: fig(5) }

describe('won deals (round 1, moved from the Pipeline)', () => {
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

describe('the Deals page (round 2)', () => {
  it('reads its view from the address, and round 1\'s Pipeline addresses too', () => {
    expect(readDealView(new URLSearchParams(''))).toEqual(NO_DEAL_VIEW)
    expect(readDealView(new URLSearchParams('filter=ready_to_ship&sort=amount&page=2&q=ada&payment=partial&owner=Anna')))
      .toEqual({ filter: 'ready_to_ship', sort: 'amount', page: 2, q: 'ada', payment: 'partial', owner: 'Anna' })
    expect(readDealView(new URLSearchParams('deal=overdue&dsort=created&dpage=3'))).toMatchObject({ filter: 'overdue', sort: 'created', page: 3 })
    expect(readDealView(new URLSearchParams('filter=nope&sort=x&payment=gold'))).toMatchObject({ filter: 'all', sort: 'due_date', payment: '' })
  })

  it('writes only what differs from the defaults, and forgets the old Pipeline keys', () => {
    const sp = writeDealView({ ...NO_DEAL_VIEW, filter: 'overdue', q: ' ada ' }, new URLSearchParams('deal=all&keep=1'))
    expect(sp.toString()).toBe('keep=1&filter=overdue&q=ada')
    expect(writeDealView(NO_DEAL_VIEW).toString()).toBe('')
  })

  it('goes back to the first page when a filter changes', () => {
    expect(withDealView({ ...NO_DEAL_VIEW, page: 4 }, { payment: 'paid' }).page).toBe(1)
    expect(withDealView({ ...NO_DEAL_VIEW, page: 4 }, { page: 5 }).page).toBe(5)
  })

  it('asks for the Ready step, the search, the payment and the owner when they are set', () => {
    expect(dealsQuery('ready_to_ship', 1, 'due_date', { q: ' ada ', payment: 'partial', owner: 'Anna' }))
      .toEqual({ page: 1, per_page: 20, sort: 'due_date', stage: 'ready_to_ship', search: 'ada', payment: 'partial', owner: 'Anna' })
    expect(dealsQuery('all', 1, 'due_date', { q: ' ' })).not.toHaveProperty('search')
    expect(dealsExportQuery({ ...NO_DEAL_VIEW, q: 'ada' })).toEqual({ status: 'Confirmed', format: 'csv', search: 'ada' })
    expect(dealFilterCount({ ...NO_DEAL_VIEW, q: 'x', owner: 'Anna' })).toBe(2)
  })

  it('counts a filter pill only where the server\'s figure counts exactly that list', () => {
    expect(filterCount('design_needed', KPIS)).toBe(2)
    expect(filterCount('ready_to_ship', KPIS)).toBe(1)
    // Awaiting payment counts unpaid deals, the filter lists the fulfilment step: no count rather than a wrong one.
    expect(filterCount('payment_pending', KPIS)).toBeUndefined()
    expect(filterCount('all', KPIS)).toBeUndefined()
    expect(filterCount('design_needed', undefined)).toBeUndefined()
  })

  it('marks a deal paid in full with its whole value', () => {
    expect(paidInFullBody('1250.00')).toEqual({ payment_status: 'paid', paid_amount: 1250 })
    expect(paidInFullBody(null)).toEqual({ payment_status: 'paid' })
  })

  it('names what a deal is for and keeps the organisation\'s columns', () => {
    expect(dealItem({ room_type_requested: null, inquiry_type: 'Wedding', event_name: 'Ada & Charles' })).toBe('Wedding')
    expect(dealItem({ room_type_requested: null, inquiry_type: null, event_name: null })).toBeNull()
    expect(dealColumns(undefined)).toMatchObject({ amount: true, owner: true })
    expect(dealColumns({ deal_fields: '{"list":{"owner":false}}' })).toMatchObject({ owner: false, payment: true })
  })
})
