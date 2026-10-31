import { create } from 'zustand'
import { getLocales } from 'expo-localization'
import { storage } from './storage'
import { languageOf, useLanguage, type Language } from './i18n'

const PREFS = 'hexatech_staff_prefs'

interface Prefs {
  /** Lock the app with Face ID, a fingerprint or the phone's passcode after two minutes away. */
  lock: boolean
  loaded: boolean
  load: () => Promise<void>
  setLock: (lock: boolean) => Promise<void>
  setLanguage: (language: Language) => Promise<void>
}

async function save(next: { lock: boolean; language: Language }): Promise<void> {
  await storage.set(PREFS, JSON.stringify(next))
}

/** The staff member's own choices on this phone: the language (the phone's by default) and the lock. */
export const usePrefs = create<Prefs>((set, get) => ({
  lock: false,
  loaded: false,

  load: async () => {
    const raw = await storage.get(PREFS)
    let stored: { lock?: boolean; language?: string } = {}
    try {
      stored = raw ? JSON.parse(raw) : {}
    } catch {
      stored = {}
    }
    const phone = getLocales()[0]?.languageCode ?? 'en'
    useLanguage.getState().setLanguage(languageOf(stored.language ?? phone))
    set({ lock: stored.lock === true, loaded: true })
  },

  setLock: async lock => {
    set({ lock })
    await save({ lock, language: useLanguage.getState().language })
  },

  setLanguage: async language => {
    useLanguage.getState().setLanguage(language)
    await save({ lock: get().lock, language })
  },
}))
