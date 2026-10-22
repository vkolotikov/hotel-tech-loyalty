import type { ApiFailure } from '../lib/api'

/**
 * Scan's decisions (release 5, spec 2026-10-23 §3), kept out of the components so they are tested by string: which
 * way of scanning this device offers, what to send from a tap or a reader, which sentence a failure gets, and whether
 * "Link this card" is offered. The server reads every code again (CardLookup) and decides who it names.
 */

/** Where a code came from: the field (a person, or a reader that types), the camera, a phone's NFC, a USB reader. */
export type Source = 'field' | 'camera' | 'nfc' | 'usb'

/** One scan: the code sent, where it came from, and the card ID to link when it names nobody (null: not a card). */
export interface Attempt {
  code: string
  source: Source
  card: string | null
}

// ─── What this device offers ──────────────────────────────────────────────

/** What the browser can do, read once from its globals (all false where there is no window, as in the tests). */
export interface ScanEnv {
  secure: boolean
  camera: boolean
  webNfc: boolean
  webHid: boolean
}

export function detectEnv(): ScanEnv {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return { secure: false, camera: false, webNfc: false, webHid: false }
  return {
    secure: window.isSecureContext === true,
    camera: typeof navigator.mediaDevices?.getUserMedia === 'function',
    webNfc: 'NDEFReader' in window,
    webHid: 'hid' in navigator,
  }
}

export type ScanMode = 'camera' | 'nfc' | 'usb'

/** Whether a way of scanning can start here: ready, not in this browser, or only over https (the camera). */
export type ModeState = 'ready' | 'unsupported' | 'insecure'

export function modeState(mode: ScanMode, env: ScanEnv): ModeState {
  if (mode === 'camera') return !env.secure ? 'insecure' : env.camera ? 'ready' : 'unsupported'
  if (mode === 'nfc') return env.webNfc ? 'ready' : 'unsupported'
  return env.webHid ? 'ready' : 'unsupported'
}

// ─── Failures of the camera and of NFC ────────────────────────────────────

export type CameraFailure = 'denied' | 'absent' | 'busy' | 'insecure' | 'unknown'

/** The browser's camera error as the page's sentence. */
export function cameraFailure(error: unknown): CameraFailure {
  const name = errorName(error)
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'absent'
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy'
  if (name === 'TypeError' && typeof navigator !== 'undefined' && !navigator.mediaDevices) return 'insecure'
  return 'unknown'
}

export type NfcFailure = 'denied' | 'unsupported' | 'off' | 'unreadable' | 'unknown'

/** Web NFC's error as the page's sentence (NotReadableError: the phone's NFC is switched off or busy). */
export function nfcFailure(error: unknown): NfcFailure {
  const name = errorName(error)
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotSupportedError') return 'unsupported'
  if (name === 'NotReadableError') return 'off'
  return 'unknown'
}

/** What the NFC panel shows: not in this browser, starting (the permission may be asked), listening, or a failure. */
export type NfcPanelState = 'unsupported' | 'starting' | 'listening' | Exclude<NfcFailure, 'unsupported'>

export function nfcState(env: ScanEnv, listening: boolean, trouble: NfcFailure | null): NfcPanelState {
  if (!env.webNfc || trouble === 'unsupported') return 'unsupported'
  if (trouble) return trouble
  return listening ? 'listening' : 'starting'
}

function errorName(error: unknown): string {
  return error && typeof error === 'object' && 'name' in error ? String((error as { name: unknown }).name) : ''
}

// ─── What a code looks like ───────────────────────────────────────────────

