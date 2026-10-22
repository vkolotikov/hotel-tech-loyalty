import { unknownTags } from '../campaigns/campaignsMath'
import type { SegmentChoice } from '../push/types'
import type { Sms, SmsAudience, SmsBody, SmsLength, SmsOptions, SmsResults, SmsRow, TwilioReadiness } from './types'

export { statusTone } from '../push/pushMath'

/**
 * SMS campaigns' decisions (spec 2026-10-22 release 4 §5, R4-4), kept out of the components so they can be tested:
 * which campaign an address names, what a campaign's state allows, how far it got, the draft as a form and what is
 * wrong with it, how long a text is as the networks count it (the server's own rule, App\Services\Sms\SmsText, held to
 * the same cases in smsLength.cases.json), the text with the tags filled as the preview shows it, where a tag goes, what
 * Send waits for, what the confirmation and its cost hint say, and what the venue still has to set up in Twilio. The
 * server decides every right and every number; these only choose what to show.
 */

/** How often a sending campaign's page asks again. */
export const SMS_REFRESH_MS = 10_000

/** The full admin's settings page where a super admin enters the venue's Twilio account. */
export const FULL_ADMIN_INTEGRATIONS = '/settings?tab=integrations'

// ─── Addresses ────────────────────────────────────────────────────────────

/** The SMS tab, or one campaign in it (`?tab=sms&message=12`): the tab keeps its place in the Campaigns page. */
export function smsSearch(id: number | null): string {
  return id === null ? '?tab=sms' : `?tab=sms&message=${id}`
}

/** The campaign an address names, or null for the list (none, or anything that is not a positive whole number). */
export function smsFrom(search: string): number | null {
  const raw = new URLSearchParams(search).get('message') ?? ''
  return /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null
}

// ─── A campaign's state ───────────────────────────────────────────────────

/** Only a campaign that is sending changes while it is shown. */
export const isLive = (status: string): boolean => status === 'sending'

/** A draft opens in the editor; anything that went out, is going out or waits for its time shows its results. */
export const viewOf = (s: Pick<SmsRow, 'status'>): 'editor' | 'results' => (s.status === 'draft' ? 'editor' : 'results')

/** What a campaign's page offers, by its state. The server checks each again (`not_a_draft`, `not_sending`, `not_scheduled`). */
export function smsActions(s: Pick<SmsRow, 'status'>): { edit: boolean; send: boolean; cancel: boolean; duplicate: boolean; remove: boolean } {
  const draft = s.status === 'draft'
  return { edit: draft, send: draft, cancel: s.status === 'sending', duplicate: true, remove: draft }
}

/** Every member the job handled, whatever came of it. */
export const handled = (r: SmsResults): number => r.sent + r.failed + r.skipped + r.pending

/**
 * How far a campaign got: the members handled of those it was handed, as a share; once it is over, `gone` is the
 * members it was handed that it never reached at all (their record was deleted or merged after Send).
 */
export function progressOf(s: Pick<SmsRow, 'status' | 'recipient_count' | 'results'>): { done: number; total: number; percent: number; gone: number } {
  const done = handled(s.results)
  const total = s.recipient_count
  const percent = total > 0 ? Math.min(100, Math.round((done * 100) / total)) : 0
  const over = s.status === 'sent'
  return { done, total, percent: over ? 100 : percent, gone: over ? Math.max(0, total - done) : 0 }
}

/** The outcomes a results page lists, in order, each with how many; an outcome nobody had is left out. */
export function outcomesOf(r: SmsResults): { code: keyof SmsResults; count: number }[] {
  const order: (keyof SmsResults)[] = ['sent', 'failed', 'skipped', 'pending']
  return order.map(code => ({ code, count: r[code] })).filter(o => o.count > 0)
}

// ─── The text, as the networks count it ───────────────────────────────────

/** The GSM 03.38 basic alphabet (the escape left out: it is never typed), and the extension table that counts twice. */
const GSM_BASIC = new Set([...'@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'])
const GSM_EXTENDED = new Set([...'\f^{}\\[~]|€'])

