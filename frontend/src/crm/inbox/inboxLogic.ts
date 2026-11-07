import { params } from '../lib/api'
import type { Tone } from '../ui/StatTile'
import type { CannedReply, Conversation, ConvStatus, Feedback, InboxStats, Message, SenderType } from './types'

/**
 * The inbox's decisions, kept pure so the tests can run them (they render to a string and cannot click): which list
 * the URL asks for, how the list is ordered, which messages show and how bubbles group, what a status allows, what the
 * AI button says, and the bodies the chat endpoints take. The server decides everything else.
 */

export const STATUS_FILTERS = ['all', 'active', 'waiting', 'resolved', 'archived'] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

/** `?status=waiting` preselects the filter (Today's "Waiting for a reply" links there); anything else is All. */
export function readStatus(value: string | null | undefined): StatusFilter {
  return (STATUS_FILTERS as readonly string[]).includes(value ?? '') ? (value as StatusFilter) : 'all'
}

/** `?c=12` opens conversation 12; anything that is not a positive whole number opens nothing. */
export function readConversationId(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,10}$/.test(value)) return null
  const id = Number(value)
  return id > 0 ? id : null
}

/** The list's address: `chat-inbox?status=&search=&group_by_visitor=1&page=` (empty parts left out). */
export function listPath(status: StatusFilter, search: string, groupByVisitor: boolean, page = 1): string {
  return `chat-inbox${params({
    status: status === 'all' ? undefined : status,
    search: search.trim(),
    group_by_visitor: groupByVisitor,
    page: page > 1 ? page : undefined,
  })}`
}

/** The count beside each filter, from `chat-inbox/stats`. */
export function filterCounts(stats: InboxStats | undefined): Partial<Record<StatusFilter, number>> {
  if (!stats) return {}
  return { all: stats.total, active: stats.active, waiting: stats.waiting, resolved: stats.resolved, archived: stats.archived }
}

/** The person's name: a member's own, the visitor's, else their email; null when nothing is known. */
export function displayName(c: Pick<Conversation, 'member' | 'visitor_name' | 'visitor_email'>): string | null {
  const name = c.member?.user?.name?.trim() || c.visitor_name?.trim() || c.visitor_email?.trim()
  return name || null
}

/** A chat that needs a person: the visitor wrote and nobody read it, or the assistant handed it to the team. */
export function needsAttention(c: Pick<Conversation, 'unread_count' | 'status'>): boolean {
  return (c.unread_count ?? 0) > 0 || c.status === 'waiting'
}

function instant(iso: string | null | undefined): number {
  const at = iso ? Date.parse(iso) : NaN
  return Number.isNaN(at) ? 0 : at
}

/** Unread and waiting chats first, then the most recent message first; the server's order otherwise. */
export function sortConversations<T extends Pick<Conversation, 'id' | 'unread_count' | 'status' | 'last_message_at'>>(list: readonly T[]): T[] {
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const urgent = Number(needsAttention(b.c)) - Number(needsAttention(a.c))
      if (urgent !== 0) return urgent
      const recent = instant(b.c.last_message_at) - instant(a.c.last_message_at)
      return recent !== 0 ? recent : a.i - b.i
    })
    .map(({ c }) => c)
}

/** Whether a row matches what was typed in the search box (name, email, phone, last message), at once on the page. */
export function matchesSearch(c: Conversation, term: string): boolean {
  const needle = term.trim().toLocaleLowerCase()
  if (!needle) return true
  return [c.member?.user?.name, c.visitor_name, c.visitor_email, c.visitor_phone, c.last_message]
    .some(field => (field ?? '').toLocaleLowerCase().includes(needle))
}

/** The list as shown: what matches the search box, needing attention first. */
export function shownConversations(list: readonly Conversation[], term: string): Conversation[] {
  return sortConversations(list.filter(c => matchesSearch(c, term)))
}

export const STATUS_TONE: Record<ConvStatus, Tone> = {
  waiting: 'pending',
  active: 'progress',
  resolved: 'success',
  archived: 'neutral',
}

