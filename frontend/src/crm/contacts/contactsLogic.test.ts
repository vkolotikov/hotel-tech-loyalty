import { describe, expect, it } from 'vitest'
import {
  BULK_MAX, DEFAULT_LIFECYCLE, EMPTY_COMPANY, EMPTY_CONTACT, activeFilterCount, activityBody, activityKey, allOnPage, bulkBody,
  companyBody, companyErrors, companyFormOf, companyStatusKey, csvWithBom, displayName, exportParams, fieldPatch, filtersFrom,
  activeFilters, impactLines, impactSummary, importanceTone, mergeRefusalKey, leadState, listOr, listParams, mailLink, mergeBody, mergeSides, newContactBody, newContactErrors,
  newLeadFor, optionsWith, pageFrom, phoneLink, reasonKey, segmentFilters, settingList, tagIdsWith, tagIdsWithout, tagNameError,
  tagsToOffer, toggleId, togglePage, withParam, withSegment, withoutFilters,
} from './contactsLogic'
import { contactsTab } from './tabs'
import type { Company, DuplicatePair } from './types'

const sp = (s: string) => new URLSearchParams(s)

describe('the list filters, as the address keeps them and GuestController reads them', () => {
  it('reads the address, keeping only a known sort and a numeric tag', () => {
    const f = filtersFrom(sp('q=ann&lifecycle=VIP&tag=7&sort=updated&country=Latvia'))
    expect(f).toMatchObject({ q: 'ann', lifecycle: 'VIP', tag: '7', sort: 'updated', country: 'Latvia', importance: '' })
    expect(filtersFrom(sp('sort=total_revenue&tag=x')).sort).toBe('newest')
    expect(filtersFrom(sp('tag=x')).tag).toBe('')
  })

  it('asks GET guests with the server’s parameter names, nothing empty, and a whitelisted sort', () => {
    const f = filtersFrom(sp('q= ann &source=Website&tag=3&company=Acme&sort=oldest'))
    expect(listParams(f, 2)).toEqual({
      search: 'ann', lead_source: 'Website', tag_ids: '3', company: 'Acme', sort: 'created_at', dir: 'asc', page: 2, per_page: 25,
    })
    expect(listParams(filtersFrom(sp('')), 1)).toEqual({ sort: 'created_at', dir: 'desc', page: 1, per_page: 25 })
  })

  it('exports the chosen rows when there are some, else what the filters show, as CSV', () => {
    const f = filtersFrom(sp('importance=VIP&page=3'))
    expect(exportParams(f, [4, 9])).toEqual({ ids: '4,9', format: 'csv' })
    expect(exportParams(f, [])).toEqual({ importance: 'VIP', format: 'csv' })
  })

  it('reads a page from 1 and goes back to the first page when a filter changes', () => {
    expect(pageFrom(sp('page=3'))).toBe(3)
    expect(pageFrom(sp('page=-1'))).toBe(1)
    expect(pageFrom(sp('cpage=2'), 'cpage')).toBe(2)
    expect(withParam(sp('page=3&q=a'), 'country', 'Spain').toString()).toBe('q=a&country=Spain')
    expect(withParam(sp('q=a&country=Spain'), 'country', '').toString()).toBe('q=a')
    expect(withParam(sp('q=a'), 'page', '2').toString()).toBe('q=a&page=2')
  })

  it('counts the filters set and clears them, keeping the tab and the order', () => {
    expect(activeFilterCount(filtersFrom(sp('q=a&tag=2&sort=oldest')))).toBe(2)
    expect(withoutFilters(sp('tab=people&q=a&tag=2&sort=oldest&page=2')).toString()).toBe('tab=people&sort=oldest')
  })
})

describe('saved views (guests/segments)', () => {
  it('keeps only what is set, and the order only beside a filter (the server refuses an empty set)', () => {
    expect(segmentFilters(filtersFrom(sp('')))).toEqual({})
    expect(segmentFilters(filtersFrom(sp('sort=oldest')))).toEqual({})
    expect(segmentFilters(filtersFrom(sp('lifecycle=VIP&sort=oldest')))).toEqual({ lifecycle: 'VIP', sort: 'oldest' })
  })

  it('opens a view with its known filters only, replacing what was set', () => {
    const next = withSegment(sp('tab=people&q=old&page=4'), { lifecycle: 'VIP', tag: '5', evil: 'x', sort: 'bad' })
    expect(next.get('tab')).toBe('people')
    expect(next.get('q')).toBeNull()
    expect(next.get('page')).toBeNull()
    expect(next.get('lifecycle')).toBe('VIP')
    expect(next.get('tag')).toBe('5')
    expect(next.get('evil')).toBeNull()
    expect(next.get('sort')).toBeNull()
    expect(withSegment(sp('q=a'), ['not', 'an', 'object']).toString()).toBe('')
    expect(withSegment(sp(''), { tag: 'abc' }).get('tag')).toBeNull()
  })
})

