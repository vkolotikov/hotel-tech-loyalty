import type { Attempt, ScanEnv, ScanMode } from './scanMath'
export function firstReader(env: ScanEnv, asked?: string | null): ScanMode {
  if (asked === 'camera' || (asked === 'usb' && env.secure && env.webHid)) return asked
  return env.secure && env.webNfc ? 'nfc' : 'camera'
}
export function physicalCardAttempt(attempt: Attempt): Attempt {
  // nfcAttempt has already preferred a personal member record when one is present. Namespace only the serial fallback.
  return attempt.card && attempt.code === attempt.card ? { ...attempt, code: `HTCARD:${attempt.card}` } : attempt
}
