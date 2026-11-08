import { describe, expect, it } from 'vitest'
import { errorKey } from '../lib/errors'
import { NO_FILTERS } from './leadLogic'
import {
  activeChips, aiSignal, captureText, closeEach, columnsBody, contactLinks, contactPatch, daysBetween, draftFromCapture, dueIn,
  filtersFromView, freshness, hasViewState, leadColumnChoices, leadColumns, orderedViews, ownerColumns, phoneOwner, previewDoc,
  priorityTone, searchTemplates, settingObject, stageSteps, templateSendable, templateSendBody, templateTags, viewBody,
  viewFilters, withColumn, withOwner,
} from './listLogic'
import type { LeadRow, SavedView, Stage } from './leadTypes'

const lead = (id: number, extra: Partial<LeadRow> = {}): LeadRow => ({
  id, guest_id: id, pipeline_id: null, pipeline_stage_id: null, status: 'New', priority: null, source: null, total_value: null,
  assigned_to: null, next_task_type: null, next_task_due: null, next_task_notes: null, next_task_completed: false, created_at: null, ...extra,
})
const stage = (id: number, name: string, kind: Stage['kind'], sort: number): Stage => ({ id, name, kind, sort_order: sort, color: null })
const STAGES = [stage(1, 'New', 'open', 0), stage(2, 'Contacted', 'open', 1), stage(3, 'Proposal', 'open', 2), stage(8, 'Won', 'won', 8), stage(9, 'Lost', 'lost', 9)]

describe('the columns the organisation shows (crm-settings inquiry_fields, the full admin\'s switch)', () => {
  it('reads a setting saved as JSON or as a string, and falls back to the full admin\'s defaults', () => {
    expect(settingObject({ inquiry_fields: '{"list":{"touches":false}}' }, 'inquiry_fields')).toEqual({ list: { touches: false } })
    expect(settingObject({ inquiry_fields: 'not json' }, 'inquiry_fields')).toEqual({})
    expect(leadColumns(undefined, false)).toEqual({ value: true, ai_signal: true, next_task: true, owner: true, touches: true, stay: false, country: false })
    expect(leadColumns({ inquiry_fields: { list: { touches: false, country: true, stay: true } } }, true)).toMatchObject({ touches: false, country: true, stay: true })
    expect(leadColumnChoices(false)).not.toContain('stay')
  })

  it('switches one column and keeps the rest of the setting (its form and detail parts) as saved', () => {
    const saved = { inquiry_fields: { form: { notes: false }, list: { value: true, bulk_select: true }, detail: { chat_history: false } } }
    expect(columnsBody(saved, 'inquiry_fields', 'value', false)).toEqual({
      value: { form: { notes: false }, list: { value: false, bulk_select: true }, detail: { chat_history: false } },
    })
    expect(columnsBody(undefined, 'deal_fields', 'owner', false)).toEqual({ value: { list: { owner: false } } })
    expect(withColumn({ lead_owners: ['Anna'] }, 'inquiry_fields', 'touches', false)).toEqual({ lead_owners: ['Anna'], inquiry_fields: { list: { touches: false } } })
  })
})

