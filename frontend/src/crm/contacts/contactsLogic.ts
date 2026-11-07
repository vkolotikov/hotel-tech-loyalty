import type { Tone } from '../ui/StatTile'
import type { Company, DeleteImpact, DuplicateGuest, DuplicatePair, GuestTag } from './types'

/**
 * Contacts' decisions, kept pure because the tests render to a string (2026-11-07): the list's filters as the address
 * keeps them and as GuestController reads them, what an edit sends and when it cannot, what a new contact or company
 * sends, tags, selection and bulk changes, a merge's sides. The rules are the server's (GuestController,
 * CorporateAccountController); these only mirror them so the workspace can refuse early and say why in our words.
 */

export const PER_PAGE = 25

/** The sorts GuestController::index accepts (its `allowedSorts`); anything else falls back to the newest. */
export const SORTS = {
  newest: { sort: 'created_at', dir: 'desc' },
  oldest: { sort: 'created_at', dir: 'asc' },
  updated: { sort: 'updated_at', dir: 'desc' },
} as const
export type SortKey = keyof typeof SORTS
export const SORT_KEYS = Object.keys(SORTS) as SortKey[]

/** The list's filters, as the address keeps them (`?q=&lifecycle=…`). `tag` is a tag's id. */
export interface PeopleFilters {
  q: string
  lifecycle: string
  importance: string
  source: string
  country: string
  tag: string
  company: string
  sort: SortKey
}

/** The filters that narrow the list (the sort only orders it). */
export const FILTER_KEYS = ['q', 'lifecycle', 'importance', 'source', 'country', 'tag', 'company'] as const
export type FilterKey = (typeof FILTER_KEYS)[number]

export function filtersFrom(search: URLSearchParams): PeopleFilters {
  const sort = search.get('sort') ?? ''
  return {
    q: search.get('q') ?? '',
    lifecycle: search.get('lifecycle') ?? '',
    importance: search.get('importance') ?? '',
    source: search.get('source') ?? '',
    country: search.get('country') ?? '',
    tag: /^\d+$/.test(search.get('tag') ?? '') ? (search.get('tag') as string) : '',
    company: search.get('company') ?? '',
    sort: (SORT_KEYS as string[]).includes(sort) ? (sort as SortKey) : 'newest',
  }
}

/** The page in the address: a whole number from 1. */
export function pageFrom(search: URLSearchParams, key = 'page'): number {
  const n = Number(search.get(key))
  return Number.isInteger(n) && n > 0 ? n : 1
}

/** What GET guests is asked for these filters (GuestController::applyFilters' names). */
export function listParams(f: PeopleFilters, page: number): Record<string, string | number> {
  const out: Record<string, string | number> = { ...filterParams(f), sort: SORTS[f.sort].sort, dir: SORTS[f.sort].dir, page, per_page: PER_PAGE }
  return out
}

function filterParams(f: PeopleFilters): Record<string, string> {
  const pairs: [string, string][] = [
    ['search', f.q.trim()], ['lifecycle_status', f.lifecycle], ['importance', f.importance], ['lead_source', f.source],
    ['country', f.country], ['tag_ids', f.tag], ['company', f.company],
  ]
  return Object.fromEntries(pairs.filter(([, v]) => v !== ''))
}

/** What GET guests/export is asked: the chosen rows when there are any, else everything the filters show; as CSV. */
export function exportParams(f: PeopleFilters, ids: number[]): Record<string, string> {
  if (ids.length > 0) return { ids: ids.join(','), format: 'csv' }
  return { ...filterParams(f), format: 'csv' }
}

/** How many filters narrow the list now. */
export function activeFilterCount(f: PeopleFilters): number {
  return FILTER_KEYS.filter(k => f[k].trim() !== '').length
}

/** The address with one filter set or cleared; any change of filter goes back to the first page. */
export function withParam(search: URLSearchParams, key: string, value: string | null): URLSearchParams {
  const next = new URLSearchParams(search)
  if (value === null || value === '') next.delete(key)
  else next.set(key, value)
  if (key !== 'page') next.delete('page')
  return next
}

/** The address without any filter (the tab and the sort stay). */
export function withoutFilters(search: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(search)
  for (const key of FILTER_KEYS) next.delete(key)
  next.delete('page')
  return next
}

