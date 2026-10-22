import { describe, expect, it } from 'vitest'
import {
  campaignActions, campaignBody, campaignFormOf, campaignServerProblems, canTest, confirmationOf, draftProblems, fieldKey, isDirty, isDay, isLink,
  moveBlock, newBlock, previewDocument, previewFilled, previewOf, progressOf, reasonBounds, removeBlock, rowOf, rowProblem, ruleRow, searchFor, segmentBody,
  segmentFormOf, segmentProblems, sendBlockers, sendRefusalRefreshes, serverRuleProblem, statusTone, tabAfter, tabFrom, tagPlace, targetFrom, toggledTier,
  unknownTags, viewOf, withTag, withType, formWords, type CampaignForm,
} from './campaignsMath'
import type { Audience, Block, Campaign, CampaignOptions, Segment, SegmentOptions } from './types'

const options: SegmentOptions = {
  operators: ['AND', 'OR'],
  max_rules: 20,
  types: [
    { type: 'tier', ops: ['in', 'not_in'], value: 'tiers', max: 50 },
    { type: 'activity', ops: ['active_within', 'inactive_over'], value: 'days', min: 1, max: 3650 },
    { type: 'current_points', ops: ['min', 'max'], value: 'points', min: 0, max: 10_000_000 },
    { type: 'joined', ops: ['after', 'before'], value: 'date', min: '1990-01-01', max: '2100-12-31' },
    { type: 'earn', ops: ['any', 'none'], value: 'none' },
  ],
  tiers: [{ id: 1, name: 'Silver', color: '#9aa4b1', is_active: true }, { id: 2, name: 'Gold', color: '#c9a227', is_active: true }, { id: 3, name: 'Old', color: null, is_active: false }],
}

const blockOptions: CampaignOptions = {
  block_types: ['heading', 'text', 'button', 'divider', 'spacer'],
  new_blocks: {
    heading: { text: '', level: 1, align: 'left', color: '#1a1a1a' },
    text: { text: '', color: '#555555', align: 'left', fontSize: 15 },
    button: { text: '', url: '', bgColor: '#c9a84c', textColor: '#0e0e0e', align: 'center' },
    divider: { color: '#e5e5e5' },
    spacer: { height: 24 },
  },
  aligns: ['left', 'center', 'right'],
  levels: [1, 2, 3],
  font_sizes: [12, 13, 14, 15, 16, 18],
  max_blocks: 100,
  max_text: { heading: 500, text: 5000, button: 200 },
  max_url: 2000,
  spacer: { min: 4, max: 160 },
  max_name: 120,
  max_subject: 200,
  tags: [{ tag: '{{member_name}}', name: 'member_name', label: 'Member full name' }, { tag: '{{first_name}}', name: 'first_name', label: 'Member first name' }],
  known_tags: ['{{member_name}}', '{{first_name}}', '{{member.name}}'],
}

const campaign = (more: Partial<Campaign> = {}): Campaign => ({
  id: 7, name: 'Autumn', subject: 'Our autumn', status: 'draft', segment: { id: 3, name: 'Gold' }, recipient_count: 0, sent_count: 0, failed_count: 0,
  sent_at: null, scheduled_at: null, scheduled_for: null, schedule_problem: null,
  created_at: '2026-10-20T08:00:00+00:00', updated_at: '2026-10-20T09:00:00+00:00', segment_id: 3, editable_here: true,
  body_blocks: [{ id: 'h', type: 'heading', text: 'Hello', level: 1, align: 'left', color: '#1a1a1a' }], body_html: '<div>Hello</div>',
  preview_subject: 'Our autumn', preview_html: '<div>Hello</div>', unknown_tags: [], missing: [], last_progress_at: null, created_by: 'Ada', sent_by: null, revision: '2026-10-20T09:00:00+00:00', ...more,
})
const segment = (more: Partial<Segment> = {}): Segment => ({
  id: 3, name: 'Gold', description: null, everyone: false, operator: 'AND', filters: [{ type: 'tier', op: 'in', value: [2] }], members: 120, problem: null,
  last_sent_at: null, updated_at: null, ...more,
})

