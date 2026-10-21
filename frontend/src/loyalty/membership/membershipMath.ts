import { addDays, isDateKey } from '../../workspace/lib/wallClock'
import { membersParams } from '../lib/api'
import type { Problems } from '../lib/forms'
import type { Can, MemberFilters, MemberRow, TierRef } from '../lib/types'
import type { DetailsBody, DuplicatePair, EnrolBody, ImportBatch, MemberProfile, TierBody } from './types'

/**
 * The members area's decisions (spec 2026-10-21 release 2 §4.1), kept out of the components so they can be tested by
 * string: what a role is offered, what each form refuses before sending and what it sends, what a dialog says, the
 * pairs of Duplicates, and what the import page does next. The server checks every one of them again.
 */

const filled = (text: string): boolean => text.trim() !== ''
const orNull = (text: string): string | null => (filled(text) ? text.trim() : null)
/** An address as the server's `email` rule would take it: something, an @, a dot after it, no spaces. */
export const looksLikeEmail = (text: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim())

// ─── Who is offered what ──────────────────────────────────────────────────

/** Every staff member adds members and opens Duplicates' and Import's addresses; a manager has the toolbar (§3). */
export function listActions(can: Can): { add: boolean; tools: boolean } {
  return { add: true, tools: can.manage_members }
}

/** An item of a member's More menu. */
export type MoreItem = 'welcome' | 'tier' | 'deactivate' | 'reactivate' | 'erase'

/**
 * A member's More menu: Resend the welcome email for everyone (when the member has an email), and for a manager Change
 * tier, Deactivate or Reactivate, and Delete. A deleted member offers nothing: what is left of them is their history.
 */
export function moreItems(can: Can, member: Pick<MemberProfile, 'is_active' | 'is_erased' | 'email'>): MoreItem[] {
  if (member.is_erased) return []
  const items: MoreItem[] = []
  if (member.email) items.push('welcome')
  if (can.manage_members) items.push('tier', member.is_active ? 'deactivate' : 'reactivate', 'erase')
  return items
}

/** The member page's own actions: Edit details and Card for everyone; none for a deleted member. */
export function pageActions(member: Pick<MemberProfile, 'is_erased'>): { edit: boolean; card: boolean } {
  return { edit: !member.is_erased, card: !member.is_erased }
}

// ─── Add member ───────────────────────────────────────────────────────────

export interface EnrolForm {
  name: string
  email: string
  phone: string
  send_welcome: boolean
}

export const NEW_MEMBER: EnrolForm = { name: '', email: '', phone: '', send_welcome: true }
/** The server's bounds (MembershipController). */
export const MAX_NAME = 255
export const MAX_PHONE = 20
export const MAX_NATIONALITY = 100

export function enrolProblems(form: EnrolForm): Problems {
  const out: Problems = {}
  if (!filled(form.name) || form.name.trim().length > MAX_NAME) out.name = 'name'
  if (!looksLikeEmail(form.email)) out.email = 'email'
  if (form.phone.trim().length > MAX_PHONE) out.phone = 'phone'
  return out
}

export function enrolBody(form: EnrolForm): EnrolBody {
  return { name: form.name.trim(), email: form.email.trim(), phone: orNull(form.phone), send_welcome: form.send_welcome }
}

/**
 * The server's field errors as the form's words. The form has checked an address's shape already, so a refused email
 * is one already in use — by someone in any organisation, which the workspace never names.
 */
export const ENROL_FIELDS: Record<string, string> = { name: 'name', email: 'email_taken', phone: 'phone' }

// ─── Edit details ─────────────────────────────────────────────────────────

export interface DetailsForm {
  name: string
  email: string
  phone: string
  language: string
  nationality: string
  date_of_birth: string
  marketing_consent: boolean
}

export function detailsFormOf(member: MemberProfile): DetailsForm {
  return {
    name: member.name,
    email: member.email ?? '',
    phone: member.phone ?? '',
    language: member.language ?? '',
    nationality: member.nationality ?? '',
    date_of_birth: member.date_of_birth ?? '',
    marketing_consent: member.marketing_consent,
  }
}

