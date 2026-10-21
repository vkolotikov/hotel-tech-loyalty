import type { ApiFailure } from '../lib/api'
import type { Tone } from '../lib/forms'
import type {
  Audience, Block, BlockType, Campaign, CampaignBody, CampaignOptions, CampaignRow, Rule, RuleProblem, Segment, SegmentBody,
  SegmentOptions, ValueKind,
} from './types'

/**
 * Campaigns' decisions (spec 2026-10-21 release 2 §6), kept out of the components so they can be tested: the tab an
 * address names, what a campaign's state allows, its progress, a segment's rules as a form and what is wrong with them,
 * the body's blocks and their problems, what Send waits for, and what the confirmation says. The server decides every
 * right and every number; these only choose what to show.
 */

/** The full admin's email campaigns, for a draft the workspace does not edit. */
export const FULL_ADMIN_CAMPAIGNS = '/campaigns?tab=email'

/** A campaign's page. */
export const campaignPath = (id: number): string => `/loyalty/campaigns/${id}`

/** How often a sending campaign's page asks again. */
export const SENDING_REFRESH_MS = 10_000

// ─── The tabs ─────────────────────────────────────────────────────────────

export const CAMPAIGN_TABS = ['campaigns', 'segments'] as const
export type CampaignTab = typeof CAMPAIGN_TABS[number]

/** The tab an address names (`?tab=segments`); Campaigns for none or anything else. */
export function tabFrom(search: string): CampaignTab {
  const tab = new URLSearchParams(search).get('tab')
  return (CAMPAIGN_TABS as readonly string[]).includes(tab ?? '') ? (tab as CampaignTab) : 'campaigns'
}

/** The address of a tab: Campaigns is the page's own address, Segments carries `?tab=segments`. */
export function searchFor(tab: CampaignTab): string {
  return tab === 'campaigns' ? '' : `?tab=${tab}`
}

/** The tab the arrow keys, Home and End move to from the current one (they wrap); null for any other key. */
export function tabAfter(current: CampaignTab, key: string): CampaignTab | null {
  const i = CAMPAIGN_TABS.indexOf(current)
  const n = CAMPAIGN_TABS.length
  if (key === 'ArrowRight') return CAMPAIGN_TABS[(i + 1) % n]
  if (key === 'ArrowLeft') return CAMPAIGN_TABS[(i - 1 + n) % n]
  if (key === 'Home') return CAMPAIGN_TABS[0]
  if (key === 'End') return CAMPAIGN_TABS[n - 1]
  return null
}

// ─── A campaign's state ───────────────────────────────────────────────────

export const CAMPAIGN_STATUSES = ['draft', 'sending', 'sent', 'failed', 'cancelled'] as const

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

/** Which page a campaign gets: the editor (a draft made of the workspace's blocks), a read-only draft (the full admin's), or its results. */
export type CampaignView = 'editor' | 'elsewhere' | 'results'

export function viewOf(c: Pick<Campaign, 'status' | 'editable_here'>): CampaignView {
  if (c.status !== 'draft') return 'results'
  return c.editable_here ? 'editor' : 'elsewhere'
}

/**
 * What a campaign's page offers, by its state. A draft of the workspace's blocks: everything but Cancel. The full
 * admin's draft: Duplicate and Delete (it is edited, tested and sent there). Sending: Cancel and Duplicate. Over:
 * Duplicate. The server checks each again (`not_a_draft`, `not_sending`, `not_editable_here`).
 */
export function campaignActions(c: Pick<Campaign, 'status' | 'editable_here'>): { edit: boolean; test: boolean; send: boolean; cancel: boolean; duplicate: boolean; remove: boolean } {
  const view = viewOf(c)
  return {
    edit: view === 'editor',
    test: view === 'editor',
    send: view === 'editor',
    cancel: c.status === 'sending',
    duplicate: true,
    remove: c.status === 'draft',
  }
}

/** Only a campaign that is sending changes while it is shown. */
export const isLive = (status: string): boolean => status === 'sending'

/**
 * How far a campaign got: those mailed, those that failed, of how many. `skipped` is, once it is over, the members it
 * was handed that it neither mailed nor failed: they withdrew consent or unsubscribed after it started (the job checks
 * again before every chunk).
 */
