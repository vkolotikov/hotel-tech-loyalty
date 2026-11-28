import { modeState, type Attempt, type ScanEnv, type ScanMode } from './scanMath'
export function firstReader(env: ScanEnv, asked?: string | null, usedWindowsReader = false): ScanMode {
  if (asked === 'camera' || (asked === 'usb' && env.secure && env.webHid)) return asked
  if (modeState('windows', env) === 'ready' && (asked === 'windows' || asked === 'nfc' || (!asked && usedWindowsReader))) return 'windows'
  if (asked === 'nfc' && env.secure && env.webNfc) return asked
  return env.secure && env.webNfc && !env.windows ? 'nfc' : 'camera'
}
export function physicalCardAttempt(attempt: Attempt): Attempt {
  // nfcAttempt has already preferred a personal member record when one is present. Namespace only the serial fallback.
  return attempt.card && attempt.code === attempt.card ? { ...attempt, code: `HTCARD:${attempt.card}` } : attempt
}
