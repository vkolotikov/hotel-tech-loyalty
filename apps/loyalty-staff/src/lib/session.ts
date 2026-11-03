import { create } from 'zustand'
import { Platform } from 'react-native'
import * as Device from 'expo-device'
import { api, cancelSessionRequests, connectSession } from './api'
import { storage } from './storage'
import { forgetAlerts } from './push'
import { languageOf, useLanguage } from './i18n'
import { queryClient } from './queryClient'
import { useScan } from './scanState'

const TOKEN = 'hexatech_staff_token'
const USER = 'hexatech_staff_user'
// Serialize persistence: an old sign-out must never delete a newer sign-in's keys.
let persistence = Promise.resolve()
let deviceCleanup = Promise.resolve()
let generation = 0
function persist(work: () => Promise<unknown>): Promise<void> {
  persistence = persistence.then(work, work).then(() => {})
  return persistence
}
function clearPrivateState(): void {
  cancelSessionRequests()
  void queryClient.cancelQueries()
  queryClient.clear()
  useScan.getState().reset()
}

export interface SessionUser {
  id: number
  name: string
  email: string
}

interface Session {
  token: string | null
  user: SessionUser | null
  /** True once the stored session (if any) has been read at launch. */
  ready: boolean
  restore: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

/** How the device names itself in the staff member's sessions (`personal_access_tokens.name`). */
function deviceName(): string {
  const model = Device.modelName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android')
  return `HexaTech Staff (${model})`.slice(0, 50)
}

export const useSession = create<Session>((set, get) => ({
  token: null,
  user: null,
  ready: false,

  restore: async () => {
    const started = generation
    const [token, userRaw] = await Promise.all([storage.get(TOKEN), storage.get(USER)])
    let user: SessionUser | null = null
    try {
      user = userRaw ? (JSON.parse(userRaw) as SessionUser) : null
    } catch {
      user = null
    }
    if (started !== generation) return
    set({ token: token && user ? token : null, user: token && user ? user : null, ready: true })
  },

  signIn: async (email, password) => {
    const started = ++generation
    await deviceCleanup
    if (started !== generation) return
    const answer = await api.signIn(email.trim().toLowerCase(), password, deviceName())
    if (started !== generation) return
    let boot
    try { boot = await api.bootstrapFor(answer.token) } catch (error) {
      void api.signOut(answer.token).catch(() => {})
      throw error
    }
    if (started !== generation) return
    const user = { id: answer.user.id, name: answer.user.name, email: answer.user.email }
    clearPrivateState()
    queryClient.setQueryData(['boot'], boot)
    set({ token: answer.token, user })
    await persist(() => Promise.all([storage.set(TOKEN, answer.token), storage.set(USER, JSON.stringify(user))]))
  },

  signOut: async () => {
    const token = get().token
    ++generation
    set({ token: null, user: null })
    clearPrivateState()
    if (token) {
      // Local access ends immediately. Cleanup uses the old token explicitly.
      deviceCleanup = deviceCleanup.then(() => forgetAlerts(token)).catch(() => {})
      void deviceCleanup.then(() => api.signOut(token)).catch(() => {})
    }
    await persist(() => Promise.all([storage.remove(TOKEN), storage.remove(USER)]))
  },
}))

connectSession({
  token: () => useSession.getState().token,
  language: () => languageOf(useLanguage.getState().language),
  signedOut: token => {
    if (useSession.getState().token === token) void useSession.getState().signOut()
  },
})
