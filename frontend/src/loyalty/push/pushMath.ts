import type { Tone } from '../lib/forms'
import type { Push, PushAudience, PushBody, PushOptions, PushResults, PushRow, SegmentChoice } from './types'

/**
 * Push messages' decisions (spec 2026-10-22 release 3 §5), kept out of the components so they can be tested: which
 * message an address names, what a message's state allows, how far it got, the draft as a form and what is wrong with
 * it, how a title or a message fits on a phone, what Send waits for, and what the confirmation says. The server
 * decides every right and every number; these only choose what to show.
 */

/** How often a sending message's page asks again. */
export const PUSH_REFRESH_MS = 10_000

// ─── Addresses ────────────────────────────────────────────────────────────

/** The Push messages tab, or one message in it (`?tab=push&message=12`): the tab keeps its place in the Campaigns page. */
export function pushSearch(id: number | null): string {
  return id === null ? '?tab=push' : `?tab=push&message=${id}`
}

/** The message an address names, or null for the list (none, or anything that is not a positive whole number). */
export function messageFrom(search: string): number | null {
  const raw = new URLSearchParams(search).get('message') ?? ''
  return /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null
}

// ─── A message's state ────────────────────────────────────────────────────

/** A draft waits (amber), sending is under way (teal), sent is done (green), failed is red, cancelled and anything else grey. */
export function statusTone(status: string): Tone {
  switch (status) {
    case 'draft': return 'pending'
    case 'sending': return 'approved'
    case 'sent': return 'fulfilled'
    case 'failed': return 'declined'
    default: return 'cancelled'
  }
}

/** Only a message that is sending changes while it is shown. */
export const isLive = (status: string): boolean => status === 'sending'

/** A draft opens in the editor; anything that went out, or is going out, shows its results. */
export const viewOf = (p: Pick<PushRow, 'status'>): 'editor' | 'results' => (p.status === 'draft' ? 'editor' : 'results')

/** What a message's page offers, by its state. The server checks each again (`not_a_draft`, `not_sending`). */
export function pushActions(p: Pick<PushRow, 'status'>): { edit: boolean; send: boolean; cancel: boolean; duplicate: boolean; remove: boolean } {
  const draft = p.status === 'draft'
  return { edit: draft, send: draft, cancel: p.status === 'sending', duplicate: true, remove: draft }
}

/** Every member the job handled, whatever came of it. */
export const handled = (r: PushResults): number => r.sent + r.failed + r.inbox_only + r.skipped + r.pending

/**
 * How far a message got: the members handled of those it was handed, as a share; once it is over, `gone` is the
 * members it was handed that it never reached at all (their record was deleted or merged after Send).
 */
export function progressOf(p: Pick<PushRow, 'status' | 'recipient_count' | 'results'>): { done: number; total: number; percent: number; gone: number } {
  const done = handled(p.results)
  const total = p.recipient_count
  const percent = total > 0 ? Math.min(100, Math.round((done * 100) / total)) : 0
  const over = p.status === 'sent'
  return { done, total, percent: over ? 100 : percent, gone: over ? Math.max(0, total - done) : 0 }
}

/** The outcomes a results page lists, in order, each with how many; an outcome nobody had is left out. */
export function outcomesOf(r: PushResults): { code: keyof PushResults; count: number }[] {
  const order: (keyof PushResults)[] = ['sent', 'failed', 'inbox_only', 'skipped', 'pending']
  return order.map(code => ({ code, count: r[code] })).filter(o => o.count > 0)
}

// ─── The draft ────────────────────────────────────────────────────────────

export interface PushForm {
  name: string
  title: string
  body: string
  /** '' while no category is chosen. */
  category: string
  /** '' while no segment is chosen. */
  segment_id: string
}

export function formOf(p: Push): PushForm {
  return { name: p.name, title: p.title, body: p.body, category: p.category ?? '', segment_id: p.segment_id === null ? '' : String(p.segment_id) }
}

/** The form as `PUT push/{id}` takes it: texts trimmed, an empty choice as none. */
export function bodyOf(f: PushForm): PushBody {
  return {
    name: f.name.trim(),
    title: f.title.trim(),
    body: f.body.trim(),
    category: f.category === '' ? null : f.category,
    segment_id: f.segment_id === '' ? null : Number(f.segment_id),
  }
}

