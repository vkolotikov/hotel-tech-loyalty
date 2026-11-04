import * as SecureStore from 'expo-secure-store'
import { freshKey } from './ids'
import { failureOf } from './failure'
import type { AttemptStatus } from './api'

export interface DeskAttempt {
  key: string
  amount: number | null
  note: string
}
export interface AttemptStorage {
  getItemAsync: (key: string) => Promise<string | null>
  setItemAsync: (key: string, value: string) => Promise<void>
  deleteItemAsync: (key: string) => Promise<void>
}
/** A malformed successful HTTP response is not proof and must not clear durable recovery. */
export function recordedAttempt(value: unknown): value is Extract<AttemptStatus, { state: 'recorded' }> {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return row.state === 'recorded' && Number.isSafeInteger(row.reference) && (row.reference as number) > 0
    && typeof row.reversed === 'boolean' && typeof row.effects_pending === 'boolean'
}
/** Intentionally survives logout/restart, scoped to the organisation and operator. No tokens or passwords. */
export function attemptScope(user: number, org: number, member: number, action: string): string {
  return `staff_attempt_${user}_${org}_${member}_${action}`
}
export function outcomeUncertain(error: unknown): boolean {
  const { status, code } = failureOf(error)
  return status === 0 || status >= 500 || status === 408 || ['unknown', 'in_progress', 'key_reused'].includes(code)
}
export function attemptJournal(store: AttemptStorage = SecureStore) {
  const starting = new Map<string, Promise<DeskAttempt>>()
  return {
    async load(scope: string): Promise<DeskAttempt | null> {
      const raw = await store.getItemAsync(scope)
      if (!raw) return null
      const value = JSON.parse(raw) as DeskAttempt
      if (typeof value.key !== 'string' || !value.key || typeof value.note !== 'string'
        || (value.amount !== null && (!Number.isFinite(value.amount) || value.amount <= 0))) throw new Error('attempt_storage')
      return value
    },
    async start(scope: string, amount: number | null, note: string, resume?: DeskAttempt | null): Promise<DeskAttempt> {
      const active = starting.get(scope)
      if (active) return active
      const work = (async () => {
        const previous = await this.load(scope)
        if (previous && resume && previous.key !== resume.key) throw new Error('attempt_changed')
        if (previous) return previous
        const attempt = resume ?? { key: freshKey(), amount, note }
        // A failed durable write must prevent the network write. Do not use the best-effort prefs store.
        await store.setItemAsync(scope, JSON.stringify(attempt))
        return attempt
      })()
      starting.set(scope, work)
      try { return await work } finally { starting.delete(scope) }
    },
    async finish(scope: string): Promise<void> { await store.deleteItemAsync(scope) },
  }
}
export const deskAttempts = attemptJournal()
