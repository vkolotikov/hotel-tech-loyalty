import { create } from 'zustand'
import { getLocales } from 'expo-localization'
import { storage } from './storage'
import { languageOf, useLanguage, type Language } from './i18n'
import type { AlertsState } from './alerts'

const PREFS = 'hexatech_staff_prefs'

interface Prefs {
  /** Lock the app with Face ID, a fingerprint or the phone's passcode after two minutes away. */
  lock: boolean
  /** Request alerts on this phone (on unless switched off here). */
  alerts: boolean
  /** What the phone answered when alerts were last connected; not stored. */
  alertsState: AlertsState | null
  loaded: boolean
  load: () => Promise<void>
  setLock: (lock: boolean) => Promise<void>
  setAlerts: (alerts: boolean) => Promise<void>
  setAlertsState: (state: AlertsState) => void
  setLanguage: (language: Language) => Promise<void>
}

async function save(next: { lock: boolean; alerts: boolean; language: Language }): Promise<void> {
  await storage.set(PREFS, JSON.stringify(next))
}

/** The staff member's own choices on this phone: the language (the phone's by default), the lock and request alerts. */
export const usePrefs = create<Prefs>((set, get) => ({
  lock: false,
  alerts: true,
  alertsState: null,
  loaded: false,

  load: async () => {
    const raw = await storage.get(PREFS)
    let stored: { lock?: boolean; alerts?: boolean; language?: string } = {}
    try {
      stored = raw ? JSON.parse(raw) : {}
    } catch {
      stored = {}
    }
    const phone = getLocales()[0]?.languageCode ?? 'en'
    useLanguage.getState().setLanguage(languageOf(stored.language ?? phone))
    set({ lock: stored.lock === true, alerts: stored.alerts !== false, loaded: true })
  },

  setLock: async lock => {
    set({ lock })
    await save({ lock, alerts: get().alerts, language: useLanguage.getState().language })
  },

  setAlerts: async alerts => {
    set({ alerts })
    await save({ lock: get().lock, alerts, language: useLanguage.getState().language })
  },

  setAlertsState: alertsState => set({ alertsState }),

  setLanguage: async language => {
    useLanguage.getState().setLanguage(language)
    await save({ lock: get().lock, alerts: get().alerts, language })
  },
}))
