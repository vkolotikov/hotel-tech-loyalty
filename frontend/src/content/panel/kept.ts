import type { PanelTarget } from './PanelProvider'
import { authSession } from '../../lib/authSession'

/**
 * The post panel's unsaved edits, kept in this tab's memory when the portal
 * goes away without asking: the browser's Back to the full admin unloads no
 * page, so no leave question can be asked. Coming back to the portal opens
 * the same post with the edits (PanelProvider, PostPanel). Only the same
 * session and brand get them back, once; while they are kept, closing the
 * tab asks the browser's own question.
 */
export interface Kept<T = unknown> { owner: string; target: PanelTarget; editing: T }

// This clock outlives every Content provider in the tab. A retained opening keeps
// its identity; closing/discarding it permanently fences all of its callbacks.
let openingClock = 0
const discarded = new Set<number>()
export const reserveOpening = (seq: number): number => { openingClock = Math.max(openingClock, seq); return seq }
export const allocateOpening = (): number => ++openingClock
export const openingIsLive = (seq: number): boolean => !discarded.has(seq)
export function discardOpening(owner: string, seq: number): void {
  discarded.add(seq)
  if (kept?.owner === owner && kept.target.seq === seq) dropKept()
}

let kept: Kept | null = null
type Update = (editing: unknown) => Pick<Kept, 'editing' | 'target'>
const listeners = new Set<{ owner: string; seq: number; receive: (update: Update) => void }>()

const onUnload = (e: BeforeUnloadEvent) => { if (kept?.owner.startsWith(`${authSession.token() ?? ''}|`)) e.preventDefault() }

/** Who may have kept edits back: this session's sign-in and the brand. */
export function ownerOf(brand: number | null): string {
  const token = authSession.token() ?? ''
  return `${token}|${brand ?? ''}`
}

export function keep(value: Kept): void {
  if (!openingIsLive(value.target.seq)) return
  reserveOpening(value.target.seq)
  kept = value
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', onUnload)
}

export function dropKept(): void {
  kept = null
  if (typeof window !== 'undefined') window.removeEventListener('beforeunload', onUnload)
}

/** The opening the kept edits came from, so the panel can open on it again. */
export const keptTarget = (owner?: string): PanelTarget | null => {
  if (!kept) return null
  if (owner !== undefined && kept.owner !== owner && !(owner.endsWith('|') && kept.owner.startsWith(owner))) return null
  return kept.target
}

/** The kept edits for this owner and opening, or null. The panel drops them once it has opened (dropKept). */
export function keptFor<T>(owner: string, seq: number): T | null {
  return kept && kept.owner === owner && kept.target.seq === seq ? (kept.editing as T) : null
}

/** A late acknowledgement may update its own retained draft, never the editor now on screen. */
export function updateKept<T>(owner: string, seq: number, update: (editing: T) => Pick<Kept<T>, 'editing' | 'target'>): void {
  if (!openingIsLive(seq)) return
  if (kept?.owner === owner && kept.target.seq === seq) kept = { owner, ...update(kept.editing as T) }
  listeners.forEach(listener => { if (listener.owner === owner && listener.seq === seq) listener.receive(update as Update) })
}

/** Reopening before a pending request finishes reconnects to that opening's acknowledgement. */
export function onKeptUpdate<T>(owner: string, seq: number, receive: (update: (editing: T) => Pick<Kept<T>, 'editing' | 'target'>) => void): () => void {
  const listener = { owner, seq, receive: receive as (update: Update) => void }
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
