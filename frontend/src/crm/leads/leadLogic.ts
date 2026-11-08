import type { CustomField, DeleteImpact, LeadRow, Pipeline, Stage, StageKind } from './leadTypes'

/**
 * The Leads area's decisions, as pure functions (the tests render to a string and cannot click): which filters the
 * address holds and what `GET inquiries` is asked, which stage a lead is in, when its follow-up is due, and what the
 * create, next-step, bulk and lost forms send. The server decides everything else; these only shape the requests the
 * full admin already makes (InquiryController).
 */

const read = (sp: URLSearchParams, key: string): string => sp.get(key) ?? ''

/** A calendar day from a date column ("2026-11-07" or "2026-11-07T00:00:00.000000Z"), or '' when there is none. */
export function dayOf(value: string | null | undefined): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value ?? '')
  return m ? m[1] : ''
}

export const isDay = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)

/* ─── The list's filters, in the address ─────────────────────────────────── */

/** Follow-up filter: none, due now (overdue or today, Today's "Follow-ups due"), overdue, today, the next three days. */
export type DueFilter = '' | 'now' | 'overdue' | 'today' | 'soon'
export const DUE_FILTERS: readonly DueFilter[] = ['', 'now', 'overdue', 'today', 'soon']

export type SortKey = 'newest' | 'oldest' | 'follow_up' | 'updated' | 'value' | 'ai' | 'arrival'
export const SORT_KEYS: readonly SortKey[] = ['newest', 'oldest', 'follow_up', 'updated', 'value', 'ai', 'arrival']

/**
 * The server's sort column and direction for each choice (InquiryController::index's allow-list of real columns; round
 * 2 put `total_value` and `ai_win_probability` on it, so "Largest first" and "Most likely to win" sort on the server).
 * Arrival is a hotel's (`check_in`).
 */
export const SORTS: Record<SortKey, { sort: string; dir: 'asc' | 'desc' }> = {
  newest: { sort: 'created_at', dir: 'desc' },
  oldest: { sort: 'created_at', dir: 'asc' },
  follow_up: { sort: 'next_task_due', dir: 'asc' },
  updated: { sort: 'updated_at', dir: 'desc' },
  value: { sort: 'total_value', dir: 'desc' },
  ai: { sort: 'ai_win_probability', dir: 'desc' },
  arrival: { sort: 'check_in', dir: 'asc' },
}

/** The sorts offered: arrival only to a hotel (other venues' leads have no stay). */
export function sortChoices(hotel: boolean): SortKey[] {
  return SORT_KEYS.filter(key => key !== 'arrival' || hotel)
}

/** Has a phone: any, with a phone or mobile, without one (the server's `has_phone`). */
export type PhoneFilter = '' | 'yes' | 'no'

export interface LeadFilters {
  q: string
  due: DueFilter
  /** A stage's name (the lead's `status`). */
  status: string
  source: string
  /** '' everyone, 'me' the person signed in, else an owner's name. */
  owner: string
  /** A priority's name (the organisation's own list). */
  priority: string
  /** An enquiry type (`inquiry_type`, a hotel's or an organisation's own list). */
  type: string
  /** The contact's country. */
  country: string
  phone: PhoneFilter
  /** Created from / to, `YYYY-MM-DD`. */
  from: string
  to: string
  sort: SortKey
  page: number
}

export const NO_FILTERS: LeadFilters = {
  q: '', due: '', status: '', source: '', owner: '', priority: '', type: '', country: '', phone: '', from: '', to: '', sort: 'newest', page: 1,
}

/** The "Filters" panel's choices, all cleared (search, follow-up and sort stay). */
export const PANEL_CLEARED: Pick<LeadFilters, 'status' | 'source' | 'owner' | 'priority' | 'type' | 'country' | 'phone' | 'from' | 'to'> = {
  status: '', source: '', owner: '', priority: '', type: '', country: '', phone: '', from: '', to: '',
}

