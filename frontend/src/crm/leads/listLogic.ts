import {
  amount, dayOf, DEFAULT_PRIORITIES, EMPTY_LEAD, isDay, readFilters, resolveStage, sortedStages, SYSTEM_SOURCES,
  type LeadDraft, type LeadFilters,
} from './leadLogic'
import type { CaptureAnswer, EmailTemplate, LeadRow, SavedView, Stage } from './leadTypes'

/**
 * Round 2's list decisions (the main platform's Leads, 2026-11-07), as pure functions: which columns a person sees
 * (crm-settings `inquiry_fields.list`, the full admin's own switch), what a saved view stores (`saved-views`, shared
 * with the full admin's Leads page), how fresh a lead is, when its next step falls on the venue's day, what the AI
 * read from a pasted message becomes in the form, whether an email template may go to a contact, the team's columns
 * and the stage bar of a lead. The server decides the rest.
 */

/* ─── Settings objects (crm-settings) ────────────────────────────────────── */

/** One object setting of `GET crm-settings` (stored as JSON, sometimes as a JSON string), or {} for anything else. */
export function settingObject(settings: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> {
  let value: unknown = settings?.[key]
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return {} }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** A setting's `list` part as switches over `defaults`: a key saved as false is off, as true on, else its default. */
export function columnsOf<K extends string>(settings: Record<string, unknown> | null | undefined, settingKey: string, defaults: Record<K, boolean>): Record<K, boolean> {
  const list = settingObject(settingObject(settings, settingKey), 'list')
  const out = { ...defaults }
  for (const key of Object.keys(defaults) as K[]) {
    if (list[key] === false) out[key] = false
    else if (list[key] === true) out[key] = true
  }
  return out
}

/**
 * `PUT crm-settings/{key}` for one column switched: the whole saved setting (its form and detail parts, and keys this
 * workspace does not know) with only `list.<column>` changed, as the full admin's column popover writes it.
 */
export function columnsBody(settings: Record<string, unknown> | null | undefined, settingKey: string, column: string, on: boolean): { value: Record<string, unknown> } {
  const whole = settingObject(settings, settingKey)
  const list = settingObject(whole, 'list')
  return { value: { ...whole, list: { ...list, [column]: on } } }
}

/** The settings with one column switched, for the cache before the server answers. */
export function withColumn(settings: Record<string, unknown> | null | undefined, settingKey: string, column: string, on: boolean): Record<string, unknown> {
  return { ...(settings ?? {}), [settingKey]: columnsBody(settings, settingKey, column, on).value }
}

/** The leads list's optional columns (the full admin's `INQUIRY_LIST_FIELD_META`, without its bulk-select switch). */
export type LeadColumn = 'value' | 'ai_signal' | 'next_task' | 'owner' | 'touches' | 'stay' | 'country'
export const LEAD_COLUMNS: readonly LeadColumn[] = ['value', 'ai_signal', 'next_task', 'owner', 'touches', 'stay', 'country']
/** The full admin's defaults (`DEFAULT_INQUIRY_FIELDS.list`). */
export const LEAD_COLUMN_DEFAULTS: Record<LeadColumn, boolean> = {
  value: true, ai_signal: true, next_task: true, owner: true, touches: true, stay: true, country: false,
}

/** The columns a person sees: the organisation's choice; the stay only at a hotel. */
export function leadColumns(settings: Record<string, unknown> | null | undefined, hotel: boolean): Record<LeadColumn, boolean> {
  const cols = columnsOf(settings, 'inquiry_fields', LEAD_COLUMN_DEFAULTS)
  return { ...cols, stay: cols.stay && hotel }
}

/** The columns the Columns menu offers. */
export function leadColumnChoices(hotel: boolean): LeadColumn[] {
  return LEAD_COLUMNS.filter(key => key !== 'stay' || hotel)
}

/* ─── Saved views (saved-views, the full admin's own) ────────────────────── */

/** The page the full admin's Leads keeps its views under: a view saved there shows here, and the other way round. */
export const VIEW_PAGE = 'inquiries'

const s = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Whether there is something to save: a search, a follow-up filter, a panel filter or a sort. */
export function hasViewState(f: LeadFilters): boolean {
  return Boolean(f.q.trim() || f.due || f.status || f.source || f.owner || f.priority || f.type || f.country || f.phone || f.from || f.to || f.sort !== 'newest')
}

/**
 * What a saved view stores: the full admin's keys (so its Leads page applies the view) and, under `crm`, this
 * workspace's own filters. "Mine" is the person's name for the full admin, whose owner filter is a name.
 */
export function viewFilters(f: LeadFilters, me: string): Record<string, unknown> {
  const crm = Object.fromEntries(Object.entries({
    q: f.q.trim(), due: f.due, status: f.status, source: f.source, owner: f.owner, priority: f.priority, type: f.type,
    country: f.country, phone: f.phone, from: f.from, to: f.to, sort: f.sort === 'newest' ? '' : f.sort,
  }).filter(([, v]) => v))
  return {
    status: f.status, priority: f.priority, inquiryType: f.type, propertyId: '', assignedTo: f.owner === 'me' ? me : f.owner,
    source: f.source, taskDue: f.due === 'now' ? '' : f.due, country: f.country, hasPhone: f.phone,
    crm,
  }
}

/** A saved view's filters: this workspace's own when it saved them, else read from the full admin's keys. */
export function filtersFromView(raw: Record<string, unknown> | null | undefined, me: string): LeadFilters {
  const sp = new URLSearchParams()
  const set = (key: string, value: string) => { if (value) sp.set(key, value) }
  const crm = raw?.crm && typeof raw.crm === 'object' && !Array.isArray(raw.crm) ? (raw.crm as Record<string, unknown>) : null
  if (crm) {
    set('q', s(crm.q))
    set('due', s(crm.due) === 'now' ? '1' : s(crm.due))
    set('stage', s(crm.status))
    for (const key of ['source', 'owner', 'priority', 'type', 'country', 'phone', 'from', 'to', 'sort']) set(key, s(crm[key]))
  } else if (raw) {
    set('stage', s(raw.status))
    set('priority', s(raw.priority))
    set('type', s(raw.inquiryType))
    const owner = s(raw.assignedTo)
    set('owner', owner && owner === me ? 'me' : owner)
    set('source', s(raw.source))
    set('due', ['today', 'overdue', 'soon'].includes(s(raw.taskDue)) ? s(raw.taskDue) : '')
    set('country', s(raw.country))
    set('phone', s(raw.hasPhone))
  }
  return { ...readFilters(sp), page: 1 }
}

/** `POST saved-views`: the name (the server allows 80 characters) and the filters, pinned. */
export function viewBody(name: string, f: LeadFilters, me: string): { page: string; name: string; filters: Record<string, unknown>; is_pinned: boolean } | null {
  const clean = name.trim().slice(0, 80)
  if (!clean || !hasViewState(f)) return null
  return { page: VIEW_PAGE, name: clean, filters: viewFilters(f, me), is_pinned: true }
}

/** Pinned views first, then the others, each in the person's order. */
export function orderedViews(views: readonly SavedView[] | null | undefined): SavedView[] {
  return [...(views ?? [])].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || a.sort_order - b.sort_order || a.id - b.id)
}