/** `today` is the venue's day: a date of birth cannot be after it. */
export function detailsProblems(form: DetailsForm, today: string): Problems {
  const out: Problems = {}
  if (!filled(form.name) || form.name.trim().length > MAX_NAME) out.name = 'name'
  if (!looksLikeEmail(form.email)) out.email = 'email'
  if (form.phone.trim().length > MAX_PHONE) out.phone = 'phone'
  if (form.nationality.trim().length > MAX_NATIONALITY) out.nationality = 'nationality'
  if (filled(form.date_of_birth) && (!isDateKey(form.date_of_birth) || form.date_of_birth > today)) out.date_of_birth = 'date_of_birth'
  return out
}

export function detailsBody(form: DetailsForm): DetailsBody {
  return {
    name: form.name.trim(),
    email: form.email.trim(),
    phone: orNull(form.phone),
    language: orNull(form.language),
    nationality: orNull(form.nationality),
    date_of_birth: orNull(form.date_of_birth),
    marketing_consent: form.marketing_consent,
  }
}

export const DETAILS_FIELDS: Record<string, string> = {
  name: 'name', email: 'email_taken', phone: 'phone', language: 'language', nationality: 'nationality', date_of_birth: 'date_of_birth',
}

/** The languages the form offers: the server's, and the member's own when it is another one (so a save keeps it). */
export function languageChoices(offered: string[], current: string | null): string[] {
  return current && !offered.includes(current) ? [...offered, current] : offered
}

/** A language code in the reader's language ("de" → "German", "Deutsch"); the code itself where the browser has no name. */
export function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale || 'en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

// ─── Change tier ──────────────────────────────────────────────────────────

export interface TierForm {
  tier_id: string
  keep_until: string
}

export function tierFormOf(member: Pick<MemberProfile, 'tier_id'>): TierForm {
  return { tier_id: member.tier_id === null ? '' : String(member.tier_id), keep_until: '' }
}

/** The tiers the dialog offers: those in use, and the member's own even when it is switched off. */
export function tierChoices(tiers: TierRef[], current: number | null): TierRef[] {
  return tiers.filter(tier => tier.is_active || tier.id === current)
}

/** The earliest day a tier can be kept until: tomorrow on the venue's clock. */
export const firstKeepDay = (today: string): string => addDays(today, 1)

export function tierProblems(form: TierForm, tiers: TierRef[], today: string): Problems {
  const out: Problems = {}
  if (!tiers.some(tier => String(tier.id) === form.tier_id)) out.tier_id = 'tier_id'
  if (filled(form.keep_until) && (!isDateKey(form.keep_until) || form.keep_until < firstKeepDay(today))) out.keep_until = 'keep_until'
  return out
}

export function tierBody(form: TierForm): TierBody {
  return { tier_id: Number(form.tier_id), keep_until: orNull(form.keep_until) }
}

export const TIER_FIELDS: Record<string, string> = { tier_id: 'tier_id', keep_until: 'keep_until' }

/**
 * What the tier dialog says will happen: held until a day (the review leaves a lower tier alone until then), or left
 * to the next review, which may move the member again.
 */
export function tierNote(form: TierForm): 'kept' | 'review' {
  return isDateKey(form.keep_until.trim()) ? 'kept' : 'review'
}

// ─── Delete ───────────────────────────────────────────────────────────────

/** Delete is pressed once the manager has typed the member's name: trimmed, in any case, as the server compares. */
export function eraseReady(typed: string, name: string): boolean {
  return filled(typed) && typed.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()
}

/** What goes and what stays when a member is deleted (the dialog's two lists, by word key). */
export const ERASE_GOES = ['name', 'email', 'phone', 'birthday', 'push', 'cards', 'sign_in'] as const
export const ERASE_STAYS = ['number', 'history'] as const

// ─── The welcome email ────────────────────────────────────────────────────

/** The minutes to wait the server's `retry_after` (seconds) makes: at least one. */
export function waitMinutes(retryAfter: unknown): number {
  const seconds = Number(retryAfter)
  return Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 1
}

// ─── Duplicates and merge ─────────────────────────────────────────────────

