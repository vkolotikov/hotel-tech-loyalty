import { createStore } from 'zustand/vanilla'

const LOCK_AFTER_MS = 2 * 60_000

/** A separate gate per restored session: old device-authentication results cannot unlock another session. */
export function createAppLock(initiallyEnabled: boolean) {
  const state = createStore(() => ({ locked: initiallyEnabled, busy: false }))
  let enabled = initiallyEnabled
  let awaySince: number | null = null
  return {
    ...state,
    configure(on: boolean) {
      enabled = on
      if (!on) { awaySince = null; state.setState({ locked: false }) }
    },
    change(next: string, now: number) {
      if (!enabled || state.getState().busy) return
      if (next === 'background' || next === 'inactive') awaySince ??= now
      else if (next === 'active') {
        if (awaySince !== null && now - awaySince >= LOCK_AFTER_MS) state.setState({ locked: true })
        awaySince = null
      }
    },
    async unlock(authenticate: () => Promise<boolean>) {
      if (!state.getState().locked || state.getState().busy) return
      state.setState({ busy: true })
      try {
        if (await authenticate()) { awaySince = null; state.setState({ locked: false }) }
      } catch {
        // Cancelled, unavailable or refused: member screens remain unmounted.
      } finally { state.setState({ busy: false }) }
    },
  }
}