describe('the tabs live in the address', () => {
  it('reads and writes ?tab=', () => {
    expect(tabFrom('')).toBe('campaigns')
    expect(tabFrom('?tab=segments')).toBe('segments')
    expect(tabFrom('?tab=campaigns')).toBe('campaigns')
    expect(tabFrom('?tab=nonsense')).toBe('campaigns')
    expect(searchFor('campaigns')).toBe('')
    expect(searchFor('segments')).toBe('?tab=segments')
    expect(tabFrom('?tab=push')).toBe('push')
    expect(searchFor('push')).toBe('?tab=push')
    // Release 4: SMS is the fourth tab.
    expect(tabFrom('?tab=sms')).toBe('sms')
    expect(searchFor('sms')).toBe('?tab=sms')
    expect(tabAfter('campaigns', 'ArrowRight')).toBe('segments')
    expect(tabAfter('segments', 'ArrowRight')).toBe('push')
    expect(tabAfter('push', 'ArrowRight')).toBe('sms')
    expect(tabAfter('sms', 'ArrowRight')).toBe('campaigns')
    expect(tabAfter('campaigns', 'ArrowLeft')).toBe('sms')
    expect(tabAfter('push', 'Home')).toBe('campaigns')
    expect(tabAfter('segments', 'End')).toBe('sms')
    expect(tabAfter('campaigns', 'x')).toBeNull()
  })
})

describe('what a campaign\'s state allows', () => {
  it('opens a workspace draft in the editor, the full admin\'s draft read-only, and anything sent as results', () => {
    expect(viewOf({ status: 'draft', editable_here: true })).toBe('editor')
    expect(viewOf({ status: 'draft', editable_here: false })).toBe('elsewhere')
    for (const status of ['scheduled', 'sending', 'sent', 'failed', 'cancelled']) expect(viewOf({ status, editable_here: true })).toBe('results')
  })

  it('offers each button only where the server would act', () => {
    expect(campaignActions({ status: 'draft', editable_here: true })).toEqual({ edit: true, test: true, send: true, cancel: false, duplicate: true, remove: true })
    expect(campaignActions({ status: 'draft', editable_here: false })).toEqual({ edit: false, test: false, send: false, cancel: false, duplicate: true, remove: true })
    expect(campaignActions({ status: 'sending', editable_here: true })).toEqual({ edit: false, test: false, send: false, cancel: true, duplicate: true, remove: false })
    for (const status of ['scheduled', 'sent', 'failed', 'cancelled']) {
      expect(campaignActions({ status, editable_here: true })).toEqual({ edit: false, test: false, send: false, cancel: false, duplicate: true, remove: false })
    }
  })

  it('gives each status its tone, anything new the quiet one', () => {
    expect(['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled', 'paused'].map(statusTone)).toEqual(['pending', 'approved', 'approved', 'fulfilled', 'declined', 'cancelled', 'cancelled'])
  })

  it('counts progress, and once sent says how many it was handed but did not mail', () => {
    expect(progressOf({ status: 'sending', recipient_count: 400, sent_count: 100, failed_count: 0 })).toEqual({ done: 100, total: 400, percent: 25, skipped: 0 })
    expect(progressOf({ status: 'sent', recipient_count: 400, sent_count: 395, failed_count: 2 })).toEqual({ done: 397, total: 400, percent: 100, skipped: 3 })
    expect(progressOf({ status: 'cancelled', recipient_count: 400, sent_count: 200, failed_count: 0 })).toEqual({ done: 200, total: 400, percent: 50, skipped: 0 })
    expect(progressOf({ status: 'sending', recipient_count: 0, sent_count: 0, failed_count: 0 }).percent).toBe(0)
  })
})

