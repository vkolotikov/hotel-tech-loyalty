export const LOCK_AFTER_MS = 2 * 60_000
export const lockAtLaunch = (enabled: boolean, signedIn: boolean): boolean => enabled && signedIn
export function lockOnReturn(enabled: boolean, signedIn: boolean, awaySince: number | null, now: number): boolean {
  return enabled && signedIn && awaySince !== null && now - awaySince >= LOCK_AFTER_MS
}