/** What a saved view keeps: the filters set now and a sort other than the default. Empty when nothing is set. */
export function segmentFilters(f: PeopleFilters): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of FILTER_KEYS) if (f[key].trim() !== '') out[key] = f[key].trim()
  if (Object.keys(out).length > 0 && f.sort !== 'newest') out.sort = f.sort
  return out
}

/** The address a saved view opens: its known filters only, every other filter cleared. */
export function withSegment(search: URLSearchParams, saved: unknown): URLSearchParams {
  const next = withoutFilters(search)
  next.delete('sort')
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return next
  const values = saved as Record<string, unknown>
  for (const key of [...FILTER_KEYS, 'sort'] as const) {
    const value = values[key]
    if (typeof value === 'string' && value.trim() !== '') next.set(key, value.trim())
  }
  if (next.has('sort') && !(SORT_KEYS as string[]).includes(next.get('sort') as string)) next.delete('sort')
  if (next.has('tag') && !/^\d+$/.test(next.get('tag') as string)) next.delete('tag')
  return next
}

/** A list kept in the venue's CRM settings (crm-settings, a JSON value per key), as plain words. */
export function settingList(settings: Record<string, unknown> | undefined, key: string): string[] {
  let value: unknown = settings?.[key]
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return [] }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) value = Object.values(value)
  if (!Array.isArray(value)) return []
  return value
    .map(item => (typeof item === 'string' ? item : item && typeof item === 'object' && 'name' in item ? String((item as { name: unknown }).name) : ''))
    .map(item => item.trim())
    .filter(Boolean)
}

/**
 * The lists a venue that never saved its own uses: the CRM settings' seeded defaults (migration
 * 2026_03_28_100002_extend_properties_and_crm_settings), as the full admin falls back to them too.
 */
export const DEFAULT_LIFECYCLE = ['Prospect', 'First-Time Guest', 'Returning Guest', 'VIP', 'Corporate', 'Inactive']
export const DEFAULT_IMPORTANCE = ['Standard', 'Important', 'VIP', 'VVIP']

/** The venue's list, or the default when it has none. */
export function listOr(settings: Record<string, unknown> | undefined, key: string, fallback: string[]): string[] {
  const list = settingList(settings, key)
  return list.length > 0 ? list : fallback
}

/** A select's options: the list, with the value a record holds now added when the list lacks it. */
export function optionsWith(list: string[], current?: string | null): string[] {
  const out = [...new Set(list)]
  if (current && current.trim() !== '' && !out.includes(current)) out.push(current)
  return out
}

/* ─── A contact's fields, edited one at a time ─────────────────────────────────────────────────── */

/** The fields a contact's page edits in place (GuestController::update's rules for them). */
export const FIELD_MAX = {
  full_name: 200, email: 150, phone: 50, mobile: 50, company: 200, position_title: 100, country: 100, city: 100,
  address: 0, lead_source: 100, owner_name: 150, lifecycle_status: 50, importance: 30, notes: 0,
} as const
export type FieldKey = keyof typeof FIELD_MAX

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Whether an address looks like one the server's `email` rule takes. */
export function isEmail(value: string): boolean {
  return EMAIL.test(value.trim())
}

export type FieldOutcome =
  | { kind: 'same' }
  | { kind: 'required' }
  | { kind: 'cannot_clear' }
  | { kind: 'too_long'; max: number }
  | { kind: 'bad_email' }
  | { kind: 'patch'; body: Partial<Record<FieldKey, string>> }

/**
 * What saving one field does. The name is required; an emptied field cannot be saved, because the server keeps a
 * field it is sent empty (GuestController::update drops empty values so a form cannot wipe one), so the page says so
 * instead of pretending it was cleared.
 */
export function fieldPatch(key: FieldKey, draft: string, current: string | null | undefined): FieldOutcome {
  const next = draft.trim()
  const was = (current ?? '').trim()
  if (next === was) return { kind: 'same' }
  if (next === '') return key === 'full_name' ? { kind: 'required' } : { kind: 'cannot_clear' }
  const max = FIELD_MAX[key]
  if (max > 0 && next.length > max) return { kind: 'too_long', max }
  if (key === 'email' && !isEmail(next)) return { kind: 'bad_email' }
  return { kind: 'patch', body: { [key]: next } }
}

/* ─── A new contact ────────────────────────────────────────────────────────────────────────────── */

export interface NewContactForm {
  full_name: string
  email: string
  phone: string
  company: string
  position_title: string
  lifecycle_status: string
  importance: string
  lead_source: string
  notes: string
}

