import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { useSession } from './session'
import { queryClient } from './queryClient'

const saved = vi.hoisted(() => new Map<string, string>())
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-device', () => ({ modelName: 'test phone' }))
vi.mock('./push', () => ({ forgetPush: vi.fn(async () => {}) }))
vi.mock('./storage', () => ({ storage: {
  get: async (key: string) => saved.get(key) ?? null,
  set: async (key: string, value: string) => { saved.set(key, value) },
  remove: async (key: string) => { saved.delete(key) },
} }))
vi.mock('./i18n', () => ({ languageOf: () => 'en', useLanguage: { getState: () => ({ language: 'en' }) } }))

const member = { id: 7, name: 'Demo Member', email: 'member@example.test', user_type: 'member' }
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  saved.clear()
  useSession.setState({ token: null, user: null, ready: false, memberRequired: false })
  queryClient.clear()
  vi.unstubAllGlobals()
})

describe('upgrading the old app session', () => {
  it('forgets a stored staff session without revoking the staff token', async () => {
    saved.set('auth_token', 'legacy-staff-test-token')
    saved.set('auth_user', JSON.stringify({ ...member, user_type: 'staff' }))
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await useSession.getState().restore()
    expect(useSession.getState().ready).toBe(true)
    expect(useSession.getState().token).toBeNull()
    expect(saved.has('auth_token')).toBe(false)
    expect(useSession.getState().memberRequired).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns an untyped legacy session to sign-in when the server says member_only', async () => {
    saved.set('auth_token', 'legacy-untyped-test-token')
    saved.set('auth_user', JSON.stringify({ id: 7, name: member.name, email: member.email }))
    await useSession.getState().restore()
    const fetch = vi.fn(async () => respond(403, { error: 'member_only' }))
    vi.stubGlobal('fetch', fetch)
    await expect(api.bootstrap()).rejects.toThrow('member_only')
    expect(useSession.getState().token).toBeNull()
    expect(saved.has('auth_token')).toBe(false)
    expect(useSession.getState().memberRequired).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps a valid saved member signed in', async () => {
    saved.set('auth_token', 'member-test-token')
    saved.set('auth_user', JSON.stringify(member))
    await useSession.getState().restore()
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, { member: { id: 7 } })))
    await expect(api.bootstrap()).resolves.toEqual({ member: { id: 7 } })
    expect(useSession.getState().token).toBe('member-test-token')
    expect(useSession.getState().memberRequired).toBe(false)
  })

  it('does not sign out a member when the venue disables its portal', async () => {
    await useSession.getState().adopt({ token: 'member-test-token', user: member })
    vi.stubGlobal('fetch', vi.fn(async () => respond(403, { error: 'portal_disabled' })))
    await expect(api.bootstrap()).rejects.toThrow('portal_disabled')
    expect(useSession.getState().token).toBe('member-test-token')
  })

  it('does not let a delayed refusal discard a newer member session', async () => {
    useSession.setState({ token: 'legacy-staff-test-token', user: member })
    let finish!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
    const request = api.bootstrap()
    await useSession.getState().adopt({ token: 'new-member-test-token', user: member })
    finish(respond(403, { error: 'member_only' }))
    await expect(request).rejects.toThrow('member_only')
    expect(useSession.getState().token).toBe('new-member-test-token')
  })

  it('clears the old account data and explanation when a member signs in', async () => {
    useSession.setState({ memberRequired: true })
    queryClient.setQueryData(['boot'], { member: { id: 8, current_points: 999 } })
    await useSession.getState().adopt({ token: 'new-member-test-token', user: member })
    expect(queryClient.getQueryData(['boot'])).toBeUndefined()
    expect(useSession.getState().memberRequired).toBe(false)
    expect(JSON.parse(saved.get('auth_user')!).user_type).toBe('member')
  })

  it('refuses a staff login response without saving it as a membership', async () => {
    await expect(useSession.getState().adopt({ token: 'staff-test-token', user: { ...member, user_type: 'staff' } })).rejects.toThrow('member_only')
    expect(saved.has('auth_token')).toBe(false)
    expect(useSession.getState().token).toBeNull()
  })
})
