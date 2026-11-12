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

/**
 * The list's filters, as the address keeps them (`?q=&lifecycle=…`). `tag` is a tag's id; `co` the company (not
 * `company`, which names an open company record, records.ts); `from`/`to` the venue's days it was added on; `email`,
 * `phone`, `vip` are on when `1`. Round 5 (owner 2026-11-12, "implement all features we have in our main platform"):
 * nationality, guest type, owner, the days added, has an email or a phone and VIP, as the full admin's Customers.
 */
export interface PeopleFilters {
  q: string
  lifecycle: string
  importance: string
  source: string
  country: string
  nationality: string
  gtype: string
  owner: string
  tag: string
  co: string
  from: string
  to: string
  email: string
  phone: string
  vip: string
  sort: SortKey
}

/** The filters that narrow the list (the sort only orders it), in the order their chips show. */
export const FILTER_KEYS = ['q', 'lifecycle', 'importance', 'vip', 'gtype', 'source', 'owner', 'country', 'nationality', 'tag', 'co', 'from', 'to', 'email', 'phone'] as const
export type FilterKey = (typeof FILTER_KEYS)[number]

/** The filters that are a switch (on = `1`). */
export const SWITCH_KEYS = ['vip', 'email', 'phone'] as const satisfies readonly FilterKey[]

