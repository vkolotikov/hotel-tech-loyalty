import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The shared API client's answer to the two refusals of Part C, for every
 * page: a deactivated account is signed out and told why; a session that
 * signed in before its organisation moved to the Appointments plan is
 * marked appointments-only and taken to the workspace (planning ruling R2).
 */
const store = vi.hoisted(() => ({
  state: { user: { id: 3, user_type: 'staff', workspaces: { appointments: { landing: false, has_services: true, only: false } } } as Record<string, unknown> | null },
}))
vi.mock('./logout', () => ({ logoutAndRedirect: vi.fn(async () => {}) }))
vi.mock('../stores/authStore', () => ({
  useAuthStore: {
    getState: () => store.state,
    setState: (next: Record<string, unknown>) => { store.state = { ...store.state, ...next } },
  },
}))

const location = { pathname: '/members', search: '', href: '', hostname: 'app.test' }
;(globalThis as unknown as { window: unknown }).window = { location, dispatchEvent: () => true }

const { api } = await import('./api')
const { logoutAndRedirect } = await import('./logout')
const { refusalOf } = await import('./accessOff')

type Handler = { rejected: (error: unknown) => Promise<unknown> }
const onError = (api.interceptors.response as unknown as { handlers: Handler[] }).handlers[0].rejected
const refused = (code: string) => ({ response: { status: 403, data: { error: code } }, config: { url: '/v1/admin/members' } })
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('the shared API client', () => {
  afterEach(() => {
    vi.mocked(logoutAndRedirect).mockClear()
    location.href = ''
    location.pathname = '/members'
  })

  it('reads only the two refusals it acts on', () => {
    expect(refusalOf(refused('staff_inactive'))).toBe('staff_inactive')
    expect(refusalOf(refused('not_in_plan'))).toBe('not_in_plan')
    expect(refusalOf(refused('not_allowed'))).toBeNull()
    expect(refusalOf({ response: { status: 401, data: { error: 'staff_inactive' } } })).toBeNull()
    expect(refusalOf(null)).toBeNull()
  })

  it('signs out a deactivated account and says why on the sign-in screen', async () => {
    await expect(onError(refused('staff_inactive'))).rejects.toBeTruthy()
    await vi.waitFor(() => expect(logoutAndRedirect).toHaveBeenCalledWith('/login?reason=access_off'))
  })

  it('takes a session that predates the Appointments plan to the workspace, marked appointments-only', async () => {
    await expect(onError(refused('not_in_plan'))).rejects.toBeTruthy()
    await vi.waitFor(() => expect(location.href).toBe('/appointments'))
    expect(store.state?.user).toMatchObject({ workspaces: { appointments: { only: true, landing: true, has_services: true } } })
    expect(logoutAndRedirect).not.toHaveBeenCalled()
  })

  it('does not answer a 401 from the sign-out call itself with another sign-out', async () => {
    await expect(onError({ response: { status: 401, data: {} }, config: { url: '/v1/auth/logout' } })).rejects.toBeTruthy()
    await settle()
    expect(logoutAndRedirect).not.toHaveBeenCalled()
  })

  it('never reloads the workspace itself, and leaves every other refusal to the page', async () => {
    location.pathname = '/appointments/clients'
    await expect(onError(refused('not_in_plan'))).rejects.toBeTruthy()
    location.pathname = '/members'
    await expect(onError(refused('not_allowed'))).rejects.toBeTruthy()
    await settle()
    expect(location.href).toBe('')
    expect(logoutAndRedirect).not.toHaveBeenCalled()
  })
})
