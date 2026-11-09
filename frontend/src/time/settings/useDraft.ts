import { useState } from 'react'

/**
 * A form's draft over a saved value (the bootstrap's settings, which reload after a save): what the form shows,
 * whether it differs from what is saved, and the step after a save. A sent draft stays on screen until the reloaded
 * settings arrive (no flash of the old value); edits made meanwhile are kept. `saved` must keep its identity while it
 * is unchanged (memoise it on the bootstrap's own objects, which react-query shares structurally).
 */
export function useDraft<T>(saved: T, same: (a: T, b: T) => boolean): {
  value: T
  dirty: boolean
  set: (next: T | ((current: T) => T)) => void
  reset: () => void
  /** After a successful save of `sent`: keep showing it until the saved value moves on. */
  sent: (sent: T) => void
} {
  const [draft, setDraft] = useState<T | null>(null)
  const [pending, setPending] = useState<{ basis: T; sent: T } | null>(null)

  // Adjusting state while rendering (React's pattern for "information from previous renders"), guarded so it settles.
  if (pending && pending.basis !== saved) {
    setPending(null)
    if (draft === pending.sent) setDraft(null)
  } else if (!pending && draft !== null && same(draft, saved)) {
    setDraft(null)
  }

  const value = draft ?? saved
  const waiting = pending !== null && draft === pending.sent
  return {
    value,
    dirty: draft !== null && !waiting && !same(draft, saved),
    set: next => setDraft(current => (typeof next === 'function' ? (next as (c: T) => T)(current ?? saved) : next)),
    reset: () => { setDraft(null); setPending(null) },
    sent: sentValue => setPending({ basis: saved, sent: sentValue }),
  }
}
