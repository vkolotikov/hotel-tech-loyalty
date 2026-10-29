import { queryClient } from './queryClient'

export const AUTH_SESSION_VERSION = 1

/** A tab must never use a different account's shared token with its existing screen or request. */
export function createSessionFence(readToken: () => string | null, invalidate: () => void) {
  let token = readToken()
  let version = 0
  let blocked = false
  const listeners = new Set<() => void>()
  const publish = () => { for (const listener of listeners) listener() }
  return {
    bind(next: string | null, commit?: () => void) {
      const changed = token !== next || blocked
      token = next
      blocked = false
      if (changed) version++
      // The store's synchronous subscribers must see the same identity as request interceptors.
      commit?.()
      if (changed) publish()
    },
    check(expected = version) {
      if (!blocked && readToken() !== token) {
        blocked = true
        version++
        publish()
        invalidate()
      }
      return !blocked && version === expected
    },
    token: () => token,
    version: () => version,
    blocked: () => blocked,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

/** Token and identity are a single atomic JSON write; the legacy token mirror is never an auth authority. */
export function sessionTokenOf(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null
  const session = state as { token?: unknown; user?: { id?: unknown; user_type?: unknown } | null }
  if (typeof session.token !== 'string' || !session.token || !session.user ||
      typeof session.user.id !== 'number' || !Number.isFinite(session.user.id) || session.user.id <= 0 ||
      !['staff', 'member'].includes(String(session.user.user_type))) return null
  return session.token
}

export function storedSessionToken(storage: Pick<Storage, 'getItem'>): string | null {
  try {
    const envelope = JSON.parse(storage.getItem('loyalty-auth') || 'null')
    return envelope?.version === AUTH_SESSION_VERSION ? sessionTokenOf(envelope.state) : null
  }
  catch { return null }
}

const readToken = () => {
  try { return typeof localStorage === 'undefined' ? null : storedSessionToken(localStorage) }
  catch { return null }
}

export const authSession = createSessionFence(readToken, () => {
  // clear() cancels outstanding queries. Reload also discards component drafts, dialogs and other stores.
  // Do not write to storage here: the other tab's new identity must remain intact.
  queryClient.clear()
  if (typeof window !== 'undefined') window.location.reload()
})

if (typeof window !== 'undefined' && window.addEventListener) {
  const check = () => { authSession.check() }
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === 'auth_token' || event.key === 'loyalty-auth') check()
  }
  window.addEventListener('storage', storage)
  window.addEventListener('focus', check)
  window.addEventListener('pageshow', check)
  import.meta.hot?.dispose(() => {
    window.removeEventListener('storage', storage)
    window.removeEventListener('focus', check)
    window.removeEventListener('pageshow', check)
  })
}