export const pairKey = (pair: Pick<DuplicatePair, 'a' | 'b'>): string => `${Math.min(pair.a.id, pair.b.id)}-${Math.max(pair.a.id, pair.b.id)}`

/** The member a pair keeps: the one chosen on the page, else the one the server suggests (the oldest). */
export function keptOf(pair: DuplicatePair, chosen: Record<string, number>): number {
  const pick = chosen[pairKey(pair)]
  return pick === pair.a.id || pick === pair.b.id ? pick : pair.keep
}

/** Which of the pair is kept and which is merged into it. */
export function mergeSides(pair: DuplicatePair, keepId: number): { keep: MemberRow; merge: MemberRow } {
  return keepId === pair.b.id ? { keep: pair.b, merge: pair.a } : { keep: pair.a, merge: pair.b }
}

/** The kept member's points after the merge: both balances and both lifetimes added. */
export function pointsAfterMerge(keep: MemberRow, merge: MemberRow): { points: number; lifetime: number } {
  return { points: keep.points + merge.points, lifetime: keep.lifetime_points + merge.lifetime_points }
}

/** What moves to the kept member (the merge dialog's list, by word key): all of it (R2-3). */
export const MERGE_MOVES = ['history', 'bookings', 'redemptions', 'referrals', 'requests', 'cards', 'messages', 'guests'] as const

export const mergeProblems = (reason: string): Problems => (reason.trim().length < 2 ? { reason: 'reason' } : {})

// ─── Import ───────────────────────────────────────────────────────────────

/** The batch the address names (`?batch=12`), or null. */
export function batchFrom(search: string): number | null {
  const n = Number(new URLSearchParams(search).get('batch'))
  return Number.isInteger(n) && n > 0 ? n : null
}

export const importSearch = (batch: number | null): string => (batch === null ? '' : `?batch=${batch}`)

/** Where the import page is: choosing a file, looking at a batch not yet started, importing, or done. */
export type ImportStep = 'choose' | 'ready' | 'running' | 'done'

export function importStep(batch: ImportBatch | null | undefined): ImportStep {
  if (!batch) return 'choose'
  if (batch.finished) return 'done'
  return batch.state === 'pending' && batch.processed === 0 ? 'ready' : 'running'
}

/**
 * What the page driving an import does next: send the next chunk while it drives and none is on its way, stop once the
 * batch is finished, else wait (for the chunk on its way, or for Import to be pressed).
 */
export function importNext(batch: ImportBatch | null | undefined, driving: boolean, sending: boolean): 'run' | 'wait' | 'finished' {
  if (!batch) return 'wait'
  if (batch.finished) return 'finished'
  return driving && !sending ? 'run' : 'wait'
}

/** "Importing… 230 of 1,000" needs the processed rows within the total. */
export const importShare = (batch: Pick<ImportBatch, 'processed' | 'rows'>): { done: number; of: number } =>
  ({ done: Math.min(batch.processed, batch.rows), of: batch.rows })

/** The tone of a batch's state (theme/loyalty.css): waiting, under way, done, stopped, failed. */
export function importTone(state: string): 'pending' | 'approved' | 'fulfilled' | 'cancelled' | 'declined' {
  return state === 'pending' ? 'pending' : state === 'running' ? 'approved' : state === 'completed' ? 'fulfilled' : state === 'failed' ? 'declined' : 'cancelled'
}

/** A CSV file by its name or type (the server checks it again). */
export const isCsv = (file: Pick<File, 'name' | 'type'>): boolean => /\.(csv|txt)$/i.test(file.name) || /csv|text\/plain/.test(file.type)
/** The server's limit for an uploaded file. */
export const MAX_UPLOAD_MB = 20
export const tooBig = (file: Pick<File, 'size'>): boolean => file.size > MAX_UPLOAD_MB * 1024 * 1024

// ─── Export ───────────────────────────────────────────────────────────────

/** The list's filters as the export takes them: `GET members`'s own, without the page. */
export function exportParams(filters: MemberFilters): Record<string, string | number> {
  const params = membersParams(filters)
  delete params.page
  return params
}

/** The file's name, the venue's day in it, as the server names it. */
export const exportFileName = (today: string): string => `members-${today}.csv`
