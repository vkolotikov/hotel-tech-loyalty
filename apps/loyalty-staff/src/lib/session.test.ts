import { beforeEach, describe, expect, it, vi } from 'vitest'
const saved = vi.hoisted(() => new Map<string, string>())
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-device', () => ({ modelName: 'test phone' }))
vi.mock('./push', () => ({ forgetAlerts: vi.fn(async () => {}) }))
vi.mock('./storage', () => ({ storage: {
  get: async (key: string) => saved.get(key) ?? null,
  set: async (key: string, value: string) => { saved.set(key, value) },
  remove: async (key: string) => { saved.delete(key) },
} }))
vi.mock('./i18n', () => ({ languageOf: () => 'en', useLanguage: { getState: () => ({ language: 'en' }) } }))
import { api } from './api'
import { useSession } from './session'
import { useScan } from './scanState'
import { queryClient } from './queryClient'
const user = { id: 7, name: 'Demo Staff', email: 'staff@example.test' }
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
beforeEach(() => {
  saved.clear(); queryClient.clear(); useScan.getState().reset()
  useSession.setState({ token: 'old-test-token', user, ready: true })
  vi.unstubAllGlobals()
})
describe('staff session isolation', () => {
  it('clears private data and scan location immediately, before remote logout completes', async () => {
    queryClient.setQueryData(['member', 1], { name: 'Private' })
    useScan.getState().setWhere({ kind: 'event', id: 4, name: 'Private event' })
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, {})))
    const leaving = useSession.getState().signOut()
    expect(useSession.getState().token).toBeNull()
    expect(queryClient.getQueryData(['member', 1])).toBeUndefined()
    expect(useScan.getState().where).toEqual({ kind: 'desk' })
    expect(useScan.getState().answer).toBeNull()
    await leaving
  })
  it.each([200, 401, 503])('discards a delayed %s from a previous account without retrying or signing out the new account', async status => {
    let finish!: (response: Response) => void
    const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
    vi.stubGlobal('fetch', fetch)
    const request = api.member(1)
    useSession.setState({ token: 'new-test-token', user: { ...user, id: 8 } })
    finish(respond(status, { member: { id: 1 } }))
    await expect(request).rejects.toThrow('unauthenticated')
    expect(useSession.getState().token).toBe('new-test-token')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('clears cache on token expiry as well as on the sign-out button', async () => {
    queryClient.setQueryData(['member', 1], { name: 'Private' })
    vi.stubGlobal('fetch', vi.fn(async () => respond(401, {})))
    await expect(api.member(1)).rejects.toThrow('unauthenticated')
    expect(useSession.getState().token).toBeNull()
    expect(queryClient.getQueryData(['member', 1])).toBeUndefined()
  })
  it('only adopts an account after its staff workspace bootstrap succeeds', async () => {
    useSession.setState({ token: null, user: null })
    const fetch = vi.fn().mockResolvedValueOnce(respond(200, { token: 'new-test-token', user }))
      .mockResolvedValueOnce(respond(200, { organization: { id: 49 } }))
    vi.stubGlobal('fetch', fetch)
    await useSession.getState().signIn('staff@example.test', 'test-only')
    expect(useSession.getState().token).toBe('new-test-token')
    expect(queryClient.getQueryData(['boot'])).toEqual({ organization: { id: 49 } })
    expect(saved.get('hexatech_staff_token')).toBe('new-test-token')
  })
})