describe('the venue’s lists (crm-settings)', () => {
  it('reads an array, a JSON string or an object of values, else nothing', () => {
    expect(settingList({ a: ['x', ' y ', ''] }, 'a')).toEqual(['x', 'y'])
    expect(settingList({ a: '["x","y"]' }, 'a')).toEqual(['x', 'y'])
    expect(settingList({ a: { 0: 'x', 1: 'y' } }, 'a')).toEqual(['x', 'y'])
    expect(settingList({ a: [{ name: 'x' }] }, 'a')).toEqual(['x'])
    expect(settingList({ a: 'not json' }, 'a')).toEqual([])
    expect(settingList(undefined, 'a')).toEqual([])
  })

  it('falls back to the seeded defaults, and adds the value a record holds', () => {
    expect(listOr({}, 'lifecycle_statuses', DEFAULT_LIFECYCLE)).toBe(DEFAULT_LIFECYCLE)
    expect(listOr({ lifecycle_statuses: ['Lead'] }, 'lifecycle_statuses', DEFAULT_LIFECYCLE)).toEqual(['Lead'])
    expect(optionsWith(['A', 'B'], 'C')).toEqual(['A', 'B', 'C'])
    expect(optionsWith(['A', 'B', 'A'], 'A')).toEqual(['A', 'B'])
    expect(optionsWith(['A'], '')).toEqual(['A'])
  })
})

describe('editing one field (PUT guests/{id})', () => {
  it('sends only a changed, trimmed value', () => {
    expect(fieldPatch('company', ' Acme ', 'Acme')).toEqual({ kind: 'same' })
    expect(fieldPatch('company', ' Beta ', 'Acme')).toEqual({ kind: 'patch', body: { company: 'Beta' } })
    expect(fieldPatch('city', 'Riga', null)).toEqual({ kind: 'patch', body: { city: 'Riga' } })
  })

  it('keeps the name, the lifecycle and the importance, and clears any other emptied field with null', () => {
    expect(fieldPatch('full_name', '  ', 'Ada')).toEqual({ kind: 'required' })
    expect(fieldPatch('lifecycle_status', '', 'VIP')).toEqual({ kind: 'required' })
    expect(fieldPatch('importance', ' ', 'Standard')).toEqual({ kind: 'required' })
    expect(fieldPatch('phone', '', '+371 2')).toEqual({ kind: 'patch', body: { phone: null } })
    expect(fieldPatch('notes', '  ', 'Prefers email.')).toEqual({ kind: 'patch', body: { notes: null } })
    expect(fieldPatch('phone', '', null)).toEqual({ kind: 'same' })
  })

  it('checks lengths and addresses as the controller does', () => {
    expect(fieldPatch('phone', '1'.repeat(51), '')).toEqual({ kind: 'too_long', max: 50 })
    expect(fieldPatch('notes', 'x'.repeat(5000), '')).toMatchObject({ kind: 'patch' })
    expect(fieldPatch('email', 'nope', '')).toEqual({ kind: 'bad_email' })
    expect(fieldPatch('email', 'a@b.lv', '')).toEqual({ kind: 'patch', body: { email: 'a@b.lv' } })
  })
})

describe('a new contact (POST guests)', () => {
  it('needs a name, a real address when one is given, and sends nothing empty', () => {
    expect(newContactErrors(EMPTY_CONTACT)).toEqual({ full_name: 'required' })
    expect(newContactErrors({ ...EMPTY_CONTACT, full_name: 'Ada', email: 'x' })).toEqual({ email: 'bad_email' })
    expect(newContactErrors({ ...EMPTY_CONTACT, full_name: 'A'.repeat(201) })).toEqual({ full_name: 'too_long' })
    expect(newContactBody({ ...EMPTY_CONTACT, full_name: ' Ada ', email: 'ada@x.io', company: ' ' })).toEqual({ full_name: 'Ada', email: 'ada@x.io' })
  })
})

describe('tags', () => {
  const worn = [{ id: 1, name: 'VIP' }, { id: 4, name: 'Press' }]
  it('adds and removes one id from the set the sync replaces', () => {
    expect(tagIdsWith(worn, 7)).toEqual([1, 4, 7])
    expect(tagIdsWith(worn, 4)).toEqual([1, 4])
    expect(tagIdsWithout(worn, 1)).toEqual([4])
  })
  it('offers the tags not worn yet, by name, and checks a new name', () => {
    const all = [...worn, { id: 9, name: 'b2b' }, { id: 8, name: 'Agency' }]
    expect(tagsToOffer(all, worn).map(t => t.id)).toEqual([8, 9])
    expect(tagNameError(' ', all)).toBe('required')
    expect(tagNameError('x'.repeat(81), all)).toBe('too_long')
    expect(tagNameError(' vip ', all)).toBe('exists')
    expect(tagNameError('Wedding', all)).toBeNull()
  })
})