/** The filters an address holds. Today's "Follow-ups due" links with `?due=1`, which is "due now". */
export function readFilters(sp: URLSearchParams): LeadFilters {
  const due = read(sp, 'due')
  const sort = read(sp, 'sort') as SortKey
  const page = Number(read(sp, 'page'))
  const from = read(sp, 'from')
  const to = read(sp, 'to')
  return {
    q: read(sp, 'q'),
    due: due === '1' ? 'now' : (DUE_FILTERS as readonly string[]).includes(due) ? (due as DueFilter) : '',
    status: read(sp, 'stage'),
    source: read(sp, 'source'),
    owner: read(sp, 'owner'),
    priority: read(sp, 'priority'),
    type: read(sp, 'type'),
    country: read(sp, 'country'),
    phone: read(sp, 'phone') === 'yes' || read(sp, 'phone') === 'no' ? (read(sp, 'phone') as PhoneFilter) : '',
    from: isDay(from) ? from : '',
    to: isDay(to) ? to : '',
    sort: SORT_KEYS.includes(sort) ? sort : 'newest',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** The address for a set of filters; what is not a filter (`new`, `guest`) is kept, defaults are left out. */
export function writeFilters(filters: LeadFilters, current: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const next = new URLSearchParams(current)
  const set = (key: string, value: string) => { if (value) next.set(key, value); else next.delete(key) }
  set('q', filters.q.trim())
  set('due', filters.due === 'now' ? '1' : filters.due)
  set('stage', filters.status)
  set('source', filters.source)
  set('owner', filters.owner)
  set('priority', filters.priority)
  set('type', filters.type)
  set('country', filters.country)
  set('phone', filters.phone)
  set('from', filters.from)
  set('to', filters.to)
  set('sort', filters.sort === 'newest' ? '' : filters.sort)
  set('page', filters.page > 1 ? String(filters.page) : '')
  return next
}

/** A change to one filter starts again from the first page. */
export function withFilter(filters: LeadFilters, patch: Partial<LeadFilters>): LeadFilters {
  return { ...filters, ...patch, page: 'page' in patch ? (patch.page ?? 1) : 1 }
}

/** How many of the "Filters" panel's choices are set (stage, source, owner, priority, type, country, phone, dates). */
export function activeFilterCount(filters: LeadFilters): number {
  return [filters.status, filters.source, filters.owner, filters.priority, filters.type, filters.country, filters.phone, filters.from || filters.to]
    .filter(Boolean).length
}

export type Query = Record<string, string | number | boolean | null | undefined>

/** The created-from/to pair in order: a range typed backwards is read the right way round. */
export function dateRange(from: string, to: string): { date_from?: string; date_to?: string } {
  const a = isDay(from) ? from : ''
  const b = isDay(to) ? to : ''
  if (a && b && a > b) return { date_from: b, date_to: a }
  return { ...(a ? { date_from: a } : {}), ...(b ? { date_to: b } : {}) }
}

/** The owner filter's "Not assigned" (`?owner=_nobody`): the server's `unassigned=1`; never a person's name. */
export const NOBODY = '_nobody'

/**
 * What `GET inquiries` is asked for a set of filters. Leads are open work only (`active_only`, as the full admin's
 * list: won leads are deals, lost ones stay in Contacts). "Assigned to me" is the person's name: a lead's owner is a
 * name, not an account (`inquiries.assigned_to`).
 */
export function listQuery(filters: LeadFilters, me: string, perPage = 25): Query {
  const sort = SORTS[filters.sort]
  return {
    active_only: true,
    search: filters.q.trim(),
    status: filters.status,
    source: filters.source,
    assigned_to: filters.owner === 'me' ? me : filters.owner === NOBODY ? '' : filters.owner,
    unassigned: filters.owner === NOBODY ? 1 : '',
    priority: filters.priority,
    inquiry_type: filters.type,
    country: filters.country,
    has_phone: filters.phone,
    ...dateRange(filters.from, filters.to),
    task_due: filters.due === 'now' ? '' : filters.due,
    sort: sort.sort,
    dir: sort.dir,
    page: filters.page,
    per_page: perPage,
  }
}

/**
 * "Due now" is two of the server's buckets at once (it filters overdue and today separately), so it is asked as two
 * lists, overdue first, each soonest first.
 */
export function dueSections(filters: LeadFilters, me: string): { key: 'overdue' | 'today'; query: Query }[] {
  if (filters.due !== 'now') return []
  return (['overdue', 'today'] as const).map(key => ({
    key,
    query: { ...listQuery({ ...filters, due: key, sort: 'follow_up', page: 1 }, me, 100) },
  }))
}

/** The CSV export of what the list shows (the same filters, every page). */
export function exportQuery(filters: LeadFilters, me: string): Query {
  const { page: _page, per_page: _perPage, task_due, ...rest } = listQuery(filters, me)
  void _page
  void _perPage
  return { ...rest, task_due: filters.due === 'now' ? '' : task_due, format: 'csv' }
}

/* ─── Pipelines and stages ───────────────────────────────────────────────── */

export function sortedStages(stages: readonly Stage[] | null | undefined): Stage[] {
  return [...(stages ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
}

/** The default pipeline (the one marked so, else the first). */
export function defaultPipeline(pipelines: readonly Pipeline[] | null | undefined): Pipeline | null {
  const list = [...(pipelines ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
  return list.find(p => p.is_default) ?? list[0] ?? null
}

/** The pipeline a lead belongs to: its own, or the default one for a lead that has none (created before pipelines). */
export function pipelineOf(lead: Pick<LeadRow, 'pipeline_id'>, pipelines: readonly Pipeline[] | null | undefined): Pipeline | null {
  return (pipelines ?? []).find(p => p.id === lead.pipeline_id) ?? defaultPipeline(pipelines)
}

const same = (a: string | null | undefined, b: string | null | undefined): boolean =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()

/**
 * The stage a lead is in. Its `status` is the stage's name and every writer sets it (the stage pickers, won and lost,
 * the bulk actions), while `pipeline_stage_id` lags behind the bulk path, so the name decides; the legacy closed names
 * `Confirmed` and `Lost` are the pipeline's won and lost stages; the stage id is the last resort.
 */
export function resolveStage(lead: Pick<LeadRow, 'status' | 'pipeline_stage_id'>, stages: readonly Stage[]): Stage | null {
  const ordered = sortedStages(stages)
  const byName = ordered.find(s => same(s.name, lead.status))
  if (byName) return byName
  if (same(lead.status, 'Confirmed')) return ordered.find(s => s.kind === 'won') ?? null
  if (same(lead.status, 'Lost')) return ordered.find(s => s.kind === 'lost') ?? null
  return ordered.find(s => s.id === lead.pipeline_stage_id) ?? null
}

/** Open, won or lost: from the stage when it is known, else from the legacy closed names. */
export function kindOf(lead: Pick<LeadRow, 'status' | 'pipeline_stage_id'>, stages: readonly Stage[]): StageKind {
  const stage = resolveStage(lead, stages)
  if (stage) return stage.kind
  if (same(lead.status, 'Confirmed')) return 'won'
  if (same(lead.status, 'Lost')) return 'lost'
  return 'open'
}

/** A stage's colour when it is a plain hex colour (it is drawn as a dot); anything else draws nothing. */
export function stageColor(color: string | null | undefined): string | null {
  return color && /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(color) ? color : null
}

/**
 * What choosing a stage does: nothing for the stage it is in; the won or lost flow for a closed stage (they record the
 * close, a lost reason and the timeline entry: `won`, `lost`); else the stage's name as the lead's status.
 */
export type StageMove = { kind: 'none' } | { kind: 'won' } | { kind: 'lost' } | { kind: 'stage'; status: string }

export function moveTo(lead: Pick<LeadRow, 'status' | 'pipeline_stage_id'>, target: Stage, stages: readonly Stage[]): StageMove {
  const current = resolveStage(lead, stages)
  if (current && current.id === target.id) return { kind: 'none' }
  if (target.kind === 'won') return { kind: 'won' }
  if (target.kind === 'lost') return { kind: 'lost' }
  return { kind: 'stage', status: target.name }
}

/* ─── Follow-ups ─────────────────────────────────────────────────────────── */

export type FollowUpState = 'overdue' | 'today' | 'later'

export interface FollowUp { state: FollowUpState; day: string; type: string | null; note: string | null }

/** A lead's next step against the venue's day (`boot.venue.today`): none once done, else overdue, today or later. */
export function followUp(lead: Pick<LeadRow, 'next_task_due' | 'next_task_completed' | 'next_task_type' | 'next_task_notes'>, today: string): FollowUp | null {
  const day = dayOf(lead.next_task_due)
  if (lead.next_task_completed) return null
  if (!day && !lead.next_task_type) return null
  const state: FollowUpState = !day ? 'later' : day < today ? 'overdue' : day === today ? 'today' : 'later'
  return { state, day, type: lead.next_task_type || null, note: lead.next_task_notes || null }
}

export interface NextStepDraft { type: string; day: string; note: string }

export function validateNextStep(draft: NextStepDraft): Partial<Record<keyof NextStepDraft, 'required' | 'too_long' | 'invalid'>> {
  const errors: Partial<Record<keyof NextStepDraft, 'required' | 'too_long' | 'invalid'>> = {}
  if (!draft.type.trim()) errors.type = 'required'
  else if (draft.type.trim().length > 50) errors.type = 'too_long'
  if (draft.day && !isDay(draft.day)) errors.day = 'invalid'
  return errors
}

/** `PUT inquiries/{id}` for a next step, as the full admin's task editor writes it (an open step again). */
export function nextStepBody(draft: NextStepDraft): Record<string, string | boolean | null> {
  return {
    next_task_type: draft.type.trim() || null,
    next_task_due: isDay(draft.day) ? draft.day : null,
    next_task_notes: draft.note.trim() || null,
    next_task_completed: false,
  }
}

export const CLEAR_NEXT_STEP = { next_task_type: null, next_task_due: null, next_task_notes: null, next_task_completed: false } as const

/* ─── The create form ────────────────────────────────────────────────────── */

export interface LeadDraft {
  contact: 'new' | 'existing'
  guestId: number | null
  name: string
  email: string
  phone: string
  company: string
  country: string
  status: string
  source: string
  value: string
  priority: string
  owner: string
  /** The enquiry type (`inquiry_type`), where the organisation has a list of them. */
  type: string
  notes: string
  checkIn: string
  checkOut: string
  rooms: string
  adults: string
  children: string
  /** A hotel guest's special requests. */
  requests: string
  custom: Record<string, unknown>
}

export const EMPTY_LEAD: LeadDraft = {
  contact: 'new', guestId: null, name: '', email: '', phone: '', company: '', country: '', status: '', source: '', value: '',
  priority: '', owner: '', type: '', notes: '', checkIn: '', checkOut: '', rooms: '', adults: '', children: '', requests: '', custom: {},
}

export type LeadField = 'name' | 'guest' | 'email' | 'value' | 'checkOut' | 'rooms' | 'adults' | 'children'
export type LeadProblem = 'required' | 'email' | 'number' | 'dates' | 'too_long'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const number = (value: string): number | null => {
  const clean = value.replace(',', '.').trim()
  if (clean === '') return null
  const n = Number(clean)
  return Number.isFinite(n) ? n : Number.NaN
}

/** What stops the form, by field (the server checks again: GuestController::store, InquiryController::store). */
export function validateLead(draft: LeadDraft): Partial<Record<LeadField, LeadProblem>> {
  const errors: Partial<Record<LeadField, LeadProblem>> = {}
  if (draft.contact === 'existing') {
    if (!draft.guestId) errors.guest = 'required'
  } else {
    if (!draft.name.trim()) errors.name = 'required'
    else if (draft.name.trim().length > 200) errors.name = 'too_long'
    if (draft.email.trim() && !EMAIL.test(draft.email.trim())) errors.email = 'email'
  }
  const value = number(draft.value)
  if (value !== null && (Number.isNaN(value) || value < 0)) errors.value = 'number'
  if (draft.checkIn && draft.checkOut && isDay(draft.checkIn) && isDay(draft.checkOut) && draft.checkOut < draft.checkIn) errors.checkOut = 'dates'
  const whole = (raw: string, min: number): boolean => {
    const n = number(raw)
    return n === null || (!Number.isNaN(n) && n >= min && Number.isInteger(n))
  }
  if (!whole(draft.rooms, 1)) errors.rooms = 'number'
  if (!whole(draft.adults, 1)) errors.adults = 'number'
  if (!whole(draft.children, 0)) errors.children = 'number'
  return errors
}

/** `POST guests` for a new contact: the name and what was typed, nothing empty. */
export function guestBody(draft: LeadDraft): Record<string, string> {
  const body: Record<string, string> = { full_name: draft.name.trim() }
  for (const [key, value] of [['email', draft.email], ['phone', draft.phone], ['company', draft.company], ['country', draft.country]] as const) {
    if (value.trim()) body[key] = value.trim()
  }
  return body
}

/** `POST inquiries`: the contact, the stage's name, and only what was filled in. Stay fields only where they are shown. */
export function leadBody(draft: LeadDraft, guestId: number, opts: { stay: boolean; fields: readonly CustomField[] }): Record<string, unknown> {
  const body: Record<string, unknown> = { guest_id: guestId }
  const put = (key: string, value: string) => { if (value.trim()) body[key] = value.trim() }
  put('status', draft.status)
  put('source', draft.source)
  put('priority', draft.priority)
  put('assigned_to', draft.owner)
  put('inquiry_type', draft.type)
  put('notes', draft.notes)
  const value = number(draft.value)
  if (value !== null && !Number.isNaN(value)) body.total_value = value
  if (opts.stay) {
    if (isDay(draft.checkIn)) body.check_in = draft.checkIn
    if (isDay(draft.checkOut)) body.check_out = draft.checkOut
    for (const [key, raw] of [['num_rooms', draft.rooms], ['num_adults', draft.adults], ['num_children', draft.children]] as const) {
      const n = number(raw)
      if (n !== null && !Number.isNaN(n)) body[key] = n
    }
    put('special_requests', draft.requests)
  }
  const custom = customBody(opts.fields, draft.custom)
  if (Object.keys(custom).length > 0) body.custom_data = custom
  return body
}

/** The first open stage of a pipeline: where a new lead starts unless someone picks another. */
export function firstOpenStage(stages: readonly Stage[]): Stage | null {
  return sortedStages(stages).find(s => s.kind === 'open') ?? null
}

/* ─── Owners, sources, priorities (crm-settings) ─────────────────────────── */

/**
 * One list from `GET crm-settings`, read the way the full admin's useSettings does: a JSON string is parsed, an object
 * with numeric keys is a list, a list of objects is their names; anything else is the fallback.
 */
export function settingList(settings: Record<string, unknown> | null | undefined, key: string, fallback: readonly string[]): string[] {
  let value: unknown = settings?.[key]
  if (value === null || value === undefined) return [...fallback]
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return [...fallback] }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) value = Object.values(value as Record<string, unknown>)
  if (!Array.isArray(value)) return [...fallback]
  return value
    .map(item => (item && typeof item === 'object' ? String((item as { name?: unknown }).name ?? '') : String(item ?? '')))
    .map(s => s.trim())
    .filter(Boolean)
}

/** The full admin's fallbacks when an organisation saved none. */
export const DEFAULT_PRIORITIES = ['Low', 'Medium', 'High'] as const
export const DEFAULT_SOURCES = ['Website', 'Phone', 'Email', 'Walk-in', 'Booking.com', 'Expedia', 'Travel Agent', 'Referral', 'Social Media'] as const
/** Sources the system writes (the chat assistant, the booking widget): offered first, named in our words. */
export const SYSTEM_SOURCES = ['chatbot', 'booking_widget', 'booking_widget_failed'] as const

/** The sources to offer: the system's, the organisation's, and the one a lead already has. */
export function sourceOptions(saved: readonly string[], current?: string | null): string[] {
  return unique([...SYSTEM_SOURCES, ...saved, ...(current ? [current] : [])])
}

/** Who a lead can belong to: the person first, the organisation's lead owners, the team, and whoever has it now. */
export function ownerOptions(me: string, leadOwners: readonly string[], team: readonly { name: string }[], current?: string | null): string[] {
  return unique([me, ...leadOwners, ...team.map(p => p.name), ...(current ? [current] : [])])
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const value = (raw ?? '').trim()
    if (!value || seen.has(value.toLowerCase())) continue
    seen.add(value.toLowerCase())
    out.push(value)
  }
  return out
}

/* ─── Bulk actions ───────────────────────────────────────────────────────── */

export type BulkAction = 'set_status' | 'set_priority' | 'set_assigned_to' | 'mark_won' | 'mark_lost' | 'mark_for_reengagement' | 'delete'

/** `POST inquiries/bulk`: the chosen ids (at most 500, the server's limit) and the action. */
export function bulkBody(ids: Iterable<number>, action: BulkAction, value?: string): { ids: number[]; action: BulkAction; value?: string } | null {
  const list = [...new Set(ids)].filter(id => Number.isInteger(id) && id > 0).slice(0, 500)
  if (list.length === 0) return null
  if ((action === 'set_status' || action === 'set_priority') && !value) return null
  return { ids: list, action, ...(value !== undefined ? { value } : {}) }
}

export function toggled(selected: ReadonlySet<number>, id: number): Set<number> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** Select every row shown, or none when every one already is. */
export function toggledAll(selected: ReadonlySet<number>, ids: readonly number[]): Set<number> {
  const all = ids.length > 0 && ids.every(id => selected.has(id))
  const next = new Set(selected)
  for (const id of ids) {
    if (all) next.delete(id)
    else next.add(id)
  }
  return next
}

/* ─── Closing, notes, contact ────────────────────────────────────────────── */

/** `POST inquiries/{id}/lost`: a reason is required (the taxonomy feeds the lost-reasons report). */
export function lostBody(reasonId: number | null, note: string): { lost_reason_id: number; note?: string } | null {
  if (!reasonId) return null
  const clean = note.trim().slice(0, 1000)
  return { lost_reason_id: reasonId, ...(clean ? { note: clean } : {}) }
}

export function wonBody(note: string): { note?: string } {
  const clean = note.trim().slice(0, 1000)
  return clean ? { note: clean } : {}
}

export type ActivityType = 'note' | 'call' | 'email' | 'meeting'
export const ACTIVITY_TYPES: readonly ActivityType[] = ['note', 'call', 'email', 'meeting']

/**
 * `POST inquiries/{id}/activities`: something to say (a subject or a body) and nothing beyond the server's limits; a
 * call or meeting may carry how long it took (0 to 1440 minutes).
 */
export function activityBody(type: ActivityType, subject: string, body: string, minutes?: number | null): { type: ActivityType; subject?: string; body?: string; duration_minutes?: number } | null {
  const s = subject.trim().slice(0, 200)
  const b = body.trim().slice(0, 8000)
  if (!s && !b) return null
  const timed = (type === 'call' || type === 'meeting') && typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440
  return { type, ...(s ? { subject: s } : {}), ...(b ? { body: b } : {}), ...(timed ? { duration_minutes: minutes } : {}) }
}

export type ContactChannel = 'call' | 'email' | 'sms' | 'whatsapp'
export const CONTACT_CHANNELS: readonly ContactChannel[] = ['call', 'email', 'whatsapp', 'sms']

/** `POST inquiries/{id}/log-contact`. */
export function logContactBody(channel: ContactChannel, note: string): { channel: ContactChannel; note?: string } {
  const clean = note.trim().slice(0, 500)
  return { channel, ...(clean ? { note: clean } : {}) }
}

/** What deleting a lead takes with it, the counts that are not zero (`delete-impact`). Reservations stay, unlinked. */
export function impactOf(impact: DeleteImpact | null | undefined): { key: 'activities' | 'tasks' | 'attachments' | 'reservations'; count: number }[] {
  if (!impact) return []
  return (['activities', 'tasks', 'attachments', 'reservations'] as const)
    .map(key => ({ key, count: Number(impact[key]) || 0 }))
    .filter(row => row.count > 0)
}

/** The AI's win probability as a tone: likely, maybe, unlikely. */
export function winTone(probability: number | null | undefined): 'success' | 'pending' | 'danger' | null {
  if (typeof probability !== 'number' || Number.isNaN(probability)) return null
  return probability >= 70 ? 'success' : probability >= 40 ? 'pending' : 'danger'
}

/**
 * Whether a lead has stay details worth a card: its dates, or more than one room. `num_rooms` (and the adults) default
 * to 1 in the database, so a clinic's or a salon's lead carries them too and they say nothing on their own.
 */
export function hasStay(lead: Pick<LeadRow, 'check_in' | 'check_out' | 'num_rooms'>): boolean {
  return Boolean(dayOf(lead.check_in) || dayOf(lead.check_out) || (lead.num_rooms ?? 0) > 1)
}

/** A file size in the person's units: "820 KB", "2.4 MB". */
export function fileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The newest conversation of a lead's chat history (the server sends them newest first; checked anyway). */
export function newestConversation<T extends { id: number; last_message_at: string | null }>(conversations: readonly T[]): T | null {
  return [...conversations].sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))[0] ?? null
}

/** A number of money from the server ("1250.00", 1250, null). */
export function amount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/* ─── Custom fields ──────────────────────────────────────────────────────── */

/** The active fields of an entity, in their order. */
export function activeFields(fields: readonly CustomField[] | null | undefined): CustomField[] {
  return [...(fields ?? [])].filter(f => f.is_active).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
}

const emptyValue = (v: unknown): boolean => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

/** `custom_data` as the server checks it (CustomFieldService::validate): typed, nothing empty, nothing unknown. */
export function customBody(fields: readonly CustomField[], draft: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = draft[field.key]
    if (field.type === 'checkbox') {
      if (raw === true) out[field.key] = true
      continue
    }
    if (emptyValue(raw)) continue
    if (field.type === 'number') {
      const n = number(String(raw))
      if (n !== null && !Number.isNaN(n)) out[field.key] = n
      continue
    }
    if (field.type === 'multiselect') {
      const list = (Array.isArray(raw) ? raw : [raw]).map(String).filter(Boolean)
      if (list.length) out[field.key] = list
      continue
    }
    out[field.key] = String(raw).trim()
  }
  return out
}

