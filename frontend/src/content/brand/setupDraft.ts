/** Where a manager is in Guided setup, per brand on this device (spec §7 F6): `content:setup-draft:{brand}`. */
interface StorageLike { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void }

const keyOf = (brand: number | null) => `content:setup-draft:${brand ?? 'default'}`
const device = (): StorageLike | null => (typeof window === 'undefined' ? null : window.localStorage)

export function loadSetupStep(brand: number | null, storage: StorageLike | null = device()): number | null {
  try {
    const step = Number(storage?.getItem(keyOf(brand)) ?? NaN)
    return Number.isInteger(step) && step >= 0 ? step : null
  } catch {
    return null
  }
}

export function saveSetupStep(brand: number | null, step: number, storage: StorageLike | null = device()): void {
  try { storage?.setItem(keyOf(brand), String(step)) } catch { /* no storage: the place is not kept */ }
}

export function clearSetupStep(brand: number | null, storage: StorageLike | null = device()): void {
  try { storage?.removeItem(keyOf(brand)) } catch { /* nothing to forget */ }
}
