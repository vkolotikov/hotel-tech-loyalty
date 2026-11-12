import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  platform: 'ios',
  delayWrite: null as (() => Promise<void>) | null,
  token: vi.fn(async () => ({ data: 'fixture-expo-token' })),
  saved: new Map<string, string>(),
}))
vi.mock('react-native', () => ({ Platform: { get OS() { return native.platform } } }))
vi.mock('expo-device', () => ({ isDevice: true }))
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { eas: { projectId: 'fixture-project' } } } } }))
vi.mock('expo-notifications', () => ({
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async () => {},
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  requestPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  getExpoPushTokenAsync: native.token,
}))
vi.mock('./storage', () => ({ storage: {
  get: async (key: string) => native.saved.get(key) ?? null,
  set: async (key: string, value: string) => { await native.delayWrite?.(); native.saved.set(key, value) },
  remove: async (key: string) => { native.saved.delete(key) },
} }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const options = (on: boolean, authToken = 'member-a') => ({ on, channelName: 'Membership', authToken })

beforeEach(() => {
  vi.resetModules()
  native.saved.clear()
  native.delayWrite = null
  native.token.mockReset().mockResolvedValue({ data: 'fixture-expo-token' })
})
afterEach(() => vi.unstubAllGlobals())

async function setup() {
  const server = new Map<string, string>()
  let currentSession = 'member-a'
  const fetcher = vi.fn(async (_url: string, request?: RequestInit) => {
    const owner = (request?.headers as Record<string, string>).Authorization
    if (request?.method === 'POST') server.set(owner, JSON.parse(String(request.body)).expo_push_token)
    if (request?.method === 'DELETE' && server.get(owner) === JSON.parse(String(request.body)).expo_push_token) server.delete(owner)
    return new Response('{}')
  })
  vi.stubGlobal('fetch', fetcher)
  const { connectSession } = await import('./api')
  connectSession({ token: () => currentSession, language: () => 'en', signedOut: () => {}, memberRequired: async () => {} })
  return { ...await import('./push'), server, fetcher, changeSession: () => { currentSession = 'member-b' } }
}

describe.each(['ios', 'android'])('device notification reconciliation on %s', platform => {
  beforeEach(() => { native.platform = platform })
  it('does not register a delayed token after notifications are switched off', async () => {
    const app = await setup()
    const token = deferred<{ data: string }>()
    native.token.mockReturnValueOnce(token.promise)
    const enabling = app.connectPush(options(true))
    await vi.waitFor(() => expect(native.token).toHaveBeenCalledOnce())
    await app.connectPush(options(false))
    token.resolve({ data: 'fixture-expo-token' })
    await enabling
    expect(app.server.size).toBe(0)
    expect(native.saved.size).toBe(0)
  })

  it('withdraws a registration that finishes after the off choice', async () => {
    const app = await setup()
    const response = deferred<Response>()
    app.fetcher.mockImplementationOnce(async (_url, request) => {
      app.server.set((request?.headers as Record<string, string>).Authorization, 'fixture-expo-token')
      return response.promise
    })
    const enabling = app.connectPush(options(true))
    await vi.waitFor(() => expect(app.server.size).toBe(1))
    const disabling = app.connectPush(options(false))
    response.resolve(new Response('{}'))
    await Promise.all([enabling, disabling])
    expect(app.server.size).toBe(0)
    expect(native.saved.size).toBe(0)
  })

  it('pins token registration to the session which requested it', async () => {
    const app = await setup()
    const token = deferred<{ data: string }>()
    native.token.mockReturnValueOnce(token.promise)
    const enabling = app.connectPush(options(true))
    await vi.waitFor(() => expect(native.token).toHaveBeenCalledOnce())
    app.changeSession()
    token.resolve({ data: 'fixture-expo-token' })
    await enabling
    expect(app.server.has('Bearer member-b')).toBe(false)
  })

  it('lets a later on choice win after an earlier disconnect', async () => {
    const app = await setup()
    await app.connectPush(options(true))
    const disabling = app.connectPush(options(false))
    const enabling = app.connectPush(options(true))
    await Promise.all([disabling, enabling])
    expect(app.server.get('Bearer member-a')).toBe('fixture-expo-token')
    expect(native.saved.get('hexatech_loyalty_push_token')).toBe('fixture-expo-token')
  })

  it.each(['fixture-expo-token', 'rotated-fixture-token'])('retains a registration when off cancels storage of %s', async token => {
    const app = await setup()
    await app.connectPush(options(true))
    native.token.mockResolvedValueOnce({ data: token })
    const write = deferred<void>()
    let writing = false
    native.delayWrite = async () => { writing = true; await write.promise }
    const reconnecting = app.connectPush(options(true))
    await vi.waitFor(() => expect(writing).toBe(true))
    const disabling = app.connectPush(options(false))
    write.resolve()
    await Promise.all([reconnecting, disabling])
    expect(app.server.size).toBe(0)
    expect(native.saved.size).toBe(0)
  })

  it('does not let token preparation re-register after sign-out withdrawal', async () => {
    const app = await setup()
    const token = deferred<{ data: string }>()
    native.token.mockReturnValueOnce(token.promise)
    const enabling = app.connectPush(options(true))
    await vi.waitFor(() => expect(native.token).toHaveBeenCalledOnce())
    await app.forgetPush('member-a')
    token.resolve({ data: 'fixture-expo-token' })
    await enabling
    expect(app.server.size).toBe(0)
    expect(native.saved.size).toBe(0)
  })

  it('retains the old receipt if a rotated reconnect cannot withdraw it while offline', async () => {
    const app = await setup()
    await app.connectPush(options(true))
    native.token.mockResolvedValueOnce({ data: 'rotated-fixture-token' })
    app.fetcher.mockRejectedValueOnce(new TypeError('Offline'))
    expect(await app.connectPush(options(true))).toBe('unavailable')
    await app.connectPush(options(false))
    expect(app.server.size).toBe(0)
    expect(native.saved.size).toBe(0)
  })

  it('keeps the stored token when offline so the next off reconciliation can retry', async () => {
    const app = await setup()
    await app.connectPush(options(true))
    app.fetcher.mockRejectedValueOnce(new TypeError('Offline'))
    await app.connectPush(options(false))
    await app.connectPush(options(false))
    expect(app.server.size).toBe(0)
    expect(native.saved.size).toBe(0)
  })
})