export const EMPTY_CONTACT: NewContactForm = {
  full_name: '', email: '', phone: '', company: '', position_title: '', lifecycle_status: '', importance: '', lead_source: '', notes: '',
}

export type FormError = 'required' | 'bad_email' | 'too_long' | 'bad_number'

/** What is wrong with a new contact before it is sent (GuestController::store's rules). */
export function newContactErrors(form: NewContactForm): Partial<Record<keyof NewContactForm, FormError>> {
  const errors: Partial<Record<keyof NewContactForm, FormError>> = {}
  if (form.full_name.trim() === '') errors.full_name = 'required'
  for (const key of Object.keys(form) as (keyof NewContactForm)[]) {
    if (errors[key]) continue
    const max = (FIELD_MAX as Record<string, number>)[key] ?? 0
    if (max > 0 && form[key].trim().length > max) errors[key] = 'too_long'
  }
  if (!errors.email && form.email.trim() !== '' && !isEmail(form.email)) errors.email = 'bad_email'
  return errors
}

/** POST guests: the fields written, nothing empty (the server fills its defaults for those). */
export function newContactBody(form: NewContactForm): Record<string, string> {
  return Object.fromEntries(
    (Object.entries(form) as [keyof NewContactForm, string][]).map(([k, v]) => [k, v.trim()] as const).filter(([, v]) => v !== ''),
  )
}

/* ─── Tags ─────────────────────────────────────────────────────────────────────────────────────── */

/** POST guests/{id}/tags replaces the contact's tags: the ids with one more. */
export function tagIdsWith(tags: GuestTag[], id: number): number[] {
  const ids = tags.map(tag => tag.id)
  return ids.includes(id) ? ids : [...ids, id]
}

/** …and the ids with one fewer. */
export function tagIdsWithout(tags: GuestTag[], id: number): number[] {
  return tags.map(tag => tag.id).filter(other => other !== id)
}

/** The organisation's tags a contact does not wear yet, by name. */
export function tagsToOffer(all: GuestTag[], worn: GuestTag[]): GuestTag[] {
  const on = new Set(worn.map(tag => tag.id))
  return all.filter(tag => !on.has(tag.id)).sort((a, b) => a.name.localeCompare(b.name))
}

/** A new tag's name: required, at most 80 characters (GuestController::storeTag), not one that exists already. */
export function tagNameError(name: string, all: GuestTag[]): 'required' | 'too_long' | 'exists' | null {
  const clean = name.trim()
  if (clean === '') return 'required'
  if (clean.length > 80) return 'too_long'
  if (all.some(tag => tag.name.trim().toLowerCase() === clean.toLowerCase())) return 'exists'
  return null
}

/* ─── Deleting ─────────────────────────────────────────────────────────────────────────────────── */

/** What goes with a contact (GET guests/{id}/delete-impact): each kind of record that has some, in this order. */
export function impactLines(impact: Partial<DeleteImpact> | undefined): { key: keyof DeleteImpact; count: number }[] {
  const order: (keyof DeleteImpact)[] = ['inquiries', 'activities', 'reservations']
  return order
    .map(key => ({ key, count: Number(impact?.[key] ?? 0) }))
    .filter(line => Number.isFinite(line.count) && line.count > 0)
}

/* ─── Choosing rows, and changing many at once ─────────────────────────────────────────────────── */

/** guests/bulk-update and guests/bulk-delete take at most this many ids. */
export const BULK_MAX = 500

export function toggleId(selected: number[], id: number): number[] {
  return selected.includes(id) ? selected.filter(other => other !== id) : [...selected, id]
}

export function allOnPage(selected: number[], pageIds: number[]): boolean {
  return pageIds.length > 0 && pageIds.every(id => selected.includes(id))
}

/** The box above the list: every row of this page chosen, or none of them when they all were. */
export function togglePage(selected: number[], pageIds: number[]): number[] {
  if (allOnPage(selected, pageIds)) return selected.filter(id => !pageIds.includes(id))
  return [...selected, ...pageIds.filter(id => !selected.includes(id))]
}

/** The fields a bulk change may set here (both are in GuestController::bulkUpdate's allowed list). */
export const BULK_FIELDS = ['lifecycle_status', 'importance'] as const
export type BulkField = (typeof BULK_FIELDS)[number]

