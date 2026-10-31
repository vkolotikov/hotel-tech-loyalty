import { create } from 'zustand'
import { Platform } from 'react-native'
import * as Device from 'expo-device'
import { api, connectSession } from './api'
import { storage } from './storage'
import { forgetPush } from './push'
import { languageOf, useLanguage } from './i18n'
import type { SignInAnswer } from './types'

// The old Hotel Loyalty app's own keys (com.hotelloyalty.app, the same keychain): a member signed in there stays
// signed in after the update to HexaTech Loyalty. Its third key, `auth_member`, is read by nothing and cleared on sign-out.
const TOKEN = 'auth_token'
const USER = 'auth_user'
const OLD_MEMBER = 'auth_member'

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
  /** Signs in with an answer the server already gave (a new member's registration). */
  adopt: (answer: SignInAnswer) => Promise<void>
  signOut: () => Promise<void>
}

/** How the device names itself in the member's sessions (`personal_access_tokens.name`). */
function deviceName(): string {
  const model = Device.modelName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android')
  return `HexaTech Loyalty (${model})`.slice(0, 50)
}

export const useSession = create<Session>((set, get) => ({
  token: null,
  user: null,
  ready: false,

  restore: async () => {
    const [token, userRaw] = await Promise.all([storage.get(TOKEN), storage.get(USER)])
    let user: SessionUser | null = null
    try {
      const parsed = userRaw ? (JSON.parse(userRaw) as Partial<SessionUser>) : null
      user = parsed && typeof parsed.id === 'number' ? { id: parsed.id, name: String(parsed.name ?? ''), email: String(parsed.email ?? '') } : null
    } catch {
      user = null
    }
    set({ token: token && user ? token : null, user: token && user ? user : null, ready: true })
  },

  signIn: async (email, password) => {
    const answer = await api.signIn(email.trim().toLowerCase(), password, deviceName())
    await get().adopt(answer)
  },

  adopt: async answer => {
    const user = { id: answer.user.id, name: answer.user.name, email: answer.user.email }
    set({ token: answer.token, user })
    await Promise.all([storage.set(TOKEN, answer.token), storage.set(USER, JSON.stringify(user))])
  },

  signOut: async () => {
    const token = get().token
    // While the token still works: this phone stops receiving the member's notifications (a few seconds at most).
    if (token) await Promise.race([forgetPush(token), new Promise(done => setTimeout(done, 4000))])
    set({ token: null, user: null })
    await Promise.all([storage.remove(TOKEN), storage.remove(USER), storage.remove(OLD_MEMBER)])
    if (token) {
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