describe('a segment\'s rules as a form', () => {
  it('starts a new segment with one rule to fill in, never with Everyone', () => {
    const form = segmentFormOf(null, options)
    expect(form).toEqual({ name: '', description: '', everyone: false, operator: 'AND', rules: [{ type: 'tier', op: 'in', text: '', tiers: [] }] })
  })

  it('reads a stored segment into rows and back into the same rules', () => {
    const stored = segment({ operator: 'OR', filters: [
      { type: 'tier', op: 'not_in', value: [2, 1] },
      { type: 'activity', op: 'inactive_over', value: 60 },
      { type: 'joined', op: 'after', value: '2026-01-01' },
      { type: 'earn', op: 'none' },
    ] })
    const form = segmentFormOf(stored, options)
    expect(form.rules[1]).toEqual({ type: 'activity', op: 'inactive_over', text: '60', tiers: [] })
    expect(segmentBody({ ...form, name: ' Lapsed ' }, options)).toEqual({ name: 'Lapsed', description: null, everyone: false, operator: 'OR', filters: [
      { type: 'tier', op: 'not_in', value: [1, 2] },
      { type: 'activity', op: 'inactive_over', value: 60 },
      { type: 'joined', op: 'after', value: '2026-01-01' },
      { type: 'earn', op: 'none' },
    ] })
  })

  it('saves Everyone as no rules', () => {
    const form = { ...segmentFormOf(segment(), options), everyone: true }
    expect(segmentBody(form, options).filters).toEqual([])
    expect(segmentFormOf(segment({ everyone: true, filters: [] }), options).rules).toEqual([])
  })

  it('starts a rule again when its type changes, since the operators differ', () => {
    const row = { type: 'tier', op: 'not_in', text: '', tiers: [2] }
    expect(withType(row, 'activity', options)).toEqual({ type: 'activity', op: 'active_within', text: '', tiers: [] })
    expect(withType(row, 'tier', options)).toBe(row)
    expect(ruleRow(options, 'joined')).toEqual({ type: 'joined', op: 'after', text: '', tiers: [] })
  })

  it('refuses every rule the shared service would skip, with the server\'s reason', () => {
    expect(rowProblem({ type: 'birthday', op: 'in', text: '', tiers: [] }, options)).toBe('unknown_type')
    expect(rowProblem({ type: 'activity', op: 'inactive_days', text: '60', tiers: [] }, options)).toBe('unknown_op')
    expect(rowProblem({ type: 'tier', op: 'in', text: '', tiers: [] }, options)).toBe('no_value')
    expect(rowProblem({ type: 'tier', op: 'in', text: '', tiers: [9] }, options)).toBe('unknown_tier')
    expect(rowProblem({ type: 'activity', op: 'active_within', text: '', tiers: [] }, options)).toBe('no_value')
    expect(rowProblem({ type: 'activity', op: 'active_within', text: '1.5', tiers: [] }, options)).toBe('bad_value')
    expect(rowProblem({ type: 'activity', op: 'active_within', text: '0', tiers: [] }, options)).toBe('out_of_range')
    expect(rowProblem({ type: 'current_points', op: 'min', text: '10000001', tiers: [] }, options)).toBe('out_of_range')
    expect(rowProblem({ type: 'current_points', op: 'max', text: '0', tiers: [] }, options)).toBeNull()
    expect(rowProblem({ type: 'joined', op: 'after', text: '2026-02-30', tiers: [] }, options)).toBe('bad_value')
    expect(rowProblem({ type: 'joined', op: 'before', text: '1980-01-01', tiers: [] }, options)).toBe('out_of_range')
    expect(rowProblem({ type: 'earn', op: 'any', text: '', tiers: [] }, options)).toBeNull()
    expect(isDay('2028-02-29')).toBe(true)
    expect(isDay('2027-02-29')).toBe(false)
  })

  it('never lets no rules mean everyone unless Everyone was chosen', () => {
    const none = { name: 'x', description: '', everyone: false, operator: 'OR', rules: [] }
    expect(segmentProblems(none, options).form).toEqual({ rules: 'no_rules' })
    expect(previewOf(none, options)).toBeNull()
    expect(segmentProblems({ ...none, everyone: true }, options).form).toEqual({})
    expect(previewOf({ ...none, everyone: true }, options)).toEqual({ everyone: true, operator: 'OR', filters: [] })
  })

  it('asks for a count only when every rule is sound, the name aside', () => {
    const form = { name: '', description: '', everyone: false, operator: 'AND', rules: [{ type: 'tier', op: 'in', text: '', tiers: [] }] }
    expect(previewOf(form, options)).toBeNull()
    expect(previewOf({ ...form, rules: [{ type: 'tier', op: 'in', text: '', tiers: [2] }] }, options)).toEqual({ everyone: false, operator: 'AND', filters: [{ type: 'tier', op: 'in', value: [2] }] })
    expect(segmentProblems({ ...form, name: 'x'.repeat(121) }, options).form.name).toBe('name')
  })

  it('keeps chosen tiers in the ladder\'s order and leaves out a value the form cannot hold', () => {
    const row = { type: 'tier', op: 'in', text: '', tiers: [2] }
    expect(toggledTier(row, 1, options).tiers).toEqual([1, 2])
    expect(toggledTier(row, 2, options).tiers).toEqual([])
    expect(rowOf({ type: 'activity', op: 'active_within', value: [1] }, options).text).toBe('')
  })

  it('reads the server\'s bad_rule, and names the bounds its words need', () => {
    expect(serverRuleProblem({ status: 422, code: 'bad_rule', extra: { index: 2, reason: 'unknown_tier' } })).toEqual({ index: 2, reason: 'unknown_tier' })
    expect(serverRuleProblem({ status: 422, code: 'bad_rule', extra: { index: null } })).toEqual({ index: null, reason: 'bad_rules' })
    expect(serverRuleProblem({ status: 422, code: 'invalid', extra: {} })).toBeNull()
    expect(reasonBounds('activity', options)).toEqual({ min: '1', max: '3650' })
    expect(reasonBounds('joined', options)).toEqual({ min: '1990-01-01', max: '2100-12-31' })
    expect(reasonBounds(undefined, options)).toEqual({ min: '', max: '20' })
  })
})