describe('deleting and choosing', () => {
  it('lists only the kinds of record that go with a contact', () => {
    expect(impactLines({ inquiries: 2, reservations: 0, activities: 5 })).toEqual([{ key: 'inquiries', count: 2 }, { key: 'activities', count: 5 }])
    expect(impactLines(undefined)).toEqual([])
  })

  it('chooses rows one by one and a page at a time', () => {
    expect(toggleId([1, 2], 2)).toEqual([1])
    expect(toggleId([1], 2)).toEqual([1, 2])
    expect(allOnPage([1, 2, 3], [1, 2])).toBe(true)
    expect(allOnPage([], [])).toBe(false)
    expect(togglePage([9], [1, 2])).toEqual([9, 1, 2])
    expect(togglePage([9, 1, 2], [1, 2])).toEqual([9])
  })

  it('sends a bulk change only with ids, a value, and no more than the server takes', () => {
    expect(bulkBody([1, 2], 'importance', 'VIP')).toEqual({ ids: [1, 2], fields: { importance: 'VIP' } })
    expect(bulkBody([], 'importance', 'VIP')).toBeNull()
    expect(bulkBody([1], 'lifecycle_status', ' ')).toBeNull()
    expect(bulkBody(Array.from({ length: BULK_MAX + 1 }, (_, i) => i + 1), 'importance', 'VIP')).toBeNull()
  })
})

describe('showing a contact', () => {
  it('names them by name, else email or phone', () => {
    expect(displayName({ full_name: ' Ada ', email: 'a@b.c' })).toBe('Ada')
    expect(displayName({ full_name: '', email: 'a@b.c' })).toBe('a@b.c')
    expect(displayName({ full_name: null, mobile: '+1 2' })).toBe('+1 2')
    expect(displayName({})).toBeNull()
  })
  it('marks importance above the first level, and reads a lead’s state as the full admin does', () => {
    expect(importanceTone('Standard', ['Standard', 'VIP'])).toBe('neutral')
    expect(importanceTone('VIP', ['Standard', 'VIP'])).toBe('accent')
    expect(importanceTone('Odd', ['Standard', 'VIP'])).toBe('neutral')
    expect(leadState('Confirmed')).toBe('won')
    expect(leadState('Lost')).toBe('lost')
    expect(leadState('New')).toBe('open')
  })
  it('writes mail and phone links only for real ones', () => {
    expect(mailLink('a@b.lv')).toBe('mailto:a@b.lv')
    expect(mailLink('nope')).toBeNull()
    expect(phoneLink('+371 26 123-456')).toBe('tel:+37126123456')
    expect(phoneLink('12')).toBeNull()
    expect(newLeadFor(12)).toBe('/crm/leads?new=1&guest=12')
  })
  it('logs a touch only with words, signed by the person', () => {
    expect(activityBody('call', '  ', 'Ann')).toBeNull()
    expect(activityBody('call', ' Rang back ', 'Ann')).toEqual({ type: 'call', description: 'Rang back', performed_by: 'Ann' })
    expect(activityBody('note', 'x', '')).toEqual({ type: 'note', description: 'x' })
    expect(activityKey('sms')).toBe('activity.sms')
    expect(activityKey('stay')).toBe('activity.other')
  })
})

describe('duplicates (guests/merge)', () => {
  const g = (id: number) => ({ id, full_name: `G${id}`, email: null, phone: null, mobile: null, company: null, city: null, country: null, lifecycle_status: null, created_at: null, last_activity_at: null })
  const pair: DuplicatePair = { reason: 'shared_email', winner: g(1), loser: g(2) }
  it('keeps the older one unless swapped, and sends the reason trimmed', () => {
    expect(mergeSides(pair, false).keep.id).toBe(1)
    expect(mergeSides(pair, true).keep.id).toBe(2)
    expect(mergeBody(pair, true, '  same person ')).toEqual({ winner_id: 2, loser_id: 1, reason: 'same person' })
    expect(mergeBody(pair, false, '')).toEqual({ winner_id: 1, loser_id: 2 })
    expect(mergeBody(pair, false, 'x'.repeat(600)).reason).toHaveLength(500)
  })
  it('names each reason the server gives', () => {
    expect(reasonKey('shared_email')).toBe('duplicates.reason_email')
    expect(reasonKey('shared_phone')).toBe('duplicates.reason_phone')
    expect(reasonKey('shared_name_context')).toBe('duplicates.reason_name')
    expect(reasonKey('other')).toBe('duplicates.reason_other')
  })
})