/** The member app's QR code (its JSON, however a layout bent the punctuation). */
export function looksLikeAppCode(text: string): boolean {
  return /member.{0,3}number|hotel.{0,3}loyalty/i.test(text) || (/^\s*[{[]/.test(text) && /token/i.test(text))
}

/** A member number as a card or tag may carry it: `LS-001001`, `#HL-2026-000001`, `M012345`, or digits alone. */
export function looksLikeMemberNumber(text: string): boolean {
  const t = text.trim()
  return /^#?\s*[A-Za-z]{1,6}[-\s]?\d[\dA-Za-z-]{2,30}$/.test(t) || /^\d{4,12}$/.test(t)
}

/**
 * A card's ID as a reader types it or a person copies it: hex with separators or letters (4 to 10 bytes), or the
 * 8 to 17 digits of a decimal reader. A member number (`LS-001001`) is not one.
 */
export function looksLikeCardId(text: string): boolean {
  const t = text.trim()
  const hex = t.replace(/[\s:\-._]/g, '')
  if (hex === '' || !/^[0-9a-fA-F]+$/.test(hex)) return false
  if (/^\d+$/.test(t)) return t.length >= 8 && t.length <= 17
  return hex.length % 2 === 0 && hex.length >= 8 && hex.length <= 20
}

/** A link that carries a member number or a token (in its query, or a member number as its last segment). */
export function linkCarriesMember(text: string): boolean {
  const t = text.trim()
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return false
  if (/[?&#](member_number|member|number|token|code|card)=/i.test(t)) return true
  const last = t.replace(/[?#].*$/, '').split('/').filter(Boolean).pop() ?? ''
  return looksLikeMemberNumber(decodeURIComponentSafe(last))
}

function decodeURIComponentSafe(text: string): string {
  try { return decodeURIComponent(text) } catch { return text }
}

/** A hex ID as a reader gave it (`04a2b3c4`) in the form people read and the server reads as hex: `04:A2:B3:C4`. */
export function hexWithColons(hex: string): string {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  return (clean.match(/.{1,2}/g) ?? []).join(':')
}

/** A card ID shown short on a member's page: `04:A2:…:F7` for a long one, the whole of a 4-byte one. */
export function shortUid(uid: string): string {
  const pairs = uid.replace(/[^0-9a-fA-F]/g, '').toUpperCase().match(/.{1,2}/g) ?? []
  if (pairs.length <= 4) return pairs.join(':') || uid
  return `${pairs.slice(0, 2).join(':')}:…:${pairs.slice(-2).join(':')}`
}

// ─── A tap, a reader, the camera, the field ───────────────────────────────

/** An NDEF record as the page reads it: its type, its media type, and its text where it has one. */
export interface NdefRecordText {
  recordType: string
  mediaType?: string
  text: string | null
}

/**
 * What a tapped card sends: a text record carrying the app's code or a member number wins over the card's own ID
 * (the serial number), then a link record that carries a member; otherwise the serial number. Linking always uses the
 * serial number. Null when the tap gave nothing to send.
 */
export function nfcAttempt(serialNumber: string | undefined | null, records: NdefRecordText[]): Attempt | null {
  const serial = (serialNumber ?? '').trim()
  const card = serial !== '' ? serial : null
  const texts = records.filter(r => r.text !== null && r.text.trim() !== '' && (r.recordType === 'text' || (r.recordType === 'mime' && /json|text/i.test(r.mediaType ?? ''))))
  const appCode = texts.find(r => looksLikeAppCode(r.text!))
  if (appCode) return { code: appCode.text!.trim(), source: 'nfc', card }
  const number = texts.find(r => looksLikeMemberNumber(r.text!))
  if (number) return { code: number.text!.trim(), source: 'nfc', card }
  const link = records.find(r => (r.recordType === 'url' || r.recordType === 'absolute-url') && r.text !== null && linkCarriesMember(r.text))
  if (link) return { code: link.text!.trim(), source: 'nfc', card }
  return card ? { code: card, source: 'nfc', card } : null
}

/** A USB reader's ID (hex), sent and linked as `04:A2:B3:C4`. */
export function usbAttempt(uid: string): Attempt {
  const code = hexWithColons(uid)
  return { code, source: 'usb', card: code }
}

export function cameraAttempt(text: string): Attempt {
  return { code: text, source: 'camera', card: null }
}

/** What the field sends: what was typed; it may be linked when it looks like a card's ID. */
export function fieldAttempt(text: string): Attempt {
  const code = text.trim()
  return { code, source: 'field', card: looksLikeCardId(code) ? code : null }
}

/** The same card read again within this many milliseconds is one tap (phones and readers repeat). */
export const REPEAT_MS = 2500

export function isRepeat(previous: { code: string; at: number } | null, code: string, now: number): boolean {
  return previous !== null && previous.code === code && now - previous.at < REPEAT_MS
}

/** Whether the field takes the focus back after a scan: not after the camera or a tap, which a phone's keyboard would cover. */
export function refocusAfter(source: Source): boolean {
  return source === 'field' || source === 'usb'
}

// ─── What a refused scan says ─────────────────────────────────────────────

/**
 * A refused scan: a card nobody has (offer to link it), a card switched off here (offer to link it again), or the
 * scan's own refusal (`not_found`, `expired`, …, read by lib/errors.ts).
 */
export type ScanTrouble = 'card_unknown' | 'card_off' | 'refusal'

export function scanTrouble(failure: ApiFailure, attempt: Attempt): ScanTrouble {
  if (failure.code === 'inactive' && failure.extra.card === 'off') return 'card_off'
  if (failure.code === 'not_found' && attempt.card !== null) return 'card_unknown'
  return 'refusal'
}

/** The card ID "Link this card" links, or null when it is not offered. */
export function cardToLink(trouble: ScanTrouble, attempt: Attempt): string | null {
  if (trouble === 'refusal') return null
  return attempt.card ?? attempt.code
}