/* ─── Freshness and the next step's day ──────────────────────────────────── */

export type Freshness = { kind: 'fresh' } | { kind: 'cold'; days: number } | { kind: 'age'; days: number }

/**
 * How fresh a lead is (the full admin's FreshnessBadge): new in the last 24 hours; cold after seven days without a
 * touch (or seven days old and never touched); else its age in days. Closed leads have none.
 */
export function freshness(createdAt: string | null | undefined, lastContactAt: string | null | undefined, now: Date, closed = false): Freshness | null {
  if (closed || !createdAt) return null
  const created = Date.parse(createdAt)
  if (Number.isNaN(created)) return null
  const age = Math.floor((now.getTime() - created) / 86_400_000)
  const touched = lastContactAt ? Date.parse(lastContactAt) : Number.NaN
  const sinceTouch = Number.isNaN(touched) ? null : Math.floor((now.getTime() - touched) / 86_400_000)
  if (age < 1) return { kind: 'fresh' }
  if ((sinceTouch === null && age >= 7) || (sinceTouch !== null && sinceTouch >= 7)) return { kind: 'cold', days: sinceTouch ?? age }
  return { kind: 'age', days: age }
}

/** Whole days from one calendar day to another (`2026-11-05` → `2026-11-07` is 2). */
export function daysBetween(from: string, to: string): number {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from)
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(to)
  if (!a || !b) return 0
  return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86_400_000)
}