/**
 * How long a text is as the networks count it, the server's rule (SmsText::measure): in the GSM alphabet 160 alone or
 * 153 a part, an extension character twice; with any other character UCS-2, 70 alone or 67 a part, a character beyond
 * the Basic Multilingual Plane twice; a doubled character is never split between parts.
 */
export function smsLength(text: string): SmsLength {
  const chars = [...text]
  const unicode: string[] = []
  for (const c of chars) if (!GSM_BASIC.has(c) && !GSM_EXTENDED.has(c) && !unicode.includes(c)) unicode.push(c)
  const gsm = unicode.length === 0
  const weights = chars.map(c => (gsm ? (GSM_EXTENDED.has(c) ? 2 : 1) : ((c.codePointAt(0) ?? 0) > 0xffff ? 2 : 1)))
  const units = weights.reduce((a, b) => a + b, 0)
  const single = gsm ? 160 : 70
  const part = gsm ? 153 : 67
  let segments = 0
  if (units > 0 && units <= single) segments = 1
  else if (units > single) {
    segments = 1
    let used = 0
    for (const w of weights) {
      if (used + w > part) {
        segments++
        used = w
      } else used += w
    }
  }
  return { encoding: gsm ? 'gsm7' : 'ucs2', units, segments, per_segment: segments > 1 ? part : single, unicode: unicode.slice(0, 10) }
}

/**
 * The text with the tags filled, as the server fills each member's copy (SmsMessage::fill): line by line, every value
 * on one line and no control characters, a word in double braces that no tag fills left as written.
 */
export function fillTags(text: string, values: Record<string, string>): string {
  // eslint-disable-next-line no-control-regex
  const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
  return text.replace(/\r\n?/g, '\n').split('\n')
    .map(line => oneLine(line.replace(/\{\{[^{}]*\}\}/g, tag => (tag in values ? oneLine(values[tag]) : tag))))
    .join('\n')
}

/** The double-braced words in a text that no tag fills (they would reach members as written). */
export const unknownSmsTags = (text: string, known: readonly string[]): string[] => unknownTags([text], known)

/**
 * The text with a tag put where the cursor was (replacing the selection), and where the cursor goes after it; null
 * when it would take the text past the server's limit.
 */
export function withTagAt(text: string, start: number, end: number, tag: string, max: number): { text: string; caret: number } | null {
  const from = Math.min(Math.max(0, start), text.length)
  const to = Math.min(Math.max(from, end), text.length)
  const next = text.slice(0, from) + tag + text.slice(to)
  return [...next].length > max ? null : { text: next, caret: from + tag.length }
}

// ─── The draft ────────────────────────────────────────────────────────────

export interface SmsForm {
  name: string
  body: string
  /** '' while no segment is chosen. */
  segment_id: string
}

export function formOf(s: Sms): SmsForm {
  return { name: s.name, body: s.body, segment_id: s.segment_id === null ? '' : String(s.segment_id) }
}

/** The form as `PUT sms/{id}` takes it: texts trimmed, line breaks as one, an empty choice as none. */
export function bodyOf(f: SmsForm): SmsBody {
  return { name: f.name.trim(), body: f.body.replace(/\r\n?/g, '\n').trim(), segment_id: f.segment_id === '' ? null : Number(f.segment_id) }
}

/** Whether the form says something the saved draft does not. */
export function isDirty(f: SmsForm, s: Sms): boolean {
  const a = bodyOf(f)
  const b = bodyOf(formOf(s))
  return a.name !== b.name || a.body !== b.body || a.segment_id !== b.segment_id
}

/** What stops the draft from being saved as it is, by field: `name`, `body_long`. */
export function draftProblems(f: SmsForm, options: Pick<SmsOptions, 'max_name' | 'max_body'>): Record<string, string> {
  const out: Record<string, string> = {}
  const name = f.name.trim()
  if (name === '' || name.length > options.max_name) out.name = 'name'
  if ([...bodyOf(f).body].length > options.max_body) out.body = 'body_long'
  return out
}

