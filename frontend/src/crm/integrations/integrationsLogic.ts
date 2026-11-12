/**
 * Integrations' decisions (HexaTech CRM round 5, 2026-11-12): which sections a person sees, a token's label, the lead
 * intake's address and its copy-paste snippets, the emails' sender as it will read, the AI spend's figures, and the
 * Messenger pages' states. Pure, because the frontend tests render to a string. The server decides every request;
 * these only word and draw what it answers.
 */

// ── Sections ────────────────────────────────────────────────────────────

export const INTEGRATION_TABS = ['leads', 'email', 'ai', 'channels'] as const
export type IntegrationsTab = (typeof INTEGRATION_TABS)[number]

/**
 * The sections a person sees: everyone reads the emails' sender (AccessMap `admin/crm/mail-settings`: staff read);
 * API tokens, AI usage and the channels are a manager's (`admin/crm/intake-tokens`, `admin/crm/ai-usage`,
 * `admin/integrations/messenger`).
 */
export function tabsFor(canManage: boolean): IntegrationsTab[] {
  return canManage ? [...INTEGRATION_TABS] : ['email']
}

/** The section a `?tab=` names when this person sees it, else their first. */
export function pickTab(value: string | null, allowed: readonly IntegrationsTab[]): IntegrationsTab {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as IntegrationsTab) : allowed[0]
}

/** The address after a section was chosen: `?tab=` names it, or is left out for the first one; the rest is kept. */
export function withTab(prev: URLSearchParams, next: IntegrationsTab, first: IntegrationsTab): URLSearchParams {
  const out = new URLSearchParams(prev)
  if (next === first) out.delete('tab')
  else out.set('tab', next)
  return out
}

// ── API tokens ──────────────────────────────────────────────────────────

export interface IntakeToken {
  id: number
  label: string
  last_used_at: string | null
  created_at: string | null
}

export interface CreatedToken extends IntakeToken {
  /** The plain token: answered once, by the create call. */
  token: string
}

export const TOKEN_LABEL_MAX = 80
const LABEL_CHARS = /^[a-zA-Z0-9 _.-]+$/

/** The name the server keeps a label under (IntakeTokens::nameFor, without its `integration:`). */
export function tokenSlug(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return slug === '' ? 'token' : slug
}

export type LabelProblem = 'required' | 'characters' | 'too_long' | 'taken'

/** What is wrong with a new token's label, or null: the server's rule (letters, digits, space, `_ - .`; 80), and unique. */
export function tokenLabelProblem(label: string, existing: readonly IntakeToken[]): LabelProblem | null {
  const text = label.trim()
  if (text === '') return 'required'
  if (text.length > TOKEN_LABEL_MAX) return 'too_long'
  if (!LABEL_CHARS.test(text)) return 'characters'
  if (existing.some(t => t.label === tokenSlug(text))) return 'taken'
  return null
}

/** A label shown as it was typed: the server keeps `website_form`, the list reads "website form". */
export function tokenTitle(label: string): string {
  return label.replace(/_/g, ' ')
}

// ── The lead intake: its address and snippets ──────────────────────────

export const TOKEN_PLACEHOLDER = 'YOUR_API_TOKEN'
const INTAKE_PATH = '/api/v1/integrations/leads'

export function intakeEndpoint(origin: string): string {
  return `${origin.replace(/\/+$/, '')}${INTAKE_PATH}`
}

export interface GuideBrand { id: number; name: string; is_default: boolean }

/** The brand the examples name: the default one, else the first; null when the organisation lists none. */
export function exampleBrandId(brands: readonly GuideBrand[]): number | null {
  return (brands.find(b => b.is_default) ?? brands[0])?.id ?? null
}

/** The token as the snippets show it: the one just made (or pasted), else the placeholder. */
export function snippetToken(token: string | null | undefined): string {
  const text = (token ?? '').trim()
  return text === '' ? TOKEN_PLACEHOLDER : text
}

