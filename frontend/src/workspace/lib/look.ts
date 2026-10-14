import { useState, useSyncExternalStore } from 'react'
import type { ThemeName } from '../theme/accent'

/**
 * How a workspace looks on this device: the theme a person picked (Light by
 * default; Auto follows the device), the side panel's size, and the
 * organisation's accent and mark as this device last saw them (its "paint"),
 * so the frame is painted in them from the first frame of the next visit
 * instead of the fallback blue and an "H". Each workspace keeps these under
 * keys of its own (`LookKeys`), so a choice in one never changes another, and
 * apart from anything else it stores, which it may write whole.
 */
export type ThemePref = 'light' | 'dark' | 'auto'
export type RailSize = 'full' | 'slim'
export interface Look { theme: ThemePref; rail: RailSize }
/** The organisation's accent (#rrggbb) and mark (one letter or one emoji) as this device last saw them. */
export interface Paint { accent: string; initial: string }
/** Where a workspace keeps its look and its paint in localStorage. */
export interface LookKeys { look: string; paint: string }
/** The look as a frame draws and changes it: what useLook answers. */
export type LiveLook = Look & { resolved: ThemeName; setTheme: (theme: ThemePref) => void; setRail: (rail: RailSize) => void }

export const DEFAULT_LOOK: Look = { theme: 'light', rail: 'full' }

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

export function loadLook(keys: LookKeys): Look {
  try {
    return parseLook(window.localStorage.getItem(keys.look))
  } catch {
    return DEFAULT_LOOK
  }
}

export function saveLook(keys: LookKeys, look: Look): void {
  try {
    window.localStorage.setItem(keys.look, JSON.stringify(look))
  } catch {
    /* a private window or a full store: the choice simply is not kept */
  }
}

/** A damaged value is simply no memory, never an error. */
export function parsePaint(raw: string | null): Paint | null {
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

export function loadPaint(keys: LookKeys): Paint | null {
  try {
    return parsePaint(window.localStorage.getItem(keys.paint))
  } catch {
    return null
  }
}

export function savePaint(keys: LookKeys, paint: Paint): void {
  try {
    window.localStorage.setItem(keys.paint, JSON.stringify({ accent: paint.accent, initial: paint.initial }))
  } catch {
    /* a private window or a full store: the next visit simply starts from the fallback */
  }
}

/** Saves the paint when it differs from what is stored; a bootstrap that changes nothing writes nothing. */
export function rememberPaint(keys: LookKeys, paint: Paint): void {
  const stored = loadPaint(keys)
  if (stored && stored.accent === paint.accent && stored.initial === paint.initial) return
  savePaint(keys, paint)
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

export function useLook(keys: LookKeys): LiveLook {
  const [look, setLook] = useState<Look>(() => loadLook(keys))
  // The device's answer on the server render too: without a window it is simply false.
  const dark = useSyncExternalStore(subscribeSystemDark, systemDark, systemDark)
  const update = (patch: Partial<Look>) => {
    const next = { ...look, ...patch }
    saveLook(keys, next)
    setLook(next)
  }
  return {
    ...look,
    resolved: resolveTheme(look.theme, dark),
    setTheme: (theme) => update({ theme }),
    setRail: (rail) => update({ rail }),
  }
}
