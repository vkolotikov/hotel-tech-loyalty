import type { OwnNote, Signal } from './alertsLogic'

/**
 * What the person did in this window that the alerts' next poll will count (round 5: no alert for one's own actions).
 * A page notes it as the request leaves — a lead captured from a chat raises the hot leads — and takes the note back
 * if the request fails; the alerts count each note once against a rise, and forget it after a minute.
 */
let notes: OwnNote[] = []

export function noteOwnAction(signal: Signal, now: number = Date.now()): () => void {
  const note: OwnNote = { signal, at: now }
  notes = [...notes, note]
  return () => { notes = notes.filter(n => n !== note) }
}

export function ownNotes(): OwnNote[] {
  return notes
}

export function keepOwnNotes(rest: OwnNote[]): void {
  notes = rest
}
