/**
 * Card & app's words whose keys the code builds at run time (`loyalty.app.<family>.<value>`), with their English
 * fallbacks; app/appLocales.test.ts checks every family in all five app.<lang>.json bundles. The server sends the
 * values (its option lists, what a pass lacks); the workspace names them. A value without a word here is shown as sent.
 */

/** The page's tabs (appMath.ts `APP_TABS`). */
export const TAB_WORDS: Record<string, string> = {
  wallet: 'Wallet pass',
  app: 'Member app',
}

/** What stops a pass (WalletSettings::missing). */
export const MISSING_WORDS: Record<string, string> = {
  switched_off: 'Wallet passes are switched off.',
  pass_type_id: 'The Pass Type ID.',
  team_id: 'The Team ID.',
  certificate: 'The Pass Type ID certificate (.p12).',
  certificate_gone: 'The certificate file is no longer on the server. Upload it again.',
  certificate_password: 'The certificate does not open with the saved password. Upload it again with its password.',
  wwdr: 'Apple’s WWDR certificate.',
  wwdr_gone: 'The WWDR certificate file is no longer on the server. Upload it again.',
  issuer_id: 'The issuer ID.',
  class_suffix: 'The class suffix.',
  service_account: 'The service account key (.json).',
  service_account_gone: 'The service account key is no longer on the server. Upload it again.',
}

/** The three files (appMath.ts `WALLET_FILES`). */
export const FILE_WORDS: Record<string, string> = {
  apple_cert: 'Pass Type ID certificate',
  apple_wwdr: 'Apple WWDR certificate',
  google_service_account: 'Google service account key',
}

/** What each file is and where it comes from. */
export const FILE_LINE_WORDS: Record<string, string> = {
  apple_cert: 'The .p12 file exported from your Apple Developer account, with its password.',
  apple_wwdr: 'Apple’s intermediate certificate, as Apple publishes it (.cer) or as .pem.',
  google_service_account: 'The JSON key of the service account your Google Wallet issuer uses.',
}

/** The pass's three colours (appMath.ts `WALLET_COLOURS`). */
export const WALLET_COLOUR_WORDS: Record<string, string> = {
  apple_pass_background_color: 'Background',
  apple_pass_foreground_color: 'Text',
  apple_pass_label_color: 'Labels',
}

/** The member app's colours, by the server's keys (AppLook::COLORS). */
export const COLOUR_WORDS: Record<string, string> = {
  primary: 'Accent',
  background: 'Background',
  surface: 'Surface',
  secondary: 'Second surface',
  text: 'Text',
  text_secondary: 'Quiet text',
  border: 'Lines',
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Information',
}

/** The member card's styles (AppLook::CARD_STYLES). */
export const CARD_STYLE_WORDS: Record<string, string> = {
  gradient: 'Gradient',
  solid: 'Solid',
  glass: 'Glass',
}

/** The buttons' styles (AppLook::BUTTON_STYLES). */
export const BUTTON_STYLE_WORDS: Record<string, string> = {
  filled: 'Filled',
  outline: 'Outline',
  soft: 'Soft',
}

/** How strongly the accent shows (AppLook::ACCENT_INTENSITIES). */
export const ACCENT_WORDS: Record<string, string> = {
  subtle: 'Subtle',
  vibrant: 'Vibrant',
  bold: 'Bold',
}

/** The presets' names, by key (AppLook::PRESETS). */
export const PRESET_WORDS: Record<string, string> = {
  gold_classic: 'Gold Classic',
  royal_sapphire: 'Royal Sapphire',
  emerald_spa: 'Emerald Spa',
  rose_boutique: 'Rose Boutique',
  ocean_resort: 'Ocean Resort',
  champagne_lux: 'Champagne Lux',
  midnight_violet: 'Midnight Violet',
  tropical_sunset: 'Tropical Sunset',
  alpine_lodge: 'Alpine Lodge',
  urban_loft: 'Urban Loft',
  desert_oasis: 'Desert Oasis',
  nordic_ice: 'Nordic Ice',
}

/** A line under each preset's name. */
export const PRESET_LINE_WORDS: Record<string, string> = {
  gold_classic: 'Warm gold on near black.',
  royal_sapphire: 'Deep navy with clear blue.',
  emerald_spa: 'Calm green for wellness.',
  rose_boutique: 'Warm rose for boutique venues.',
  ocean_resort: 'Cyan and violet by the sea.',
  champagne_lux: 'Champagne on warm dark.',
  midnight_violet: 'Deep purple.',
  tropical_sunset: 'Coral and amber.',
  alpine_lodge: 'Earthy mountain tones.',
  urban_loft: 'Sleek monochrome.',
  desert_oasis: 'Terracotta and sand.',
  nordic_ice: 'Cool and minimal.',
}

/** What stops the wallet form (appMath.ts `walletProblems`). */
export const WALLET_PROBLEM_WORDS: Record<string, string> = {
  pass_type_id: 'A Pass Type ID starts with “pass.”, e.g. pass.com.yourvenue.loyalty.',
  team_id: 'A Team ID is 10 capital letters or digits, e.g. ABCDE12345.',
  organization_name: 'Keep the name to 191 characters.',
  colour: 'Choose a colour, or type one as #rrggbb.',
  issuer_id: 'An issuer ID is digits only.',
  class_suffix: 'Use letters, digits, dots, hyphens or underscores, without spaces.',
}

/** What stops the look's form (appMath.ts `lookProblems`). */
export const LOOK_PROBLEM_WORDS: Record<string, string> = {
  colour: 'Choose a colour, or type one as #rrggbb.',
  card_style: 'Choose a card style.',
  radius: 'Choose a corner radius from 0 to 32.',
  button_style: 'Choose a button style.',
  accent_intensity: 'Choose how strong the accent is.',
  preset: 'Choose a preset again.',
}

/** The families above by the key prefix they are read under. */
export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  tab: TAB_WORDS,
  missing: MISSING_WORDS,
  file: FILE_WORDS,
  file_line: FILE_LINE_WORDS,
  wallet_colour: WALLET_COLOUR_WORDS,
  colour: COLOUR_WORDS,
  card_style: CARD_STYLE_WORDS,
  button_style: BUTTON_STYLE_WORDS,
  accent: ACCENT_WORDS,
  preset: PRESET_WORDS,
  preset_line: PRESET_LINE_WORDS,
  'wallet.problem': WALLET_PROBLEM_WORDS,
  'look.problem': LOOK_PROBLEM_WORDS,
}
