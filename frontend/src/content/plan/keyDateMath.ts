import { isDateKey } from '../../workspace/lib/wallClock'
import type { BrandPayload, BuiltInDay, DateKey, KeyDate, KeyDateFields, OwnKeyDate, OwnKind } from '../lib/types'

/** The nine countries the built-in holidays cover (spec 2026-10-16 D3; the server's PublicHolidays::COUNTRIES). */
export const HOLIDAY_COUNTRIES = ['GB', 'IE', 'DE', 'FR', 'ES', 'LV', 'LT', 'EE', 'US'] as const
export const MAX_EVENT_DAYS = 31

/** Each kind's English name, the fallback under the bundles' `content.keydates.kind.*`. */
export const KIND_TEXT: Record<KeyDate['kind'], string> = {
  holiday: 'Public holiday', marketing: 'Marketing day', industry: 'International day', event: 'Event', note: 'Note',
}

export const isBuiltIn = (k: KeyDate): k is BuiltInDay => k.kind === 'holiday' || k.kind === 'marketing' || k.kind === 'industry'

/** A key date's key in a list: built-in ids repeat (a substitute shares its holiday's id), so kind and day go in. */
export const keyOf = (k: KeyDate): string => (isBuiltIn(k) ? `${k.kind}:${k.id}:${k.date}:${k.substitute ? 's' : 'd'}` : `own:${k.id}`)

/** A built-in day on its date; an event on every day it covers; a note on its day. */
export const onDay = (k: KeyDate, day: DateKey): boolean => (isBuiltIn(k) ? k.date === day : k.start <= day && day <= (k.end ?? k.start))

/** Each shown day's key dates, in the server's order (built-in days, then the brand's own); days without any are left out. */
export function keyDatesByDay(keyDates: readonly KeyDate[], days: readonly DateKey[]): Record<DateKey, KeyDate[]> {
  const out: Record<DateKey, KeyDate[]> = {}
  for (const day of days) {
    const here = keyDates.filter(k => onDay(k, day))
    if (here.length > 0) out[day] = here
  }
  return out
}

/** Days from the first to the last, both counted (the server's ContentRules::days). */
export const daysCovered = (start: DateKey, end: DateKey): number =>
  Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1

/** The country whose holidays the brand sees (spec §3.3): its choice ("none" = none), else the venue's guess. */
export function holidayCountryOf(brand: BrandPayload | null | undefined): string | null {
  const chosen = brand?.profile?.holiday_country ?? null
  if (chosen === 'none') return null
  if (chosen !== null && (HOLIDAY_COUNTRIES as readonly string[]).includes(chosen)) return chosen
  return brand?.holiday_country_guess ?? null
}

/** An event or note as its editor holds it: text, '' for "none". */
export interface KeyDateForm { title: string; details: string; start: string; end: string }

export function keyDateForm(keyDate: OwnKeyDate | null, day: DateKey): KeyDateForm {
  return keyDate
    ? { title: keyDate.title, details: keyDate.details ?? '', start: keyDate.start, end: keyDate.end ?? '' }
    : { title: '', details: '', start: day, end: '' }
}

export type KeyDateProblem = 'invalid' | 'end_before_start' | 'too_long'

/** What the server would refuse, said first: a title and a first day; an event's last day not before it, 31 days at most. */
export function keyDateProblem(kind: OwnKind, form: KeyDateForm): KeyDateProblem | null {
  if (form.title.trim() === '' || !isDateKey(form.start)) return 'invalid'
  if (kind === 'note' || form.end === '' || form.end === form.start) return null
  if (!isDateKey(form.end)) return 'invalid'
  if (form.end < form.start) return 'end_before_start'
  return daysCovered(form.start, form.end) > MAX_EVENT_DAYS ? 'too_long' : null
}

/** What to send: everything for a new one, only what changed for one being edited; a note never has a last day. */
export function keyDateBody(kind: OwnKind, form: KeyDateForm, original: OwnKeyDate | null): KeyDateFields {
  const fields: KeyDateFields = {
    title: form.title.trim(),
    details: form.details.trim() === '' ? null : form.details.trim(),
    start_date: form.start,
    end_date: kind === 'note' || form.end === '' || form.end === form.start ? null : form.end,
  }
  if (!original) return { kind, ...fields }
  const before: KeyDateFields = { title: original.title, details: original.details, start_date: original.start, end_date: original.end }
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => before[key as keyof KeyDateFields] !== value)) as KeyDateFields
}
