import { ApiError, failureFrom } from './failure'
import type {
  Activity, Bootstrap, DeskAnswer, Envelope, EventRow, HistoryPage, MemberDetail, MemberRow, MembersPage, Metrics,
  NfcCardRow, PlaceRow, PointsAfter, RedemptionsPage, RequestTab, RequestsPage, ScanAnswer, SignInAnswer,
} from './types'

/** The HexaTech API (production by default; a development build may point elsewhere with EXPO_PUBLIC_API_URL). */
export const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://app.hexa-tech.uk/api').replace(/\/+$/, '')
/** The web app beside it, for the workspace pages the phone opens in the browser. */
export const WEB_BASE = (process.env.EXPO_PUBLIC_WEB_URL ?? API_BASE.replace(/\/api$/, '')).replace(/\/+$/, '')

const LOYALTY = '/v1/admin/loyalty'
const TIMEOUT_MS = 15_000

type Query = Record<string, string | number | null | undefined>

let readToken: () => string | null = () => null
let readLanguage: () => string = () => 'en'
let onSignedOut: () => void = () => {}

/** The session tells the client where the token is and what to do when the server no longer accepts it. */
export function connectSession(options: { token: () => string | null; language: () => string; signedOut: () => void }): void {
  readToken = options.token
  readLanguage = options.language
  onSignedOut = options.signedOut
}

/**
 * A loyalty address. Every call names `brand_id=all`, as the web workspace's do: the programme is the organisation's,
 * and a staff member restricted to one brand is still held to it by the server.
 */
export function loyaltyPath(path: string): string {
  return `${LOYALTY}/${path}${path.includes('?') ? '&' : '?'}brand_id=all`
}

function withQuery(path: string, query?: Query): string {
  const parts = Object.entries(query ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  if (parts.length === 0) return path
  return `${path}${path.includes('?') ? '&' : '?'}${parts.join('&')}`
}

async function send<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, query?: Query, asToken?: string): Promise<T> {
  const token = asToken ?? readToken()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${API_BASE}${withQuery(path, query)}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Accept-Language': readLanguage(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch {
    throw new ApiError(failureFrom(0, null))
  } finally {
    clearTimeout(timer)
  }

  const text = await response.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  if (!response.ok) {
    const failure = failureFrom(response.status, parsed)
    // A token the server no longer knows ends the session; a refused sign-in does not.
    if (response.status === 401 && token && !asToken) onSignedOut()
    throw new ApiError(failure)
  }
  return parsed as T
}

/**
 * Reads are asked once more after no answer or a server error; writes never are on their own — the screen offers
 * "Try again" with the attempt's own key, so a retried award or scan never counts twice.
 */
async function read<T>(path: string, query?: Query): Promise<T> {
  try {
    return await send<T>('GET', path, undefined, query)
  } catch (error) {
    const status = error instanceof ApiError ? error.failure.status : 0
    if (status === 0 || status >= 500) return send<T>('GET', path, undefined, query)
    throw error
  }
}

export const api = {
  signIn: (email: string, password: string, device: string): Promise<SignInAnswer> =>
    send('POST', '/v1/auth/login', { email, password, device, user_type: 'staff' }),
  /** Revokes this token; sent with the token itself, which the session has already forgotten. */
  signOut: (token: string): Promise<unknown> => send('DELETE', '/v1/auth/logout', undefined, undefined, token),

  bootstrap: (): Promise<Bootstrap> => read(loyaltyPath('bootstrap')),
  metrics: (): Promise<Envelope<Metrics>> => read(loyaltyPath('overview/metrics'), { period: '30d' }),
  activity: (): Promise<Envelope<Activity>> => read(loyaltyPath('overview/activity'), { filter: 'all' }),

  find: (q: string): Promise<{ members: MemberRow[] }> => read(loyaltyPath('find'), { q }),
  members: (q: string, page: number, tierId: number | null): Promise<MembersPage> =>
    read(loyaltyPath('members'), { q, page, per_page: 25, sort: 'recent', state: 'all', tier_id: tierId }),
  member: (id: number): Promise<MemberDetail> => read(loyaltyPath(`members/${id}`)),
  history: (id: number, page: number): Promise<HistoryPage> => read(loyaltyPath(`members/${id}/history`), { page }),
  cards: (id: number): Promise<{ cards: NfcCardRow[] }> => read(loyaltyPath(`members/${id}/cards`)),

  scan: (body: { code: string; idempotency_key: string; place_id?: number; event_id?: number }): Promise<ScanAnswer> =>
    send('POST', loyaltyPath('scan'), body),
  places: (): Promise<{ places: PlaceRow[] }> => read(loyaltyPath('places')),
  eventsToday: (): Promise<{ events: EventRow[] }> => read(loyaltyPath('events'), { when: 'today' }),

  award: (id: number, points: number, reason: string, key: string): Promise<PointsAfter> =>
    send('POST', loyaltyPath(`members/${id}/award`), { points, reason, idempotency_key: key }),
  redeem: (id: number, points: number, reason: string, key: string): Promise<PointsAfter> =>
    send('POST', loyaltyPath(`members/${id}/redeem`), { points, reason, idempotency_key: key }),
  checkIn: (id: number, amount: number | null, note: string, key: string): Promise<DeskAnswer> =>
    send('POST', loyaltyPath(`members/${id}/check-in`), { ...(amount ? { amount } : {}), ...(note ? { note } : {}), idempotency_key: key }),
  linkCard: (id: number, uid: string): Promise<{ card: NfcCardRow; linked: boolean }> =>
    send('POST', loyaltyPath(`members/${id}/cards`), { uid }),

  requests: (state: RequestTab, page: number): Promise<RequestsPage> => read(loyaltyPath('requests'), { state, page }),
  approve: (id: number): Promise<unknown> => send('POST', loyaltyPath(`requests/${id}/approve`)),
  decline: (id: number, reason: string): Promise<unknown> => send('POST', loyaltyPath(`requests/${id}/decline`), { reason }),
  done: (id: number): Promise<unknown> => send('POST', loyaltyPath(`requests/${id}/done`)),

  redemptions: (state: 'pending' | 'done', page: number): Promise<RedemptionsPage> => read(loyaltyPath('redemptions'), { state, page }),
  fulfil: (id: number): Promise<unknown> => send('POST', loyaltyPath(`redemptions/${id}/fulfil`)),
}
