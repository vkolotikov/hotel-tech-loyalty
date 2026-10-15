import { afterEach, describe, expect, it } from 'vitest'
import { dropKept, keep, keptFor, keptTarget } from './kept'
import type { PanelTarget } from './PanelProvider'

const target: PanelTarget = { kind: 'post', id: 5, seq: 4 }
const editing = { base: { hook: 'Old' }, draft: { hook: 'Typed' }, post: null }

afterEach(() => dropKept())

// Leaving the portal by the browser's Back (no page unload, so no leave question) keeps the panel's
// unsaved edits in this tab's memory; coming back hands them to the panel again.
describe('kept edits', () => {
  it('are handed back to the same session and brand, for the opening they came from, until dropped', () => {
    keep({ owner: 'token|3', target, editing })
    expect(keptTarget()).toEqual(target)
    expect(keptFor('token|3', 4)).toEqual(editing)
    expect(keptFor('token|3', 5)).toBeNull()
    dropKept()
    expect(keptFor('token|3', 4)).toBeNull()
    expect(keptTarget()).toBeNull()
  })

  it('are given to no other session or brand', () => {
    keep({ owner: 'token|3', target, editing })
    expect(keptFor('other|3', 4)).toBeNull()
    expect(keptFor('token|7', 4)).toBeNull()
  })
})