export function curlSnippet(endpoint: string, token: string, brandId: number | null): string {
  const brand = brandId === null ? '' : `\n    "brand_id": ${brandId},`
  return `curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -d '{
    "external_source": "website_form",${brand}
    "contact": { "name": "Jane Doe", "email": "jane@example.com", "phone": "+371..." }
  }'`
}

/** A website form and the server endpoint that keeps the token off the browser (the full admin's example). */
export function webSnippet(endpoint: string, brandId: number | null): string {
  const brand = brandId ?? 1
  return `<!-- 1) The form on your website (one hidden brand_id per brand) -->
<form id="lead-form">
  <input type="hidden" name="brand_id" value="${brand}" />
  <input name="name"  placeholder="Your name"  required />
  <input name="email" type="email" placeholder="Email" required />
  <input name="phone" placeholder="Phone (optional)" />
  <textarea name="message" placeholder="Message (optional)"></textarea>
  <!-- honeypot: real users leave this empty; bots fill it -->
  <input name="company_website" tabindex="-1" autocomplete="off"
         style="position:absolute;left:-9999px" aria-hidden="true" />
  <button type="submit">Send</button>
</form>

<script>
document.getElementById('lead-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const f = e.target
  if (f.company_website.value) return            // bot caught by honeypot
  f.querySelector('button').disabled = true
  const res = await fetch('/api/lead', {          // -> your server endpoint below
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brand_id: Number(f.brand_id.value),
      name: f.name.value, email: f.email.value,
      phone: f.phone.value, message: f.message.value,
    }),
  })
  f.querySelector('button').disabled = false
  alert(res.ok ? 'Thanks! We\\'ll be in touch.' : 'Something went wrong, please try again.')
  if (res.ok) f.reset()
})
</script>

/* 2) A server endpoint (Astro shown; Node/Express is the same fetch call) — keeps your token OFF the browser.
   File: src/pages/api/lead.ts */
import type { APIRoute } from 'astro'
const CRM_TOKEN = import.meta.env.CRM_API_TOKEN   // set in your host's environment, never in code

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json()
  const res = await fetch('${endpoint}', {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${CRM_TOKEN}\`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      external_source: 'website_form',
      brand_id: body.brand_id,
      contact: { name: body.name, email: body.email, phone: body.phone || undefined },
      description: body.message || undefined,
    }),
  })
  const data = await res.json()
  return new Response(JSON.stringify(res.ok ? { ok: true, id: data.id } : data), { status: res.status })
}`
}

/** The guide's sentences, in the person's language (the bundle's `guide.*`). */
export interface GuideWords {
  title: string
  intro: string
  endpoint: string
  replace: string
  required: string
  optional: string
  fields: { source: string; name: string; email: string; brand: string; phone: string; company: string; position: string; description: string; amount: string; externalId: string; submittedAt: string }
  brands: string
  noBrands: string
  defaultBrand: string
  example: string
  response: string
  responseLine: string
  notes: string
  noteLimit: string
  noteHoneypot: string
  noteServer: string
  web: string
}

/** The whole guide, ready to hand to a developer or an AI: the address, the token, the fields, the brands, the examples. */
export function guideText(words: GuideWords, endpoint: string, token: string, brands: readonly GuideBrand[]): string {
  const brandId = exampleBrandId(brands)
  const brandLines = brands.length
    ? brands.map(b => `- ${b.id} → ${b.name}${b.is_default ? ` (${words.defaultBrand})` : ''}`).join('\n')
    : `- ${words.noBrands}`
  const f = words.fields
  return `# ${words.title}

${words.intro}

## ${words.endpoint}
POST ${endpoint}
Authorization: Bearer ${token}
Content-Type: application/json
${token === TOKEN_PLACEHOLDER ? `\n> ${words.replace}\n` : ''}
## ${words.required}
- external_source (string) — ${f.source}
- contact.name (string) — ${f.name}
- contact.email (email) — ${f.email}

## ${words.optional}
- brand_id (number) — ${f.brand}
- contact.phone (string) — ${f.phone}
- contact.company (string) — ${f.company}
- contact.position (string) — ${f.position}
- description (string) — ${f.description}
- amount (number), currency (3 letters) — ${f.amount}
- external_id (string) — ${f.externalId}
- submitted_at (ISO date) — ${f.submittedAt}

## ${words.brands}
${brandLines}

## ${words.example}
${curlSnippet(endpoint, token, brandId)}

## ${words.response}
${words.responseLine}
{ "id": 123, "url": "…" }

## ${words.notes}
- ${words.noteLimit}
- ${words.noteHoneypot}
- ${words.noteServer}

## ${words.web}
${webSnippet(endpoint, brandId)}
`
}