export type StatusAction = 'resolve' | 'archive' | 'reopen'

/** What a conversation's status allows, in the order the buttons show: resolve or reopen, then archive. */
export function statusActions(status: ConvStatus): { action: StatusAction; next: ConvStatus }[] {
  switch (status) {
    case 'active':
    case 'waiting':
      return [{ action: 'resolve', next: 'resolved' }, { action: 'archive', next: 'archived' }]
    case 'resolved':
      return [{ action: 'reopen', next: 'active' }, { action: 'archive', next: 'archived' }]
    case 'archived':
      return [{ action: 'reopen', next: 'active' }]
  }
}

/** An archived chat takes no reply (as the full admin); reopen it first. */
export function canReply(status: ConvStatus): boolean {
  return status !== 'archived'
}

/**
 * The AI button: while the assistant answers (ai_enabled, true when unset), "Take over" pauses it so a person replies;
 * once a person has it, "Hand back to AI" lets the assistant answer again.
 */
export function aiToggle(c: Pick<Conversation, 'ai_enabled'>): { aiOn: boolean; action: 'take_over' | 'hand_back'; next: boolean } {
  const aiOn = c.ai_enabled ?? true
  return aiOn ? { aiOn, action: 'take_over', next: false } : { aiOn, action: 'hand_back', next: true }
}

// ─── The thread ─────────────────────────────────────────────────────────────

/** A message worth a bubble: it says something or carries a file. */
export function isShown(m: Pick<Message, 'content' | 'attachment_url'>): boolean {
  return Boolean(m.content?.trim()) || Boolean(m.attachment_url)
}

export type Side = 'left' | 'right'

/** The visitor on the left; the team and the assistant on the right. */
export function sideOf(sender: SenderType): Side {
  return sender === 'visitor' ? 'left' : 'right'
}

export const BUBBLE_CLASS: Record<Exclude<SenderType, 'system'>, string> = {
  visitor: 'crm-bubble-visitor',
  agent: 'crm-bubble-agent',
  ai: 'crm-bubble-ai',
}

/** The venue's calendar day of an instant (`YYYY-MM-DD`), for the day lines in a thread. */
export function dayKey(iso: string | null | undefined, zone: string): string {
  const at = instant(iso)
  if (!at) return ''
  const parts = (tz: string | undefined) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz }).format(new Date(at))
  try {
    return parts(zone)
  } catch {
    return parts(undefined)
  }
}

export type ThreadRow =
  | { kind: 'day'; key: string; day: string }
  | { kind: 'note'; key: string; message: Message }
  | { kind: 'bubble'; key: string; message: Message; side: Side; first: boolean; last: boolean }

/** Who wrote a message, for grouping: the visitor, the assistant, or one person of the team. */
function author(m: Message): string {
  return m.sender_type === 'agent' ? `agent:${m.sender_user_id ?? ''}` : m.sender_type
}

/**
 * The thread as rows: a line for each new venue day, system notes in the middle, and bubbles — consecutive messages of
 * the same author within `gapMinutes` form a group, whose first bubble carries the name and whose last the time.
 */
export function threadRows(messages: readonly Message[], zone: string, gapMinutes = 5): ThreadRow[] {
  const rows: ThreadRow[] = []
  let day = ''
  let previous: Message | null = null
  const shown = messages.filter(isShown)
  shown.forEach((m, i) => {
    const today = dayKey(m.created_at, zone)
    if (today && today !== day) {
      rows.push({ kind: 'day', key: `day-${today}`, day: today })
      day = today
      previous = null
    }
    if (m.sender_type === 'system') {
      rows.push({ kind: 'note', key: `m-${m.id}`, message: m })
      previous = null
      return
    }
    const joins = (a: Message | null, b: Message | null) => !!a && !!b && a.sender_type !== 'system' && b.sender_type !== 'system'
      && author(a) === author(b) && dayKey(a.created_at, zone) === dayKey(b.created_at, zone)
      && Math.abs(instant(b.created_at) - instant(a.created_at)) <= gapMinutes * 60_000
    const next = shown[i + 1] ?? null
    rows.push({ kind: 'bubble', key: `m-${m.id}`, message: m, side: sideOf(m.sender_type), first: !joins(previous, m), last: !joins(m, next) })
    previous = m
  })
  return rows
}

