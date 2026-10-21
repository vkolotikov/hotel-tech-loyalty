import { api, resolveImage } from '../../lib/api'
import type {
  Bootstrap, BenefitRequest, HistoryPage, MemberDetail, MemberFilters, MemberRow, MembersPage, PointsAfter, RequestTab, RequestsPage,
} from './types'

/**
 * Every call HexaTech Loyalty makes, in one place, typed. All of them live
 * under the one prefix the server gates with the organisation's flag;
 * tokens.test.ts refuses any other API path in this folder.
 */
const BASE = '/v1/admin/loyalty'

/**
 * The address of a call. The programme is the organisation's, so every call
 * names `brand_id=all`: the full admin's request hook (src/lib/api.ts) adds
 * its own brand choice to any address without `brand_id=`, and the brand
 * someone last picked there must not narrow the rewards or the ledger here.
 * A staff member restricted to one brand is still held to it by the server.
 */
export function loyaltyUrl(path: string): string {
  return `${BASE}/${path}${path.includes('?') ? '&' : '?'}brand_id=all`
}

/**
 * A stored picture's address as the browser must ask for it: MediaService answers `/storage/…` on the public disk,
 * which lives beside the API, not beside the page (they differ in local development). The full admin's own rule.
 */
export function mediaUrl(url: string | null | undefined): string | undefined {
  return resolveImage(url) ?? undefined
}

export interface ApiFailure {
  status: number
  /** The server's code (`not_enough_points`), `invalid` for a form's field errors, `network`, or `unknown`. */
  code: string
  /** Laravel's field errors, by field. */
  fields?: Record<string, string[]>
  /** What a refusal carries beside its code (`balance`, `state`, `need`). */
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
  const code = snake(data.code) ? data.code : snake(data.error) ? data.error : fields ? 'invalid' : response.status === 404 ? 'not_found' : 'unknown'
  const extra = Object.fromEntries(Object.entries(data).filter(([key]) => !['error', 'message', 'errors', 'code'].includes(key)))

  return { status: response.status ?? 0, code, ...(fields ? { fields } : {}), extra }
}

const offListeners = new Set<() => void>()

/**
 * Be told when a call is refused because Loyalty was switched off, or the
 * subscription lapsed, while this window was open: the provider asks for the
 * bootstrap again, whose own refusal puts the shell's notice on screen.
 * Returns the unsubscribe.
 */
export function onWorkspaceOff(listener: () => void): () => void {
  offListeners.add(listener)
  return () => { offListeners.delete(listener) }
}

/** Every call but the bootstrap goes through here; the failure is passed on untouched. */
export function watched<T>(request: Promise<{ data: T }>): Promise<T> {
  return request.then(r => r.data, (error: unknown) => {
    const code = failureOf(error).code
    if (code === 'workspace_disabled' || code === 'subscription_required') offListeners.forEach(listener => listener())
    throw error
  })
}

/** The members filters as `GET members` takes them: only those that hold something, the page only after the first. */
export function membersParams(filters: MemberFilters): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  const q = filters.q.trim()
  if (q !== '') out.q = q
  if (filters.tier_id !== null) out.tier_id = filters.tier_id
  if (filters.state !== 'active') out.state = filters.state
  if (filters.sort !== 'recent') out.sort = filters.sort
  if (filters.page > 1) out.page = filters.page
  return out
}

/** A key for one press of Award or Redeem: a retry of the same press writes nothing new. */
export function newPressKey(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return random.slice(0, 64)
}

export const loyaltyApi = {
  bootstrap: (): Promise<Bootstrap> => api.get(loyaltyUrl('bootstrap')).then(r => r.data),

  members: (filters: MemberFilters): Promise<MembersPage> => watched(api.get(loyaltyUrl('members'), { params: membersParams(filters) })),
  find: (q: string): Promise<{ members: MemberRow[] }> => watched(api.get(loyaltyUrl('find'), { params: { q } })),
  member: (id: number): Promise<MemberDetail> => watched(api.get(loyaltyUrl(`members/${id}`))),
  history: (id: number, page: number): Promise<HistoryPage> => watched(api.get(loyaltyUrl(`members/${id}/history`), { params: page > 1 ? { page } : {} })),
  award: (id: number, body: { points: number; reason: string; idempotency_key: string }): Promise<PointsAfter> =>
    watched(api.post(loyaltyUrl(`members/${id}/award`), body)),
  redeem: (id: number, body: { points: number; reason: string; idempotency_key: string }): Promise<PointsAfter> =>
    watched(api.post(loyaltyUrl(`members/${id}/redeem`), body)),
  reverse: (id: number, line: number, reason: string): Promise<PointsAfter> =>
    watched(api.post(loyaltyUrl(`members/${id}/history/${line}/reverse`), { reason })),

  requests: (tab: RequestTab, page: number): Promise<RequestsPage> =>
    watched(api.get(loyaltyUrl('requests'), { params: { state: tab, ...(page > 1 ? { page } : {}) } })),
  approve: (id: number): Promise<{ request: BenefitRequest }> => watched(api.post(loyaltyUrl(`requests/${id}/approve`))),
  done: (id: number): Promise<{ request: BenefitRequest }> => watched(api.post(loyaltyUrl(`requests/${id}/done`))),
  decline: (id: number, reason: string): Promise<{ request: BenefitRequest }> => watched(api.post(loyaltyUrl(`requests/${id}/decline`), { reason })),

  scan: (code: string): Promise<{ member: MemberRow }> => watched(api.post(loyaltyUrl('scan'), { code })),
}

export type LoyaltyApi = typeof loyaltyApi
