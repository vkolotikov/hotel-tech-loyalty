import { describe, expect, it } from 'vitest'
import { CANNED_LIMITS, canAddReply, cannedList, cannedPayload, cannedProblems, cannedValid, sameCanned } from './canned'
import { countsByEntity, createPayload, fieldForm, fieldProblems, fieldsOf, optionList, updatePayload, type CustomField } from './customFields'
import { addCustomField, formDraft, formPatch, formProblems, formUrl, iframeSnippet, isCustom, setField, submitter, type LeadForm } from './leadForms'
import { SETTINGS_TABS, moveItem, orderChanged, pickTab, reorderIds, withTab } from './lists'
import { fallbackStage, kindsFor, onlyOfKind, pipelineDeleteBlock, sortedReasons, sortedStages, stageForm, stagePayload, stageProblems, type Pipeline, type Stage } from './pipelines'

describe('settings sections in ?tab=', () => {
  it('knows the tab Get started links to', () => {
    expect(pickTab('pipelines', SETTINGS_TABS, 'canned')).toBe('pipelines')
    expect(pickTab('', SETTINGS_TABS, 'canned')).toBe('canned')
    expect(withTab(new URLSearchParams(''), 'tab', 'fields', 'canned').toString()).toBe('tab=fields')
    expect(withTab(new URLSearchParams('tab=fields&q=1'), 'tab', 'canned', 'canned').toString()).toBe('q=1')
  })
})

describe('reorder maths', () => {
  const list = [{ id: 4 }, { id: 9 }, { id: 2 }]
  it('gives the ids in their new order, the body a reorder endpoint takes', () => {
    expect(reorderIds(list, 1, -1)).toEqual([9, 4, 2])
    expect(reorderIds(list, 2, 1)).toEqual([4, 9, 2])
    expect(orderChanged(list, [9, 4, 2])).toBe(true)
    expect(orderChanged(list, [4, 9, 2])).toBe(false)
    expect(moveItem(['a', 'b'], 0, 1)).toEqual(['b', 'a'])
  })
})

describe('canned replies (chat-inbox-canned)', () => {
  it('reads the server\'s list, and sends the whole list trimmed', () => {
    const list = cannedList({ canned_responses: [{ label: 'Hours', text: 'We open at 9.' }, null, { label: 3 }] })
    expect(list).toEqual([{ label: 'Hours', text: 'We open at 9.' }, { label: '', text: '' }])
    expect(cannedPayload([{ label: ' Hours ', text: ' 9 to 5 ' }])).toEqual({ canned_responses: [{ label: 'Hours', text: '9 to 5' }] })
    expect(cannedList(undefined)).toEqual([])
  })

  it('asks for a name and a text within the controller\'s limits, at most 50 replies', () => {
    expect(cannedProblems([{ label: '', text: 'x' }, { label: 'y'.repeat(81), text: '' }])).toEqual([
      { index: 0, field: 'label', code: 'required' },
      { index: 1, field: 'label', code: 'too_long' },
      { index: 1, field: 'text', code: 'required' },
    ])
    const full = Array.from({ length: CANNED_LIMITS.count }, (_, i) => ({ label: `L${i}`, text: 'T' }))
    expect(cannedValid(full)).toBe(true)
    expect(canAddReply(full)).toBe(false)
    expect(cannedValid([...full, { label: 'one more', text: 'T' }])).toBe(false)
  })

  it('sees a reorder as a change and spaces as none', () => {
    const a = [{ label: 'A', text: '1' }, { label: 'B', text: '2' }]
    expect(sameCanned(a, [{ label: 'A ', text: '1' }, { label: 'B', text: ' 2' }])).toBe(true)
    expect(sameCanned(a, [a[1], a[0]])).toBe(false)
  })
})

describe('pipelines and stages', () => {
  const stage = (id: number, kind: Stage['kind'], sort_order: number, name = `S${id}`): Stage => ({ id, name, slug: name, color: '#3b82f6', kind, sort_order, default_win_probability: null })
  const stages = [stage(3, 'won', 2), stage(1, 'open', 0, 'New'), stage(2, 'open', 1, 'Offer'), stage(4, 'lost', 3)]

  it('orders stages by their place on the board', () => {
    expect(sortedStages(stages).map(s => s.id)).toEqual([1, 2, 3, 4])
  })

  it('keeps the last of a kind: it can neither change kind nor be deleted', () => {
    expect(onlyOfKind(stages, stages[0])).toBe(true)
    expect(onlyOfKind(stages, stages[1])).toBe(false)
    expect(kindsFor(stages, stages[0])).toEqual(['won'])
    expect(kindsFor(stages, stages[1])).toEqual(['open', 'won', 'lost'])
    expect(kindsFor(stages, null)).toEqual(['open', 'won', 'lost'])
  })

  it('says where a deleted stage\'s leads go: the first other open stage', () => {
    expect(fallbackStage(stages, stages[1])?.name).toBe('Offer')
    expect(fallbackStage(stages, stages[2])?.name).toBe('New')
  })

  it('says why a pipeline cannot be deleted', () => {
    const p: Pipeline = { id: 1, name: 'Sales', slug: 's', description: null, is_default: true, sort_order: 0, inquiries_count: 0, stages }
    expect(pipelineDeleteBlock(p)).toBe('default')
    expect(pipelineDeleteBlock({ ...p, is_default: false, inquiries_count: 3 })).toBe('deals')
    expect(pipelineDeleteBlock({ ...p, is_default: false })).toBeNull()
  })

  it('checks a stage\'s name and chance, and sends an empty chance as none', () => {
    expect(stageProblems({ name: '', kind: 'open', color: '#fff', win: '101' })).toEqual(['name', 'win'])
    expect(stageProblems({ name: 'Offer', kind: 'open', color: '#fff', win: '2.5' })).toEqual(['win'])
    expect(stagePayload({ name: ' Offer ', kind: 'open', color: '#3b82f6', win: '' })).toEqual({ name: 'Offer', kind: 'open', color: '#3b82f6', default_win_probability: null })
    expect(stagePayload(stageForm({ ...stages[0], default_win_probability: 100 })).default_win_probability).toBe(100)
  })

  it('lists active lost reasons first', () => {
    const list = sortedReasons([
      { id: 1, label: 'Price', slug: 'p', sort_order: 0, is_active: false },
      { id: 2, label: 'Dates', slug: 'd', sort_order: 1, is_active: true },
      { id: 3, label: 'No reply', slug: 'n', sort_order: 2 },
    ])
    expect(list.map(r => r.id)).toEqual([2, 3, 1])
  })
})