/** The newest message's id: what the poll asks after (`since_id`). */
export function lastMessageId(messages: readonly Pick<Message, 'id'>[]): number {
  return messages.reduce((max, m) => (m.id > max ? m.id : max), 0)
}

/** The thread with the poll's new messages added once each, in the order they were written. */
export function mergeMessages(existing: readonly Message[], incoming: readonly Message[]): Message[] {
  const known = new Set(existing.map(m => m.id))
  const fresh = incoming.filter(m => !known.has(m.id)).sort((a, b) => a.id - b.id)
  return fresh.length ? [...existing, ...fresh] : [...existing]
}

/** Whether the visitor has written something a reply could answer (what the AI draft needs). */
export function visitorHasWritten(messages: readonly Message[]): boolean {
  return messages.some(m => m.sender_type === 'visitor' && Boolean(m.content?.trim()))
}

// ─── The composer ───────────────────────────────────────────────────────────

/** A canned reply or a dictated sentence added to what is in the box, after a space. */
export function insertText(current: string, text: string): string {
  const add = text.trim()
  if (!add) return current
  return current.trim() ? `${current.trimEnd()} ${add}` : add
}

/** The AI's draft goes into the box for the person to read and change; what was there is kept so it can come back. */
export function withDraft(current: string, draft: string): { text: string; previous: string | null } {
  return { text: draft.trim(), previous: current.trim() ? current : null }
}

export type DraftState = { show: false } | { show: true; blocked: null | 'ai_budget_used_up' | 'nothing_to_answer' }

/**
 * "Draft a reply with AI": only on a plan with the chatbot and where a reply can be written; held back while the month's
 * AI allowance is spent or before the visitor has written anything (the server would refuse both).
 */
export function draftState(input: { chatbot: boolean; aiStatus: string; status: ConvStatus; messages: readonly Message[] }): DraftState {
  if (!input.chatbot || !canReply(input.status)) return { show: false }
  if (input.aiStatus === 'over') return { show: true, blocked: 'ai_budget_used_up' }
  if (!visitorHasWritten(input.messages)) return { show: true, blocked: 'nothing_to_answer' }
  return { show: true, blocked: null }
}

/** The body of `POST crm/conversations/{id}/draft`: an instruction only when one was written (at most 300 letters). */
export function draftInstruction(text: string): string | undefined {
  const clean = text.trim().slice(0, 300)
  return clean || undefined
}

/** The visitor's widget shows "typing…" for 5 s after a ping; one ping every 2 s while the person types is enough. */
export function shouldPingTyping(lastPing: number, now: number, gapMs = 2000): boolean {
  return now - lastPing >= gapMs
}

/** The body of `POST chat-inbox/{id}/messages`, or null when there is nothing to send (at most 5000 letters). */
export function messageBody(text: string): { content: string } | null {
  const content = text.trim()
  return content && content.length <= 5000 ? { content } : null
}

export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024
export const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.txt'
const UPLOAD_EXT = /\.(jpe?g|png|gif|webp|pdf|docx?|txt)$/i

/** What `chat-inbox/{id}/upload` would refuse, checked before sending: 8 MB at most, pictures, PDF, Word or text. */
export function checkUpload(file: { name: string; size: number }): null | 'too_big' | 'wrong_type' {
  if (!UPLOAD_EXT.test(file.name)) return 'wrong_type'
  if (file.size > UPLOAD_MAX_BYTES) return 'too_big'
  return null
}

/** A file the server stored is linked only from its own address (http(s) or a path), never another scheme. */
export function isSafeAttachment(url: string | null | undefined): url is string {
  return !!url && (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url))
}

/** The recorder's format, the first the browser supports, and the file name the transcription takes. */
export function recorderMime(isSupported: (mime: string) => boolean): string {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(m => isSupported(m)) ?? ''
}

