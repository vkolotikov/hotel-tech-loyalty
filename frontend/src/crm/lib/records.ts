/**
 * Round 5 (owner 2026-11-12, "opening tabs, slides or popups"): a lead, a contact or a company opens in a panel over the
 * page it was chosen on, from any list, the board, Today or the inbox, and keeps its place in the address (`?lead=12`,
 * `?contact=7&rtab=emails`) so Back closes it and the link can be shared. Something new is made in a panel too
 * (`?create=lead|deal|capture|deal_capture|contact|company|task`), from the header's New button or a page. Pure rules, with tests.
 */

export const RECORD_KINDS = ['lead', 'contact', 'company'] as const
export type RecordKind = (typeof RECORD_KINDS)[number]

export const CREATE_KINDS = ['lead', 'deal', 'capture', 'deal_capture', 'contact', 'company', 'task'] as const
export type CreateKind = (typeof CREATE_KINDS)[number]

/** The address key of the record panel's tab. */
export const RECORD_TAB = 'rtab'

export interface OpenRecord { kind: RecordKind; id: number; tab: string | null }

const positive = (raw: string | null): number | null => {
  if (!raw || !/^\d{1,10}$/.test(raw)) return null
  const n = Number(raw)
  return n > 0 ? n : null
}

/** The record the address opens, if any: the first of lead, contact, company with a positive whole id. */
export function recordOf(search: URLSearchParams): OpenRecord | null {
  for (const kind of RECORD_KINDS) {
    const id = positive(search.get(kind))
    if (id) {
      const tab = search.get(RECORD_TAB)
      return { kind, id, tab: tab && /^[a-z_]{1,20}$/.test(tab) ? tab : null }
    }
  }
  return null
}

/** The address with this record open (any other record closed, and any "new" panel: what was made opens), on `tab`. */
export function withRecord(search: URLSearchParams, kind: RecordKind, id: number, tab?: string | null): URLSearchParams {
  const next = withoutRecord(search)
  if (next.has('create')) next.delete('guest')
  next.delete('create')
  next.set(kind, String(id))
  if (tab) next.set(RECORD_TAB, tab)
  return next
}

/** The address with no record open. */
export function withoutRecord(search: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(search)
  for (const kind of RECORD_KINDS) next.delete(kind)
  next.delete(RECORD_TAB)
  return next
}

/** What the address asks to make, if anything. */
export function createOf(search: URLSearchParams): CreateKind | null {
  const raw = search.get('create')
  return (CREATE_KINDS as readonly string[]).includes(raw ?? '') ? raw as CreateKind : null
}

/** What a "new" panel starts from: a lead or a deal for a contact (`&guest=`). */
export interface CreatePreset { guest?: number | null }

/** The address asking to make something (`null`: nothing, and no preset). */
export function withCreate(search: URLSearchParams, kind: CreateKind | null, preset?: CreatePreset): URLSearchParams {
  const next = new URLSearchParams(search)
  next.delete('guest')
  if (!kind) {
    next.delete('create')
    return next
  }
  next.set('create', kind)
  const guest = preset?.guest
  if (guest && Number.isInteger(guest) && guest > 0) next.set('guest', String(guest))
  return next
}

/** The contact a "new" panel was asked for (`?create=lead&guest=12`), or null. */
export function presetGuestOf(search: URLSearchParams): number | null {
  if (!createOf(search)) return null
  return positive(search.get('guest'))
}

/** The record before or after `current` in the list it was opened from (none at either end, none when not in it). */
export function stepIn(ids: readonly number[], current: number, dir: -1 | 1): number | null {
  const i = ids.indexOf(current)
  if (i < 0) return null
  const next = ids[i + dir]
  return next === undefined ? null : next
}

/** A query string for a link (`?lead=3`), or the bare path when nothing is left. */
export function hrefOf(pathname: string, search: URLSearchParams): string {
  const q = search.toString()
  return q ? `${pathname}?${q}` : pathname
}
