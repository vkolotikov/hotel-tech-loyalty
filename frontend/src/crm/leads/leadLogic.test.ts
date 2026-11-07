import { describe, expect, it } from 'vitest'
import {
  activeFields, activeFilterCount, activityBody, amount, bulkBody, customBody, customErrors, customText, dateRange, dayOf,
  defaultPipeline, detailsDraft, detailsPatch, dueSections, EMPTY_LEAD, exportQuery, fileSize, firstOpenStage, followUp,
  guestBody, hasStay, impactOf, kindOf, leadBody, listQuery, logContactBody, lostBody, missingCustom, moveTo,
  newestConversation, nextStepBody, NO_FILTERS, ownerOptions, pipelineOf, readFilters, resolveStage, settingList,
  sourceOptions, stageColor, toggled, toggledAll, validateLead, validateNextStep, winTone, withFilter, wonBody, writeFilters,
} from './leadLogic'
import type { CustomField, Pipeline, Stage } from './leadTypes'

const stage = (id: number, name: string, kind: Stage['kind'], sort: number, extra: Partial<Stage> = {}): Stage => ({ id, name, kind, sort_order: sort, color: '#3b82f6', ...extra })
const STAGES: Stage[] = [
  stage(3, 'Proposal', 'open', 2),
  stage(1, 'New', 'open', 0),
  stage(2, 'Contacted', 'open', 1),
  stage(9, 'Lost', 'lost', 9),
  stage(8, 'Won', 'won', 8),
]
const field = (key: string, type: CustomField['type'], extra: Partial<CustomField> = {}): CustomField => ({
  id: key.length, entity: 'inquiry', key, label: key, type, config: null, help_text: null, required: false, is_active: true, sort_order: 0, ...extra,
})

describe('the list filters in the address', () => {
  it('reads Today\'s "?due=1" as due now and leaves out what is not a filter value', () => {
    const f = readFilters(new URLSearchParams('due=1&sort=nope&page=-2&from=2026-13&q=ada'))
    expect(f).toMatchObject({ due: 'now', sort: 'newest', page: 1, from: '', q: 'ada' })
    expect(readFilters(new URLSearchParams('due=overdue&stage=New&owner=me&page=3')).due).toBe('overdue')
  })

  it('writes only what differs from the defaults and keeps ?new and ?guest', () => {
    const sp = writeFilters({ ...NO_FILTERS, due: 'now', owner: 'me', page: 2 }, new URLSearchParams('new=1&guest=5&stage=Old'))
    expect(sp.get('due')).toBe('1')
    expect(sp.get('owner')).toBe('me')
    expect(sp.get('page')).toBe('2')
    expect(sp.get('new')).toBe('1')
    expect(sp.get('guest')).toBe('5')
    expect(sp.has('stage')).toBe(false)
    expect(sp.has('sort')).toBe(false)
    expect(readFilters(sp)).toMatchObject({ due: 'now', owner: 'me', page: 2 })
  })

  it('goes back to the first page when a filter changes, not when the page does', () => {
    expect(withFilter({ ...NO_FILTERS, page: 4 }, { source: 'chatbot' }).page).toBe(1)
    expect(withFilter({ ...NO_FILTERS, page: 4 }, { page: 5 }).page).toBe(5)
  })

  it('counts the panel\'s filters (a date range counts once)', () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0)
    expect(activeFilterCount({ ...NO_FILTERS, status: 'New', from: '2026-11-01', to: '2026-11-07', q: 'x', due: 'today' })).toBe(2)
  })
})

describe('what GET inquiries is asked', () => {
  it('always asks for open leads, names the person for "mine" and maps the sort', () => {
    const q = listQuery({ ...NO_FILTERS, owner: 'me', sort: 'follow_up', due: 'today', q: '  ada ' }, 'Vitalij K')
    expect(q).toMatchObject({ active_only: true, assigned_to: 'Vitalij K', sort: 'next_task_due', dir: 'asc', task_due: 'today', search: 'ada', page: 1, per_page: 25 })
    expect(listQuery({ ...NO_FILTERS, owner: 'Anna' }, 'Vitalij K').assigned_to).toBe('Anna')
  })

  it('reads a created range typed backwards the right way round', () => {
    expect(dateRange('2026-11-07', '2026-11-01')).toEqual({ date_from: '2026-11-01', date_to: '2026-11-07' })
    expect(dateRange('2026-11-01', '')).toEqual({ date_from: '2026-11-01' })
    expect(dateRange('bad', 'worse')).toEqual({})
  })

  it('asks "due now" as overdue then today, soonest first, and nothing else as sections', () => {
    const sections = dueSections({ ...NO_FILTERS, due: 'now', page: 3 }, 'Me')
    expect(sections.map(s => s.key)).toEqual(['overdue', 'today'])
    expect(sections[0].query).toMatchObject({ task_due: 'overdue', sort: 'next_task_due', page: 1, per_page: 100 })
    expect(dueSections({ ...NO_FILTERS, due: 'today' }, 'Me')).toEqual([])
    expect(listQuery({ ...NO_FILTERS, due: 'now' }, 'Me').task_due).toBe('')
  })

  it('exports the same filters as CSV, every page', () => {
    const q = exportQuery({ ...NO_FILTERS, source: 'chatbot', page: 4 }, 'Me')
    expect(q).toMatchObject({ format: 'csv', source: 'chatbot', active_only: true })
    expect(q).not.toHaveProperty('page')
    expect(q).not.toHaveProperty('per_page')
  })
})

