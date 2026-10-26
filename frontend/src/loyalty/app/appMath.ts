import type { Can, Features } from '../lib/types'
import { serverProblems, type Problems } from '../lib/forms'
import type { Colors, CurrencyPreview, Look, LookBody, LookOptions, Preset, Wallet, WalletBody, WalletFile } from './types'

/**
 * Card & app's decisions (release 2 §7), kept out of the components so they can be tested: the tab an address names,
 * who sees what, the colours in the two forms the two places read (`#rrggbb` for the member app, `rgb(r,g,b)` for
 * Apple's pass), the wallet's and the look's forms — what they hold, what stops them, what is sent — readiness, the
 * presets, and the colours the phone preview is drawn with.
 */

// ─── The tabs ─────────────────────────────────────────────────────────────

export const APP_TABS = ['wallet', 'app', 'currency'] as const
export type AppTab = typeof APP_TABS[number]

/** The tab an address names (`?tab=app`, `?tab=currency`); the wallet pass for none or anything else. */
export function tabFrom(search: string): AppTab {
  const tab = new URLSearchParams(search).get('tab')
  return (APP_TABS as readonly string[]).includes(tab ?? '') ? (tab as AppTab) : 'wallet'
}

/** The address of a tab: the wallet pass is the page's own address, the others carry `?tab=`. */
export function searchFor(tab: AppTab): string {
  return tab === 'wallet' ? '' : `?tab=${tab}`
}

/**
 * What the page shows (§3): the whole page is a manager's (`manage_app`) — anyone else who opens it by address reads
 * why; the wallet pass needs the plan's `wallet` feature, the member app's look does not.
 */
export function appAccess(can: Can, features: Features): { manage: boolean; wallet: boolean } {
  return { manage: can.manage_app, wallet: features.wallet }
}

// ─── The currency (release 4, R4-5) ───────────────────────────────────────

/** A currency code with its name in the language, "EUR · Euro"; the bare code where the browser has no name for it. */
export function currencyLabel(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale || 'en'], { type: 'currency' }).of(code)
    return name && name !== code ? `${code} · ${name}` : code
  } catch {
    return code
  }
}

/** Whether Save has anything to do: a code from the list other than the current one. */
export function currencyChanged(current: string, chosen: string, options: readonly string[]): boolean {
  return chosen !== current && options.includes(chosen)
}

/** One thing the manager reads before the change is saved, by its key under `loyalty.app.currency.warn`. */
export type CurrencyWarning =
  | { key: 'payments'; currency: string }
  | { key: 'bookings'; total: number; upcoming: number }
  | { key: 'stays'; currency: string }
  | { key: 'relabel'; services: number; extras: number }

/**
 * What the server's dry run says, in the order it matters (warn, list, still allow): online payments in another
 * currency first, then the bookings that keep theirs, the stays priced apart, and the prices that get the new label.
 * Nothing to say: an empty list, and the change is saved at once.
 */
export function currencyWarnings(preview: CurrencyPreview): CurrencyWarning[] {
  const out: CurrencyWarning[] = []
  if (preview.payments.mismatch && preview.payments.currency) out.push({ key: 'payments', currency: preview.payments.currency })
  if (preview.bookings.total > 0) out.push({ key: 'bookings', total: preview.bookings.total, upcoming: preview.bookings.upcoming })
  if (preview.stays) out.push({ key: 'stays', currency: preview.stays.currency })
  if (preview.relabel.services + preview.relabel.extras > 0) out.push({ key: 'relabel', services: preview.relabel.services, extras: preview.relabel.extras })
  return out
}

// ─── Colours ──────────────────────────────────────────────────────────────

/** A colour typed or stored as `#rgb` or `#rrggbb`, in any case, as the lower-case `#rrggbb` both forms keep; else null. */
export function hexOf(text: string | null | undefined): string | null {
  const v = (text ?? '').trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + v.slice(1).split('').map(c => c + c).join('')
  return null
}

const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i

/** A pass colour as stored (`rgb(13,13,13)`, or the hex the full admin let through) as `#rrggbb`; null for anything else. */
export function rgbHex(stored: string | null | undefined): string | null {
  const m = RGB.exec((stored ?? '').trim())
  if (!m) return hexOf(stored)
  const parts = m.slice(1, 4).map(Number)
  if (parts.some(p => p > 255)) return null
  return '#' + parts.map(p => p.toString(16).padStart(2, '0')).join('')
}