export function progressOf(c: Pick<CampaignRow, 'status' | 'recipient_count' | 'sent_count' | 'failed_count'>): { done: number; total: number; percent: number; skipped: number } {
  const done = c.sent_count + c.failed_count
  const total = c.recipient_count
  const percent = total > 0 ? Math.min(100, Math.round((done * 100) / total)) : 0
  const sent = c.status === 'sent'
  return { done, total, percent: sent ? 100 : percent, skipped: sent ? Math.max(0, total - done) : 0 }
}

// ─── Segments: the form ───────────────────────────────────────────────────

/** One rule as the form holds it: the number, days or date as typed, the tiers as chosen. */
export interface RuleRow {
  type: string
  op: string
  text: string
  tiers: number[]
}

export interface SegmentForm {
  name: string
  description: string
  everyone: boolean
  operator: string
  rules: RuleRow[]
}

export const MAX_SEGMENT_NAME = 120
export const MAX_SEGMENT_DESCRIPTION = 500

/** What a rule type's value is, or null for a type the server does not offer (one the full admin saved). */
export function kindOf(type: string, options: SegmentOptions): ValueKind | null {
  return options.types.find(rt => rt.type === type)?.value ?? null
}

/** A new rule of a type (the server's first one when none is named), its first operator, no value yet. */
export function ruleRow(options: SegmentOptions, type?: string): RuleRow {
  const rt = options.types.find(x => x.type === type) ?? options.types[0]
  return { type: rt?.type ?? '', op: rt?.ops[0] ?? '', text: '', tiers: [] }
}

/** The same row of another type: its operators differ, so the operator and the value start again. */
export function withType(row: RuleRow, type: string, options: SegmentOptions): RuleRow {
  return row.type === type ? row : ruleRow(options, type)
}

/** A stored rule as a row: a value the form cannot hold (one the full admin wrote) is left out, and the row then says what is missing. */
export function rowOf(rule: Rule, options: SegmentOptions): RuleRow {
  const kind = kindOf(rule.type, options)
  const v = rule.value
  return {
    type: rule.type,
    op: rule.op,
    text: kind === 'days' || kind === 'points' || kind === 'date' ? (typeof v === 'number' || typeof v === 'string' ? String(v) : '') : '',
    tiers: kind === 'tiers' && Array.isArray(v) ? v.map(Number).filter(n => Number.isInteger(n)) : [],
  }
}

/** A new segment starts with one rule to fill in, never with "Everyone": that is chosen, not fallen into. */
export function segmentFormOf(segment: Segment | null, options: SegmentOptions): SegmentForm {
  if (!segment) return { name: '', description: '', everyone: false, operator: options.operators[0] ?? 'AND', rules: [ruleRow(options)] }
  return {
    name: segment.name,
    description: segment.description ?? '',
    everyone: segment.everyone,
    operator: options.operators.includes(segment.operator) ? segment.operator : (options.operators[0] ?? 'AND'),
    rules: segment.everyone ? [] : segment.filters.map(rule => rowOf(rule, options)),
  }
}

const isWhole = (text: string): boolean => /^\d{1,9}$/.test(text.trim())