/** The required fields left empty (the server says so too, as `custom_data.<key>`). */
export function missingCustom(fields: readonly CustomField[], draft: Record<string, unknown>): string[] {
  return fields.filter(f => f.required && (f.type === 'checkbox' ? draft[f.key] !== true : emptyValue(draft[f.key]))).map(f => f.key)
}

/** A field's value as text for reading ("Yes", a list joined, a day as given). */
export function customText(field: CustomField, value: unknown, yes: string, no: string): string {
  if (field.type === 'checkbox') return value === true ? yes : value === false ? no : ''
  if (emptyValue(value)) return ''
  if (Array.isArray(value)) return value.map(String).join(', ')
  return String(value)
}

/** The field-error keys of a 422 (`custom_data.<key>`) that belong to custom fields, by field key. */
export function customErrors(fields: Record<string, string[]> | undefined): string[] {
  return Object.keys(fields ?? {}).filter(k => k.startsWith('custom_data.')).map(k => k.slice('custom_data.'.length))
}

/* ─── A lead's details ───────────────────────────────────────────────────── */

export interface DetailsDraft { value: string; priority: string; owner: string; source: string; type: string; notes: string }

export function detailsDraft(lead: Pick<LeadRow, 'total_value' | 'priority' | 'assigned_to' | 'source'> & { notes?: string | null; inquiry_type?: string | null }): DetailsDraft {
  const value = amount(lead.total_value)
  return {
    value: value === null ? '' : String(value),
    priority: lead.priority ?? '',
    owner: lead.assigned_to ?? '',
    source: lead.source ?? '',
    type: lead.inquiry_type ?? '',
    notes: lead.notes ?? '',
  }
}

/**
 * `PUT inquiries/{id}` with only what changed (an emptied box clears the value). `problem` when the value is not a
 * number of zero or more; `body` null when nothing changed.
 */
export function detailsPatch(lead: Parameters<typeof detailsDraft>[0], draft: DetailsDraft): { body: Record<string, unknown> | null; problem?: 'number' } {
  const before = detailsDraft(lead)
  const body: Record<string, unknown> = {}
  if (draft.value.trim() !== before.value) {
    const n = number(draft.value)
    if (n !== null && (Number.isNaN(n) || n < 0)) return { body: null, problem: 'number' }
    if (n !== amount(lead.total_value)) body.total_value = n
  }
  for (const [key, field] of [['priority', 'priority'], ['assigned_to', 'owner'], ['source', 'source'], ['inquiry_type', 'type'], ['notes', 'notes']] as const) {
    const next = draft[field].trim()
    if (next !== before[field].trim()) body[key] = next || null
  }
  return { body: Object.keys(body).length ? body : null }
}