describe('pipelines and stages', () => {
  const pipelines: Pipeline[] = [
    { id: 2, name: 'Groups', is_default: false, sort_order: 1, stages: [] },
    { id: 1, name: 'Sales', is_default: true, sort_order: 0, stages: STAGES },
  ]

  it('finds the default pipeline and a lead\'s own, falling back to the default', () => {
    expect(defaultPipeline(pipelines)?.id).toBe(1)
    expect(defaultPipeline([{ ...pipelines[0], is_default: false }])?.id).toBe(2)
    expect(pipelineOf({ pipeline_id: 2 }, pipelines)?.id).toBe(2)
    expect(pipelineOf({ pipeline_id: null }, pipelines)?.id).toBe(1)
    expect(firstOpenStage(STAGES)?.name).toBe('New')
  })

  it('reads the stage from the status name first, the closed legacy names next, the id last', () => {
    expect(resolveStage({ status: 'contacted ', pipeline_stage_id: 1 }, STAGES)?.id).toBe(2)
    expect(resolveStage({ status: 'Confirmed', pipeline_stage_id: 1 }, STAGES)?.id).toBe(8)
    expect(resolveStage({ status: 'Lost', pipeline_stage_id: null }, STAGES.filter(s => s.name !== 'Lost').concat(stage(10, 'Gone', 'lost', 10)))?.id).toBe(10)
    expect(resolveStage({ status: 'Renamed away', pipeline_stage_id: 3 }, STAGES)?.id).toBe(3)
    expect(resolveStage({ status: 'Renamed away', pipeline_stage_id: null }, STAGES)).toBeNull()
    expect(kindOf({ status: 'Confirmed', pipeline_stage_id: null }, [])).toBe('won')
    expect(kindOf({ status: 'Whatever', pipeline_stage_id: null }, [])).toBe('open')
  })

  it('sends won and lost through their own flows, an open stage by name, the same stage nowhere', () => {
    const lead = { status: 'New', pipeline_stage_id: 1 }
    expect(moveTo(lead, STAGES[1], STAGES)).toEqual({ kind: 'none' })
    expect(moveTo(lead, STAGES[0], STAGES)).toEqual({ kind: 'stage', status: 'Proposal' })
    expect(moveTo(lead, STAGES[4], STAGES)).toEqual({ kind: 'won' })
    expect(moveTo(lead, STAGES[3], STAGES)).toEqual({ kind: 'lost' })
  })

  it('draws only plain hex colours', () => {
    expect(stageColor('#10b981')).toBe('#10b981')
    expect(stageColor('#abc')).toBe('#abc')
    expect(stageColor('red; background:url(x)')).toBeNull()
    expect(stageColor(null)).toBeNull()
  })
})

describe('follow-ups on the venue\'s day', () => {
  const base = { next_task_type: 'Call back', next_task_notes: null, next_task_completed: false }
  it('reads a date column as a day and compares it with the venue\'s today', () => {
    expect(dayOf('2026-11-07T00:00:00.000000Z')).toBe('2026-11-07')
    expect(followUp({ ...base, next_task_due: '2026-11-06T00:00:00.000000Z' }, '2026-11-07')?.state).toBe('overdue')
    expect(followUp({ ...base, next_task_due: '2026-11-07' }, '2026-11-07')?.state).toBe('today')
    expect(followUp({ ...base, next_task_due: '2026-11-08' }, '2026-11-07')?.state).toBe('later')
    expect(followUp({ ...base, next_task_due: null }, '2026-11-07')).toMatchObject({ state: 'later', day: '' })
    expect(followUp({ ...base, next_task_due: '2026-11-01', next_task_completed: true }, '2026-11-07')).toBeNull()
    expect(followUp({ ...base, next_task_type: null, next_task_due: null }, '2026-11-07')).toBeNull()
  })

  it('checks and writes a next step as the full admin does', () => {
    expect(validateNextStep({ type: '', day: '', note: '' })).toEqual({ type: 'required' })
    expect(validateNextStep({ type: 'x'.repeat(51), day: '2026-1-1', note: '' })).toEqual({ type: 'too_long', day: 'invalid' })
    expect(nextStepBody({ type: ' Call ', day: '2026-11-09', note: ' ' })).toEqual({ next_task_type: 'Call', next_task_due: '2026-11-09', next_task_notes: null, next_task_completed: false })
  })
})

