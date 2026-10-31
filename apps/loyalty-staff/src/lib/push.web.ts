import type { AlertsState } from './alerts'

/** The web preview has no push: alerts are the installed app's. */
export async function connectAlerts(_options: { language: string; alerts: boolean; channelName: string }): Promise<AlertsState> {
  return 'unavailable'
}

export async function forgetAlerts(_authToken: string): Promise<void> {}

export function useAlertTaps(_open: () => void, _refresh: () => void): void {}