/** `#rrggbb` as the CSS-style triple Apple's pass.json reads, written as the server stores it: `rgb(13,13,13)`. */
export function appleRgb(hex: string): string {
  const v = hexOf(hex) ?? '#000000'
  return `rgb(${[1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16)).join(',')})`
}

/** What a colour input can show for the text beside it: the colour, or black while the text is not one yet. */
export const pickerValue = (text: string): string => hexOf(text) ?? '#000000'

// ─── The wallet pass ──────────────────────────────────────────────────────

/** The pass's three colours, by the server's field names. */
export const WALLET_COLOURS = ['apple_pass_background_color', 'apple_pass_foreground_color', 'apple_pass_label_color'] as const

export interface WalletForm {
  apple_pass_type_id: string
  apple_team_id: string
  apple_organization_name: string
  /** The colours as typed, `#rrggbb`. */
  apple_pass_background_color: string
  apple_pass_foreground_color: string
  apple_pass_label_color: string
  google_issuer_id: string
  google_class_suffix: string
  is_active: boolean
}

/** The wallet's fields for the form; a stored colour Apple cannot read is kept as it is, for the form to flag. */
export function walletFormOf(w: Wallet): WalletForm {
  const colour = (stored: string | null) => rgbHex(stored) ?? (stored ?? '')
  return {
    apple_pass_type_id: w.apple_pass_type_id ?? '',
    apple_team_id: w.apple_team_id ?? '',
    apple_organization_name: w.apple_organization_name ?? '',
    apple_pass_background_color: colour(w.apple_pass_background_color),
    apple_pass_foreground_color: colour(w.apple_pass_foreground_color),
    apple_pass_label_color: colour(w.apple_pass_label_color),
    google_issuer_id: w.google_issuer_id ?? '',
    google_class_suffix: w.google_class_suffix ?? '',
    is_active: w.is_active,
  }
}

const filled = (text: string): boolean => text.trim() !== ''
const orNull = (text: string): string | null => (filled(text) ? text.trim() : null)

/** The shapes WalletController checks: a Pass Type ID starts `pass.`, a Team ID is ten capitals or digits, … */
export const isPassTypeId = (text: string): boolean => /^pass\.[A-Za-z0-9][A-Za-z0-9.-]*$/.test(text.trim()) && text.trim().length <= 191
export const isTeamId = (text: string): boolean => /^[A-Z0-9]{10}$/.test(text.trim().toUpperCase())
export const isIssuerId = (text: string): boolean => /^\d{1,64}$/.test(text.trim())
export const isClassSuffix = (text: string): boolean => /^[A-Za-z0-9._-]+$/.test(text.trim()) && text.trim().length <= 191

export function walletProblems(form: WalletForm): Problems {
  const out: Problems = {}
  if (filled(form.apple_pass_type_id) && !isPassTypeId(form.apple_pass_type_id)) out.apple_pass_type_id = 'pass_type_id'
  if (filled(form.apple_team_id) && !isTeamId(form.apple_team_id)) out.apple_team_id = 'team_id'
  if (form.apple_organization_name.trim().length > 191) out.apple_organization_name = 'organization_name'
  for (const field of WALLET_COLOURS) if (!hexOf(form[field])) out[field] = 'colour'
  if (filled(form.google_issuer_id) && !isIssuerId(form.google_issuer_id)) out.google_issuer_id = 'issuer_id'
  if (filled(form.google_class_suffix) && !isClassSuffix(form.google_class_suffix)) out.google_class_suffix = 'class_suffix'
  return out
}

/** The whole form as the server takes it: empty is none, the Team ID in capitals, the colours as Apple reads them. */
export function walletBody(form: WalletForm): WalletBody {
  return {
    apple_pass_type_id: orNull(form.apple_pass_type_id),
    apple_team_id: filled(form.apple_team_id) ? form.apple_team_id.trim().toUpperCase() : null,
    apple_organization_name: orNull(form.apple_organization_name),
    apple_pass_background_color: appleRgb(form.apple_pass_background_color),
    apple_pass_foreground_color: appleRgb(form.apple_pass_foreground_color),
    apple_pass_label_color: appleRgb(form.apple_pass_label_color),
    google_issuer_id: orNull(form.google_issuer_id),
    google_class_suffix: orNull(form.google_class_suffix),
    is_active: form.is_active,
  }
}