export type DueIn = { state: 'late'; days: number } | { state: 'today' } | { state: 'tomorrow' } | { state: 'soon'; days: number } | { state: 'later'; day: string }

/** When a next step falls against the venue's day: days late, today, tomorrow, in a few days, or its date. */
export function dueIn(day: string | null | undefined, today: string): DueIn | null {
  const d = dayOf(day)
  if (!isDay(d) || !isDay(today)) return null
  const n = daysBetween(today, d)
  if (n < 0) return { state: 'late', days: -n }
  if (n === 0) return { state: 'today' }
  if (n === 1) return { state: 'tomorrow' }
  if (n < 7) return { state: 'soon', days: n }
  return { state: 'later', day: d }
}

/* ─── The AI's signals ──────────────────────────────────────────────────── */

export interface AiSignal {
  probability: number | null
  cold: 'low' | 'medium' | 'high' | null
  action: string | null
  brief: string | null
  intent: string | null
}

/** What the AI said about a lead, or null when it has not read it yet. A probability is kept between 0 and 100. */
export function aiSignal(lead: Pick<LeadRow, 'ai_win_probability' | 'ai_going_cold_risk' | 'ai_suggested_action' | 'ai_brief' | 'ai_intent'>): AiSignal | null {
  const p = typeof lead.ai_win_probability === 'number' && Number.isFinite(lead.ai_win_probability) ? Math.max(0, Math.min(100, Math.round(lead.ai_win_probability))) : null
  const risk = (lead.ai_going_cold_risk ?? '').toLowerCase()
  const cold = risk === 'low' || risk === 'medium' || risk === 'high' ? risk : null
  const out: AiSignal = { probability: p, cold, action: lead.ai_suggested_action?.trim() || null, brief: lead.ai_brief?.trim() || null, intent: lead.ai_intent || null }
  return out.probability === null && !out.cold && !out.action && !out.brief && !out.intent ? null : out
}

/* ─── Priority ───────────────────────────────────────────────────────────── */

/** A priority's tone: the organisation's highest is urgent, its lowest quiet (by its place in the list). */
export function priorityTone(priority: string | null | undefined, priorities: readonly string[] = DEFAULT_PRIORITIES): 'danger' | 'pending' | 'neutral' | null {
  if (!priority) return null
  const list = priorities.length ? priorities : DEFAULT_PRIORITIES
  const i = list.findIndex(p => p.toLowerCase() === priority.toLowerCase())
  if (i < 0) return 'neutral'
  if (list.length > 1 && i === list.length - 1) return 'danger'
  if (i === 0) return 'neutral'
  return 'pending'
}

/* ─── The stage bar on a lead's page ─────────────────────────────────────── */

export interface StageStep { stage: Stage; state: 'done' | 'current' | 'next' }

/**
 * A lead's open stages in order, those before its own done, its own current; the won and lost stages are the bar's
 * two ends, current when the lead is closed there.
 */
export function stageSteps(lead: Pick<LeadRow, 'status' | 'pipeline_stage_id'>, stages: readonly Stage[]): { open: StageStep[]; won: Stage | null; lost: Stage | null; current: Stage | null } {
  const ordered = sortedStages(stages)
  const current = resolveStage(lead, ordered)
  const open = ordered.filter(st => st.kind === 'open')
  const at = current && current.kind === 'open' ? open.findIndex(st => st.id === current.id) : current?.kind === 'won' ? open.length : -1
  return {
    open: open.map((stage, i) => ({ stage, state: i < at ? 'done' : i === at ? 'current' : 'next' })),
    won: ordered.find(st => st.kind === 'won') ?? null,
    lost: ordered.find(st => st.kind === 'lost') ?? null,
    current,
  }
}

