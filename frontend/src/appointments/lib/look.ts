import { useState, useSyncExternalStore } from 'react'
import type { ThemeName } from '../theme/accent'

/**
 * How the workspace looks on this device: the theme a person picked (spec
 * D2, D6 — Light by default; Auto follows the device) and the side panel's
 * size. Kept apart from `appointments:prefs`, which the calendar writes
 * whole, so the two never overwrite each other.
 */
export type ThemePref = 'light' | 'dark' | 'auto'
export type RailSize = 'full' | 'slim'
export interface Look { theme: ThemePref; rail: RailSize }

export const DEFAULT_LOOK: Look = { theme: 'light', rail: 'full' }

const KEY = 'appointments:look'
const THEMES: readonly string[] = ['light', 'dark', 'auto']
const RAILS: readonly string[] = ['full', 'slim']
const QUERY = '(prefers-color-scheme: dark)'

export function parseLook(raw: string | null): Look {
  let value: unknown
  try {
    value = raw ? JSON.parse(raw) : null
  } catch {
    value = null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_LOOK
  const v = value as Record<string, unknown>
  return {
    theme: typeof v.theme === 'string' && THEMES.includes(v.theme) ? (v.theme as ThemePref) : DEFAULT_LOOK.theme,
    rail: typeof v.rail === 'string' && RAILS.includes(v.rail) ? (v.rail as RailSize) : DEFAULT_LOOK.rail,
  }
}

export function loadLook(): Look {
  try {
    return parseLook(window.localStorage.getItem(KEY))
  } catch {
    return DEFAULT_LOOK
  }
}

export function saveLook(look: Look): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(look))
  } catch {
    /* a private window or a full store: the choice simply is not kept */
  }
}

/**
 * The organisation's accent and mark as this device last saw them, so the
 * frame is painted in them from the first frame of the next visit instead of
 * the fallback blue and an "H" until the bootstrap arrives. Its own key and
 * its own parse: a damaged value is simply no memory, never an error.
 */
export interface Brand { accent: string; initial: string }

const BRAND_KEY = 'appointments:brand'

export function parseBrand(raw: string | null): Brand | null {
  let value: unknown
  try {
    value = raw ? JSON.parse(raw) : null
  } catch {
    value = null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (typeof v.accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.accent)) return null
  if (typeof v.initial !== 'string') return null
  const initial = v.initial.trim()
  // One letter or one emoji (firstLetter); the few code points of headroom cover a letter that upper-cases to two.
  const length = Array.from(initial).length
  if (length < 1 || length > 4) return null
  return { accent: v.accent.toLowerCase(), initial }
}

export function loadBrand(): Brand | null {
  try {
    return parseBrand(window.localStorage.getItem(BRAND_KEY))
  } catch {
    return null
  }
}

export function saveBrand(brand: Brand): void {
  try {
    window.localStorage.setItem(BRAND_KEY, JSON.stringify({ accent: brand.accent, initial: brand.initial }))
  } catch {
    /* a private window or a full store: the next visit simply starts from the fallback */
  }
}

/** Saves the brand when it differs from what is stored; a bootstrap that changes nothing writes nothing. */
export function rememberBrand(brand: Brand): void {
  const stored = loadBrand()
  if (stored && stored.accent === brand.accent && stored.initial === brand.initial) return
  saveBrand(brand)
}

export function resolveTheme(pref: ThemePref, systemDarkNow: boolean): ThemeName {
  return pref === 'auto' ? (systemDarkNow ? 'dark' : 'light') : pref
}

function media(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null
}

export function subscribeSystemDark(onChange: () => void): () => void {
  const mq = media()
  if (!mq) return () => {}
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

export function systemDark(): boolean {
  return media()?.matches ?? false
}

export function useLook(): Look & { resolved: ThemeName; setTheme: (t: ThemePref) => void; setRail: (r: RailSize) => void } {
  const [look, setLook] = useState<Look>(loadLook)
  // The device's answer on the server render too: without a window it is simply false.
  const dark = useSyncExternalStore(subscribeSystemDark, systemDark, systemDark)
  const update = (patch: Partial<Look>) => {
    const next = { ...look, ...patch }
    saveLook(next)
    setLook(next)
  }
  return {
    ...look,
    resolved: resolveTheme(look.theme, dark),
    setTheme: (theme) => update({ theme }),
    setRail: (rail) => update({ rail }),
  }
}