describe('saved views (shared with the full admin\'s Leads page)', () => {
  const f = { ...NO_FILTERS, q: ' ada ', due: 'now' as const, status: 'Proposal', owner: 'me', priority: 'High', phone: 'yes' as const, sort: 'value' as const }

  it('stores the full admin\'s keys beside this workspace\'s own', () => {
    expect(viewFilters(f, 'Anna')).toEqual({
      status: 'Proposal', priority: 'High', inquiryType: '', propertyId: '', assignedTo: 'Anna', source: '', taskDue: '', country: '', hasPhone: 'yes',
      crm: { q: 'ada', due: 'now', status: 'Proposal', owner: 'me', priority: 'High', phone: 'yes', sort: 'value' },
    })
  })

  it('reads its own views back whole, and the full admin\'s by their keys', () => {
    expect(filtersFromView(viewFilters(f, 'Anna'), 'Anna')).toEqual({ ...f, q: 'ada', page: 1 })
    expect(filtersFromView({ status: 'New', assignedTo: 'Anna', taskDue: 'overdue', hasPhone: 'no', inquiryType: 'Wedding', propertyId: '4' }, 'Anna'))
      .toMatchObject({ status: 'New', owner: 'me', due: 'overdue', phone: 'no', type: 'Wedding' })
    expect(filtersFromView({ assignedTo: 'Ben', taskDue: 'yesterday' }, 'Anna')).toMatchObject({ owner: 'Ben', due: '' })
    expect(filtersFromView(null, 'Anna')).toEqual(NO_FILTERS)
  })

  it('saves only a named view with something in it, pinned', () => {
    expect(hasViewState(NO_FILTERS)).toBe(false)
    expect(hasViewState({ ...NO_FILTERS, sort: 'oldest' })).toBe(true)
    expect(viewBody('  ', f, 'Anna')).toBeNull()
    expect(viewBody('Hot', NO_FILTERS, 'Anna')).toBeNull()
    expect(viewBody('x'.repeat(90), f, 'Anna')).toMatchObject({ page: 'inquiries', is_pinned: true, name: 'x'.repeat(80) })
  })

  it('lists the pinned views first', () => {
    const v = (id: number, pinned: boolean, order: number): SavedView => ({ id, name: `v${id}`, page: 'inquiries', filters: {}, is_pinned: pinned, sort_order: order })
    expect(orderedViews([v(1, false, 0), v(2, true, 5), v(3, true, 1)]).map(x => x.id)).toEqual([3, 2, 1])
  })

  it('shows the filters in force as chips, the follow-up only on the list', () => {
    expect(activeChips({ ...f, from: '2026-11-01' }, true).map(c => c.key)).toEqual(['q', 'due', 'status', 'owner', 'priority', 'phone', 'dates'])
    expect(activeChips(f, false).map(c => c.key)).not.toContain('due')
    expect(activeChips({ ...NO_FILTERS, from: '2026-11-01' }, true)[0].clear).toEqual({ from: '', to: '' })
  })
})

describe('how fresh a lead is and when its next step falls', () => {
  const now = new Date('2026-11-07T12:00:00Z')
  it('reads a lead as new, cold or its age (the full admin\'s freshness chip)', () => {
    expect(freshness('2026-11-07T01:00:00Z', null, now)).toEqual({ kind: 'fresh' })
    expect(freshness('2026-11-04T12:00:00Z', null, now)).toEqual({ kind: 'age', days: 3 })
    expect(freshness('2026-10-20T12:00:00Z', null, now)).toEqual({ kind: 'cold', days: 18 })
    expect(freshness('2026-10-20T12:00:00Z', '2026-11-05T12:00:00Z', now)).toEqual({ kind: 'age', days: 18 })
    expect(freshness('2026-10-20T12:00:00Z', '2026-10-28T12:00:00Z', now)).toEqual({ kind: 'cold', days: 10 })
    expect(freshness('2026-10-20T12:00:00Z', null, now, true)).toBeNull()
    expect(freshness(null, null, now)).toBeNull()
  })

  it('counts calendar days, never instants', () => {
    expect(daysBetween('2026-11-05', '2026-11-07')).toBe(2)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2) // across the clock change
    expect(dueIn('2026-11-05T00:00:00.000000Z', '2026-11-07')).toEqual({ state: 'late', days: 2 })
    expect(dueIn('2026-11-07', '2026-11-07')).toEqual({ state: 'today' })
    expect(dueIn('2026-11-08', '2026-11-07')).toEqual({ state: 'tomorrow' })
    expect(dueIn('2026-11-11', '2026-11-07')).toEqual({ state: 'soon', days: 4 })
    expect(dueIn('2026-12-24', '2026-11-07')).toEqual({ state: 'later', day: '2026-12-24' })
    expect(dueIn(null, '2026-11-07')).toBeNull()
  })
})

describe('the AI\'s signals and the priority', () => {
  it('reads what the AI said, or nothing before it read the lead', () => {
    expect(aiSignal(lead(1))).toBeNull()
    expect(aiSignal(lead(1, { ai_win_probability: 140, ai_going_cold_risk: 'HIGH', ai_suggested_action: ' Call today ' })))
      .toEqual({ probability: 100, cold: 'high', action: 'Call today', brief: null, intent: null })
    expect(aiSignal(lead(1, { ai_going_cold_risk: 'freezing', ai_intent: 'event' }))).toMatchObject({ cold: null, intent: 'event' })
  })

  it('gives the highest priority the urgent tone and the lowest a quiet one', () => {
    expect(priorityTone('High')).toBe('danger')
    expect(priorityTone('medium')).toBe('pending')
    expect(priorityTone('Low')).toBe('neutral')
    expect(priorityTone('Urgent', ['Low', 'Normal', 'High', 'Urgent'])).toBe('danger')
    expect(priorityTone('Someday')).toBe('neutral')
    expect(priorityTone(null)).toBeNull()
  })
})