describe('lead forms', () => {
  const form: LeadForm = {
    id: 5, name: 'Weddings', embed_key: 'abc123', description: null, is_active: true, submission_count: 2, last_submitted_at: null, updated_at: null,
    default_source: null, default_inquiry_type: null,
    fields: [
      { key: 'name', type: 'text', label: 'Your name', required: true, enabled: true },
      { key: 'phone', type: 'phone', label: 'Phone', required: false, enabled: true },
    ],
    design: { title: 'Get in touch', intro: '', submit_text: 'Send', success_title: 'Thanks', success_message: '', primary_color: '#22d3ee', theme: 'light', corners: 'rounded', show_privacy_link: true, show_brand_logo: true },
  }

  it('builds the public page and the frame as the full admin does', () => {
    expect(formUrl('https://app.example.com/', 'abc123')).toBe('https://app.example.com/form/abc123')
    expect(iframeSnippet('https://app.example.com/form/abc123')).toBe('<iframe src="https://app.example.com/form/abc123" width="100%" height="700" frameborder="0" style="border: 0; max-width: 600px;"></iframe>')
  })

  it('sends only what changed', () => {
    const saved = formDraft(form)
    expect(formPatch(saved, saved)).toEqual({})
    const draft = { ...saved, name: ' Wedding enquiries ', fields: setField(saved.fields, 1, { required: true }) }
    expect(Object.keys(formPatch(saved, draft)).sort()).toEqual(['fields', 'name'])
    expect(formPatch(saved, draft).name).toBe('Wedding enquiries')
    expect(formPatch(saved, { ...saved, default_source: '  ' })).toEqual({ default_source: null })
  })

  it('adds the venue\'s own field at the end; only those can be removed', () => {
    const fields = addCustomField(form.fields, 'x1', 'Budget')
    expect(fields[2]).toEqual({ key: 'custom:x1', type: 'text', label: 'Budget', placeholder: '', required: false, enabled: true })
    expect(isCustom(fields[2])).toBe(true)
    expect(isCustom(fields[0])).toBe(false)
  })

  it('asks for a name and a label on every field that is on', () => {
    const draft = formDraft(form)
    expect(formProblems({ ...draft, name: ' ' })).toEqual(['name'])
    expect(formProblems({ ...draft, fields: setField(draft.fields, 0, { label: '' }) })).toEqual(['field_label'])
    expect(formProblems({ ...draft, fields: setField(draft.fields, 0, { label: '', enabled: false }) })).toEqual([])
  })

  it('names who sent a submission, from the contact or what they typed', () => {
    expect(submitter({ id: 1, payload: { name: 'Ada', email: 'ada@example.com' }, inquiry_id: null, status: null, created_at: '', guest: null })).toEqual({ name: 'Ada', email: 'ada@example.com' })
    expect(submitter({ id: 1, payload: {}, inquiry_id: 3, status: null, created_at: '', guest: { id: 1, full_name: 'Ada L', email: null, phone: null } })).toEqual({ name: 'Ada L', email: null })
  })
})

describe('custom fields', () => {
  const field = (id: number, entity: CustomField['entity'], sort_order: number): CustomField => ({ id, entity, key: `k${id}`, label: `F${id}`, type: 'text', config: null, help_text: null, required: false, is_active: true, show_in_list: false, sort_order })

  it('lists one record type\'s fields in order and counts each type', () => {
    const all = [field(1, 'guest', 1), field(2, 'inquiry', 0), field(3, 'guest', 0)]
    expect(fieldsOf(all, 'guest').map(f => f.id)).toEqual([3, 1])
    expect(countsByEntity(all)).toEqual({ inquiry: 1, guest: 2, corporate_account: 0, task: 0 })
  })

  it('wants choices for a list, and never sends the type on an update', () => {
    const form = { ...fieldForm(null), label: 'Diet', type: 'select' as const, options: 'Vegan\n\nVegan\nHalal ' }
    expect(optionList(form.options)).toEqual(['Vegan', 'Halal'])
    expect(fieldProblems({ ...form, options: '' })).toEqual(['options'])
    expect(createPayload(form, 'guest')).toMatchObject({ entity: 'guest', type: 'select', label: 'Diet', config: { options: ['Vegan', 'Halal'] } })
    expect(updatePayload(form)).not.toHaveProperty('type')
    expect(updatePayload({ ...form, type: 'text' }).config).toBeNull()
  })
})
