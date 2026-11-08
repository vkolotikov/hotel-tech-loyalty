import { api } from '../../lib/api'
import type { ApplyResult, Board, Bootstrap, CaptureDraft, Insights, Person, PlanResult, Review, Task, Today, Week } from './types'

/**
 * Every call HexaTech Time Planner makes goes through here (2026-11-09). Its own reads and AI live under
 * `/v1/admin/time/…`, behind `workspace:time` (and the plan's `time_management`); tasks, the backlog, templates and day
 * notes are the full admin's own `planner/*` endpoints, a person's skills its `team/{id}` — whose rules (AccessMap)
 * stay theirs; the planner's settings are the workspace's `time/settings` (the full admin's rows, so an organisation
 * that bought only the Time Planner never needs the CRM's settings area). Only the areas in AREAS may be called; tokens.test.ts refuses any
 * other API path in this folder.
 */
export const AREAS = ['time', 'planner', 'team'] as const

export type Area = (typeof AREAS)[number]

const AREA_SET = new Set<string>(AREAS)

/**
 * The address of a call: `/v1/admin/<area>/…`. Every call names `brand_id=all`: the planner is the organisation's, and
 * the full admin's request hook (src/lib/api.ts) otherwise adds the brand someone last picked there.
 */
export function timeUrl(path: string): string {
  const clean = path.replace(/^\/+/, '')
  const area = clean.split(/[/?]/)[0]
  if (!AREA_SET.has(area)) throw new Error(`HexaTech Time Planner does not call /v1/admin/${area}`)
  return `/v1/admin/${clean}${clean.includes('?') ? '&' : '?'}brand_id=all`
}

/** Query parameters with nothing empty in them. */
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

/** Be told when a call is refused because the workspace was switched off, or the subscription lapsed, meanwhile. */
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
  return watched(api.get<T>(timeUrl(path)))
}

/** POST, PUT, PATCH or DELETE /v1/admin/<path>. A FormData body is sent as a multipart upload. */
export function send<T>(method: 'post' | 'put' | 'patch' | 'delete', path: string, body?: unknown): Promise<T> {
  const url = timeUrl(path)
  if (method === 'delete') return watched(api.delete<T>(url, body === undefined ? undefined : { data: body }))
  return watched(api[method]<T>(url, body))
}

export interface PlanRequest {
  date: string
  scope: 'me' | 'person' | 'team'
  person?: string
  include_pool?: boolean
  include_overdue?: boolean
  include_timed?: boolean
  use_ai?: boolean
  instruction?: string
  lang?: string
}

/** The workspace's own reads, its clock and its AI. */
export const timeApi = {
  bootstrap: () => api.get<Bootstrap>(timeUrl('time/bootstrap')).then(r => r.data),
  today: () => get<Today>('time/today'),
  day: (date: string, person?: string | null) => get<Board>(`time/day${params({ date, person })}`),
  week: (start: string, person?: string | null) => get<Week>(`time/week${params({ start, person })}`),
  people: () => get<{ people: Person[]; knowledge_max: number }>('time/people'),
  /** The backlog as the full admin's `planner/backlog` chooses it, in the workspace's task shape. */
  backlog: (scope: 'mine' | 'pool') => get<{ tasks: Task[] }>(`time/backlog${params({ scope })}`),
  teamBacklog: () => get<{ pool: Task[]; buckets: { key: string; user_id: number; name: string; tasks: Task[] }[] }>('time/backlog?scope=team'),
  insights: (from: string, to: string, person?: string | null) => get<Insights>(`time/insights${params({ from, to, person })}`),
  estimate: (q: { task_group?: string | null; task_category?: string | null; title?: string | null }) =>
    get<{ estimate: { minutes: number; samples: number; basis: string } | null }>(`time/estimate${params(q)}`),
  clock: (taskId: number, action: 'start' | 'pause' | 'finish') => send<Task>('post', `time/tasks/${taskId}/${action}`),
  plan: (body: PlanRequest) => send<PlanResult>('post', 'time/plan', body),
  apply: (date: string, lines: { task_id: number; person: string; start_time: string; duration_minutes: number; seen: string | null }[]) =>
    send<ApplyResult>('post', 'time/plan/apply', { date, lines }),
  review: (body: { kind: 'day'; date: string; person?: string | null; lang?: string } | { kind: 'period'; from: string; to: string; person?: string | null; lang?: string }) =>
    send<Review>('post', 'time/review', body),
  capture: (text: string, lang: string, date?: string) => send<{ tasks: CaptureDraft[] }>('post', 'time/capture', { text, lang, ...(date ? { date } : {}) }),
  transcribe: (audio: Blob, fileName: string, language?: string) => {
    const form = new FormData()
    form.append('audio', audio, fileName)
    if (language) form.append('language', language)
    return send<{ text: string; language: string | null }>('post', 'time/transcribe', form)
  },
  updatePerson: (userId: number, body: Record<string, unknown>) => send<{ person: unknown }>('put', `time/people/${userId}`, body),
}
