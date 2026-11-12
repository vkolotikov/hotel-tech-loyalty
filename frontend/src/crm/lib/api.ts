import { api } from '../../lib/api'
import { brandParam } from './brand'
import type { Bootstrap, BotGap, SetupProgress, Today } from './types'
import type { Pulse } from '../../lib/venuePulse'

/**
 * Every call HexaTech CRM makes goes through here (2026-11-07). The workspace's own reads live under
 * `/v1/admin/crm/…`, behind `workspace:crm`; everything else it shows is the full admin's own chat and CRM endpoints,
 * whose rules (AccessMap) stay theirs — the server decides, the workspace only hides what it would refuse. Only the
 * areas in AREAS may be called; tokens.test.ts refuses any other API path in this folder.
 */
export const AREAS = [
  'crm',
  // The website chat: the inbox, its canned replies and agents, the live visitors, the hub's feed and translation.
  'chat-inbox', 'chat-inbox-canned', 'chat-inbox-agents', 'visitors', 'engagement',
  // The AI assistant and the widget.
  'chatbot', 'chatbot-config', 'chatbot-onboarding', 'knowledge', 'popup-rules', 'training', 'widget-config',
  // The CRM: leads, deals, pipelines, contacts, tasks and what they share.
  'inquiries', 'inquiry-lost-reasons', 'inquiry-lost-reasons-admin', 'deals', 'pipelines', 'pipeline-stages', 'guests',
  'tasks', 'saved-views', 'custom-fields', 'lead-forms', 'corporate-accounts', 'crm-settings',
  // Round 2 (the main platform's leads): sending an email template from a lead, and the CRM's AI capture of a lead.
  'email-templates', 'crm-ai',
  // Round 5 (Integrations): the Facebook Messenger pages (`integrations/messenger*`, AccessMap product chat, a manager's).
  'integrations',
] as const

export type Area = (typeof AREAS)[number]

const AREA_SET = new Set<string>(AREAS)

/**
 * The address of a call: `/v1/admin/<area>/…`. Every call names its `brand_id`: the brand chosen in the CRM's switcher,
 * or `all` (lib/brand.ts, 2026-11-09) — never left out, because the full admin's request hook (src/lib/api.ts) would
 * otherwise add the brand someone last picked there. The server decides what each brand shows, and holds a staff
 * member restricted to their brands (BrandMiddleware).
 */
export function crmUrl(path: string): string {
  const clean = path.replace(/^\/+/, '')
  const area = clean.split(/[/?]/)[0]
  if (!AREA_SET.has(area)) throw new Error(`HexaTech CRM does not call /v1/admin/${area}`)
  return `/v1/admin/${clean}${clean.includes('?') ? '&' : '?'}brand_id=${encodeURIComponent(brandParam())}`
}

/** Query parameters with nothing empty in them: what the list endpoints take. */
export function params(values: Record<string, string | number | boolean | null | undefined>): string {
  const pairs = Object.entries(values)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v === true ? '1' : String(v))}`)
  return pairs.length ? `?${pairs.join('&')}` : ''
}

export interface ApiFailure {
  status: number
  /** The server's code (`ai_budget_used_up`, `feature_locked`), `invalid` for field errors, `network`, or `unknown`. */
  code: string
  /** Laravel's field errors, by field. */
  fields?: Record<string, string[]>
  extra: Record<string, unknown>
}

/** What went wrong with a call, read the same way everywhere. The server's sentence is never shown. */
export function failureOf(error: unknown): ApiFailure {
  if (!error) return { status: 0, code: '', extra: {} }
  const response = (error as { response?: { status?: number; data?: unknown } }).response
  if (!response) return { status: 0, code: 'network', extra: {} }

  const data = response.data && typeof response.data === 'object' ? (response.data as Record<string, unknown>) : {}
  const snake = (v: unknown): v is string => typeof v === 'string' && /^[a-z_]+$/.test(v)
  const fields = data.errors && typeof data.errors === 'object' ? (data.errors as Record<string, string[]>) : undefined
  const status = response.status ?? 0
  const code = snake(data.code) ? data.code
    : snake(data.error) ? data.error
    : fields ? 'invalid'
    : status === 404 ? 'not_found'
    : status === 403 ? 'not_allowed'
    : status === 429 ? 'too_many'
    : 'unknown'
  const extra = Object.fromEntries(Object.entries(data).filter(([key]) => !['error', 'message', 'errors', 'code'].includes(key)))

  return { status, code, ...(fields ? { fields } : {}), extra }
}

const offListeners = new Set<() => void>()

/**
 * Be told when a call is refused because HexaTech CRM was switched off, or the subscription lapsed, while this window
 * was open: the provider asks for the bootstrap again, whose own refusal puts the shell's notice on screen.
 */
export function onWorkspaceOff(listener: () => void): () => void {
  offListeners.add(listener)
  return () => { offListeners.delete(listener) }
}

function watched<T>(request: Promise<{ data: T }>): Promise<T> {
  return request.then(r => r.data, (error: unknown) => {
    const code = failureOf(error).code
    if (code === 'workspace_disabled' || code === 'subscription_required') offListeners.forEach(listener => listener())
    throw error
  })
}

/** GET /v1/admin/<path>. */
export function get<T>(path: string): Promise<T> {
  return watched(api.get<T>(crmUrl(path)))
}

/** POST, PUT, PATCH or DELETE /v1/admin/<path>. A FormData body is sent as a multipart upload. */
export function send<T>(method: 'post' | 'put' | 'patch' | 'delete', path: string, body?: unknown): Promise<T> {
  const url = crmUrl(path)
  if (method === 'delete') return watched(api.delete<T>(url, body === undefined ? undefined : { data: body }))
  return watched(api[method]<T>(url, body))
}

/** The workspace's own reads and its AI draft. */
export const crmApi = {
  bootstrap: () => api.get<Bootstrap>(crmUrl('crm/bootstrap')).then(r => r.data),
  today: () => get<Today>('crm/today'),
  /** The venue's clock, place and weather (VenuePulse), for Today's card. */
  pulse: () => get<Pulse>('crm/pulse'),
  start: () => get<SetupProgress>('crm/start'),
  botGaps: () => get<{ data: BotGap[] }>('crm/bot-gaps').then(r => r.data),
  draft: (conversationId: number, instruction?: string) =>
    send<{ draft: string }>('post', `crm/conversations/${conversationId}/draft`, instruction ? { instruction } : {}),
}