/** One value of the address, or '' (a variable key keeps the API sweep from reading it as a call). */
export function arg(search: URLSearchParams, key: string): string {
  return search.get(key) ?? ''
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function filtersFrom(search: URLSearchParams): PeopleFilters {
  const sort = arg(search, 'sort')
  const tag = arg(search, 'tag')
  const day = (key: string) => (DAY.test(arg(search, key)) ? arg(search, key) : '')
  const on = (key: string) => (arg(search, key) === '1' ? '1' : '')
  return {
    q: arg(search, 'q'),
    lifecycle: arg(search, 'lifecycle'),
    importance: arg(search, 'importance'),
    source: arg(search, 'source'),
    country: arg(search, 'country'),
    nationality: arg(search, 'nationality'),
    gtype: arg(search, 'gtype'),
    owner: arg(search, 'owner'),
    tag: /^\d+$/.test(tag) ? tag : '',
    co: arg(search, 'co'),
    from: day('from'),
    to: day('to'),
    email: on('email'),
    phone: on('phone'),
    vip: on('vip'),
    sort: (SORT_KEYS as string[]).includes(sort) ? (sort as SortKey) : 'newest',
  }
}

/** The page in the address: a whole number from 1. */
export function pageFrom(search: URLSearchParams, key = 'page'): number {
  const n = Number(arg(search, key))
  return Number.isInteger(n) && n > 0 ? n : 1
}

/** What GET guests is asked for these filters (GuestController::applyFilters' names). */
export function listParams(f: PeopleFilters, page: number): Record<string, string | number> {
  const out: Record<string, string | number> = { ...filterParams(f), sort: SORTS[f.sort].sort, dir: SORTS[f.sort].dir, page, per_page: PER_PAGE }
  return out
}

/** VIP, as the full admin's Customers asks for it: the contacts whose VIP level is "VIP" (its bulk "Mark VIP" sets it). */
export const VIP_LEVEL = 'VIP'

function filterParams(f: PeopleFilters): Record<string, string> {
  const pairs: [string, string][] = [
    ['search', f.q.trim()], ['lifecycle_status', f.lifecycle], ['importance', f.importance], ['lead_source', f.source],
    ['country', f.country], ['nationality', f.nationality], ['guest_type', f.gtype], ['owner_name', f.owner], ['tag_ids', f.tag],
    ['company', f.co.trim()], ['date_from', f.from], ['date_to', f.to],
    ['has_email', f.email], ['has_phone', f.phone], ['vip_level', f.vip ? VIP_LEVEL : ''],
  ]
  return Object.fromEntries(pairs.filter(([, v]) => v !== ''))
}

export type ExportFormat = 'xlsx' | 'csv'

/**
 * What GET guests/export is asked: the chosen rows when there are any, else everything the filters show; as the
 * styled workbook (the server's default, as the full admin's Export) or as CSV.
 */
export function exportParams(f: PeopleFilters, ids: number[], format: ExportFormat = 'csv'): Record<string, string> {
  const base: Record<string, string> = ids.length > 0 ? { ids: ids.join(',') } : filterParams(f)
  return format === 'csv' ? { ...base, format: 'csv' } : base
}

/** How many filters narrow the list now (the search is not one of the Filters panel's). */
export function activeFilterCount(f: PeopleFilters, { withSearch = true }: { withSearch?: boolean } = {}): number {
  return FILTER_KEYS.filter(k => (withSearch || k !== 'q') && f[k].trim() !== '').length
}

/** The filters narrowing the list now, in the chips' order, each shown as a chip that removes it. */
export function activeFilters(f: PeopleFilters): { key: FilterKey; value: string }[] {
  return FILTER_KEYS.filter(k => f[k].trim() !== '').map(k => ({ key: k, value: f[k].trim() }))
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
  // A view saved before round 5 named the company `company`; it is `co` now.
  const values: Record<string, unknown> = { ...(saved as Record<string, unknown>) }
  if (typeof values.co !== 'string' && typeof values.company === 'string') values.co = values.company
  for (const key of [...FILTER_KEYS, 'sort'] as const) {
    const value = values[key]
    if (typeof value === 'string' && value.trim() !== '') next.set(key, value.trim())
  }
  if (next.has('sort') && !(SORT_KEYS as string[]).includes(arg(next, 'sort'))) next.delete('sort')
  if (next.has('tag') && !/^\d+$/.test(arg(next, 'tag'))) next.delete('tag')
  for (const key of ['from', 'to'] as const) if (next.has(key) && !DAY.test(arg(next, key))) next.delete(key)
  for (const key of SWITCH_KEYS) if (next.has(key) && arg(next, key) !== '1') next.delete(key)
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
export const DEFAULT_GUEST_TYPES = ['Individual', 'Corporate', 'Travel Agent', 'Group Leader', 'VIP', 'Returning']
export const DEFAULT_VIP_LEVELS = ['Standard', 'Silver', 'Gold', 'Platinum', 'Diamond']
export const DEFAULT_INDUSTRIES = ['Technology', 'Finance', 'Consulting', 'Pharmaceutical', 'Automotive', 'Energy', 'Government', 'Airlines', 'Media', 'Other']
export const DEFAULT_RATE_TYPES = ['Fixed Rate', 'Percentage Discount', 'Best Available Rate Minus']

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
  guest_type: 30, vip_level: 30, nationality: 100, preferred_language: 30,
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
  | { kind: 'too_long'; max: number }
  | { kind: 'bad_email' }
  | { kind: 'patch'; body: Partial<Record<FieldKey, string | null>> }

/**
 * The fields a contact always has: the name, and the lifecycle, importance, guest type and VIP level (columns with a
 * default, never empty). Every other field can be emptied.
 */
export const KEPT_FIELDS: readonly FieldKey[] = ['full_name', 'lifecycle_status', 'importance', 'guest_type', 'vip_level']

/**
 * What saving one field does. An emptied field is sent as null, which clears it (round 2: PUT guests/{id} clears a field
 * sent as null; an empty string it still ignores); the name, the lifecycle and the importance cannot be emptied.
 */
export function fieldPatch(key: FieldKey, draft: string, current: string | null | undefined): FieldOutcome {
  const next = draft.trim()
  const was = (current ?? '').trim()
  if (next === was) return { kind: 'same' }
  if (next === '') return KEPT_FIELDS.includes(key) ? { kind: 'required' } : { kind: 'patch', body: { [key]: null } }
  const max = FIELD_MAX[key]
  if (max > 0 && next.length > max) return { kind: 'too_long', max }
  if (key === 'email' && !isEmail(next)) return { kind: 'bad_email' }
  return { kind: 'patch', body: { [key]: next } }
}

/** How a field is edited in place: a line, an address, a list to choose from, a number or a day. */
export type FieldKind = 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'number' | 'date'

/** The lists a contact's fields choose from (the venue's CRM settings, else their defaults). */
export type ContactList = 'lifecycle' | 'importance' | 'guestTypes' | 'vipLevels'

export interface ContactFieldDef { key: FieldKey; kind: FieldKind; list?: ContactList; suggest?: 'sources' | 'countries' | 'nationalities' | 'owners' }

/**
 * A contact's fields in groups of what belongs together, in the order they are read (round 5: the guest type,
 * VIP level, nationality and language the full admin's guest page has, beside round 2's fields).
 */
export const CONTACT_GROUPS: { key: 'reach' | 'work' | 'standing' | 'place' | 'notes'; fields: ContactFieldDef[] }[] = [
  { key: 'reach', fields: [{ key: 'full_name', kind: 'text' }, { key: 'email', kind: 'email' }, { key: 'phone', kind: 'tel' }, { key: 'mobile', kind: 'tel' }] },
  { key: 'work', fields: [{ key: 'company', kind: 'text' }, { key: 'position_title', kind: 'text' }, { key: 'owner_name', kind: 'text', suggest: 'owners' }] },
  {
    key: 'standing', fields: [
      { key: 'lifecycle_status', kind: 'select', list: 'lifecycle' }, { key: 'importance', kind: 'select', list: 'importance' },
      { key: 'guest_type', kind: 'select', list: 'guestTypes' }, { key: 'vip_level', kind: 'select', list: 'vipLevels' },
      { key: 'lead_source', kind: 'text', suggest: 'sources' },
    ],
  },
  {
    key: 'place', fields: [
      { key: 'country', kind: 'text', suggest: 'countries' }, { key: 'city', kind: 'text' }, { key: 'nationality', kind: 'text', suggest: 'nationalities' },
      { key: 'preferred_language', kind: 'text' }, { key: 'address', kind: 'textarea' },
    ],
  },
  { key: 'notes', fields: [{ key: 'notes', kind: 'textarea' }] },
]

/* ─── A company's fields, edited one at a time ─────────────────────────────────────────────────── */

/** The company fields HexaTech CRM edits in place (CorporateAccountController::update's rules for them). */
export const COMPANY_FIELD_KEYS = [
  'company_name', 'industry', 'status', 'account_manager', 'contact_person', 'contact_email', 'contact_phone', 'payment_terms',
  'credit_limit', 'discount_percentage', 'contract_start', 'contract_end', 'negotiated_rate', 'rate_type', 'annual_room_nights_target',
  'billing_email', 'tax_id', 'billing_address', 'notes',
] as const
export type CompanyFieldKey = (typeof COMPANY_FIELD_KEYS)[number]

export interface CompanyFieldDef {
  key: CompanyFieldKey
  kind: FieldKind
  list?: 'statuses' | 'rateTypes'
  suggest?: 'industries' | 'managers'
  /** A hotel's word (a room rate, room nights): shown to a hotel only, as Leads shows a stay only to a hotel. */
  hotel?: boolean
  /** A number's range and whether it takes a fraction. */
  min?: number
  max?: number
  whole?: boolean
}

export const COMPANY_GROUPS: { key: 'main' | 'reach' | 'terms' | 'billing' | 'notes'; fields: CompanyFieldDef[] }[] = [
  {
    key: 'main', fields: [
      { key: 'company_name', kind: 'text' }, { key: 'industry', kind: 'text', suggest: 'industries' },
      { key: 'status', kind: 'select', list: 'statuses' }, { key: 'account_manager', kind: 'text', suggest: 'managers' },
    ],
  },
  { key: 'reach', fields: [{ key: 'contact_person', kind: 'text' }, { key: 'contact_email', kind: 'email' }, { key: 'contact_phone', kind: 'tel' }] },
  {
    key: 'terms', fields: [
      { key: 'payment_terms', kind: 'text' }, { key: 'credit_limit', kind: 'number', min: 0 },
      { key: 'discount_percentage', kind: 'number', min: 0, max: 100 },
      { key: 'contract_start', kind: 'date' }, { key: 'contract_end', kind: 'date' },
      { key: 'negotiated_rate', kind: 'number', min: 0, hotel: true }, { key: 'rate_type', kind: 'select', list: 'rateTypes', hotel: true },
      { key: 'annual_room_nights_target', kind: 'number', min: 0, whole: true, hotel: true },
    ],
  },
  { key: 'billing', fields: [{ key: 'billing_email', kind: 'email' }, { key: 'tax_id', kind: 'text' }, { key: 'billing_address', kind: 'textarea' }] },
  { key: 'notes', fields: [{ key: 'notes', kind: 'textarea' }] },
]

/** A company's groups for this venue: the hotel's room-rate fields only for a hotel. */
export function companyGroupsFor(hotel: boolean): typeof COMPANY_GROUPS {
  return COMPANY_GROUPS.map(group => ({ ...group, fields: group.fields.filter(field => hotel || !field.hotel) })).filter(group => group.fields.length > 0)
}

const COMPANY_FIELD_MAX: Partial<Record<CompanyFieldKey, number>> = {
  company_name: 200, industry: 100, contact_person: 150, contact_email: 150, contact_phone: 50, account_manager: 150,
  billing_email: 150, tax_id: 50, payment_terms: 50, status: 30, rate_type: 30,
}

export type CompanyFieldOutcome =
  | { kind: 'same' }
  | { kind: 'required' }
  | { kind: 'too_long'; max: number }
  | { kind: 'bad_email' }
  | { kind: 'bad_number'; min: number; max: number | null; whole: boolean }
  | { kind: 'bad_day' }
  | { kind: 'patch'; body: Partial<Record<CompanyFieldKey, string | number | null>> }

/** A company field as the form shows it: a day stays `YYYY-MM-DD`, a number as written by the server. */
export function companyValue(company: Partial<Record<CompanyFieldKey, unknown>>, key: CompanyFieldKey): string {
  const v = company[key]
  if (v === null || v === undefined) return ''
  if (key === 'contract_start' || key === 'contract_end') return String(v).slice(0, 10)
  const def = COMPANY_GROUPS.flatMap(g => g.fields).find(f => f.key === key)
  if (def?.kind === 'number') {
    const n = Number(v)
    return Number.isFinite(n) ? String(n) : String(v)
  }
  return String(v)
}

/**
 * What saving one company field does (PUT corporate-accounts/{id}): an emptied field is sent as null, which clears it,
 * except the name (required) and the status (always one); a number in its range, a day as `YYYY-MM-DD`.
 */
export function companyFieldPatch(key: CompanyFieldKey, draft: string, current: string | null | undefined): CompanyFieldOutcome {
  const next = draft.trim()
  const was = (current ?? '').trim()
  if (next === was) return { kind: 'same' }
  if (next === '') return key === 'company_name' || key === 'status' ? { kind: 'required' } : { kind: 'patch', body: { [key]: null } }
  const def = COMPANY_GROUPS.flatMap(g => g.fields).find(f => f.key === key)
  const max = COMPANY_FIELD_MAX[key]
  if (max && next.length > max) return { kind: 'too_long', max }
  if ((key === 'contact_email' || key === 'billing_email') && !isEmail(next)) return { kind: 'bad_email' }
  if (def?.kind === 'number') {
    const n = Number(next)
    const min = def.min ?? 0
    const top = def.max ?? null
    if (!Number.isFinite(n) || n < min || (top !== null && n > top) || (def.whole && !Number.isInteger(n))) {
      return { kind: 'bad_number', min, max: top, whole: def.whole ?? false }
    }
    if (Number(was) === n && was !== '') return { kind: 'same' }
    return { kind: 'patch', body: { [key]: n } }
  }
  if (def?.kind === 'date' && !isDay(next)) return { kind: 'bad_day' }
  return { kind: 'patch', body: { [key]: next } }
}

/** A calendar day as a date input writes it, and one that exists. */
export function isDay(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
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

/** What a contact's delete takes with it, in this order, and what stays (unlinked): GuestController::deleteImpact. */
export const IMPACT_REMOVES = ['inquiries', 'lead_tasks', 'reservations', 'activities'] as const
export const IMPACT_KEPT = ['chats'] as const
export type ImpactKey = (typeof IMPACT_REMOVES)[number] | (typeof IMPACT_KEPT)[number]

/**
 * The delete's preview as the server answers it: the kinds of record deleted with the contact that have some, the kinds
 * that stay but lose the link, and the venue bookings that block it (null when nothing blocks). Which kind goes and which
 * stays is the server's word (`removes`, `kept`); an older answer without them reads as the leads, reservations and
 * timeline going.
 */
export function impactSummary(impact: Partial<DeleteImpact> | undefined): {
  removes: { key: ImpactKey; count: number }[]
  kept: { key: ImpactKey; count: number }[]
  blocked: number | null
} {
  const read = (key: string) => {
    const n = Number((impact as Record<string, unknown> | undefined)?.[key] ?? 0)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const removing = Array.isArray(impact?.removes) ? impact.removes : ['inquiries', 'reservations', 'activities']
  const keeping = Array.isArray(impact?.kept) ? impact.kept : []
  const removes = IMPACT_REMOVES.filter(key => removing.includes(key)).map(key => ({ key, count: read(key) })).filter(line => line.count > 0)
  const kept = IMPACT_KEPT.filter(key => keeping.includes(key)).map(key => ({ key, count: read(key) })).filter(line => line.count > 0)
  return { removes, kept, blocked: impact?.blocked ? Math.max(1, read('venue_bookings')) : null }
}

/** What goes with a contact: each kind of record deleted with it that has some (impactSummary's `removes`). */
export function impactLines(impact: Partial<DeleteImpact> | undefined): { key: ImpactKey; count: number }[] {
  return impactSummary(impact).removes
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

/** The fields a bulk change may set here (each is in GuestController::bulkUpdate's allowed list). */
export const BULK_FIELDS = ['lifecycle_status', 'importance', 'guest_type', 'vip_level'] as const
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

/** The new lead form, told whose lead it is (the Leads page may read `guest`). */
export function newLeadFor(id: number): string {
  return `/crm/leads?new=1&guest=${id}`
}

/** The VIP levels to choose from: the venue's, with "VIP" (what the full admin's "Mark VIP" and the VIP filter use). */
export function withVip(levels: string[]): string[] {
  return optionsWith(levels, VIP_LEVEL)
}

/** `mailto:` and `tel:` links, or null. A phone keeps its digits and a leading +. */
export function mailLink(email: string | null | undefined): string | null {
  return email && isEmail(email) ? `mailto:${email.trim()}` : null
}

export function phoneLink(phone: string | null | undefined): string | null {
  const clean = (phone ?? '').trim().replace(/(?!^\+)[^\d]/g, '')
  return clean.replace('+', '').length >= 4 ? `tel:${clean}` : null
}

/** A WhatsApp chat with the number (wa.me takes the digits with the country code, no +), or null. */
export function whatsappLink(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 7 ? `https://wa.me/${digits}` : null
}

/** Under a contact's name: their company, email and phone, those they have. */
export function contactSubtitle(g: { company?: string | null; email?: string | null; phone?: string | null; mobile?: string | null }): string {
  return [g.company, g.email, g.phone || g.mobile].map(v => (v ?? '').trim()).filter(Boolean).join(' · ')
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

/** The suggested pairs this contact is in, each with the other contact (at most `max`). */
export function pairsWith(pairs: DuplicatePair[], id: number, max = 3): { pair: DuplicatePair; other: DuplicateGuest }[] {
  return pairs
    .filter(pair => pair.winner?.id === id || pair.loser?.id === id)
    .slice(0, max)
    .map(pair => ({ pair, other: pair.winner.id === id ? pair.loser : pair.winner }))
}

/**
 * The sentence for a merge the server refused (GuestMergeController's codes): two contacts of different member
 * accounts, a contact with itself, a merge that failed and changed nothing; anything else is a plain refusal.
 */
export function mergeRefusalKey(code: string): 'refused' | 'same' | 'failed' | 'not_merged' | null {
  if (code === 'different_members') return 'refused'
  if (code === 'same_guest') return 'same'
  if (code === 'merge_failed') return 'failed'
  if (code === 'merge_refused' || code === 'different_organizations') return 'not_merged'
  return null
}

/* ─── Companies ────────────────────────────────────────────────────────────────────────────────── */

/** A company's states (the full admin's list; the column defaults to Active). */
export const COMPANY_STATUSES = ['Active', 'Pending', 'Expired', 'Suspended'] as const

/** The i18n key of a company's state, or null for one we do not know (shown as written). */
export function companyStatusKey(status: string | null | undefined): string | null {
  return status && (COMPANY_STATUSES as readonly string[]).includes(status) ? `company_status.${status.toLowerCase()}` : null
}

export const COMPANY_TONE: Record<string, Tone> = { Active: 'success', Pending: 'pending', Expired: 'neutral', Suspended: 'danger' }

/** A new company's fields (round 5: the discount, and for a hotel the rate and room nights, as the full admin's form). */
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
  discount_percentage: string
  negotiated_rate: string
  rate_type: string
  annual_room_nights_target: string
  contract_start: string
  contract_end: string
  status: string
  notes: string
}

export const EMPTY_COMPANY: CompanyForm = {
  company_name: '', industry: '', contact_person: '', contact_email: '', contact_phone: '', account_manager: '',
  billing_email: '', billing_address: '', tax_id: '', payment_terms: '', credit_limit: '', discount_percentage: '',
  negotiated_rate: '', rate_type: '', annual_room_nights_target: '', contract_start: '', contract_end: '', status: '', notes: '',
}

const COMPANY_MAX: Partial<Record<keyof CompanyForm, number>> = {
  company_name: 200, industry: 100, contact_person: 150, contact_email: 150, contact_phone: 50, account_manager: 150,
  billing_email: 150, tax_id: 50, payment_terms: 50, status: 30, rate_type: 30,
}

/** The form's number fields: their range, and whether they take a fraction. */
const COMPANY_NUMBERS: Partial<Record<keyof CompanyForm, { max: number | null; whole: boolean }>> = {
  credit_limit: { max: null, whole: false }, discount_percentage: { max: 100, whole: false },
  negotiated_rate: { max: null, whole: false }, annual_room_nights_target: { max: null, whole: true },
}

/** A company as the form holds it. A day stays `YYYY-MM-DD`. */
export function companyFormOf(c: Company): CompanyForm {
  const text = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  const day = (v: string | null) => (v ? v.slice(0, 10) : '')
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(Number(v)))
  return {
    company_name: text(c.company_name), industry: text(c.industry), contact_person: text(c.contact_person),
    contact_email: text(c.contact_email), contact_phone: text(c.contact_phone), account_manager: text(c.account_manager),
    billing_email: text(c.billing_email), billing_address: text(c.billing_address), tax_id: text(c.tax_id),
    payment_terms: text(c.payment_terms), credit_limit: num(c.credit_limit), discount_percentage: num(c.discount_percentage),
    negotiated_rate: num(c.negotiated_rate), rate_type: text(c.rate_type), annual_room_nights_target: num(c.annual_room_nights_target),
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
  for (const [key, rule] of Object.entries(COMPANY_NUMBERS) as [keyof CompanyForm, { max: number | null; whole: boolean }][]) {
    const raw = form[key].trim()
    if (raw === '') continue
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0 || (rule.max !== null && n > rule.max) || (rule.whole && !Number.isInteger(n))) errors[key] = 'bad_number'
  }
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
    out[key] = value === '' ? null : key in COMPANY_NUMBERS ? Number(value) : value
  }
  if (mode === 'edit' && out.status === null) delete out.status
  return out
}

/* ─── Exporting ────────────────────────────────────────────────────────────────────────────────── */

/** The CSV as a spreadsheet opens it in UTF-8: with its byte-order mark (the server writes one; keep exactly one). */
const BOM = String.fromCharCode(0xfeff)

export function csvWithBom(text: string): string {
  return text.startsWith(BOM) ? text : `${BOM}${text}`
}

export function exportName(today: string, format: ExportFormat = 'csv'): string {
  return `contacts-${today}.${format}`
}
