import { ApiError, failureFrom } from './failure'
import type { Activity, JoinContext, LaravelPage, MemberCardAnswer, PortalBootstrap, SignInAnswer } from './types'
import type { AppVersions } from './version'

/** The HexaTech API (production by default; a development build may point elsewhere with EXPO_PUBLIC_API_URL). */
export const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://app.hexa-tech.uk/api').replace(/\/+$/, '')
/** The web app beside it, for the pages a phone opens in the browser (password reset, account set-up). */
export const WEB_BASE = (process.env.EXPO_PUBLIC_WEB_URL ?? API_BASE.replace(/\/api$/, '')).replace(/\/+$/, '')

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

/** Reads are asked once more after no answer or a server error; writes never are on their own. */
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
    send('POST', '/v1/auth/login', { email, password, device, user_type: 'member' }),
  /** Revokes this token; sent with the token itself, which the session has already forgotten. */
  signOut: (token: string): Promise<unknown> => send('DELETE', '/v1/auth/logout', undefined, undefined, token),
  joinContext: (orgToken: string): Promise<JoinContext> => send('GET', `/v1/public/join/${encodeURIComponent(orgToken)}`),
  register: (body: { name: string; email: string; phone: string; password: string; password_confirmation: string; referral_code: string; org_token: string }): Promise<SignInAnswer> =>
    send('POST', '/v1/auth/register', body),

  /** Which versions of this app the server still serves; public, asked before sign-in too. */
  appVersions: (): Promise<AppVersions> => read('/v1/apps/member/version'),
  /** Everything the home screen needs at once (the portal's own bootstrap). */
  bootstrap: (): Promise<PortalBootstrap> => read('/v1/member/portal'),
  card: (): Promise<MemberCardAnswer> => read('/v1/member/card'),
  pointsHistory: (page: number): Promise<LaravelPage<Activity>> => read('/v1/member/points/history', { page, per_page: 20 }),
  appleWalletLink: (): Promise<{ url: string; expires_in: number }> => read('/v1/member/card/apple-wallet/link'),
  googleWallet: (): Promise<{ saveUrl?: string; save_url?: string }> => read('/v1/member/card/google-wallet'),

  /** This phone's push token for the member (one per member, as the server keeps it). */
  savePushToken: (token: string): Promise<unknown> => send('POST', '/v1/auth/push-token', { expo_push_token: token }),
  /** Before signing out, with the session's own token: the member's push token is cleared when it is this phone's. */
  forgetPushToken: (token: string, authToken: string): Promise<unknown> => send('DELETE', '/v1/auth/push-token', { expo_push_token: token }, undefined, authToken),
}
