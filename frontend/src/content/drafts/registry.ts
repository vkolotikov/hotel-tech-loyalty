import { authSession } from '../../lib/authSession'

/** Tab-memory only. Keys include the authenticated session and brand; nothing reaches storage. */
export class DraftRegistry {
  private entries = new Map<string, { value: unknown; base: unknown; dirty: boolean; ticket: number }>()
  private sequence = 0
  private listeners = new Set<() => void>()
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private emit() { this.listeners.forEach(listener => listener()) }
  read<T>(key: string, initial: () => T): T {
    if (!this.entries.has(key)) { const value = initial(); this.entries.set(key, { value, base: value, dirty: false, ticket: ++this.sequence }) }
    return this.entries.get(key)!.value as T
  }
  write<T>(key: string, value: T, tracked = true) {
    const entry = this.entries.get(key)
    const base = entry ? entry.base : value
    this.entries.set(key, { value, base, ticket: entry?.ticket ?? ++this.sequence, dirty: tracked && value !== null && JSON.stringify(value) !== JSON.stringify(base) })
    this.emit()
  }
  acknowledge<T>(key: string, submitted: T) {
    const entry = this.entries.get(key)
    if (entry) { entry.base = submitted; entry.dirty = entry.value !== null && JSON.stringify(entry.value) !== JSON.stringify(submitted); this.emit() }
  }
  adoptIfClean<T>(key: string, authoritative: T) {
    const entry = this.entries.get(key)
    if (!entry || entry.dirty || JSON.stringify(entry.value) === JSON.stringify(authoritative)) return
    entry.value = authoritative
    entry.base = authoritative
    this.emit()
  }
  dirty(owner?: string) { return [...this.entries].some(([key, entry]) => (!owner || key.startsWith(owner + '::')) && entry.dirty) }
  dirtySession(session: string) { return [...this.entries].some(([key, entry]) => key.startsWith(session + '|') && entry.dirty) }
  ticket(key: string) { return this.entries.get(key)?.ticket }
  owns(key: string, ticket: number | undefined) { return ticket !== undefined && this.ticket(key) === ticket }
  clear(owner: string) { for (const key of this.entries.keys()) if (key.startsWith(owner + '::')) this.entries.delete(key); this.emit() }
  clearSession(session: string) { for (const key of this.entries.keys()) if (key.startsWith(session + '|')) this.entries.delete(key); this.emit() }
  remove(key: string) { this.entries.delete(key); this.emit() }
}
export const contentDrafts = new DraftRegistry()
if (typeof window !== 'undefined') window.addEventListener('beforeunload', event => { if (contentDrafts.dirtySession(authSession.token() ?? '')) event.preventDefault() })