/** POST guests/bulk-update's body, or null when there is nothing to send. */
export function bulkBody(ids: number[], field: BulkField, value: string): { ids: number[]; fields: Partial<Record<BulkField, string>> } | null {
  if (ids.length === 0 || ids.length > BULK_MAX || value.trim() === '') return null
  return { ids, fields: { [field]: value.trim() } }
}

/* ─── Showing a contact ────────────────────────────────────────────────────────────────────────── */

/** A contact's name, or else their email or phone; null for nobody. */
export function displayName(g: { full_name?: string | null; email?: string | null; phone?: string | null; mobile?: string | null }): string | null {
  for (const value of [g.full_name, g.email, g.phone, g.mobile]) if (value && value.trim() !== '') return value.trim()
  return null
}

/** Importance in its tone: the list's first level (the default) is plain, any higher one stands out. */
export function importanceTone(value: string | null | undefined, levels: string[]): Tone {
  if (!value) return 'neutral'
  const at = levels.indexOf(value)
  return at > 0 ? 'accent' : 'neutral'
}

/** A lead's state from its status, as the full admin reads it: Confirmed is won, Lost is lost, anything else open. */
export function leadState(status: string | null | undefined): 'won' | 'lost' | 'open' {
  if (status === 'Confirmed') return 'won'
  if (status === 'Lost') return 'lost'
  return 'open'
}

export const LEAD_TONE: Record<'won' | 'lost' | 'open', Tone> = { won: 'success', lost: 'danger', open: 'progress' }

/** `mailto:` and `tel:` links, or null. A phone keeps its digits and a leading +. */
export function mailLink(email: string | null | undefined): string | null {
  return email && isEmail(email) ? `mailto:${email.trim()}` : null
}

export function phoneLink(phone: string | null | undefined): string | null {
  const clean = (phone ?? '').trim().replace(/(?!^\+)[^\d]/g, '')
  return clean.replace('+', '').length >= 4 ? `tel:${clean}` : null
}

/* ─── The timeline ─────────────────────────────────────────────────────────────────────────────── */