export function audioFileName(mime: string): string {
  return `reply.${mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm'}`
}

/** Canned replies as the endpoint answers them (`{canned_responses: [...]}`), only the usable ones. */
export function cannedReplies(answer: { canned_responses?: unknown } | undefined): CannedReply[] {
  const list = Array.isArray(answer?.canned_responses) ? answer.canned_responses : []
  return list.filter((c): c is CannedReply => !!c && typeof c === 'object'
    && typeof (c as CannedReply).text === 'string' && (c as CannedReply).text.trim() !== '')
    .map(c => ({ label: typeof c.label === 'string' && c.label.trim() ? c.label : c.text.slice(0, 40), text: c.text }))
}

// ─── Forms ──────────────────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ContactForm {
  visitor_name: string
  visitor_email: string
  visitor_phone: string
  visitor_country: string
  visitor_city: string
  agent_notes: string
}

export function contactForm(c: Conversation): ContactForm {
  return {
    visitor_name: c.visitor_name ?? '',
    visitor_email: c.visitor_email ?? '',
    visitor_phone: c.visitor_phone ?? '',
    visitor_country: c.visitor_country ?? '',
    visitor_city: c.visitor_city ?? '',
    agent_notes: c.agent_notes ?? '',
  }
}

/** The body of `PUT chat-inbox/{id}/contact`: every field, an emptied one as null so it is cleared. */
export function contactPayload(form: ContactForm): Record<keyof ContactForm, string | null> {
  const clean = (v: string) => (v.trim() === '' ? null : v.trim())
  return {
    visitor_name: clean(form.visitor_name),
    visitor_email: clean(form.visitor_email),
    visitor_phone: clean(form.visitor_phone),
    visitor_country: clean(form.visitor_country),
    visitor_city: clean(form.visitor_city),
    agent_notes: form.agent_notes.trim() === '' ? null : form.agent_notes,
  }
}

/** What the server's rules would refuse, said beside the field (max lengths as ChatInboxController::updateContact). */
export function contactErrors(form: ContactForm): Partial<Record<keyof ContactForm, 'email' | 'too_long'>> {
  const errors: Partial<Record<keyof ContactForm, 'email' | 'too_long'>> = {}
  const email = form.visitor_email.trim()
  if (email && !EMAIL.test(email)) errors.visitor_email = 'email'
  const max: Record<keyof ContactForm, number> = { visitor_name: 120, visitor_email: 180, visitor_phone: 30, visitor_country: 100, visitor_city: 100, agent_notes: 5000 }
  for (const key of Object.keys(max) as (keyof ContactForm)[]) {
    if (!errors[key] && form[key].trim().length > max[key]) errors[key] = 'too_long'
  }
  return errors
}

export interface LeadForm { name: string; email: string; phone: string; notes: string }

export function leadForm(c: Conversation): LeadForm {
  return { name: displayName(c) ?? '', email: c.visitor_email ?? '', phone: c.visitor_phone ?? '', notes: '' }
}

/** The body of `POST chat-inbox/{id}/capture-lead`: only what was filled in (the server keeps the chat's own details). */
export function leadPayload(form: LeadForm): Partial<LeadForm> {
  const out: Partial<LeadForm> = {}
  for (const key of ['name', 'email', 'phone', 'notes'] as const) {
    const value = form[key].trim()
    if (value) out[key] = value
  }
  return out
}

export function leadErrors(form: LeadForm): Partial<Record<keyof LeadForm, 'email' | 'too_long'>> {
  const errors: Partial<Record<keyof LeadForm, 'email' | 'too_long'>> = {}
  const email = form.email.trim()
  if (email && !EMAIL.test(email)) errors.email = 'email'
  const max: Record<keyof LeadForm, number> = { name: 120, email: 180, phone: 30, notes: 2000 }
  for (const key of Object.keys(max) as (keyof LeadForm)[]) {
    if (!errors[key] && form[key].trim().length > max[key]) errors[key] = 'too_long'
  }
  return errors
}

