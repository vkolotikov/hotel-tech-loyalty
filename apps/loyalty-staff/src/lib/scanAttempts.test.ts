import { describe, expect, it, vi } from 'vitest'
import { scanCanRetry, scanJournal, scanScope } from './scanAttempts'
import type { AttemptStorage } from './attempts'
vi.mock('expo-crypto', () => ({ randomUUID: () => 'scan-fixture-key' }))
vi.mock('expo-secure-store', () => ({}))

const memory = (): AttemptStorage => {
  const values = new Map<string, string>()
  return { getItemAsync: async key => values.get(key) ?? null, setItemAsync: async (key, value) => { values.set(key, value) }, deleteItemAsync: async key => { values.delete(key) } }
}
describe('interrupted scan recovery', () => {
  it('restores code, place and original key/time after restart without overwriting an unresolved scan', async () => {
    const storage = memory()
    const scope = scanScope(2, 4)
    const saved = await scanJournal(storage).start(scope, 'card-fixture', { kind: 'event', id: 8, name: 'Evening' }, 1000)
    const restarted = scanJournal(storage)
    expect(await restarted.start(scope, 'other-card', { kind: 'desk' }, 9000)).toEqual(saved)
    expect(await restarted.load(scanScope(3, 4))).toBeNull()
    expect(await restarted.load(scanScope(2, 5))).toBeNull()
    await restarted.finish(scope, saved.key)
    expect(await restarted.load(scope)).toBeNull()
  })
  it('stops retries before cache expiry and refuses a backwards clock', async () => {
    const attempt = await scanJournal(memory()).start('scope', 'fixture', { kind: 'desk' }, 1000)
    expect(scanCanRetry(attempt, 1000)).toBe(true)
    expect(scanCanRetry(attempt, 1000 + 9 * 60_000 - 1)).toBe(true)
    expect(scanCanRetry(attempt, 1000 + 9 * 60_000)).toBe(false)
    expect(scanCanRetry(attempt, 999)).toBe(false)
  })
  it('fails closed on corrupt storage or a failed save', async () => {
    const storage = memory()
    await storage.setItemAsync('bad', '{')
    await expect(scanJournal(storage).start('bad', 'fixture', { kind: 'desk' }, 1000)).rejects.toThrow()
    await storage.setItemAsync('bad', JSON.stringify({ key: 'x', code: 'x', at: 1, where: { kind: 'event', id: -1 } }))
    await expect(scanJournal(storage).load('bad')).rejects.toThrow()
    storage.setItemAsync = async () => { throw new Error('storage unavailable') }
    await expect(scanJournal(storage).start('new', 'fixture', { kind: 'desk' }, 1000)).rejects.toThrow('storage unavailable')
  })
  it('serializes simultaneous reads and will not clear another attempt', async () => {
    const journal = scanJournal(memory())
    const [first, second] = await Promise.all([
      journal.start('scope', 'one', { kind: 'desk' }, 1000),
      journal.start('scope', 'two', { kind: 'place', id: 1, name: 'Door' }, 1001),
    ])
    expect(first).toEqual(second)
    await expect(journal.finish('scope', 'wrong-key')).rejects.toThrow('attempt_changed')
    expect(await journal.load('scope')).toEqual(first)
  })
})
