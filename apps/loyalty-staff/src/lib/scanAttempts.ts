import * as SecureStore from 'expo-secure-store'
import type { AttemptStorage } from './attempts'
import type { ScanWhere } from './scanState'
import { freshKey } from './ids'

export interface ScanAttempt { key: string; code: string; where: ScanWhere; at: number }
// Leave a minute for transit before the server's ten-minute replay expires. Never extend on retry.
export function scanCanRetry(attempt: ScanAttempt, now: number): boolean {
  return now >= attempt.at && now - attempt.at < 9 * 60_000
}
export function scanScope(user: number, org: number): string { return `staff_scan_${user}_${org}` }
/** Codes are credentials: encrypted device storage only, never logs or general preferences. */
export function scanJournal(store: AttemptStorage = SecureStore) {
  const starting = new Map<string, Promise<ScanAttempt>>()
  return {
    async load(scope: string): Promise<ScanAttempt | null> {
      const raw = await store.getItemAsync(scope)
      if (!raw) return null
      const value = JSON.parse(raw) as ScanAttempt
      const where = value?.where
      if (!value || typeof value.key !== 'string' || !value.key || typeof value.code !== 'string' || !value.code
        || !Number.isFinite(value.at) || value.at <= 0 || !where || !['desk', 'place', 'event'].includes(where.kind)
        || (where.kind !== 'desk' && (!Number.isSafeInteger(where.id) || where.id <= 0 || typeof where.name !== 'string'))) throw new Error('attempt_storage')
      return value
    },
    async start(scope: string, code: string, where: ScanWhere, now: number): Promise<ScanAttempt> {
      const active = starting.get(scope)
      if (active) return active
      const work = (async () => {
        const old = await this.load(scope)
        if (old) return old
        const attempt = { code, where, at: now, key: freshKey() }
        await store.setItemAsync(scope, JSON.stringify(attempt))
        return attempt
      })()
      starting.set(scope, work)
      try { return await work } finally { starting.delete(scope) }
    },
    async finish(scope: string, key: string): Promise<void> {
      const old = await this.load(scope)
      if (old && old.key !== key) throw new Error('attempt_changed')
      await store.deleteItemAsync(scope)
    },
  }
}
export const scanAttempts = scanJournal()