/* ─── The team's columns (who a lead belongs to) ─────────────────────────── */

export interface OwnerColumn { owner: string | null; leads: LeadRow[]; count: number; value: number }

/**
 * One column for the leads nobody owns, then one per owner the organisation knows (in the order given), then any other
 * owner a lead names. A lead's owner is a name (`inquiries.assigned_to`), matched without regard to case.
 */
export function ownerColumns(leads: readonly LeadRow[], owners: readonly string[]): OwnerColumn[] {
  const keyOf = (name: string | null | undefined) => (name ?? '').trim().toLowerCase()
  const order: (string | null)[] = [null]
  const seen = new Set<string>([''])
  for (const raw of [...owners, ...leads.map(l => l.assigned_to ?? '')]) {
    const name = raw.trim()
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    order.push(name)
  }
  return order.map(owner => {
    const mine = leads.filter(l => keyOf(l.assigned_to) === keyOf(owner))
    return { owner, leads: mine, count: mine.length, value: Math.round(mine.reduce((n, l) => n + (amount(l.total_value) ?? 0), 0) * 100) / 100 }
  })
}

/** The list's cache after a lead was given to someone, so it shows there before the server answers. */
export function withOwner<T extends { data: LeadRow[] }>(page: T | undefined, leadId: number, owner: string | null): T | undefined {
  if (!page) return page
  return { ...page, data: page.data.map(lead => (lead.id === leadId ? { ...lead, assigned_to: owner } : lead)) }
}

/** The team column a phone shows: the chosen one, else the first with leads, else the first. */
export function phoneOwner(columns: readonly OwnerColumn[], chosen: string | null | undefined): OwnerColumn | null {
  if (chosen !== undefined) {
    const hit = columns.find(c => (c.owner ?? '') === (chosen ?? ''))
    if (hit) return hit
  }
  return columns.find(c => c.count > 0) ?? columns[0] ?? null
}

/* ─── AI capture: a pasted message into the form ─────────────────────────── */

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim())

/** One of `options`, matched without regard to case, else what was read (kept so a person sees it), else ''. */
function pick(value: string, options: readonly string[], keepUnknown: boolean): string {
  if (!value) return ''
  return options.find(o => o.toLowerCase() === value.toLowerCase()) ?? (keepUnknown ? value : '')
}

/**
 * The form a capture fills: the contact (always a new one), the value, the priority and type as the organisation names
 * them, the source, the notes (the summary, then any special requests), and a hotel's stay. Nothing is sent: the person
 * reads the form and adds the lead.
 */
export function draftFromCapture(answer: CaptureAnswer | null | undefined, opts: { owner: string; priorities: readonly string[]; sources: readonly string[]; types: readonly string[]; hotel: boolean }): LeadDraft | null {
  const d = answer?.success ? answer.data : null
  if (!d) return null
  const value = amount(text(d.total_value).replace(',', '.'))
  const whole = (v: unknown, min: number): string => {
    const n = Number(text(v))
    return Number.isInteger(n) && n >= min ? String(n) : ''
  }
  const notes = [text(d.notes), opts.hotel ? '' : text(d.special_requests)].filter(Boolean).join('\n\n')
  return {
    ...EMPTY_LEAD,
    contact: 'new',
    name: text(d.customer_name).slice(0, 200),
    email: text(d.email),
    phone: text(d.phone),
    company: text(d.company),
    country: text(d.country),
    owner: opts.owner,
    value: value !== null && value >= 0 ? String(value) : '',
    priority: pick(text(d.priority), opts.priorities, false),
    source: pick(text(d.source), [...SYSTEM_SOURCES, ...opts.sources], true),
    type: pick(text(d.inquiry_type), opts.types, opts.types.length > 0),
    notes,
    checkIn: opts.hotel && isDay(text(d.check_in)) ? text(d.check_in) : '',
    checkOut: opts.hotel && isDay(text(d.check_out)) ? text(d.check_out) : '',
    rooms: opts.hotel ? whole(d.num_rooms, 1) : '',
    adults: opts.hotel ? whole(d.num_adults, 1) : '',
    children: opts.hotel ? whole(d.num_children, 0) : '',
    requests: opts.hotel ? text(d.special_requests) : '',
  }
}