describe('the stage bar', () => {
  it('marks the stages before the lead\'s done and its own current; a won lead has every open stage done', () => {
    const steps = stageSteps({ status: 'Contacted', pipeline_stage_id: null }, STAGES)
    expect(steps.open.map(s => [s.stage.name, s.state])).toEqual([['New', 'done'], ['Contacted', 'current'], ['Proposal', 'next']])
    expect(steps.won?.name).toBe('Won')
    expect(steps.lost?.name).toBe('Lost')
    expect(stageSteps({ status: 'Confirmed', pipeline_stage_id: null }, STAGES).open.every(s => s.state === 'done')).toBe(true)
    expect(stageSteps({ status: 'Lost', pipeline_stage_id: null }, STAGES).open.every(s => s.state === 'next')).toBe(true)
  })
})

describe('the team\'s columns', () => {
  const leads = [lead(1, { assigned_to: 'Anna', total_value: '100' }), lead(2), lead(3, { assigned_to: 'anna ', total_value: 50 }), lead(4, { assigned_to: 'Zed' })]
  it('puts nobody first, then the known owners, then any other owner a lead names', () => {
    const columns = ownerColumns(leads, ['Anna', 'Ben'])
    expect(columns.map(c => [c.owner, c.leads.map(l => l.id), c.value])).toEqual([
      [null, [2], 0], ['Anna', [1, 3], 150], ['Ben', [], 0], ['Zed', [4], 0],
    ])
    expect(phoneOwner(columns, undefined)?.owner).toBeNull()
    expect(phoneOwner(columns, 'Ben')?.owner).toBe('Ben')
    expect(phoneOwner(columns, null)?.owner).toBeNull()
  })

  it('shows a lead with its new owner before the server answers', () => {
    expect(withOwner({ data: leads }, 2, 'Ben')?.data.find(l => l.id === 2)?.assigned_to).toBe('Ben')
    expect(withOwner(undefined, 2, 'Ben')).toBeUndefined()
  })
})

describe('a lead from a pasted message (crm-ai/capture-lead)', () => {
  const opts = { owner: 'Anna', priorities: ['Low', 'Medium', 'High'], sources: ['Email', 'Website'], types: [], hotel: false }
  it('fills in a new contact and the lead, in the organisation\'s own words', () => {
    const draft = draftFromCapture({ success: true, data: {
      customer_name: ' Ada Lovelace ', email: 'ada@example.test', company: 'Engines', total_value: '1200,50', priority: 'high',
      source: 'email', notes: 'Wants a quote', special_requests: 'Vegan lunch', check_in: '2026-12-01', num_rooms: 3,
    } }, opts)
    expect(draft).toMatchObject({
      contact: 'new', name: 'Ada Lovelace', email: 'ada@example.test', company: 'Engines', owner: 'Anna', value: '1200.5',
      priority: 'High', source: 'Email', notes: 'Wants a quote\n\nVegan lunch', checkIn: '', rooms: '', requests: '',
    })
  })

  it('keeps a hotel\'s stay, and a type only from the organisation\'s list', () => {
    const draft = draftFromCapture({ success: true, data: { customer_name: 'Ada', check_in: '2026-12-01', check_out: 'soon', num_rooms: '2', num_adults: 0, special_requests: 'Sea view', inquiry_type: 'wedding', priority: 'Urgent' } },
      { ...opts, hotel: true, types: ['Wedding'] })
    expect(draft).toMatchObject({ checkIn: '2026-12-01', checkOut: '', rooms: '2', adults: '', requests: 'Sea view', type: 'Wedding', priority: '' })
  })

  it('says a spent AI allowance in our words (403 ai_budget_used_up), never the server\'s', () => {
    const spent = { response: { status: 403, data: { error: 'ai_budget_used_up', message: 'Provider said no' } } }
    expect(errorKey(spent)).toBe('crm.errors.ai_budget_used_up')
    expect(errorKey({ response: { status: 402, data: { error: 'feature_locked' } } })).toBe('crm.errors.feature_locked')
  })

  it('reads nothing from a failure (its text is the provider\'s, never shown) and needs some text to send', () => {
    expect(draftFromCapture({ success: false, error: 'AI service error: boom' }, opts)).toBeNull()
    expect(draftFromCapture(undefined, opts)).toBeNull()
    expect(captureText('  hi ')).toBeNull()
    expect(captureText(`${'a'.repeat(10_050)}`)).toHaveLength(10_000)
  })
})

