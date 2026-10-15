import { CHANNEL_DAYS, RHYTHM_DAYS } from '../lib/options'
import type { Positioning, RhythmDay, Weekday } from '../lib/types'

/**
 * Readers for the brand as the old wizard and the AI wrote it (Review Focus 1):
 * any shape reads as the editors' shape, nothing throws, and parts an editor
 * does not show are kept so they go back as they came.
 */
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

export const asText = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '')

export function asList(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() === '' ? [] : [value.trim()]
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(v => v !== '')
}

/** Positioning written as plain text reads as the transformation it describes. */
export function asPositioning(value: unknown): Positioning {
  if (typeof value === 'string') return value.trim() === '' ? {} : { transformation: value }
  const v = record(value)
  if (Object.keys(v).length === 0) return {}
  return { ...v, old_way: asText(v.old_way), new_way: asText(v.new_way), transformation: asText(v.transformation), beliefs: asList(v.beliefs) }
}

/** All seven days (by their full English names, as the AI reads them), each with its role and notes, keeping what else a day had. */
export function asRhythm(value: unknown): Record<string, RhythmDay> {
  const source = record(value)
  const out: Record<string, RhythmDay> = {}
  for (const day of RHYTHM_DAYS) {
    const entry = record(source[day])
    out[day] = { ...entry, role: asText(entry.role), notes: asText(entry.notes) }
  }
  return out
}

/** A channel's posting days: all seven, off unless on. */
export function asDays(value: unknown): Record<Weekday, boolean> {
  const source = record(value)
  return Object.fromEntries(CHANNEL_DAYS.map(day => [day, source[day] === true || source[day] === 1 || source[day] === '1'])) as Record<Weekday, boolean>
}

/** A content mix as whole percentages; a number, or a text holding one (as some AI answers stored it); anything else is left out. */
export function asMix(value: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, raw] of Object.entries(record(value))) {
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
    if (Number.isFinite(n)) out[key] = Math.round(n)
  }
  return out
}

/** An emptied text is "none" for the server. */
export const orNull = (text: string): string | null => (text.trim() === '' ? null : text.trim())

/** Only the fields whose value changed (lists and objects compared by value). */
export function changedFields<T extends object>(before: T, after: T): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out[key] = after[key]
  }
  return out
}

/** Tags typed or pasted: split on commas and lines, trimmed, without doubles (ignoring case). */
export function addTags(values: readonly string[], text: string): string[] {
  const out = [...values]
  for (const part of text.split(/[,\n]/)) {
    const tag = part.trim()
    if (tag !== '' && !out.some(v => v.toLowerCase() === tag.toLowerCase())) out.push(tag)
  }
  return out
}

/** The tags without the one at `index`: a tag stored twice loses one copy, not both. */
export const removeTag = (values: readonly string[], index: number): string[] => values.filter((_, i) => i !== index)