describe('the body\'s blocks', () => {
  const blocks: Block[] = [
    { id: 'a', type: 'heading', text: 'Hi', level: 1, align: 'left', color: '#1a1a1a' },
    { id: 'b', type: 'text', text: 'Body', color: '#555555', align: 'left', fontSize: 15 },
    { id: 'c', type: 'divider', color: '#e5e5e5' },
  ]

  it('makes a new block as the server says it starts', () => {
    expect(newBlock('button', blockOptions, 'x1')).toEqual({ id: 'x1', type: 'button', text: '', url: '', bgColor: '#c9a84c', textColor: '#0e0e0e', align: 'center' })
  })

  it('moves and removes blocks, and leaves the ends alone', () => {
    expect(moveBlock(blocks, 1, -1).map(b => b.id)).toEqual(['b', 'a', 'c'])
    expect(moveBlock(blocks, 2, 1)).toBe(blocks)
    expect(moveBlock(blocks, 0, -1)).toBe(blocks)
    expect(removeBlock(blocks, 1).map(b => b.id)).toEqual(['a', 'c'])
  })

  it('checks links as the server does: http, https with a host, or mailto', () => {
    for (const ok of ['https://lumiere.example/book?a=1&b=2', 'http://x.example', 'mailto:hello@lumiere.example']) expect(isLink(ok), ok).toBe(true)
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'https://', 'www.lumiere.example', 'https://x.example/a b', 'mailto:nobody', '']) expect(isLink(bad), bad).toBe(false)
  })

  it('saves a draft as it is, empty texts included, but not a bad link or an overlong text', () => {
    const form = { name: 'Autumn', subject: '', segment_id: '', blocks: [{ id: 'b', type: 'button' as const, text: '', url: '', bgColor: '#c9a84c', textColor: '#0e0e0e', align: 'center' as const }] }
    expect(draftProblems(form, blockOptions)).toEqual({ form: {}, blocks: {} })
    expect(draftProblems({ ...form, blocks: [{ ...form.blocks[0], url: 'https://' }] }, blockOptions)).toEqual({ form: {}, blocks: {} })
    expect(draftProblems({ ...form, name: ' ', blocks: [{ ...form.blocks[0], url: 'javascript:x' }] }, blockOptions)).toEqual({ form: { name: 'name' }, blocks: { 0: { url: 'url' } } })
    expect(draftProblems({ ...form, blocks: [{ id: 't', type: 'text', text: 'x'.repeat(5001), color: '#555555', align: 'left', fontSize: 15 }] }, blockOptions).blocks).toEqual({ 0: { text: 'text_long' } })
  })

  it('reads the server\'s field errors per block', () => {
    expect(campaignServerProblems({ 'body_blocks.2.url': ['x'], 'body_blocks.0.color': ['x'], segment_id: ['x'], name: ['x'] })).toEqual({
      form: { segment_id: 'segment_gone', name: 'name' }, blocks: { 2: { url: 'url' }, 0: { look: 'look' } },
    })
  })

  it('knows when the form differs from the saved draft', () => {
    const c = campaign()
    const form = campaignFormOf(c)
    expect(isDirty(form, c)).toBe(false)
    expect(isDirty({ ...form, subject: 'Our winter' }, c)).toBe(true)
    expect(isDirty({ ...form, subject: ' Our autumn ' }, c)).toBe(false)
    expect(campaignBody(form)).toEqual({ name: 'Autumn', subject: 'Our autumn', segment_id: 3, body_blocks: c.body_blocks })
  })

  it('puts the server\'s rendering in a page of its own', () => {
    expect(previewDocument('<p>x</p>')).toMatch(/^<!doctype html>.*<body[^>]*><p>x<\/p><\/body><\/html>$/)
  })
})

