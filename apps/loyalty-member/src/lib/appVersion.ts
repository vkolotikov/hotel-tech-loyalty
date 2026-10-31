import { create } from 'zustand'
import Constants from 'expo-constants'
import { api } from './api'
import { versionState, type AppVersions, type VersionState } from './version'

/** This build's own version (app.json `version`). */
export const INSTALLED_VERSION = Constants.expoConfig?.version ?? '0.0.0'

/** How often a return to the app asks the server again. */
const RECHECK_MS = 30 * 60_000

interface VersionCheck {
  versions: AppVersions | null
  state: VersionState
  checkedAt: number
  check: (force?: boolean) => Promise<void>
}

/**
 * Whether this build is still served: asked at start and, at most every half hour, on return to the app. No answer
 * keeps what was known (a phone that was told to update stays told) and asks again next time.
 */
export const useVersionCheck = create<VersionCheck>((set, get) => ({
  versions: null,
  state: 'current',
  checkedAt: 0,

  check: async (force = false) => {
    if (!force && Date.now() - get().checkedAt < RECHECK_MS) return
    set({ checkedAt: Date.now() })
    try {
      const versions = await api.appVersions()
      set({ versions, state: versionState(INSTALLED_VERSION, versions) })
    } catch {
      set({ checkedAt: 0 })
    }
  },
}))
