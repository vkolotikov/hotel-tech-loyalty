import { describe, expect, it } from 'vitest'
import { newForm, type Editing } from './panelState'
import { completedSave, hasPendingEdits, needsDraftProtection, sameOpening, sameBrandPlaceholder } from './draftCompletion'

const base = newForm({ date: null, platform: null }, ['instagram'])
describe('submitted snapshots and ownership', () => {
  it('keeps intentional undo to the old base while Save is pending', () => {
    const submitted = { ...base, hook: 'submitted' }
    const editing: Editing = { base, draft: base, post: null }
    expect(hasPendingEdits(editing, submitted)).toBe(true)
    expect(completedSave(editing, submitted, { ...submitted, hook: 'server' }).hook).toBe('')
  })
  it('takes normalized server fields but retains later typing', () => {
    const submitted = { ...base, hook: 'sent' }
    expect(completedSave({ base, draft: { ...submitted, main_copy: 'later' }, post: null }, submitted, { ...submitted, hook: 'normalized' }))
      .toMatchObject({ hook: 'normalized', main_copy: 'later' })
  })
  it('requires the same session, brand and editor opening', () => {
    expect(sameOpening('session|3', 1, 'session|3', 1)).toBe(true)
    expect(sameOpening('session|3', 1, 'session|4', 1)).toBe(false)
    expect(sameOpening('session|3', 1, 'other|3', 1)).toBe(false)
    expect(sameOpening('session|3', 1, 'session|3', 2)).toBe(false)
  })
  it('retains pagination placeholders only within their brand', () => {
    expect(sameBrandPlaceholder(3, ['content', 4, 'posts'], ['old'])).toBeUndefined()
    expect(sameBrandPlaceholder(3, ['content', 3, 'posts'], ['own'])).toEqual(['own'])
  })
})


it('protects an unchanged submission independently of dirty field differences until acknowledgement', () => {
  const editing: Editing = { base, draft: base, post: null }
  expect(hasPendingEdits(editing, base)).toBe(false)
  expect(needsDraftProtection(editing, base)).toBe(true)
  expect(needsDraftProtection(editing, null)).toBe(false)
  expect(needsDraftProtection({ ...editing, draft: { ...base, hook: 'later' } }, null)).toBe(true)
})