describe('tags (release 3 §4)', () => {
  const form: CampaignForm = {
    name: 'Autumn', subject: 'Hello there', segment_id: '', blocks: [
      { id: 'h', type: 'heading', text: 'Autumn', level: 1, align: 'left', color: '#1a1a1a' },
      { id: 'd', type: 'divider', color: '#e5e5e5' },
      { id: 't', type: 'text', text: 'Dear guest', color: '#555555', align: 'left', fontSize: 15 },
      { id: 'b', type: 'button', text: 'Book', url: '', bgColor: '#000000', textColor: '#ffffff', align: 'left' },
    ],
  }

  it('names each double-braced word no tag fills, once, in order, and the server\'s own tags not at all', () => {
    const known = blockOptions.known_tags
    expect(unknownTags(['Hi {{first_name}} {{member.name}}'], known)).toEqual([])
    expect(unknownTags(['Hi {{x}} and {{ first_name }}', undefined, null, '{{x}} {{member.tier}} {{ unclosed'], known)).toEqual(['{{x}}', '{{ first_name }}', '{{member.tier}}'])
    expect(unknownTags(formWords({ ...form, blocks: [{ id: 'b', type: 'button', text: 'Go {{y}}', url: '', bgColor: '#000', textColor: '#fff', align: 'left' }] }), known)).toEqual(['{{y}}'])
  })

  it('puts a tag where the cursor was, over the selection, in the subject or a block\'s words', () => {
    const subject = withTag(form, { field: { kind: 'subject' }, start: 6, end: 11 }, '{{first_name}}', blockOptions)
    expect(subject).toEqual({ form: { ...form, subject: 'Hello {{first_name}}' }, caret: 20 })
    const text = withTag(form, { field: { kind: 'block', id: 't' }, start: 5, end: 10 }, '{{member_name}}', blockOptions)
    expect(text?.form.blocks[2]).toMatchObject({ id: 't', text: 'Dear {{member_name}}' })
    expect(text?.form.blocks.filter((_, i) => i !== 2)).toEqual(form.blocks.filter((_, i) => i !== 2))
    expect(text?.caret).toBe(20)
    // A cursor past the end lands at the end; a button's label takes tags too.
    expect(withTag(form, { field: { kind: 'block', id: 'b' }, start: 99, end: 99 }, ' {{first_name}}', blockOptions)?.form.blocks[3]).toMatchObject({ text: 'Book {{first_name}}' })
  })

  it('puts no tag into a field that is gone, has no words, or has no room for it', () => {
    expect(withTag(form, { field: { kind: 'block', id: 'gone' }, start: 0, end: 0 }, '{{first_name}}', blockOptions)).toBeNull()
    expect(withTag(form, { field: { kind: 'block', id: 'd' }, start: 0, end: 0 }, '{{first_name}}', blockOptions)).toBeNull()
    expect(withTag({ ...form, subject: 'x'.repeat(195) }, { field: { kind: 'subject' }, start: 0, end: 0 }, '{{first_name}}', blockOptions)).toBeNull()
    expect(withTag({ ...form, subject: 'x'.repeat(195) }, { field: { kind: 'subject' }, start: 0, end: 195 }, '{{first_name}}', blockOptions)?.form.subject).toBe('{{first_name}}')
  })

  it('says where the cursor is, and reads it from the field', () => {
    expect(tagPlace(form, { kind: 'subject' })).toEqual({ kind: 'subject' })
    expect(tagPlace(form, { kind: 'block', id: 't' })).toEqual({ kind: 'text', n: 3 })
    expect(tagPlace(form, { kind: 'block', id: 'd' })).toBeNull()
    expect(tagPlace(form, { kind: 'block', id: 'gone' })).toBeNull()
    expect(fieldKey({ kind: 'subject' })).toBe('subject')
    expect(fieldKey({ kind: 'block', id: 't' })).toBe('block:t')
    expect(targetFrom({ kind: 'subject' }, { value: 'Hello', selectionStart: 1, selectionEnd: 3 })).toEqual({ field: { kind: 'subject' }, start: 1, end: 3 })
    expect(targetFrom({ kind: 'subject' }, { value: 'Hello', selectionStart: null, selectionEnd: null })).toEqual({ field: { kind: 'subject' }, start: 5, end: 5 })
  })

  it('knows when the preview shows tags filled with a sample', () => {
    expect(previewFilled(campaign())).toBe(false)
    expect(previewFilled(campaign({ subject: 'Hi {{first_name}}', preview_subject: 'Hi Ada' }))).toBe(true)
    expect(previewFilled(campaign({ body_html: '<p>{{first_name}}</p>', preview_html: '<p>Ada</p>' }))).toBe(true)
  })
})