/** The server's field errors (`PUT sms/{id}`, 422) as the form's own codes. */
export function serverProblems(fields: Record<string, string[]> | undefined): Record<string, string> {
  if (!fields) return {}
  const out: Record<string, string> = {}
  if (fields.name) out.name = 'name'
  if (fields.body) out.body = 'body_long'
  if (fields.segment_id) out.segment_id = 'segment_gone'
  return out
}

/**
 * Why Send cannot be pressed yet, in order: the venue's Twilio account, unsaved changes, what the saved draft lacks
 * (the server's `missing`), then its segment (none, gone, or with a rule the workspace would refuse). Segments still
 * loading say nothing yet.
 */
export function sendBlockers(s: Sms, dirty: boolean, segments: SegmentChoice[] | undefined, twilio: TwilioReadiness): string[] {
  const out: string[] = []
  if (!twilio.ready) out.push('twilio')
  if (dirty) out.push('unsaved')
  if (s.missing.includes('body')) out.push('body')
  if (s.segment_id === null) out.push('no_segment')
  else if (segments) {
    const seg = segments.find(x => x.id === s.segment_id)
    if (!seg) out.push('segment_gone')
    else if (seg.problem) out.push('segment_problem')
  }
  return out
}

/** Whether the saved draft can be counted: a segment, and nothing waiting to be saved. */
export const canCount = (s: Sms, dirty: boolean): boolean => !dirty && s.segment_id !== null

/** A test needs the saved draft's text and the venue's Twilio account; it goes to the person pressing it only. */
export const canTest = (s: Sms, dirty: boolean, twilio: TwilioReadiness): boolean => !dirty && !s.missing.includes('body') && twilio.ready

/** The order the audience's buckets are told in (SmsAudience). */
export const NOT_REACHED = ['no_consent', 'no_phone', 'bad_phone', 'same_phone'] as const

/**
 * What the confirmation says: it can go (`ok`), nobody can receive it, or it is over the cap; who is left out, by why;
 * and the cost hint — the SMS parts the members' copies come to, which Twilio bills, and how many parts a copy is on
 * average when it is more than one.
 */
export function confirmationOf(a: SmsAudience): {
  state: 'ok' | 'nobody' | 'over'
  reached: number
  left_out: number
  reasons: { code: string; count: number }[]
  segments: number
  long: boolean
} {
  const reasons = NOT_REACHED.map(code => ({ code, count: a[code] })).filter(r => r.count > 0)
  const state = a.reached === 0 ? 'nobody' : a.reached > a.limit ? 'over' : 'ok'
  return { state, reached: a.reached, left_out: Math.max(0, a.members - a.reached), reasons, segments: a.segments, long: a.segments > a.reached }
}

/** After a refused Send: what to read again so the page tells the truth (the count, or the campaign itself). */
export function sendRefusalRefreshes(code: string): { audience: boolean; message: boolean } {
  return {
    audience: ['audience_changed', 'nobody_to_send_to', 'too_many', 'bad_rule', 'no_audience'].includes(code),
    message: ['already_started', 'changed', 'incomplete', 'not_found', 'not_started', 'not_ready'].includes(code),
  }
}

/** What the venue still has to put in Settings → Integrations, in the order the fields stand there. */
export function twilioSteps(t: TwilioReadiness): { field: string; state: 'missing' | 'wrong' }[] {
  return ['account_sid', 'auth_token', 'phone_number']
    .map(field => ({ field, state: t.missing.includes(field) ? 'missing' as const : t.wrong.includes(field) ? 'wrong' as const : null }))
    .filter((s): s is { field: string; state: 'missing' | 'wrong' } => s.state !== null)
}

/** A Twilio error a member's SMS or a test failed with (`twilio_21211`), as its code; null for anything else. */
export function twilioCode(reason: string | null | undefined): string | null {
  const m = /^twilio_(\d{5})$/.exec(reason ?? '')
  return m ? m[1] : null
}
