/**
 * Release 4, part C. What the browser keeps for itself across a bank redirect, under the payment intent's id, in
 * this tab's `sessionStorage`: only what is neither money nor the booking's target — the member's own note (an
 * appointment's notes, a stay's special requests) and an appointment confirm's `Idempotency-Key`. Everything that
 * decides what is booked and what it costs comes back from the server (`portalApi.paymentReturn`). When the bank
 * opens a new tab, or storage is blocked, this is simply empty: the booking still goes through, without the note,
 * and the key falls back to one derived from the intent id (`returnIdempotencyKey`).
 *
 * Every access is wrapped: a private window, blocked site data or a preview can throw on `sessionStorage` itself.
 */
export interface ReturnStash {
  notes?: string
  idempotencyKey?: string
}

const key = (paymentIntentId: string) => `portal.payReturn.${paymentIntentId}`

export function stashForReturn(paymentIntentId: string, stash: ReturnStash): void {
  try {
    window.sessionStorage.setItem(key(paymentIntentId), JSON.stringify(stash))
  } catch {
    // Nothing to keep the note in: the return books without it.
  }
}

export function readReturnStash(paymentIntentId: string): ReturnStash {
  try {
    const raw = window.sessionStorage.getItem(key(paymentIntentId))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object') return {}
    const p = parsed as Record<string, unknown>
    return {
      notes: typeof p.notes === 'string' ? p.notes : undefined,
      idempotencyKey: typeof p.idempotencyKey === 'string' ? p.idempotencyKey : undefined,
    }
  } catch {
    return {}
  }
}

export function clearReturnStash(paymentIntentId: string): void {
  try {
    window.sessionStorage.removeItem(key(paymentIntentId))
  } catch {
    // Nothing was kept.
  }
}

/** The appointment confirm's `Idempotency-Key` on the return: the visit's own, when this tab kept it, else one
 *  derived from the intent id (8–80 characters), so a reload of the return page replays the same booking. */
export function returnIdempotencyKey(paymentIntentId: string, stash: ReturnStash): string {
  const kept = stash.idempotencyKey
  if (kept && kept.length >= 8 && kept.length <= 80) return kept
  return `return-${paymentIntentId}`.slice(0, 80)
}
