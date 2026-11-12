import { describe, expect, it } from 'vitest'
import { createOf, hrefOf, recordOf, stepIn, withCreate, withRecord, withoutRecord } from './records'

const q = (s: string) => new URLSearchParams(s)

describe('records in the address (round 5)', () => {
  it('reads the open record and its tab; ignores what is not a positive whole id or a tab name', () => {
    expect(recordOf(q('view=board&lead=12'))).toEqual({ kind: 'lead', id: 12, tab: null })
    expect(recordOf(q('contact=7&rtab=emails'))).toEqual({ kind: 'contact', id: 7, tab: 'emails' })
    expect(recordOf(q('company=3&rtab=<script>'))).toEqual({ kind: 'company', id: 3, tab: null })
    expect(recordOf(q('lead=0'))).toBeNull()
    expect(recordOf(q('lead=-4'))).toBeNull()
    expect(recordOf(q('lead=1e3'))).toBeNull()
    expect(recordOf(q('lead=abc&contact=5'))).toEqual({ kind: 'contact', id: 5, tab: null })
    expect(recordOf(q('view=list'))).toBeNull()
  })

  it('opens one record at a time and keeps the page’s own keys', () => {
    const next = withRecord(q('view=board&p=2&contact=9&rtab=leads'), 'lead', 4, 'tasks')
    expect(next.get('view')).toBe('board')
    expect(next.get('p')).toBe('2')
    expect(next.get('contact')).toBeNull()
    expect(next.get('lead')).toBe('4')
    expect(next.get('rtab')).toBe('tasks')
    expect(withRecord(q('rtab=files'), 'company', 2).get('rtab')).toBeNull()
    expect(withRecord(q('create=contact'), 'contact', 8).toString()).toBe('contact=8')
  })

  it('closes the record and leaves the rest of the address', () => {
    expect(withoutRecord(q('view=team&lead=4&rtab=tasks')).toString()).toBe('view=team')
  })

  it('reads and writes what to make', () => {
    expect(createOf(q('create=deal'))).toBe('deal')
    expect(createOf(q('create=member'))).toBeNull()
    expect(withCreate(q('view=list'), 'task').toString()).toBe('view=list&create=task')
    expect(withCreate(q('create=task&x=1'), null).toString()).toBe('x=1')
  })

  it('steps through the list a record was opened from', () => {
    expect(stepIn([5, 8, 2], 8, 1)).toBe(2)
    expect(stepIn([5, 8, 2], 8, -1)).toBe(5)
    expect(stepIn([5, 8, 2], 2, 1)).toBeNull()
    expect(stepIn([5, 8, 2], 5, -1)).toBeNull()
    expect(stepIn([5, 8, 2], 9, 1)).toBeNull()
  })

  it('makes a link', () => {
    expect(hrefOf('/crm/leads', q('lead=3'))).toBe('/crm/leads?lead=3')
    expect(hrefOf('/crm/leads', q(''))).toBe('/crm/leads')
  })
})