describe('what Send waits for', () => {
  it('needs the draft saved, a sound segment, a subject, a body and complete buttons', () => {
    expect(sendBlockers(campaign(), false, [segment()])).toEqual([])
    expect(sendBlockers(campaign(), true, [segment()])).toEqual(['unsaved'])
    expect(sendBlockers(campaign({ segment_id: null }), false, [])).toEqual(['no_segment'])
    expect(sendBlockers(campaign(), false, [])).toEqual(['segment_gone'])
    expect(sendBlockers(campaign(), false, [segment({ problem: { index: 0, reason: 'unknown_op' } })])).toEqual(['segment_problem'])
    expect(sendBlockers(campaign({ missing: ['subject', 'body', 'button:2'] }), false, undefined)).toEqual(['subject', 'body', 'button'])
  })

  it('tests only a saved draft with a subject and a body', () => {
    expect(canTest(campaign(), false)).toBe(true)
    expect(canTest(campaign(), true)).toBe(false)
    expect(canTest(campaign({ missing: ['button:1'] }), false)).toBe(true)
    expect(canTest(campaign({ missing: ['body'] }), false)).toBe(false)
  })
})

describe('the confirmation', () => {
  const audience = (more: Partial<Audience> = {}): Audience => ({
    segment: { id: 3, name: 'Gold' }, members: 10, reached: 6, unsubscribed: 1, no_consent: 2, suppressed: 1, no_email: 0, limit: 5000, ...more,
  })

  it('names the number it will email and why the rest will not get it', () => {
    expect(confirmationOf(audience())).toEqual({
      state: 'ok', reached: 6, left_out: 4,
      reasons: [{ code: 'no_consent', count: 2 }, { code: 'unsubscribed', count: 1 }, { code: 'suppressed', count: 1 }],
    })
  })

  it('offers no Send when nobody can receive it or there are more than one campaign may reach', () => {
    expect(confirmationOf(audience({ reached: 0, members: 4 })).state).toBe('nobody')
    expect(confirmationOf(audience({ reached: 5001, members: 5001, unsubscribed: 0, no_consent: 0, suppressed: 0 })).state).toBe('over')
  })

  it('asks again for what a refusal made untrue', () => {
    expect(sendRefusalRefreshes('audience_changed')).toEqual({ audience: true, campaign: false })
    expect(sendRefusalRefreshes('already_started')).toEqual({ audience: false, campaign: true })
    expect(sendRefusalRefreshes('network')).toEqual({ audience: false, campaign: false })
  })
})
