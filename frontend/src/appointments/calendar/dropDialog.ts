/**
 * Small rules of the drag and its drop dialog (polish pass), kept out of the
 * components so they can be tested on their own.
 */

export interface EscapeLike { key: string; defaultPrevented: boolean; preventDefault: () => void }

/**
 * A drag and the drop dialog listen for Escape before the panel does (the
 * capture phase) and mark it as theirs, so an open panel stays open. A save
 * in flight is never cancelled by it.
 */
export function claimEscape(e: EscapeLike, cancel: () => void, busy = false): void {
  if (e.key !== 'Escape') return
  e.preventDefault()
  if (!busy) cancel()
}

/** The panel closes on an Escape nothing else claimed. */
export const panelClosesOn = (e: { key: string; defaultPrevented: boolean }): boolean => e.key === 'Escape' && !e.defaultPrevented

/** Tell the client only for a move, when the box is ticked and their details loaded. */
export const dropNotify = (p: { moving: boolean; tell: boolean; detailsFailed: boolean }): boolean => p.moving && p.tell && !p.detailsFailed

/**
 * A move to another person with no length set by staff takes that person's
 * normal length for the service (Part F, R1): the dialog says so. Unknown
 * until the appointment's details have loaded.
 */
export function lengthNote(p: { moving: boolean; from: number | null | undefined; to: number; lengthSetByStaff: boolean | undefined }): boolean {
  return p.moving && p.from !== p.to && p.lengthSetByStaff === false
}
