import { describe, expect, it, vi } from 'vitest'
vi.mock('expo-crypto', () => ({ randomUUID: () => 'test-attempt-key' }))
vi.mock('expo-secure-store', () => ({}))
import { attemptJournal, attemptScope, outcomeUncertain, type AttemptStorage } from './attempts'
import { ApiError, failureFrom } from './failure'
import { purchaseAmount } from './desk'
import { queueCounts, uniqueRows } from './queue'
import { lockAtLaunch, lockOnReturn, LOCK_AFTER_MS } from './lock'

describe('device lock', () => {
  it('requires unlock on cold launch and after the timeout, never for a signed-out session', () => {
    expect(lockAtLaunch(true, true)).toBe(true)
    expect(lockAtLaunch(false, true)).toBe(false)
    expect(lockAtLaunch(true, false)).toBe(false)
    expect(lockOnReturn(true, true, 1000, 1000 + LOCK_AFTER_MS)).toBe(true)
    expect(lockOnReturn(true, true, 1000, 1000 + LOCK_AFTER_MS - 1)).toBe(false)
    expect(lockOnReturn(true, false, 1000, 999999)).toBe(false)
    expect(lockOnReturn(true, true, null, 999999)).toBe(false)
  })
})

describe('desk input', () => {
  it('separates an omitted purchase from invalid money and never rounds input', () => {
    expect(purchaseAmount('', 'GBP')).toBeNull()
    expect(purchaseAmount('12,50', 'EUR')).toBe(12.5)
    expect(purchaseAmount('12.50', 'GBP')).toBe(12.5)
    for (const value of ['-5', '0', '1e3', '1,000.00', 'NaN', '12.345', '1000000.01']) expect(purchaseAmount(value, 'GBP'), value).toBe('invalid')
    expect(purchaseAmount('100.5', 'JPY')).toBe('invalid')
    expect(purchaseAmount('100', 'JPY')).toBe(100)
  })
})

describe('request coverage', () => {
  it('includes waiting benefits, approved benefits and pending rewards in the open total', () => {
    expect(queueCounts({ waiting: 1, approved: 4, done: 9 }, 2)).toEqual({ waiting: 3, approved: 4, open: 7 })
  })
  it('keeps every page while de-duplicating rows moved by a concurrent update', () => {
    const first = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }))
    const second = [{ id: 25 }, { id: 26 }]
    expect(uniqueRows([...first, ...second])).toHaveLength(26)
  })
})

describe('durable transaction retries', () => {
  const memory = (): AttemptStorage => {
    const saved = new Map<string, string>()
    return { getItemAsync: async key => saved.get(key) ?? null, setItemAsync: async (key, value) => { saved.set(key, value) }, deleteItemAsync: async key => { saved.delete(key) } }
  }
  it('restores the exact key and payload after closing/restarting, even when the next form differs', async () => {
    const storage = memory()
    const scope = attemptScope(1, 2, 3, 'award')
    const first = await attemptJournal(storage).start(scope, 10, 'Visit')
    const reopened = attemptJournal(storage)
    expect(await reopened.start(scope, 100, 'Changed')).toEqual(first)
    expect(await reopened.load(attemptScope(2, 2, 3, 'award'))).toBeNull()
    expect(await reopened.load(attemptScope(1, 9, 3, 'award'))).toBeNull()
    expect(await reopened.load(attemptScope(1, 2, 3, 'redeem'))).toBeNull()
    await reopened.finish(scope)
    expect(await reopened.load(scope)).toBeNull()
  })
  it('stops before sending when durable storage fails', async () => {
    const store = memory()
    store.setItemAsync = async () => { throw new Error('keystore unavailable') }
    await expect(attemptJournal(store).start('scope', 5, 'Visit')).rejects.toThrow('keystore unavailable')
  })
  it('serializes simultaneous starts so only one payload and key can be sent', async () => {
    const journal = attemptJournal(memory())
    const [first, second] = await Promise.all([journal.start('scope', 10, 'Visit'), journal.start('scope', 100, 'Changed')])
    expect(second).toEqual(first)
    expect(first.amount).toBe(10)
  })
  it('never creates a fresh key for a restored form when another response has already cleared storage', async () => {
    const journal = attemptJournal(memory())
    const first = await journal.start('scope', 10, 'Visit')
    await journal.finish('scope')
    expect(await journal.start('scope', 100, 'Changed', first)).toEqual(first)
  })
  it('does not generate a new key over damaged stored state', async () => {
    const store = memory()
    await store.setItemAsync('scope', '{broken')
    await expect(attemptJournal(store).start('scope', 5, 'Visit')).rejects.toThrow()
  })
  it('retains attempts on timeouts, server errors and in-progress answers', () => {
    for (const status of [0, 408, 500, 502, 503]) expect(outcomeUncertain(new ApiError(failureFrom(status, null)))).toBe(true)
    expect(outcomeUncertain(new ApiError(failureFrom(409, { error: 'in_progress' })))).toBe(true)
    expect(outcomeUncertain(new ApiError(failureFrom(422, { errors: { amount: ['invalid'] } })))).toBe(false)
    expect(outcomeUncertain(new ApiError(failureFrom(403, { error: 'not_allowed' })))).toBe(false)
  })
})
