import { create } from 'zustand'
import { Platform } from 'react-native'
import * as Device from 'expo-device'
import { api, connectSession } from './api'
import { storage } from './storage'
import { forgetAlerts } from './push'
import { languageOf, useLanguage } from './i18n'

const TOKEN = 'hexatech_staff_token'
const USER = 'hexatech_staff_user'

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
    const [token, userRaw] = await Promise.all([storage.get(TOKEN), storage.get(USER)])
    let user: SessionUser | null = null
    try {
      user = userRaw ? (JSON.parse(userRaw) as SessionUser) : null
    } catch {
      user = null
    }
    set({ token: token && user ? token : null, user: token && user ? user : null, ready: true })
  },

  signIn: async (email, password) => {
    const answer = await api.signIn(email.trim().toLowerCase(), password, deviceName())
    const user = { id: answer.user.id, name: answer.user.name, email: answer.user.email }
    set({ token: answer.token, user })
    await Promise.all([storage.set(TOKEN, answer.token), storage.set(USER, JSON.stringify(user))])
  },

  signOut: async () => {
    const token = get().token
    // While the token still works: this phone stops hearing this person's request alerts (at most a few seconds' wait).
    if (token) await Promise.race([forgetAlerts(token), new Promise(done => setTimeout(done, 4000))])
    set({ token: null, user: null })
    await Promise.all([storage.remove(TOKEN), storage.remove(USER)])
    if (token) {
      // Revoke the token on the server too; signed out here whatever it answers.
      try {
        await api.signOut(token)
      } catch {
        // Offline: the token stays until it is revoked from the web.
      }
    }
  },
}))

connectSession({
  token: () => useSession.getState().token,
  language: () => languageOf(useLanguage.getState().language),
  signedOut: () => {
    void useSession.getState().signOut()
  },
})