/** Whether the form says something the saved draft does not. */
export function isDirty(f: PushForm, p: Push): boolean {
  const a = bodyOf(f)
  const b = bodyOf(formOf(p))
  return a.name !== b.name || a.title !== b.title || a.body !== b.body || a.category !== b.category || a.segment_id !== b.segment_id
}

/** What stops the draft from being saved as it is, by field: `name`, `title_long`, `body_long`, `category`. */
export function draftProblems(f: PushForm, options: PushOptions): Record<string, string> {
  const out: Record<string, string> = {}
  const name = f.name.trim()
  if (name === '' || name.length > options.max_name) out.name = 'name'
  if (f.title.trim().length > options.max_title) out.title = 'title_long'
  if (f.body.trim().length > options.max_body) out.body = 'body_long'
  if (f.category !== '' && !options.categories.includes(f.category)) out.category = 'category'
  return out
}

/** The server's field errors (`PUT push/{id}`, 422) as the form's own codes. */
export function serverProblems(fields: Record<string, string[]> | undefined): Record<string, string> {
  if (!fields) return {}
  const out: Record<string, string> = {}
  if (fields.name) out.name = 'name'
  if (fields.title) out.title = 'title_long'
  if (fields.body) out.body = 'body_long'
  if (fields.category) out.category = 'category'
  if (fields.segment_id) out.segment_id = 'segment_gone'
  return out
}

/**
 * How a text fits on a phone: within the guide it shows in full on most phones (`fits`), past it a phone may cut it
 * (`may_cut`), past the server's limit it cannot be saved (`too_long`).
 */
export function lengthGuide(text: string, guide: number, max: number): { count: number; state: 'fits' | 'may_cut' | 'too_long' } {
  const count = text.trim().length
  return { count, state: count > max ? 'too_long' : count > guide ? 'may_cut' : 'fits' }
}

/** The title as a phone shows it: cut after about the guide's characters, with an ellipsis, at a word where it can be. */
export function previewTitle(title: string, guide: number): { text: string; cut: boolean } {
  const text = title.trim()
  if (text.length <= guide) return { text, cut: false }
  const head = text.slice(0, guide)
  const space = head.lastIndexOf(' ')
  return { text: `${(space > guide * 0.6 ? head.slice(0, space) : head).trimEnd()}…`, cut: true }
}

/**
 * Why Send cannot be pressed yet, in order: unsaved changes, then what the saved draft lacks (the server's `missing`),
 * then its segment (none, gone, or with a rule the workspace would refuse). Segments still loading say nothing yet.
 */
export function sendBlockers(p: Push, dirty: boolean, segments: SegmentChoice[] | undefined): string[] {
  const out: string[] = []
  if (dirty) out.push('unsaved')
  for (const m of p.missing) if (['title', 'body', 'category'].includes(m)) out.push(m)
  if (p.segment_id === null) out.push('no_segment')
  else if (segments) {
    const s = segments.find(x => x.id === p.segment_id)
    if (!s) out.push('segment_gone')
    else if (s.problem) out.push('segment_problem')
  }
  return out
}

/** Whether the saved draft can be counted: a segment and a category, and nothing waiting to be saved. */
export const canCount = (p: Push, dirty: boolean): boolean => !dirty && p.segment_id !== null && p.category !== null

/** What the confirmation says: it can go (`ok`), nobody can receive it, or it is over the cap; and who is left out, by why. */
export function confirmationOf(a: PushAudience): { state: 'ok' | 'nobody' | 'over'; reached: number; left_out: number; reasons: { code: string; count: number }[] } {
  const reasons = (['push_off', 'no_device', 'opted_out'] as const).map(code => ({ code, count: a[code] })).filter(r => r.count > 0)
  const state = a.reached === 0 ? 'nobody' : a.reached > a.limit ? 'over' : 'ok'
  return { state, reached: a.reached, left_out: Math.max(0, a.members - a.reached), reasons }
}

/** After a refused Send: what to read again so the page tells the truth (the count, or the message itself). */
export function sendRefusalRefreshes(code: string): { audience: boolean; message: boolean } {
  return {
    audience: ['audience_changed', 'nobody_to_send_to', 'too_many', 'bad_rule', 'no_audience', 'no_category'].includes(code),
    message: ['already_started', 'changed', 'incomplete', 'not_found', 'not_started'].includes(code),
  }
}
