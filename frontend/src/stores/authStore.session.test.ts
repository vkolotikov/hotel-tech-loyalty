import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../i18n', () => ({ applyServerLanguage: () => {} }))

const user = (id: number) => ({ id, name: `Fixture ${id}`, email: `fixture-${id}@example.test`, user_type: 'staff' })
const envelope = (token: string, id: number) => JSON.stringify({ state: { token, user: user(id), staff: null }, version: 1 })

async function openStore(values: Record<string, string> = {}) {
  vi.resetModules()
  const entries = new Map(Object.entries(values))
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) },
  }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { localStorage: storage, location: { hostname: 'app.test', pathname: '/members', search: '', reload: vi.fn() } })
  const { useAuthStore } = await import('./authStore')
  const { authSession, storedSessionToken } = await import('../lib/authSession')
  const { api } = await import('../lib/api')
  return { useAuthStore, authSession, storedSessionToken, api, storage }
}

afterEach(() => vi.unstubAllGlobals())

describe('the persisted account and synchronous request subscribers', () => {
  it('publishes one identity to store subscribers, the fence and an immediate Axios request during sign-in and logout', async () => {
    const { useAuthStore, authSession, storedSessionToken, api, storage } = await openStore({
      'auth_token': 'account-a', 'loyalty-auth': envelope('account-a', 1),
    })
    const requests: Promise<unknown>[] = []
    const seen: Array<{ user: number | null; token: string | null; bearer: unknown }> = []
    const unsubscribe = useAuthStore.subscribe(state => {
      expect(authSession.check()).toBe(true)
      expect(authSession.token()).toBe(state.token)
      expect(storedSessionToken(storage)).toBe(state.token)
      requests.push(api.get('/fixture-only', { adapter: async config => {
        seen.push({ user: state.user?.id ?? null, token: state.token, bearer: config.headers.Authorization })
        return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
      } }))
    })
    try {
      useAuthStore.getState().setAuth('account-b', user(2))
      expect(seen).toEqual([{ user: 2, token: 'account-b', bearer: 'Bearer account-b' }])
      await Promise.all(requests)
      useAuthStore.getState().logout()
      expect(seen[1]).toEqual({ user: null, token: null, bearer: undefined })
      await Promise.all(requests)
    } finally {
      unsubscribe()
    }
  })

  it('hydrates a complete old pair after an interrupted legacy-token write, never the new token with the old identity', async () => {
    const { useAuthStore, authSession } = await openStore({
      'auth_token': 'account-b', 'loyalty-auth': envelope('account-a', 1),
    })
    expect(useAuthStore.getState()).toMatchObject({ token: 'account-a', user: { id: 1 } })
    expect(authSession.token()).toBe('account-a')
    expect(authSession.check()).toBe(true)
  })

  it.each([
    '{broken',
    JSON.stringify({ state: { token: 'account-b', user: null }, version: 1 }),
    JSON.stringify({ state: { token: 'account-b', user: { id: 1, user_type: 'unknown' } }, version: 1 }),
    JSON.stringify({ state: { token: 'account-b', user: user(1) }, version: 999 }),
  ])('treats an invalid persisted identity as signed out', async persisted => {
    const { useAuthStore, authSession } = await openStore({ 'auth_token': 'account-b', 'loyalty-auth': persisted })
    expect(useAuthStore.getState()).toMatchObject({ token: null, user: null, staff: null })
    expect(authSession.token()).toBeNull()
    expect(authSession.check()).toBe(true)
  })
})