// ── Email sending: the sender ──────────────────────────────────────────

export interface MailIdentity { from_name: string | null; from_address: string; reply_to: string | null }

export interface MailSettings {
  from_name: string | null
  reply_to: string | null
  defaults: { from_name: string | null; reply_to: string | null }
  /** What an email carries now (MailIdentityService). */
  identity: MailIdentity
  /** An owner's (the full admin's rule for these two settings). */
  can_change: boolean
}

export interface MailDraft { from_name: string; reply_to: string }

export const SENDER_NAME_MAX = 100
const EMAIL = /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]{2,}$/

export function mailDraftOf(settings: MailSettings | undefined): MailDraft {
  return { from_name: settings?.from_name ?? '', reply_to: settings?.reply_to ?? '' }
}

export function sameMail(a: MailDraft, b: MailDraft): boolean {
  return a.from_name.trim() === b.from_name.trim() && a.reply_to.trim().toLowerCase() === b.reply_to.trim().toLowerCase()
}

export interface MailProblems { from_name?: 'too_long' | 'characters'; reply_to?: 'invalid' }

/** The server's rules, said before the save: a name of one line without `< > "`, a reply-to that is an address or empty. */
export function mailProblems(draft: MailDraft): MailProblems {
  const out: MailProblems = {}
  const name = draft.from_name.trim()
  if (name.length > SENDER_NAME_MAX) out.from_name = 'too_long'
  else if (/[\r\n<>"]/.test(name)) out.from_name = 'characters'
  const reply = draft.reply_to.trim()
  if (reply !== '' && (reply.length > 191 || !EMAIL.test(reply))) out.reply_to = 'invalid'
  return out
}

/** The body of `PUT crm/mail-settings`: an empty field clears it, so the default applies. */
export function mailPayload(draft: MailDraft): { from_name: string | null; reply_to: string | null } {
  const name = draft.from_name.trim()
  const reply = draft.reply_to.trim().toLowerCase()
  return { from_name: name === '' ? null : name, reply_to: reply === '' ? null : reply }
}

export interface MailPreview {
  fromName: string | null
  fromAddress: string
  replyTo: string | null
  /** The name or the reply-to is the organisation's own (nothing set). */
  nameIsDefault: boolean
  replyIsDefault: boolean
}

/** How an email will read with this draft: the draft's values, else the organisation's name and email (MailIdentityService). */
export function mailPreview(settings: MailSettings, draft: MailDraft): MailPreview {
  const name = draft.from_name.trim()
  const reply = draft.reply_to.trim().toLowerCase()
  const replyOk = reply !== '' && EMAIL.test(reply)
  return {
    fromName: name !== '' ? name : settings.defaults.from_name,
    fromAddress: settings.identity.from_address,
    replyTo: reply !== '' ? (replyOk ? reply : null) : settings.defaults.reply_to,
    nameIsDefault: name === '',
    replyIsDefault: reply === '',
  }
}

// ── AI usage ────────────────────────────────────────────────────────────

export type BudgetStatus = 'unlimited' | 'under' | 'warn' | 'over'

export interface AiUsage {
  month: string
  today: string
  budget: { status: BudgetStatus; used_cents: number; cap_cents: number | null; percent: number | null }
  plan: { modules: string[] | null; tiers: Record<string, string> | null }
  by_feature: { feature: string; cost_cents: number; calls: number }[]
  by_day: { day: string; cost_cents: number; calls: number }[]
  calls: number
}

/** Cents of US dollars (the allowance's unit, `ai_monthly_cost_cents`), in the person's language. */
export function usd(cents: number, lang: string): string {
  try {
    return new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}

export type MeterTone = 'success' | 'pending' | 'danger' | 'neutral'

export function budgetTone(status: BudgetStatus): MeterTone {
  return status === 'over' ? 'danger' : status === 'warn' ? 'pending' : status === 'under' ? 'success' : 'neutral'
}

/** How full the allowance's bar is drawn (0–100), or null without an allowance. */
export function meterWidth(budget: AiUsage['budget']): number | null {
  if (budget.cap_cents === null || budget.cap_cents <= 0) return null
  return Math.max(0, Math.min(100, Math.round((budget.used_cents / budget.cap_cents) * 100)))
}

/** What is left of the allowance (never below zero), or null without one. */
export function leftCents(budget: AiUsage['budget']): number | null {
  return budget.cap_cents === null || budget.cap_cents <= 0 ? null : Math.max(0, budget.cap_cents - budget.used_cents)
}

export interface DayBar { day: string; cost_cents: number; calls: number; height: number; today: boolean }

/** The days as bars: each one's height against the month's highest day (a day with any spend shows at least a sliver). */
export function dayBars(days: AiUsage['by_day'], today: string): DayBar[] {
  const peak = Math.max(0, ...days.map(d => d.cost_cents))
  return days.map(d => ({
    ...d,
    height: peak === 0 ? 0 : d.cost_cents === 0 ? 0 : Math.max(4, Math.round((d.cost_cents / peak) * 100)),
    today: d.day === today,
  }))
}

/** The day of the month a bar stands for ("2026-11-04" → 4), for its axis label. */
export function dayOfMonth(day: string): number {
  return Number(day.slice(8, 10))
}

/** The features the ledger writes that have their own words (`crm.integrations.feature.<name>`); others show as named. */
export const KNOWN_FEATURES = [
  'website_chatbot', 'website_chatbot_tools', 'messenger_chat', 'member_chat', 'chatbot_test', 'chat', 'crm_chat', 'crm_draft',
  'voice_agent', 'engagement_brief', 'engagement_translate', 'knowledge_faqs', 'knowledge_keywords', 'inquiry_smart_panel',
  'inquiry_lost_reason', 'inquiry_proposal_draft', 'content', 'time_plan', 'time_review', 'time_capture',
] as const

export function isKnownFeature(feature: string): feature is (typeof KNOWN_FEATURES)[number] {
  return (KNOWN_FEATURES as readonly string[]).includes(feature)
}

/** An unknown feature's own name, readable: `inquiry_brief` → "Inquiry brief". */
export function featureFallback(feature: string): string {
  const text = feature.replace(/[_-]+/g, ' ').trim()
  return text === '' ? '—' : text.charAt(0).toUpperCase() + text.slice(1)
}

export interface FeatureRow { feature: string; cost_cents: number; calls: number; share: number }

/** The features by spend, each with its share of the month (whole percent), the costliest first. */
export function featureRows(rows: AiUsage['by_feature']): FeatureRow[] {
  const total = rows.reduce((sum, r) => sum + r.cost_cents, 0)
  return [...rows]
    .sort((a, b) => b.cost_cents - a.cost_cents || b.calls - a.calls)
    .map(r => ({ ...r, share: total === 0 ? 0 : Math.round((r.cost_cents / total) * 100) }))
}

/** The packages the allowance comes from ("crm" → "standard"), in the order the server listed them. */
export function planPackages(plan: AiUsage['plan']): { module: string; tier: string }[] {
  if (!plan.modules || !plan.tiers) return []
  return plan.modules.map(module => ({ module, tier: plan.tiers?.[module] ?? 'standard' }))
}

// ── Channels: Facebook Messenger ───────────────────────────────────────

export interface MessengerConfig {
  configured: boolean
  app_id: string
  graph_version: string
  required_scopes: string[]
  subscribed_fields: string[]
}

export type AccountStatus = 'active' | 'reauth_required' | 'disconnected'

export interface MessengerAccount {
  id: number
  channel: string
  external_id: string
  display_name: string | null
  display_avatar_url: string | null
  status: AccountStatus | string
  brand_id: number | null
  token_verified_at: string | null
  last_webhook_at: string | null
  last_error: string | null
  created_at: string | null
}

/** A page the person may connect (`list-pages`): its token goes straight back to the server, never shown. */
export interface PageOption { id: string; name: string; picture_url: string | null; access_token: string; already_connected: boolean }

export type CheckStatus = 'ok' | 'fail' | 'warn' | 'unknown'
export interface DiagnosticCheck { key: string; label: string; status: CheckStatus; detail: string; fix: string | null }
export interface Diagnostic { account_id: number; status: string; last_webhook_at: string | null; meta_app_id: string; checks: DiagnosticCheck[] }

export type StateTone = 'success' | 'pending' | 'danger' | 'neutral'

export function accountTone(status: string): StateTone {
  return status === 'active' ? 'success' : status === 'reauth_required' ? 'pending' : status === 'disconnected' ? 'danger' : 'neutral'
}

export function accountStatusKey(status: string): 'active' | 'reauth_required' | 'disconnected' | 'other' {
  return status === 'active' || status === 'reauth_required' || status === 'disconnected' ? status : 'other'
}

export function checkTone(status: string): StateTone {
  return status === 'ok' ? 'success' : status === 'warn' ? 'pending' : status === 'fail' ? 'danger' : 'neutral'
}

/** The checks the server runs, in its order, with words of their own; any other key shows the server's label. */
export const CHECK_KEYS = ['token', 'subscription', 'messages_field', 'webhook_activity'] as const

export function isKnownCheck(key: string): key is (typeof CHECK_KEYS)[number] {
  return (CHECK_KEYS as readonly string[]).includes(key)
}

/** A page whose token died can be reconnected through Facebook again, when the server is set up for it. */
export function canReconnect(account: MessengerAccount, config: MessengerConfig | undefined): boolean {
  return account.status === 'reauth_required' && config?.configured === true
}

/** The pages to offer: ones not yet connected first, each group by name. */
export function pageChoices(pages: readonly PageOption[]): PageOption[] {
  return [...pages].sort((a, b) => Number(a.already_connected) - Number(b.already_connected) || a.name.localeCompare(b.name))
}

/** The body that connects a chosen page, for the brand chosen in the header (null: the server's first brand). */
export function connectBody(page: PageOption, brandId: number | null | undefined): Record<string, unknown> {
  return {
    page_id: page.id,
    page_token: page.access_token,
    display_name: page.name,
    ...(page.picture_url ? { avatar_url: page.picture_url } : {}),
    ...(typeof brandId === 'number' ? { brand_id: brandId } : {}),
  }
}

/** How long ago an instant was, as a value and a unit for Intl.RelativeTimeFormat; null for never. */
export function ago(iso: string | null, nowMs: number): { value: number; unit: 'minute' | 'hour' | 'day' } | 'now' | null {
  if (!iso) return null
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return null
  const diff = Math.max(0, nowMs - at)
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return { value: -Math.round(diff / 60_000), unit: 'minute' }
  if (diff < 86_400_000) return { value: -Math.round(diff / 3_600_000), unit: 'hour' }
  return { value: -Math.round(diff / 86_400_000), unit: 'day' }
}
