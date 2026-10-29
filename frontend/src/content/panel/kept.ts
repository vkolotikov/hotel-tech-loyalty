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

let kept: Kept | null = null

const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault() }

/** Who may have kept edits back: this session's sign-in and the brand. */
export function ownerOf(brand: number | null): string {
  const token = authSession.token() ?? ''
  return `${token}|${brand ?? ''}`
}

export function keep(value: Kept): void {
  kept = value
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', onUnload)
}

export function dropKept(): void {
  kept = null
  if (typeof window !== 'undefined') window.removeEventListener('beforeunload', onUnload)
}

/** The opening the kept edits came from, so the panel can open on it again. */
export const keptTarget = (): PanelTarget | null => kept?.target ?? null

/** The kept edits for this owner and opening, or null. The panel drops them once it has opened (dropKept). */
export function keptFor<T>(owner: string, seq: number): T | null {
  return kept && kept.owner === owner && kept.target.seq === seq ? (kept.editing as T) : null
}