/** A real calendar day written `YYYY-MM-DD`. */
export function isDay(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

/** What is wrong with one rule, as the server's reason codes (SegmentRules), or null. */
export function rowProblem(row: RuleRow, options: SegmentOptions): string | null {
  const rt = options.types.find(x => x.type === row.type)
  if (!rt) return 'unknown_type'
  if (!rt.ops.includes(row.op)) return 'unknown_op'
  switch (rt.value) {
    case 'tiers': {
      if (row.tiers.length === 0) return 'no_value'
      if (typeof rt.max === 'number' && row.tiers.length > rt.max) return 'too_many_tiers'
      return row.tiers.every(id => options.tiers.some(tier => tier.id === id)) ? null : 'unknown_tier'
    }
    case 'days':
    case 'points': {
      const text = row.text.trim()
      if (text === '') return 'no_value'
      if (!isWhole(text)) return 'bad_value'
      const n = Number(text)
      return (typeof rt.min === 'number' && n < rt.min) || (typeof rt.max === 'number' && n > rt.max) ? 'out_of_range' : null
    }
    case 'date': {
      const text = row.text.trim()
      if (text === '') return 'no_value'
      if (!isDay(text)) return 'bad_value'
      return (typeof rt.min === 'string' && text < rt.min) || (typeof rt.max === 'string' && text > rt.max) ? 'out_of_range' : null
    }
    default:
      return null
  }
}

/** The segment's problems: for the form as a whole (`name`, `description`, `no_rules`, `too_many`) and per rule. */
export function segmentProblems(form: SegmentForm, options: SegmentOptions): { form: Record<string, string>; rules: Record<number, string> } {
  const out: Record<string, string> = {}
  if (form.name.trim() === '' || form.name.trim().length > MAX_SEGMENT_NAME) out.name = 'name'
  if (form.description.trim().length > MAX_SEGMENT_DESCRIPTION) out.description = 'description'
  const rules: Record<number, string> = {}
  if (!form.everyone) {
    if (form.rules.length === 0) out.rules = 'no_rules'
    else if (form.rules.length > options.max_rules) out.rules = 'too_many'
    form.rules.forEach((row, i) => {
      const p = rowProblem(row, options)
      if (p) rules[i] = p
    })
  }
  return { form: out, rules }
}

/** The rules as the server stores them: numbers as numbers, tiers in order, no value where the type takes none. */
export function ruleOf(row: RuleRow, options: SegmentOptions): Rule {
  const kind = kindOf(row.type, options)
  if (kind === 'tiers') return { type: row.type, op: row.op, value: [...row.tiers].sort((a, b) => a - b) }
  if (kind === 'days' || kind === 'points') return { type: row.type, op: row.op, value: Number(row.text.trim()) }
  if (kind === 'date') return { type: row.type, op: row.op, value: row.text.trim() }
  return { type: row.type, op: row.op }
}

export function segmentBody(form: SegmentForm, options: SegmentOptions): SegmentBody {
  return {
    name: form.name.trim(),
    description: form.description.trim() === '' ? null : form.description.trim(),
    everyone: form.everyone,
    operator: form.operator,
    filters: form.everyone ? [] : form.rules.map(row => ruleOf(row, options)),
  }
}

/** What the live count asks about, or null while the rules have a problem (nothing is asked then). */
export function previewOf(form: SegmentForm, options: SegmentOptions): Omit<SegmentBody, 'name' | 'description'> | null {
  const { form: whole, rules } = segmentProblems({ ...form, name: 'x', description: '' }, options)
  if (Object.keys(whole).length > 0 || Object.keys(rules).length > 0) return null
  const { everyone, operator, filters } = segmentBody(form, options)
  return { everyone, operator, filters }
}

/**
 * What a reason's words name: a rule type's bounds (`out_of_range`: "from {{min}} to {{max}}"; `too_many_tiers`), or
 * the most rules a segment may have (`too_many`).
 */
export function reasonBounds(type: string | undefined, options: SegmentOptions): { min: string; max: string } {
  const rt = options.types.find(x => x.type === type)
  if (!rt) return { min: '', max: String(options.max_rules) }
  return { min: rt.min !== undefined ? String(rt.min) : '', max: rt.max !== undefined ? String(rt.max) : String(options.max_rules) }
}

/** The server's `bad_rule` as the form's problem: the rule's index (null for the whole segment) and the reason. */
export function serverRuleProblem(failure: ApiFailure | null): RuleProblem | null {
  if (!failure || failure.code !== 'bad_rule') return null
  const index = typeof failure.extra.index === 'number' ? failure.extra.index : null
  const reason = typeof failure.extra.reason === 'string' ? failure.extra.reason : 'bad_rules'
  return { index, reason }
}

/** A tier chosen or not, kept in the ladder's order. */
export function toggledTier(row: RuleRow, id: number, options: SegmentOptions): RuleRow {
  const on = row.tiers.includes(id) ? row.tiers.filter(x => x !== id) : [...row.tiers, id]
  const order = options.tiers.map(tier => tier.id)
  return { ...row, tiers: on.sort((a, b) => order.indexOf(a) - order.indexOf(b)) }
}

/** The names of a stored rule's tiers, in the ladder's order; ids no longer there are counted, not named. */
export function tierNames(ids: number[], options: SegmentOptions): { names: string[]; gone: number } {
  const names = options.tiers.filter(tier => ids.includes(tier.id)).map(tier => tier.name)
  return { names, gone: ids.length - names.length }
}

// ─── Campaigns: the body ──────────────────────────────────────────────────

/** A block id as the builder makes one. */
export function blockId(random: () => number = Math.random): string {
  return random().toString(36).slice(2, 9).padEnd(7, '0')
}

/** A new block of a type, as the server says it starts (CampaignBody::options `new_blocks`). */
export function newBlock(type: BlockType, options: CampaignOptions, id: string): Block {
  return { ...(options.new_blocks[type] ?? {}), id, type } as Block
}

/** The list with one block moved up (-1) or down (+1); unchanged at either end. */
export function moveBlock(blocks: Block[], index: number, delta: -1 | 1): Block[] {
  const j = index + delta
  if (index < 0 || index >= blocks.length || j < 0 || j >= blocks.length) return blocks
  const copy = blocks.slice()
  ;[copy[index], copy[j]] = [copy[j], copy[index]]
  return copy
}

export function removeBlock(blocks: Block[], index: number): Block[] {
  return blocks.filter((_, i) => i !== index)
}

export function patchBlock(blocks: Block[], index: number, patch: Partial<Block>): Block[] {
  return blocks.map((b, i) => (i === index ? ({ ...b, ...patch } as Block) : b))
}

/** A block's words, for the types that have them. */
export function textOf(block: Block): string | null {
  return block.type === 'heading' || block.type === 'text' || block.type === 'button' ? block.text : null
}

/**
 * A link a member may be sent to, as the server checks it (CampaignBody::link): http or https with a host, or a
 * mailto address; no spaces or quotes.
 */
export function isLink(url: string, max = 2000): boolean {
  const u = url.trim()
  if (u === '' || u.length > max || /[\s"'<>`]/.test(u)) return false
  if (/^mailto:[^@/?]+@[^@/?]+\.[^@/?]+(\?.*)?$/i.test(u)) return true
  if (!/^https?:\/\//i.test(u)) return false
  try {
    return new URL(u).hostname !== ''
  } catch {
    return false
  }
}

/** No link yet: empty, or the bare "https://" a new button starts with in the full admin (the server reads both as none). */
export const noLinkYet = (url: string): boolean => /^\s*(?:https?:\/\/)?\s*$/i.test(url)

export interface CampaignForm {
  name: string
  subject: string
  /** Empty for none. */
  segment_id: string
  blocks: Block[]
}

export function campaignFormOf(c: Campaign): CampaignForm {
  return { name: c.name, subject: c.subject, segment_id: c.segment_id !== null ? String(c.segment_id) : '', blocks: c.body_blocks ?? [] }
}

export function campaignBody(form: CampaignForm): CampaignBody {
  return { name: form.name.trim(), subject: form.subject.trim(), segment_id: form.segment_id === '' ? null : Number(form.segment_id), body_blocks: form.blocks }
}

/** The form differs from the saved draft. */
export function isDirty(form: CampaignForm, c: Campaign): boolean {
  return JSON.stringify(campaignBody(form)) !== JSON.stringify(campaignBody(campaignFormOf(c)))
}

/**
 * What stops a save: the name, the subject's length, too many blocks, and each block's (`text_long`, `url`). An empty
 * subject, text or link does not: a draft is saved as it is, and Send waits for them.
 */
export function draftProblems(form: CampaignForm, options: CampaignOptions): { form: Record<string, string>; blocks: Record<number, Record<string, string>> } {
  const out: Record<string, string> = {}
  if (form.name.trim() === '' || form.name.trim().length > options.max_name) out.name = 'name'
  if (form.subject.trim().length > options.max_subject) out.subject = 'subject_long'
  if (form.blocks.length > options.max_blocks) out.blocks = 'too_many_blocks'
  const blocks: Record<number, Record<string, string>> = {}
  form.blocks.forEach((b, i) => {
    const p: Record<string, string> = {}
    const text = textOf(b)
    const max = b.type === 'heading' || b.type === 'text' || b.type === 'button' ? options.max_text[b.type] : Infinity
    if (text !== null && text.length > max) p.text = 'text_long'
    if (b.type === 'button' && !noLinkYet(b.url) && !isLink(b.url, options.max_url)) p.url = 'url'
    if (Object.keys(p).length > 0) blocks[i] = p
  })
  return { form: out, blocks }
}

/** The server's field errors in the form's words: `name`, `subject`, `segment_id`, and `body_blocks.<i>.<key>` per block. */
export function campaignServerProblems(fields: Record<string, string[]> | undefined): { form: Record<string, string>; blocks: Record<number, Record<string, string>> } {
  const form: Record<string, string> = {}
  const blocks: Record<number, Record<string, string>> = {}
  for (const name of Object.keys(fields ?? {})) {
    const m = /^body_blocks\.(\d+)\.(\w+)$/.exec(name)
    if (m) {
      const i = Number(m[1])
      const field = m[2] === 'url' || m[2] === 'text' ? m[2] : 'look'
      blocks[i] = { ...(blocks[i] ?? {}), [field]: field === 'text' ? 'text_long' : field }
    } else if (name === 'name') form.name = 'name'
    else if (name === 'subject') form.subject = 'subject_long'
    else if (name === 'segment_id') form.segment_id = 'segment_gone'
    else if (name.startsWith('body_blocks')) form.blocks = 'too_many_blocks'
  }
  return { form, blocks }
}

/**
 * Whether the words hold a tag such as `{{member.name}}`. The pipeline fills in none (spec §2): a member would read it
 * as written, so the editor and the confirmation say so.
 */
export function hasTags(...texts: (string | null | undefined)[]): boolean {
  return texts.some(text => typeof text === 'string' && text.includes('{{'))
}

/** The form's words, for hasTags. */
export function formWords(form: CampaignForm): string[] {
  return [form.subject, ...form.blocks.map(textOf).filter((t): t is string => t !== null)]
}

/**
 * Why Send cannot be pressed yet, in order: changes not saved; no segment; a segment whose rules have a problem;
 * then what the saved draft lacks, as the server says (`subject`, `body`, `button`). Empty: it may be sent.
 */
export function sendBlockers(c: Campaign, dirty: boolean, segments: Segment[] | undefined): string[] {
  const out: string[] = []
  if (dirty) out.push('unsaved')
  if (c.segment_id === null) out.push('no_segment')
  else if (segments && !segments.some(s => s.id === c.segment_id)) out.push('segment_gone')
  else if (segments?.find(s => s.id === c.segment_id)?.problem) out.push('segment_problem')
  if (c.missing.includes('subject')) out.push('subject')
  if (c.missing.includes('body')) out.push('body')
  if (c.missing.some(m => m.startsWith('button:'))) out.push('button')
  return out
}

/** A test needs the saved draft to have a subject and a body; it goes to the person pressing it only. */
export function canTest(c: Campaign, dirty: boolean): boolean {
  return !dirty && !c.missing.includes('subject') && !c.missing.includes('body')
}

/** The block indexes the saved draft's buttons lack a label or a link at (the server's `button:<i>`). */
export function incompleteButtons(c: Campaign): number[] {
  return c.missing.filter(m => m.startsWith('button:')).map(m => Number(m.slice(7))).filter(n => Number.isInteger(n))
}

/**
 * The page a preview frame shows: the server's rendering of the email, on the grey a mail client puts around it. The
 * frame is sandboxed with nothing allowed (no script, no form, no same origin), so a draft's HTML written in the full
 * admin cannot act on the workspace.
 */
export function previewDocument(html: string): string {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + `<body style="margin:0;padding:16px 0;background:#f4f4f5">${html}</body></html>`
}

// ─── Send: the confirmation ───────────────────────────────────────────────

export const NOT_REACHED = ['no_consent', 'unsubscribed', 'suppressed', 'no_email'] as const
export type NotReached = typeof NOT_REACHED[number]

/**
 * What the confirmation says: how many it will email, and of the segment's other members how many will not get it and
 * why (only the reasons that hold someone). `nobody`: none can receive it; `over`: more than one campaign may reach.
 * Only `ok` offers the Send button, which names the number.
 */
export function confirmationOf(a: Audience): { state: 'ok' | 'nobody' | 'over'; reached: number; left_out: number; reasons: { code: NotReached; count: number }[] } {
  const reasons = NOT_REACHED.map(code => ({ code, count: a[code] })).filter(r => r.count > 0)
  const left = Math.max(0, a.members - a.reached)
  const state = a.reached === 0 ? 'nobody' : a.reached > a.limit ? 'over' : 'ok'
  return { state, reached: a.reached, left_out: left, reasons }
}

/** A refusal of Send that means the confirmation's numbers or the draft are no longer true: ask again. */
export function sendRefusalRefreshes(code: string): { audience: boolean; campaign: boolean } {
  return {
    audience: ['audience_changed', 'nobody_to_send_to', 'too_many', 'bad_rule', 'no_audience'].includes(code),
    campaign: ['already_started', 'changed', 'not_editable_here', 'incomplete', 'not_found'].includes(code),
  }
}