describe('email templates to a contact', () => {
  const template = (subject: string, html_body: string) => ({ subject, html_body })
  it('finds the merge tags a template uses', () => {
    expect(templateTags(template('Hello {{first_name}}', '<p>{{hotel_name}} {{first_name}} {{Bad}}</p>'))).toEqual(['first_name', 'hotel_name'])
  })

  it('refuses a template with a member\'s details for a contact who is not a member, naming the tags', () => {
    expect(templateSendable(template('Hi {{member_name}}', 'Your {{points_balance}} points'), null)).toEqual({ ok: false, tags: ['member_name', 'points_balance'] })
    expect(templateSendable(template('Hi {{member_name}}', ''), 12)).toEqual({ ok: true })
    expect(templateSendable(template('From {{hotel_name}}', '© {{current_year}}'), null)).toEqual({ ok: true })
  })

  it('sends to a real address, the member when known, a subject only when typed', () => {
    expect(templateSendBody('ada@', null, '')).toBeNull()
    expect(templateSendBody(' ada@example.test ', null, ' ')).toEqual({ to: 'ada@example.test' })
    expect(templateSendBody('ada@example.test', 5, 'Offer')).toEqual({ to: 'ada@example.test', member_id: 5, subject: 'Offer' })
    expect(searchTemplates([{ name: 'Welcome', subject: 'Hi' }, { name: 'Quote', subject: 'Your offer' }], 'OFFER').map(x => x.name)).toEqual(['Quote'])
    expect(previewDoc('<p>x</p>')).toContain('background:#ffffff')
  })
})

describe('a contact changed from a lead, and reaching them', () => {
  const guest = { full_name: 'Ada', company: 'Engines', email: 'ada@example.test', phone: null, country: 'Latvia' }
  it('sends only what changed; an emptied box clears it; a name is needed', () => {
    expect(contactPatch(guest, { name: 'Ada', company: '', email: 'ada@example.test', phone: ' +371 2 ', country: 'Latvia' })).toEqual({ body: { company: null, phone: '+371 2' } })
    expect(contactPatch(guest, { name: ' ', company: '', email: '', phone: '', country: '' })).toEqual({ body: null, problem: 'name' })
    expect(contactPatch(guest, { name: 'Ada', company: 'Engines', email: 'nope', phone: '', country: 'Latvia' })).toEqual({ body: null, problem: 'email' })
    expect(contactPatch(guest, { name: 'Ada', company: 'Engines', email: 'ada@example.test', phone: '', country: 'Latvia' })).toEqual({ body: null })
  })

  it('offers email, a call to the phone and messages to the mobile', () => {
    expect(contactLinks({ email: 'ada@example.test', phone: '+371 26 123 456', mobile: '+371 29 000 000' })).toEqual({
      email: 'mailto:ada@example.test', call: 'tel:+37126123456', sms: 'sms:+37129000000', whatsapp: 'https://wa.me/37129000000',
    })
    expect(contactLinks({ email: 'nope', phone: '12' })).toEqual({})
    expect(contactLinks(null)).toEqual({})
  })
})

describe('closing many leads, each through its own flow', () => {
  it('calls once per lead, in turn, and says which failed', async () => {
    const called: number[] = []
    const result = await closeEach([3, 1, 3, 2, -1], async id => { called.push(id); if (id === 1) throw new Error('refused') })
    expect(called).toEqual([3, 1, 2])
    expect(result).toEqual({ done: 2, failed: [1] })
  })

  it('stops at the limit', async () => {
    const result = await closeEach(Array.from({ length: 130 }, (_, i) => i + 1), async () => undefined)
    expect(result.done).toBe(100)
  })
})