describe('companies (corporate-accounts)', () => {
  const company: Company = {
    id: 3, company_name: 'Acme', industry: null, tax_id: null, billing_address: null, billing_email: null, contact_person: 'Bo',
    contact_email: null, contact_phone: null, account_manager: null, contract_start: '2026-01-01T00:00:00.000000Z', contract_end: null,
    payment_terms: 'Net 30', credit_limit: '5000.00', status: 'Active', notes: null,
  }
  it('fills the form with days as days and amounts as numbers', () => {
    const form = companyFormOf(company)
    expect(form.contract_start).toBe('2026-01-01')
    expect(form.credit_limit).toBe('5000')
    expect(form.industry).toBe('')
  })
  it('checks the name, addresses and the credit limit', () => {
    expect(companyErrors(EMPTY_COMPANY)).toEqual({ company_name: 'required' })
    expect(companyErrors({ ...EMPTY_COMPANY, company_name: 'A', billing_email: 'x', credit_limit: '-1' })).toEqual({ billing_email: 'bad_email', credit_limit: 'bad_number' })
  })
  it('creates with what is written, and edits with every field so an emptied one is cleared', () => {
    const form = { ...companyFormOf(company), industry: ' Tech ', contact_person: '' }
    expect(companyBody({ ...EMPTY_COMPANY, company_name: 'New', status: 'Active', credit_limit: '10' }, 'create')).toEqual({ company_name: 'New', credit_limit: 10 })
    const edit = companyBody(form, 'edit')
    expect(edit.industry).toBe('Tech')
    expect(edit.contact_person).toBeNull()
    expect(edit.credit_limit).toBe(5000)
    expect(edit.status).toBe('Active')
    expect('status' in companyBody({ ...form, status: '' }, 'edit')).toBe(false)
  })
  it('names the states it knows', () => {
    expect(companyStatusKey('Active')).toBe('company_status.active')
    expect(companyStatusKey('Weird')).toBeNull()
  })
})

describe('odds and ends', () => {
  it('keeps exactly one byte-order mark on the CSV', () => {
    const bom = String.fromCharCode(0xfeff)
    expect(csvWithBom('a,b')).toBe(`${bom}a,b`)
    expect(csvWithBom(`${bom}a,b`)).toBe(`${bom}a,b`)
  })
  it('opens People unless the address names another section', () => {
    expect(contactsTab(null)).toBe('people')
    expect(contactsTab('companies')).toBe('companies')
    expect(contactsTab('loyalty')).toBe('people')
  })
})

describe('round 2: chips, the delete preview and merge refusals', () => {
  it('lists the active filters in the toolbar’s order, each as a chip', () => {
    const f = filtersFrom(new URLSearchParams('lifecycle=VIP&q=%20ada%20&tag=4&company=Acme&sort=oldest'))
    expect(activeFilters(f)).toEqual([
      { key: 'q', value: 'ada' }, { key: 'lifecycle', value: 'VIP' }, { key: 'tag', value: '4' }, { key: 'company', value: 'Acme' },
    ])
    expect(activeFilters(filtersFrom(new URLSearchParams('sort=oldest')))).toEqual([])
  })

  it('reads the delete preview as the server answers it: what goes, what stays unlinked, what blocks', () => {
    const answer = { inquiries: 2, reservations: 1, activities: 5, lead_tasks: 3, chats: 1, venue_bookings: 0, removes: ['inquiries', 'reservations', 'activities', 'lead_tasks'], kept: ['chats', 'member'], blocked: false }
    expect(impactSummary(answer)).toEqual({
      removes: [{ key: 'inquiries', count: 2 }, { key: 'lead_tasks', count: 3 }, { key: 'reservations', count: 1 }, { key: 'activities', count: 5 }],
      kept: [{ key: 'chats', count: 1 }],
      blocked: null,
    })
    expect(impactSummary({ ...answer, blocked: true, venue_bookings: 2 }).blocked).toBe(2)
    // An older answer without the lists: the leads, reservations and timeline go, nothing is said to stay.
    expect(impactSummary({ inquiries: 1, reservations: 0, activities: 0 })).toEqual({ removes: [{ key: 'inquiries', count: 1 }], kept: [], blocked: null })
    expect(impactSummary(undefined)).toEqual({ removes: [], kept: [], blocked: null })
  })

  it('says a refused merge in its own words, by the server’s code', () => {
    expect(mergeRefusalKey('different_members')).toBe('refused')
    expect(mergeRefusalKey('same_guest')).toBe('same')
    expect(mergeRefusalKey('merge_failed')).toBe('failed')
    expect(mergeRefusalKey('merge_refused')).toBe('not_merged')
    expect(mergeRefusalKey('different_organizations')).toBe('not_merged')
    expect(mergeRefusalKey('network')).toBeNull()
  })
})
