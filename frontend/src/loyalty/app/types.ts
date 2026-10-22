import type { PictureLimits } from '../rewards/types'

/**
 * What Card & app's calls answer and take (release 2 §7; WalletController, AppLookController). Nothing here ever holds
 * a secret, a file or a path: the server answers only whether each is set. A picture's limits are the ones Rewards
 * reads (rewards/types.ts), served the same way.
 */

/** Why a pass is not ready yet, as WalletSettings::missing names it. */
export type MissingCode = string

export interface Wallet {
  apple_pass_type_id: string | null
  apple_team_id: string | null
  apple_organization_name: string | null
  /** As stored: `rgb(r,g,b)` when saved here; the full admin accepts any text. */
  apple_pass_background_color: string | null
  apple_pass_foreground_color: string | null
  apple_pass_label_color: string | null
  apple_cert_uploaded: boolean
  apple_cert_password_set: boolean
  apple_wwdr_uploaded: boolean
  apple_ready: boolean
  google_issuer_id: string | null
  google_class_suffix: string | null
  google_service_account_uploaded: boolean
  google_ready: boolean
  is_active: boolean
  apple_missing: MissingCode[]
  google_missing: MissingCode[]
}

/** A change to the wallet's fields; the password travels only with the certificate it opens. */
export interface WalletBody {
  apple_pass_type_id: string | null
  apple_team_id: string | null
  apple_organization_name: string | null
  apple_pass_background_color: string
  apple_pass_foreground_color: string
  apple_pass_label_color: string
  google_issuer_id: string | null
  google_class_suffix: string | null
  is_active: boolean
}

/** The three files, by the endpoint each goes to. */
export type WalletFile = 'apple_cert' | 'apple_wwdr' | 'google_service_account'

/** The member app's colours, by the key the server names (`mobile_{key}_color`). */
export type Colors = Record<string, string>

export interface Look {
  colors: Colors
  card_style: string
  radius: number
  button_style: string
  accent_intensity: string
  /** The preset applied last, by key; null for none. */
  preset: string | null
  logo_url: string | null
}

export interface Preset {
  key: string
  /** The name the full admin stores and shows; the workspace shows its own word for the key. */
  name: string
  colors: Colors
}

/** The lists the look's form chooses from, served by the server (AppLook). */
export interface LookOptions {
  colors: string[]
  card_styles: string[]
  button_styles: string[]
  accent_intensities: string[]
  radius: { min: number; max: number }
  presets: Preset[]
  logo: PictureLimits
}

export interface LookAnswer {
  look: Look
  options: LookOptions
}

/** `GET currency` (release 4, R4-5; CurrencyController): the venue's currency and the ISO 4217 codes to choose from. */
export interface CurrencyAnswer {
  currency: string
  options: string[]
}

/** `PUT currency` with `dry_run`: what setting `to` would mean now; every figure is the server's. */
export interface CurrencyPreview {
  dry_run: true
  from: string
  to: string
  /** The services and extras whose prices get the new label (never converted). */
  relabel: { services: number; extras: number }
  /** Online payments are set up in another currency (`currency`): bookings would be paid at the venue. */
  payments: { mismatch: boolean; currency: string | null }
  /** Appointments already booked in another currency; they keep theirs. */
  bookings: { total: number; upcoming: number }
  /** Stays are priced in their own currency, which this field does not change; null when that is not the case. */
  stays: { currency: string } | null
}

export interface LookBody {
  colors: Colors
  card_style: string
  radius: number
  button_style: string
  accent_intensity: string
  /** Sent only when a preset was applied in this edit; the stored one stays otherwise. */
  preset?: string
}