describe('the create form', () => {
  it('asks for a name (new) or a contact (existing) and checks what was typed', () => {
    expect(validateLead({ ...EMPTY_LEAD })).toEqual({ name: 'required' })
    expect(validateLead({ ...EMPTY_LEAD, contact: 'existing' })).toEqual({ guest: 'required' })
    expect(validateLead({ ...EMPTY_LEAD, name: 'Ada', email: 'ada@', value: '-5', checkIn: '2026-12-10', checkOut: '2026-12-01', rooms: '1.5' }))
      .toEqual({ email: 'email', value: 'number', checkOut: 'dates', rooms: 'number' })
    expect(validateLead({ ...EMPTY_LEAD, name: 'Ada', value: '1250,50' })).toEqual({})
  })

  it('makes the contact from what was typed, nothing empty', () => {
    expect(guestBody({ ...EMPTY_LEAD, name: ' Ada Lovelace ', email: 'ada@example.test', phone: ' ' })).toEqual({ full_name: 'Ada Lovelace', email: 'ada@example.test' })
  })

  it('sends the lead with its stage name, typed numbers, stay only when shown, and known fields only', () => {
    const fields = [field('budget', 'number'), field('vip', 'checkbox')]
    const draft = { ...EMPTY_LEAD, status: 'New', value: '1250,5', owner: 'Anna', checkIn: '2026-12-01', rooms: '2', custom: { budget: '300', vip: false, stray: 'x' } }
    expect(leadBody(draft, 7, { stay: false, fields })).toEqual({ guest_id: 7, status: 'New', assigned_to: 'Anna', total_value: 1250.5, custom_data: { budget: 300 } })
    expect(leadBody(draft, 7, { stay: true, fields: [] })).toMatchObject({ check_in: '2026-12-01', num_rooms: 2 })
    expect(leadBody({ ...EMPTY_LEAD }, 3, { stay: true, fields })).toEqual({ guest_id: 3 })
  })
})

describe('the organisation\'s lists', () => {
  it('reads crm-settings as the full admin does', () => {
    expect(settingList({ lead_owners: '["Anna","Ben"]' }, 'lead_owners', [])).toEqual(['Anna', 'Ben'])
    expect(settingList({ lead_owners: { 0: 'Anna', 1: 'Ben' } }, 'lead_owners', [])).toEqual(['Anna', 'Ben'])
    expect(settingList({ lead_owners: [{ name: 'Anna' }, { name: ' ' }] }, 'lead_owners', [])).toEqual(['Anna'])
    expect(settingList({ priorities: 'not json' }, 'priorities', ['Low'])).toEqual(['Low'])
    expect(settingList(undefined, 'priorities', ['Low'])).toEqual(['Low'])
    expect(settingList({ priorities: [] }, 'priorities', ['Low'])).toEqual([])
  })

  it('offers each source and owner once, the person first', () => {
    expect(sourceOptions(['Website', 'chatbot'], 'Fair')).toEqual(['chatbot', 'booking_widget', 'booking_widget_failed', 'Website', 'Fair'])
    expect(ownerOptions('Vitalij K', ['Anna', 'vitalij k'], [{ name: 'Ben' }, { name: 'Anna' }], 'Old owner')).toEqual(['Vitalij K', 'Anna', 'Ben', 'Old owner'])
  })
})

describe('bulk actions and selection', () => {
  it('sends the chosen ids once, at most 500, and refuses a stage or priority without a value', () => {
    expect(bulkBody([], 'delete')).toBeNull()
    expect(bulkBody([1, 1, 2], 'set_status')).toBeNull()
    expect(bulkBody([1, 1, 2], 'set_status', 'New')).toEqual({ ids: [1, 2], action: 'set_status', value: 'New' })
    expect(bulkBody([5], 'set_assigned_to', '')).toEqual({ ids: [5], action: 'set_assigned_to', value: '' })
    expect(bulkBody(Array.from({ length: 600 }, (_, i) => i + 1), 'delete')?.ids).toHaveLength(500)
  })

  it('toggles one row, and the whole page on or off', () => {
    expect([...toggled(new Set([1]), 1)]).toEqual([])
    expect([...toggled(new Set([1]), 2)].sort()).toEqual([1, 2])
    expect([...toggledAll(new Set([1]), [1, 2])].sort()).toEqual([1, 2])
    expect([...toggledAll(new Set([1, 2, 9]), [1, 2])]).toEqual([9])
  })
})

