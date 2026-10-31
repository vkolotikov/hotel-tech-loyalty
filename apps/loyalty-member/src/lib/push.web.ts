import type { AlertsState } from './alerts'

/** The web preview has no push: notifications are the installed app's. */
export async function connectPush(_options: { on: boolean; channelName: string; authToken: string }): Promise<AlertsState> {
  return 'unavailable'
}

export async function forgetPush(_authToken: string): Promise<void> {}

export function usePushTaps(_open: (path: '/inbox') => void, _refresh: () => void): void {}
