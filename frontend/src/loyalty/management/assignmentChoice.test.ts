import { expect, it } from 'vitest'
import { assignmentChoice } from './assignmentChoice'
it('selects a real option even when every existing tier is switched off', () => {
  expect(assignmentChoice([{ id: 9, is_active: false }])).toBe('9')
  expect(assignmentChoice([{ id: 9, is_active: false }, { id: 10, is_active: true }])).toBe('10')
  expect(assignmentChoice([], undefined)).toBe('')
})
