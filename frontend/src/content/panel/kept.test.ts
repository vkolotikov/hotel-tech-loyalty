import { afterEach, describe, expect, it } from 'vitest'
import { allocateOpening, discardOpening, dropKept, keep, keptFor, keptTarget, onKeptUpdate, updateKept } from './kept'
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
    expect(keptTarget('other|3')).toBeNull()
    expect(keptTarget('token|7')).toBeNull()
    expect(keptTarget('token|')).toEqual(target)
  })

  it('reconnects a pending acknowledgement only to its original opening', () => {
    let received = 0
    const stop = onKeptUpdate('token|3', 4, () => { received++ })
    updateKept('other|3', 4, held => ({ target, editing: held }))
    updateKept('token|3', 5, held => ({ target, editing: held }))
    expect(received).toBe(0)
    updateKept('token|3', 4, held => ({ target, editing: held }))
    expect(received).toBe(1)
    stop()
    updateKept('token|3', 4, held => ({ target, editing: held }))
    expect(received).toBe(1)
  })
})


describe('opening lifetimes', () => {
  it('allocates different identities across provider lifetimes and reserves retained ones', () => {
    const first = allocateOpening()
    const retained = first + 100 // an explicitly supplied initial/retained identity
    keep({ owner: 'token|3', target: { ...target, seq: retained }, editing })
    expect(keptTarget('token|3')?.seq).toBe(retained)
    dropKept() // restoration consumes the retained draft, not its identity
    expect(allocateOpening()).toBeGreaterThan(retained)
  })
  it('never retains or broadcasts a discarded opening, including an old unmount cleanup', () => {
    const seq = allocateOpening()
    const opening = { ...target, seq }
    let received = 0
    const stop = onKeptUpdate('token|3', seq, () => { received++ })
    keep({ owner: 'token|3', target: opening, editing })
    discardOpening('token|3', seq)
    keep({ owner: 'token|3', target: opening, editing })
    updateKept('token|3', seq, held => ({ target: opening, editing: held }))
    expect(keptTarget()).toBeNull()
    expect(received).toBe(0)
    stop()
  })
})
