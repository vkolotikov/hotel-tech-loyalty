import { hexOf, type LookForm } from '../appMath'
import type { LookOptions } from '../types'

/** Palettes are server-owned and only replace their neutral keys; accent and semantic colours survive. */
export function applyColorMode(form: LookForm, options: LookOptions, mode: string): LookForm {
  const palette = options.color_modes?.[mode]
  return palette ? { ...form, colors: { ...form.colors, ...palette } } : form
}
export function colorMode(form: LookForm, options: LookOptions): string | null {
  return Object.entries(options.color_modes ?? {}).find(([, palette]) =>
    Object.entries(palette).every(([key, value]) => hexOf(form.colors[key]) === hexOf(value)))?.[0] ?? null
}