/** The lead a capture made, from its answer (`{inquiry_id}`), or the one the conversation already links to. */
export function leadIdOf(answer: unknown, c?: Pick<Conversation, 'inquiry_id'>): number | null {
  const id = answer && typeof answer === 'object' ? (answer as { inquiry_id?: unknown }).inquiry_id : undefined
  if (typeof id === 'number' && id > 0) return id
  return c?.inquiry_id && c.inquiry_id > 0 ? c.inquiry_id : null
}

export interface FeedbackForm { rating: 'good' | 'bad'; comment: string; corrected_answer: string; apply_to_training: boolean }

/** Rating an AI answer: from what was saved before, or fresh — a "bad" rating offers to teach the assistant at once. */
export function feedbackForm(rating: 'good' | 'bad', saved?: Feedback | null): FeedbackForm {
  return { rating, comment: saved?.comment ?? '', corrected_answer: '', apply_to_training: rating === 'bad' }
}

/**
 * The body of `POST chat-inbox/messages/{id}/feedback`. A corrected answer goes with a bad rating only, and it teaches
 * the assistant (`apply_to_training`) only when there is one — the server saves it as an answer in the knowledge base.
 */
export function feedbackPayload(form: FeedbackForm): { rating: 'good' | 'bad'; comment: string | null; corrected_answer: string | null; apply_to_training: boolean } {
  const corrected = form.rating === 'bad' ? form.corrected_answer.trim() : ''
  return {
    rating: form.rating,
    comment: form.comment.trim() || null,
    corrected_answer: corrected || null,
    apply_to_training: Boolean(corrected) && form.apply_to_training,
  }
}

// ─── Words the code builds ──────────────────────────────────────────────────

/** The channels with their own words (crm.inbox.channel.<key>); any other shows as the server names it. */
export const CHANNELS = ['widget', 'messenger', 'whatsapp', 'instagram', 'admin_initiated'] as const

export function channelKey(channel: string | null | undefined): (typeof CHANNELS)[number] | null {
  return (CHANNELS as readonly string[]).includes(channel ?? '') ? (channel as (typeof CHANNELS)[number]) : null
}

/** The assistant's reading of what a chat is about (EngagementAiService::INTENTS), words crm.inbox.intent.<key>. */
export const INTENTS = ['booking_inquiry', 'info_request', 'complaint', 'cancellation', 'support', 'spam', 'other'] as const

export function intentKey(tag: string | null | undefined): (typeof INTENTS)[number] | null {
  return (INTENTS as readonly string[]).includes(tag ?? '') ? (tag as (typeof INTENTS)[number]) : null
}

/** `engagement/translate` takes these targets; the person's language when it is one of them, else English. */
export const TRANSLATE_TARGETS = ['en', 'ru', 'de', 'fr', 'es'] as const

export function translateTarget(lang: string): (typeof TRANSLATE_TARGETS)[number] {
  const short = lang.slice(0, 2).toLowerCase()
  return (TRANSLATE_TARGETS as readonly string[]).includes(short) ? (short as (typeof TRANSLATE_TARGETS)[number]) : 'en'
}

/** A message a person might want in their own language: the visitor's or the assistant's, with words in it. */
export function canTranslate(m: Pick<Message, 'sender_type' | 'content'>): boolean {
  return (m.sender_type === 'visitor' || m.sender_type === 'ai') && Boolean(m.content?.trim())
}

/** The transcript's file name. */
export function transcriptFileName(id: number): string {
  return `chat-${id}-transcript.txt`
}

/** A page address as its path ("/rooms/suite?x=1"), the whole address when it cannot be read. */
export function pagePath(url: string): string {
  try {
    const u = new URL(url)
    return `${u.pathname}${u.search}` || '/'
  } catch {
    return url
  }
}

/** The site an address belongs to ("www.google.com"), the whole address when it cannot be read. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}

/** A link only for a web address: a page the visitor's browser reported is never followed under another scheme. */
export function webHref(url: string | null | undefined): string | null {
  return url && /^https?:\/\/[^\s]+$/i.test(url.trim()) ? url.trim() : null
}