/** The kinds of touch a person logs (the full admin's fixed list, so the timeline stays countable). */
export const ACTIVITY_TYPES = ['note', 'call', 'email', 'sms', 'whatsapp'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

/** POST guests/{id}/activities' body, or null while there is nothing written. */
export function activityBody(type: ActivityType, description: string, by: string | null | undefined): { type: ActivityType; description: string; performed_by?: string } | null {
  const text = description.trim()
  if (text === '') return null
  const name = (by ?? '').trim().slice(0, 150)
  return name ? { type, description: text, performed_by: name } : { type, description: text }
}

/** The i18n key of a timeline line's kind; one the server wrote that we do not know reads as "Activity". */
export function activityKey(type: string | null | undefined): string {
  return (ACTIVITY_TYPES as readonly string[]).includes(type ?? '') ? `activity.${type}` : 'activity.other'
}

/* ─── Duplicates ───────────────────────────────────────────────────────────────────────────────── */

/** Why two contacts look like one person (GuestMergeService::findDuplicates' reasons); an unknown one reads plainly. */
export function reasonKey(reason: string): string {
  return reason === 'shared_email' ? 'duplicates.reason_email'
    : reason === 'shared_phone' ? 'duplicates.reason_phone'
    : reason === 'shared_name_context' ? 'duplicates.reason_name'
    : 'duplicates.reason_other'
}

/** Which contact stays and which goes: the older one stays unless the person swapped them. */
export function mergeSides(pair: DuplicatePair, swapped: boolean): { keep: DuplicateGuest; remove: DuplicateGuest } {
  return swapped ? { keep: pair.loser, remove: pair.winner } : { keep: pair.winner, remove: pair.loser }
}

/** POST guests/merge's body (the reason at most 500 characters, as the server takes). */
export function mergeBody(pair: DuplicatePair, swapped: boolean, reason: string): { winner_id: number; loser_id: number; reason?: string } {
  const { keep, remove } = mergeSides(pair, swapped)
  const why = reason.trim().slice(0, 500)
  return why ? { winner_id: keep.id, loser_id: remove.id, reason: why } : { winner_id: keep.id, loser_id: remove.id }
}

/* ─── Companies ────────────────────────────────────────────────────────────────────────────────── */

/** A company's states (the full admin's list; the column defaults to Active). */
export const COMPANY_STATUSES = ['Active', 'Pending', 'Expired', 'Suspended'] as const

/** The i18n key of a company's state, or null for one we do not know (shown as written). */
export function companyStatusKey(status: string | null | undefined): string | null {
  return status && (COMPANY_STATUSES as readonly string[]).includes(status) ? `company_status.${status.toLowerCase()}` : null
}

export const COMPANY_TONE: Record<string, Tone> = { Active: 'success', Pending: 'pending', Expired: 'neutral', Suspended: 'danger' }

/** The company fields HexaTech CRM edits (the hotel's room-rate and room-night fields stay in the full admin). */
export interface CompanyForm {
  company_name: string
  industry: string
  contact_person: string
  contact_email: string
  contact_phone: string
  account_manager: string
  billing_email: string
  billing_address: string
  tax_id: string
  payment_terms: string
  credit_limit: string
  contract_start: string
  contract_end: string
  status: string
  notes: string
}

export const EMPTY_COMPANY: CompanyForm = {
  company_name: '', industry: '', contact_person: '', contact_email: '', contact_phone: '', account_manager: '',
  billing_email: '', billing_address: '', tax_id: '', payment_terms: '', credit_limit: '', contract_start: '',
  contract_end: '', status: '', notes: '',
}

const COMPANY_MAX: Partial<Record<keyof CompanyForm, number>> = {
  company_name: 200, industry: 100, contact_person: 150, contact_email: 150, contact_phone: 50, account_manager: 150,
  billing_email: 150, tax_id: 50, payment_terms: 50, status: 30,
}

/** A company as the form holds it. A day stays `YYYY-MM-DD`. */
export function companyFormOf(c: Company): CompanyForm {
  const text = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  const day = (v: string | null) => (v ? v.slice(0, 10) : '')
  return {
    company_name: text(c.company_name), industry: text(c.industry), contact_person: text(c.contact_person),
    contact_email: text(c.contact_email), contact_phone: text(c.contact_phone), account_manager: text(c.account_manager),
    billing_email: text(c.billing_email), billing_address: text(c.billing_address), tax_id: text(c.tax_id),
    payment_terms: text(c.payment_terms), credit_limit: c.credit_limit === null || c.credit_limit === undefined ? '' : String(Number(c.credit_limit)),
    contract_start: day(c.contract_start), contract_end: day(c.contract_end), status: text(c.status), notes: text(c.notes),
  }
}

/** What is wrong with a company before it is sent (CorporateAccountController's rules for these fields). */
export function companyErrors(form: CompanyForm): Partial<Record<keyof CompanyForm, FormError>> {
  const errors: Partial<Record<keyof CompanyForm, FormError>> = {}
  if (form.company_name.trim() === '') errors.company_name = 'required'
  for (const [key, max] of Object.entries(COMPANY_MAX) as [keyof CompanyForm, number][]) {
    if (!errors[key] && form[key].trim().length > max) errors[key] = 'too_long'
  }
  for (const key of ['contact_email', 'billing_email'] as const) {
    if (!errors[key] && form[key].trim() !== '' && !isEmail(form[key])) errors[key] = 'bad_email'
  }
  const limit = form.credit_limit.trim()
  if (limit !== '' && (!Number.isFinite(Number(limit)) || Number(limit) < 0)) errors.credit_limit = 'bad_number'
  return errors
}

/**
 * What a company save sends. A new one sends what is written (the server sets Active and its other defaults); an
 * edit sends every field, an emptied one as null, which clears it (CorporateAccountController::update keeps nulls).
 */
export function companyBody(form: CompanyForm, mode: 'create' | 'edit'): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {}
  for (const [key, raw] of Object.entries(form) as [keyof CompanyForm, string][]) {
    if (mode === 'create' && key === 'status') continue
    const value = raw.trim()
    if (mode === 'create' && value === '') continue
    out[key] = value === '' ? null : key === 'credit_limit' ? Number(value) : value
  }
  if (mode === 'edit' && out.status === null) delete out.status
  return out
}

/* ─── Exporting ────────────────────────────────────────────────────────────────────────────────── */

/** The CSV as a spreadsheet opens it in UTF-8: with its byte-order mark (the server writes one; keep exactly one). */
export function csvWithBom(text: string): string {
  return text.startsWith('﻿') ? text : `﻿${text}`
}

export function exportName(today: string): string {
  return `contacts-${today}.csv`
}
