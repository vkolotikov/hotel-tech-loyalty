import { failureOf } from './api'
import type { Bootstrap } from './types'

/** Where this device keeps the brand the portal works on (spec §6.7). */
export const BRAND_KEY = 'content:brand'
/** The full admin's brand switcher's own record (src/stores/brandStore.ts, persisted as `loyalty-brand`). */
const ADMIN_BRAND_KEY = 'loyalty-brand'

export type BrandStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** This window's storage, or null where there is none (a private window that refuses it, the tests). */
export function deviceStorage(): BrandStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const positiveId = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * The brand to ask the bootstrap for: the one this device used here last,
 * else the full admin's current choice ("All brands" is not one), else none —
 * the server then answers with the person's default brand.
 */
export function storedBrand(storage: BrandStorage | null): number | null {
  if (!storage) return null
  try {
    const own = positiveId(storage.getItem(BRAND_KEY))
    if (own !== null) return own
    const admin = JSON.parse(storage.getItem(ADMIN_BRAND_KEY) ?? 'null') as { state?: { currentBrandId?: unknown } } | null
    return positiveId(admin?.state?.currentBrandId)
  } catch {
    return null
  }
}

/** The brand to ask for first: the one a shared post link names (`?brand_id=`), else this device's own choice. */
export function firstBrand(search: string, storage: BrandStorage | null): number | null {
  return positiveId(new URLSearchParams(search).get('brand_id')) ?? storedBrand(storage)
}

export function rememberBrand(storage: BrandStorage | null, id: number): void {
  try { storage?.setItem(BRAND_KEY, String(id)) } catch { /* the choice lasts this visit */ }
}

export function forgetBrand(storage: BrandStorage | null): void {
  try { storage?.removeItem(BRAND_KEY) } catch { /* nothing to forget */ }
}

/**
 * The bootstrap for the brand this device asks for. A brand this person may
 * no longer use (a re-assigned staff member) is forgotten and their default
 * brand asked for instead; every other refusal is the caller's to show.
 */
export async function loadBootstrap(
  asked: number | null,
  storage: BrandStorage | null,
  fetch: (brand: number | null) => Promise<Bootstrap>,
): Promise<Bootstrap> {
  try {
    return await fetch(asked)
  } catch (error) {
    if (asked === null || failureOf(error).code !== 'brand_not_allowed') throw error
    forgetBrand(storage)
    return fetch(null)
  }
}
