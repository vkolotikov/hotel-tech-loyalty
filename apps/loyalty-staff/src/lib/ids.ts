import * as Crypto from 'expo-crypto'

/**
 * A fresh key for one attempt of a write the server deduplicates (`idempotency_key`): an award, a deduction, a scan, a
 * check-in. The same attempt sent again (after no answer came) carries the same key, so it never counts twice.
 */
export function freshKey(): string {
  return Crypto.randomUUID()
}
