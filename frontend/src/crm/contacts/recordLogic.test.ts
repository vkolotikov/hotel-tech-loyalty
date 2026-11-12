import { describe, expect, it } from 'vitest'
import {
  companyTab, contactPageHref, contactTab, customDraft, customErrorKeys, customPayload, customText, filled, filledCount, missingRequired,
  orderedFields, sameDraft, storedDay, type CustomFieldDef,
} from './recordLogic'

const field = (key: string, type: CustomFieldDef['type'], extra: Partial<CustomFieldDef> = {}): CustomFieldDef => ({
  id: extra.id ?? key.length, entity: 'guest', key, label: key, type, config: null, help_text: null, required: false, sort_order: 0, ...extra,
})

describe('a record’s tabs, as the address names them', () => {
  it('opens a contact on a tab it has, else Overview', () => {
    expect(contactTab('emails')).toBe('emails')
    expect(contactTab('fields')).toBe('fields')
    expect(contactTab('pages')).toBe('overview')
    expect(contactTab(null)).toBe('overview')
    expect(companyTab('people')).toBe('people')
    expect(companyTab('emails')).toBe('overview')
  })

  it('opens the contact’s own page on the tab the panel showed', () => {
    expect(contactPageHref(12, null)).toBe('/crm/contacts/12')
    expect(contactPageHref(12, 'overview')).toBe('/crm/contacts/12')
    expect(contactPageHref(12, 'activity')).toBe('/crm/contacts/12?tab=activity')
    expect(contactPageHref(12, 'nonsense')).toBe('/crm/contacts/12')
  })
})

describe('the organisation’s own fields (custom_data)', () => {
  const fields = [
    field('budget', 'number', { id: 1 }), field('visit', 'date', { id: 2 }), field('diet', 'multiselect', { id: 3, config: { options: ['Vegan', 'Halal'] } }),
    field('newsletter', 'checkbox', { id: 4 }), field('size', 'select', { id: 5, required: true, config: { options: ['S', 'M'] } }), field('note', 'textarea', { id: 6 }),
  ]

  it('orders the fields as Settings does, then by id', () => {
    const out = orderedFields([field('b', 'text', { id: 2, sort_order: 1 }), field('a', 'text', { id: 3, sort_order: 0 }), field('c', 'text', { id: 1, sort_order: 1 })])
    expect(out.map(f => f.key)).toEqual(['a', 'c', 'b'])
  })

  it('reads a stored day as the day it was written, never converted', () => {
    expect(storedDay('2026-11-12T00:00:00+00:00')).toBe('2026-11-12')
    expect(storedDay('2026-11-12')).toBe('2026-11-12')
    expect(storedDay(12)).toBe('')
    expect(customText(fields[1], '2026-11-12T00:00:00+00:00', 'Yes', 'No')).toBe('2026-11-12')
  })

  it('says a value in words: a list joined, a tick as yes or no, nothing as empty', () => {
    expect(customText(fields[2], ['Vegan', 'Halal'], 'Yes', 'No')).toBe('Vegan, Halal')
    expect(customText(fields[3], true, 'Yes', 'No')).toBe('Yes')
    expect(customText(fields[3], false, 'Yes', 'No')).toBe('No')
    expect(customText(fields[3], undefined, 'Yes', 'No')).toBe('')
    expect(customText(fields[0], 1200, 'Yes', 'No')).toBe('1200')
    expect(customText(fields[5], '  ', 'Yes', 'No')).toBe('')
  })

  it('counts the fields that hold something', () => {
    expect(filled(fields[3], false)).toBe(false)
    expect(filled(fields[2], [])).toBe(false)
    expect(filledCount(fields, { budget: 0, diet: ['Vegan'], newsletter: true, note: '' })).toBe(3)
    expect(filledCount(fields, null)).toBe(0)
  })

  it('starts the form from what is stored, each in the shape its input takes', () => {
    expect(customDraft(fields, { budget: 1200, visit: '2026-11-12T00:00:00+00:00', diet: ['Vegan'], newsletter: true, gone: 'kept by the server' })).toEqual({
      budget: '1200', visit: '2026-11-12', diet: ['Vegan'], newsletter: true, size: '', note: '',
    })
  })

  it('sends a number as a number, a tick as true or false, a list of known options, and leaves the empty out', () => {
    const draft = { budget: ' 1500 ', visit: '2026-12-01', diet: ['Vegan', 'Unknown'], newsletter: false, size: 'M', note: '  ' }
    expect(customPayload(fields, draft)).toEqual({ budget: 1500, visit: '2026-12-01', diet: ['Vegan'], newsletter: false, size: 'M' })
    expect(customPayload(fields, { diet: [] })).toEqual({ newsletter: false })
  })

  it('names the required fields still empty, and the fields a 422 named', () => {
    expect(missingRequired(fields, { size: '' })).toEqual(['size'])
    expect(missingRequired(fields, { size: 'S' })).toEqual([])
    expect(missingRequired([field('ok', 'checkbox', { required: true })], {})).toEqual([])
    expect(customErrorKeys({ 'custom_data.size': ['x'], email: ['y'] })).toEqual(['size'])
    expect(customErrorKeys(undefined)).toEqual([])
  })

  it('tells an unchanged draft from a changed one', () => {
    const start = customDraft(fields, null)
    expect(sameDraft(start, customDraft(fields, null))).toBe(true)
    expect(sameDraft(start, { ...start, size: 'M' })).toBe(false)
  })
})
