/** How long the drop dialog waits for the calendar to be fetched again after a saved move. */
export const REFETCH_WAIT_MS = 3000

/**
 * Saves a drop and fetches the calendar again before it resolves, so the drop
 * dialog closes on the card already at its new place (polish F6). The wait is
 * bounded: the move is saved, and a stalled fetch must not hold "Saving…" with
 * Cancel disabled; the next poll brings the calendar up to date. A refused
 * move still fetches again (the calendar shows what is true) and then throws
 * for the dialog to show.
 */
export async function saveDrop(p: { move: () => Promise<unknown>; refetch: () => Promise<unknown>; waitMs?: number }): Promise<void> {
  try {
    await p.move()
  } finally {
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      p.refetch(),
      new Promise<void>(resolve => { timer = setTimeout(resolve, p.waitMs ?? REFETCH_WAIT_MS) }),
    ])
    clearTimeout(timer)
  }
}
