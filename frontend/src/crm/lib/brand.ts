/**
 * The brand HexaTech CRM works in (owner 2026-11-09: "an option to select which organisation we are working in and see
 * its data" — the organisation's brands). One choice per device (`crm:brand`), read by `crmUrl`, which sends it as
 * `brand_id` on every call; the server decides what it may see (BrandMiddleware), and the bootstrap says which brands
 * are this person's (`brands`, `all_brands`) and which one the request was scoped to (`brand_id`).
 */
export type BrandChoice = number | 'all'

const KEY = 'crm:brand'

function stored(): BrandChoice {
  try {
    const raw = window.localStorage.getItem(KEY)
    const n = Number(raw)
    return raw && raw !== 'all' && Number.isInteger(n) && n > 0 ? n : 'all'
  } catch {
    return 'all'
  }
}

let current: BrandChoice = typeof window === 'undefined' ? 'all' : stored()

/** The choice as `brand_id` names it. */
export const brandParam = (): string => String(current)

export const currentBrand = (): BrandChoice => current

/** Remember a choice on this device (the caller refetches what is on screen). */
export function setBrand(next: BrandChoice): void {
  current = next
  try { window.localStorage.setItem(KEY, String(next)) } catch { /* a private window: the choice lasts this visit */ }
}

/**
 * The choice to keep once the bootstrap says what this person may see: their choice when it is one of their brands
 * (or all brands, where that is theirs), else the brand the server held them to, else their first brand, else all.
 */
export function settle(choice: BrandChoice, brands: readonly { id: number }[], allBrands: boolean, served: number | null): BrandChoice {
  if (choice === 'all' ? allBrands : brands.some(b => b.id === choice)) return choice
  if (served !== null && brands.some(b => b.id === served)) return served
  if (allBrands) return 'all'
  return brands[0]?.id ?? 'all'
}

/** Whether the switcher shows: more than one brand to choose from. */
export const showsSwitcher = (brands: readonly unknown[]): boolean => brands.length > 1