/** The server's field errors in the wallet form's words. */
export const WALLET_FIELDS: Record<string, string> = {
  apple_pass_type_id: 'pass_type_id', apple_team_id: 'team_id', apple_organization_name: 'organization_name',
  apple_pass_background_color: 'colour', apple_pass_foreground_color: 'colour', apple_pass_label_color: 'colour',
  google_issuer_id: 'issuer_id', google_class_suffix: 'class_suffix',
}

export function walletServerProblems(fields: Record<string, string[]> | undefined): Problems {
  return serverProblems(fields, WALLET_FIELDS)
}

/**
 * The problems the wallet form shows: its own once Save was pressed, the server's field errors, and — from the start —
 * a colour that is not one, since it can only have been saved elsewhere (the full admin takes any text).
 */
export function walletShownProblems(form: WalletForm, tried: boolean, fields: Record<string, string[]> | undefined): Problems {
  const out: Problems = { ...(tried ? walletProblems(form) : {}), ...walletServerProblems(fields) }
  for (const field of WALLET_COLOURS) if (!hexOf(form[field])) out[field] = 'colour'
  return out
}

/** A pass is ready when nothing is missing (WalletSettings::missing names every condition the pass builder has). */
export function passReady(missing: string[]): boolean {
  return missing.length === 0
}

export const WALLET_FILES: WalletFile[] = ['apple_cert', 'apple_wwdr', 'google_service_account']

/** What the file input offers for each file. */
export const FILE_ACCEPT: Record<WalletFile, string> = {
  apple_cert: '.p12,.pfx,application/x-pkcs12',
  apple_wwdr: '.cer,.crt,.pem,application/x-x509-ca-cert,application/pkix-cert',
  google_service_account: '.json,application/json',
}

/** The missing code that says a named file is no longer on the server. */
const GONE: Record<WalletFile, string> = { apple_cert: 'certificate_gone', apple_wwdr: 'wwdr_gone', google_service_account: 'service_account_gone' }

/** Whether a file is there: uploaded, never uploaded, or named but no longer on the server. */
export function fileState(kind: WalletFile, w: Wallet): 'set' | 'none' | 'gone' {
  const missing = kind === 'google_service_account' ? w.google_missing : w.apple_missing
  if (missing.includes(GONE[kind])) return 'gone'
  const set = kind === 'apple_cert' ? w.apple_cert_uploaded : kind === 'apple_wwdr' ? w.apple_wwdr_uploaded : w.google_service_account_uploaded
  return set ? 'set' : 'none'
}

/** An upload over a file that is there replaces it, and the dialog says so first. */
export const replaces = (state: 'set' | 'none' | 'gone'): boolean => state === 'set'

// ─── The member app's look ────────────────────────────────────────────────

export interface LookForm {
  /** The colours as typed. */
  colors: Colors
  card_style: string
  radius: number
  button_style: string
  accent_intensity: string
  /** The preset applied in this edit; null until one is. */
  preset: string | null
}

/** The saved look for the form; a colour stored as `#ABC` reads as `#aabbcc`, one that is not a colour as it is. */
export function lookFormOf(look: Look, options: LookOptions): LookForm {
  const colors: Colors = {}
  for (const key of options.colors) colors[key] = hexOf(look.colors[key]) ?? (look.colors[key] ?? '')
  return { colors, card_style: look.card_style, radius: look.radius, button_style: look.button_style, accent_intensity: look.accent_intensity, preset: null }
}

/** A preset's colours, all of them, and its key to send. */
export function applyPreset(form: LookForm, preset: Preset): LookForm {
  return { ...form, colors: { ...form.colors, ...preset.colors }, preset: preset.key }
}

export function lookProblems(form: LookForm, options: LookOptions): Problems {
  const out: Problems = {}
  for (const key of options.colors) if (!hexOf(form.colors[key])) out[`colors.${key}`] = 'colour'
  if (!options.card_styles.includes(form.card_style)) out.card_style = 'card_style'
  if (!Number.isInteger(form.radius) || form.radius < options.radius.min || form.radius > options.radius.max) out.radius = 'radius'
  if (!options.button_styles.includes(form.button_style)) out.button_style = 'button_style'
  if (!options.accent_intensities.includes(form.accent_intensity)) out.accent_intensity = 'accent_intensity'
  return out
}

