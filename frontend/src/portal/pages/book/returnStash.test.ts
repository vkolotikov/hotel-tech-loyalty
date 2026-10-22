import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearReturnStash, readReturnStash, returnIdempotencyKey, stashForReturn } from './returnStash'

/** A tab's sessionStorage, in memory — the tests run under node, where there is no window. */
function fakeWindow(throwing = false) {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => { if (throwing) throw new Error('blocked'); return store.get(k) ?? null },
    setItem: (k: string, v: string) => { if (throwing) throw new Error('blocked'); store.set(k, v) },
    removeItem: (k: string) => { if (throwing) throw new Error('blocked'); store.delete(k) },
  }
  vi.stubGlobal('window', { sessionStorage: storage })
  return store
}

afterEach(() => { vi.unstubAllGlobals() })

describe('returnStash', () => {
  it('keeps only the note and the key under the intent id, and forgets them after', () => {
    const store = fakeWindow()
    stashForReturn('pi_1', { notes: 'Window seat', idempotencyKey: 'visit-key-123' })
    expect([...store.keys()]).toEqual(['portal.payReturn.pi_1'])
    expect(readReturnStash('pi_1')).toEqual({ notes: 'Window seat', idempotencyKey: 'visit-key-123' })
    expect(readReturnStash('pi_2')).toEqual({})
    clearReturnStash('pi_1')
    expect(readReturnStash('pi_1')).toEqual({})
  })

  it('never throws when storage is blocked, and anything odd in it reads as nothing', () => {
    fakeWindow(true)
    expect(() => stashForReturn('pi_1', { notes: 'x' })).not.toThrow()
    expect(readReturnStash('pi_1')).toEqual({})
    expect(() => clearReturnStash('pi_1')).not.toThrow()

    const store = fakeWindow()
    store.set('portal.payReturn.pi_3', '{"notes": 7, "idempotencyKey": ["x"], "total": 1}')
    expect(readReturnStash('pi_3')).toEqual({ notes: undefined, idempotencyKey: undefined })
    store.set('portal.payReturn.pi_4', 'not json')
    expect(readReturnStash('pi_4')).toEqual({})
  })

  it('with no window at all, there is simply nothing kept', () => {
    expect(readReturnStash('pi_1')).toEqual({})
  })
})

describe('returnIdempotencyKey', () => {
  it('is the visit\'s own key when this tab kept it, else one derived from the intent (a reload replays)', () => {
    expect(returnIdempotencyKey('pi_1', { idempotencyKey: 'visit-key-123' })).toBe('visit-key-123')
    expect(returnIdempotencyKey('pi_1', {})).toBe('return-pi_1')
    expect(returnIdempotencyKey('pi_1', { idempotencyKey: 'short' })).toBe('return-pi_1')
    expect(returnIdempotencyKey(`pi_${'x'.repeat(120)}`, {}).length).toBeLessThanOrEqual(80)
  })
})