describe('closing, the timeline and contact', () => {
  it('needs a reason to lose a lead and trims the notes', () => {
    expect(lostBody(null, 'x')).toBeNull()
    expect(lostBody(4, '  ')).toEqual({ lost_reason_id: 4 })
    expect(lostBody(4, ' went elsewhere ')).toEqual({ lost_reason_id: 4, note: 'went elsewhere' })
    expect(wonBody(' ')).toEqual({})
  })

  it('adds something to the timeline only when there is something to say', () => {
    expect(activityBody('note', ' ', '')).toBeNull()
    expect(activityBody('call', 'Rang', ' ')).toEqual({ type: 'call', subject: 'Rang' })
    expect(logContactBody('whatsapp', '')).toEqual({ channel: 'whatsapp' })
  })

  it('lists what goes with a lead, without the zeros', () => {
    expect(impactOf({ activities: 3, tasks: 0, attachments: 1, reservations: 0 })).toEqual([{ key: 'activities', count: 3 }, { key: 'attachments', count: 1 }])
    expect(impactOf(null)).toEqual([])
  })

  it('reads small figures and helpers', () => {
    expect(winTone(80)).toBe('success')
    expect(winTone(40)).toBe('pending')
    expect(winTone(10)).toBe('danger')
    expect(winTone(null)).toBeNull()
    expect(hasStay({ check_in: null, check_out: null, num_rooms: null })).toBe(false)
    expect(hasStay({ check_in: '2026-12-01T00:00:00.000000Z', check_out: null, num_rooms: null })).toBe(true)
    // The database's default of one room is no stay.
    expect(hasStay({ check_in: null, check_out: null, num_rooms: 1 })).toBe(false)
    expect(hasStay({ check_in: null, check_out: null, num_rooms: 2 })).toBe(true)
    expect(fileSize(2_500_000)).toBe('2.4 MB')
    expect(fileSize(0)).toBe('')
    expect(amount('1250.00')).toBe(1250)
    expect(amount('x')).toBeNull()
    expect(newestConversation([{ id: 1, last_message_at: '2026-11-01T10:00:00Z' }, { id: 2, last_message_at: '2026-11-05T10:00:00Z' }])?.id).toBe(2)
  })
})

describe('custom fields', () => {
  const fields = [
    field('budget', 'number', { sort_order: 2 }),
    field('kind', 'select', { config: { options: ['A', 'B'] }, required: true, sort_order: 1 }),
    field('tags', 'multiselect'),
    field('vip', 'checkbox', { required: true }),
    field('old', 'text', { is_active: false }),
  ]
  it('keeps the active ones, by their order then id', () => {
    expect(activeFields(fields).map(f => f.key)).toEqual(['vip', 'tags', 'kind', 'budget']) // by order, then id
  })
  it('sends typed values, nothing empty or unknown', () => {
    expect(customBody(fields, { budget: '12,5', kind: '', tags: ['x'], vip: true, stray: 1 })).toEqual({ budget: 12.5, tags: ['x'], vip: true })
    expect(customBody(fields, { budget: 'abc', vip: false })).toEqual({})
  })
  it('names the required ones left empty and reads values back', () => {
    expect(missingCustom(fields, { kind: 'A' })).toEqual(['vip'])
    expect(missingCustom(fields, { vip: true })).toEqual(['kind'])
    expect(customText(fields[3], true, 'Yes', 'No')).toBe('Yes')
    expect(customText(fields[2], ['x', 'y'], 'Yes', 'No')).toBe('x, y')
    expect(customErrors({ 'custom_data.kind': ['bad'], email: ['bad'] })).toEqual(['kind'])
  })
})

describe('a lead\'s details', () => {
  const lead = { total_value: '1250.00', priority: 'High', assigned_to: 'Anna', source: 'chatbot', notes: 'Wants May' }
  it('sends only what changed, an emptied box as a cleared value', () => {
    const draft = detailsDraft(lead)
    expect(draft).toEqual({ value: '1250', priority: 'High', owner: 'Anna', source: 'chatbot', notes: 'Wants May' })
    expect(detailsPatch(lead, draft)).toEqual({ body: null })
    expect(detailsPatch(lead, { ...draft, value: '', owner: 'Ben' })).toEqual({ body: { total_value: null, assigned_to: 'Ben' } })
    expect(detailsPatch(lead, { ...draft, value: '-1' })).toEqual({ body: null, problem: 'number' })
    expect(detailsPatch(lead, { ...draft, notes: '' })).toEqual({ body: { notes: null } })
  })
})