/** What a capture may send: something to read, within the server's 10 000 characters. */
export function captureText(raw: string): string | null {
  const clean = raw.trim()
  return clean.length >= 10 ? clean.slice(0, 10_000) : null
}

/* ─── Email templates: what may go to this contact ───────────────────────── */

/** The tags a template's server fills from a loyalty member's record (EmailTemplate::render). */
export const MEMBER_TAGS = ['member_name', 'first_name', 'email', 'member_number', 'tier_name', 'points_balance', 'lifetime_points', 'referral_code'] as const

/** The merge tags a template's subject and body use (`{{tag}}`, as the server reads them). */
export function templateTags(template: Pick<EmailTemplate, 'subject' | 'html_body'>): string[] {
  const found = `${template.subject ?? ''} ${template.html_body ?? ''}`.match(/\{\{[a-z_]+\}\}/g) ?? []
  return [...new Set(found.map(tag => tag.slice(2, -2)))]
}

/**
 * Whether a template may go to this contact. Without a member behind the contact the server fills a member's tags from
 * the first active member it finds (EmailTemplateController::sendOnce), which would show another person's name, card
 * number and points: such a template is refused here, naming the tags. The venue's name and the year are safe.
 */
export function templateSendable(template: Pick<EmailTemplate, 'subject' | 'html_body'>, memberId: number | null | undefined): { ok: true } | { ok: false; tags: string[] } {
  if (memberId) return { ok: true }
  const tags = templateTags(template).filter(tag => (MEMBER_TAGS as readonly string[]).includes(tag))
  return tags.length ? { ok: false, tags } : { ok: true }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** `POST email-templates/{id}/send`: an address, the member when there is one, a subject only when one is typed. */
export function templateSendBody(to: string, memberId: number | null | undefined, subject: string): { to: string; member_id?: number; subject?: string } | null {
  const address = to.trim()
  if (!EMAIL.test(address) || address.length > 191) return null
  const clean = subject.trim().slice(0, 255)
  return { to: address, ...(memberId ? { member_id: memberId } : {}), ...(clean ? { subject: clean } : {}) }
}

/** Templates whose name or subject holds the words typed. */
export function searchTemplates<T extends Pick<EmailTemplate, 'name' | 'subject'>>(templates: readonly T[], q: string): T[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return [...templates]
  return templates.filter(t => `${t.name} ${t.subject}`.toLowerCase().includes(needle))
}

/* ─── A contact's details, changed from a lead ──────────────────────────── */

export interface ContactDraft { name: string; company: string; email: string; phone: string; country: string }

export function contactDraft(guest: { full_name?: string | null; company?: string | null; email?: string | null; phone?: string | null; mobile?: string | null; country?: string | null } | null | undefined): ContactDraft {
  return {
    name: guest?.full_name ?? '', company: guest?.company ?? '', email: guest?.email ?? '',
    phone: guest?.phone ?? '', country: guest?.country ?? '',
  }
}

/**
 * `PUT guests/{id}` with only what changed; an emptied box is sent as null, which clears it (round 2's server). A name
 * is required and an email must look like one.
 */
export function contactPatch(guest: Parameters<typeof contactDraft>[0], draft: ContactDraft): { body: Record<string, string | null> | null; problem?: 'name' | 'email' } {
  if (!draft.name.trim()) return { body: null, problem: 'name' }
  if (draft.email.trim() && !EMAIL.test(draft.email.trim())) return { body: null, problem: 'email' }
  const before = contactDraft(guest)
  const body: Record<string, string | null> = {}
  for (const [key, field] of [['full_name', 'name'], ['company', 'company'], ['email', 'email'], ['phone', 'phone'], ['country', 'country']] as const) {
    const next = draft[field].trim()
    if (next !== before[field].trim()) body[key] = next || null
  }
  return { body: Object.keys(body).length ? body : null }
}

/* ─── The timeline's filter ──────────────────────────────────────────────── */

/** The timeline's kinds to filter by (the server's `type`), as the full admin's lead page offers them. */
export const TIMELINE_KINDS = ['', 'note', 'call', 'email', 'meeting', 'status_change', 'task_completed'] as const
export type TimelineKind = (typeof TIMELINE_KINDS)[number]

/** `POST inquiries/{id}/activities` for a call or meeting with its length, 0 to 1440 minutes. */
export function minutesOf(raw: string): number | null {
  const n = Number(raw.trim())
  return raw.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 1440 ? n : null
}

/* ─── Reaching a contact from a row ─────────────────────────────────────── */

/** The links to write, call or message a contact: an email, a phone (its digits), WhatsApp and a text message. */
export function contactLinks(guest: { email?: string | null; phone?: string | null; mobile?: string | null } | null | undefined): { email?: string; call?: string; whatsapp?: string; sms?: string } {
  const out: { email?: string; call?: string; whatsapp?: string; sms?: string } = {}
  const email = guest?.email?.trim()
  if (email && EMAIL.test(email)) out.email = `mailto:${email}`
  const usable = (raw: string | null | undefined): string | null => {
    const digits = (raw ?? '').trim().replace(/[^\d+]/g, '')
    return digits.replace(/\D/g, '').length >= 6 ? digits : null
  }
  // A call goes to the phone first; a message to the mobile first.
  const call = usable(guest?.phone) ?? usable(guest?.mobile)
  const text = usable(guest?.mobile) ?? usable(guest?.phone)
  if (call) out.call = `tel:${call}`
  if (text) {
    out.sms = `sms:${text}`
    out.whatsapp = `https://wa.me/${text.replace(/\D/g, '')}`
  }
  return out
}

/* ─── The toolbar's chips ───────────────────────────────────────────────── */

export type ChipKey = 'q' | 'due' | 'status' | 'source' | 'owner' | 'priority' | 'type' | 'country' | 'phone' | 'dates'

/**
 * The filters in force, as removable chips: each with what removing it clears. The follow-up filter is the list's only
 * (the board and the team show every open lead).
 */
export function activeChips(f: LeadFilters, onList: boolean): { key: ChipKey; clear: Partial<LeadFilters> }[] {
  const out: { key: ChipKey; clear: Partial<LeadFilters> }[] = []
  if (f.q.trim()) out.push({ key: 'q', clear: { q: '' } })
  if (onList && f.due) out.push({ key: 'due', clear: { due: '' } })
  for (const key of ['status', 'source', 'owner', 'priority', 'type', 'country', 'phone'] as const) {
    if (f[key]) out.push({ key, clear: { [key]: '' } })
  }
  if (f.from || f.to) out.push({ key: 'dates', clear: { from: '', to: '' } })
  return out
}

/* ─── Closing many leads at once ────────────────────────────────────────── */

/** At most this many leads are closed in one go, one call each (the won and lost flows record each one's close). */
export const CLOSE_LIMIT = 100

/**
 * Close the chosen leads one after another through their own flow (`POST inquiries/{id}/won` or `/lost` with the
 * reason): unlike the bulk path it moves each to its won or lost stage, records the reason and writes the timeline
 * entry. Stops at the limit; says how many went through and which did not.
 */
export async function closeEach(ids: Iterable<number>, call: (id: number) => Promise<unknown>): Promise<{ done: number; failed: number[] }> {
  const list = [...new Set(ids)].filter(id => Number.isInteger(id) && id > 0).slice(0, CLOSE_LIMIT)
  let done = 0
  const failed: number[] = []
  for (const id of list) {
    try {
      await call(id)
      done++
    } catch {
      failed.push(id)
    }
  }
  return { done, failed }
}

/**
 * A template's HTML for the sandboxed preview, on the white an email is written for (the workspace may be dark, and a
 * template that sets no background would show dark text on it).
 */
export function previewDoc(html: string): string {
  return `<meta charset="utf-8"><style>html{background:#ffffff;color:#111111}</style>${html ?? ''}`
}