/** The whole look as the server takes it: colours lower-case `#rrggbb`; the preset only when one was applied. */
export function lookBody(form: LookForm, options: LookOptions): LookBody {
  const colors: Colors = {}
  for (const key of options.colors) colors[key] = hexOf(form.colors[key]) ?? form.colors[key]
  return {
    colors,
    card_style: form.card_style,
    radius: form.radius,
    button_style: form.button_style,
    accent_intensity: form.accent_intensity,
    ...(form.preset ? { preset: form.preset } : {}),
  }
}

/** The server's field errors (`colors.primary`, `radius`, …) by the same names the form's own problems use. */
export function lookServerProblems(fields: Record<string, string[]> | undefined): Problems {
  const out: Problems = {}
  for (const name of Object.keys(fields ?? {})) {
    if (name.startsWith('colors.')) out[name] = 'colour'
    else if (['card_style', 'radius', 'button_style', 'accent_intensity', 'preset'].includes(name)) out[name] = name
  }
  return out
}

/**
 * The preset the look shows as chosen: the one applied in this edit, else the one saved; `changed` when the colours
 * no longer all equal it (the full admin keeps the name after a colour is changed by hand, and so does this).
 */
export function chosenPreset(form: LookForm, saved: string | null, options: LookOptions): { key: string; changed: boolean } | null {
  const preset = options.presets.find(p => p.key === (form.preset ?? saved))
  if (!preset) return null
  const changed = Object.entries(preset.colors).some(([key, hex]) => hexOf(form.colors[key]) !== hexOf(hex))
  return { key: preset.key, changed }
}

/** Whether the form holds anything the saved look does not. */
export function lookChanged(form: LookForm, look: Look, options: LookOptions): boolean {
  if (form.preset !== null && form.preset !== look.preset) return true
  if (form.card_style !== look.card_style || form.radius !== look.radius || form.button_style !== look.button_style || form.accent_intensity !== look.accent_intensity) return true
  return options.colors.some(key => (hexOf(form.colors[key]) ?? form.colors[key]) !== (hexOf(look.colors[key]) ?? look.colors[key]))
}

// ─── The phone preview ────────────────────────────────────────────────────

export interface PreviewPaint {
  /** Every colour of the form as `#rrggbb`; one still being typed shows as saved. */
  c: Colors
  card: 'gradient' | 'solid' | 'glass'
  /** The ink on the card: the app's background on a filled card, its text on glass (as the full admin's preview). */
  cardInk: string
  cardInk2: string
  radius: number
  button: { fill: string | null; fillOpacity: number; stroke: string | null; ink: string }
}

/**
 * The colours and shapes the phone preview is drawn with, as the full admin's live preview draws them: the card in
 * the accent (a gradient to the second surface, solid, or a glass tint with a line), the button filled, soft or
 * outlined, every corner from the radius.
 */
export function previewPaint(form: LookForm, saved: Colors, options: LookOptions): PreviewPaint {
  const c: Colors = {}
  for (const key of options.colors) c[key] = hexOf(form.colors[key]) ?? hexOf(saved[key]) ?? '#000000'
  const card = form.card_style === 'solid' || form.card_style === 'glass' ? form.card_style : 'gradient'
  const glass = card === 'glass'
  const radius = Math.max(options.radius.min, Math.min(options.radius.max, Number.isFinite(form.radius) ? form.radius : 16))
  const button = form.button_style === 'outline'
    ? { fill: null, fillOpacity: 0, stroke: c.primary, ink: c.primary }
    : form.button_style === 'soft'
      ? { fill: c.primary, fillOpacity: 0.125, stroke: null, ink: c.primary }
      : { fill: c.primary, fillOpacity: 1, stroke: null, ink: c.background }
  return { c, card, cardInk: glass ? c.text : c.background, cardInk2: glass ? c.text_secondary : c.background, radius, button }
}

/** The tier the preview's card wears: the programme's highest active one, as a member to show off; null for none. */
export function previewTier<T extends { name: string; is_active: boolean }>(tiers: T[]): string | null {
  const active = tiers.filter(tier => tier.is_active)
  return active.length > 0 ? active[active.length - 1].name : null
}

/** An id for SVG references (`url(#…)`), from React's useId, which may hold characters a reference cannot. */
export const svgId = (id: string): string => `l${id.replace(/[^A-Za-z0-9_-]/g, '')}`
