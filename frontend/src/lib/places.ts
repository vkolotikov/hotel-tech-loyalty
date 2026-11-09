/**
 * The Locations form's place picking (2026-11-09, owner: "maybe need country and city dropdown selection"): a city is
 * picked from the server's search (`GET admin/properties/places`, Open-Meteo's places), which fills the city, the
 * country and — where the location has none yet — its time zone, so the dashboards' weather and clock can find it.
 * Pure, so it is tested without rendering.
 */

/** One city the search answers. */
export interface Place {
  name: string
  region: string | null
  country: string | null
  country_code: string | null
  latitude: number
  longitude: number
  timezone: string | null
}

/** ISO 3166-1 alpha-2: every country a location may be in. */
export const COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG',
  'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK',
  'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER',
  'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR',
  'GT', 'GU', 'GW', 'GY', 'HK', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY',
  'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM',
  'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SK', 'SL',
  'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR',
  'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'XK', 'YE', 'YT',
  'ZA', 'ZM', 'ZW',
] as const

/** A country's English name (what a location stores, as it always has; the server reads names in many languages). */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * The country dropdown: every country by its English name, A to Z. A stored value the list does not hold (a code, a
 * name in another language) stays first, so opening the form never changes what is saved.
 */
export function countryOptions(current: string): { value: string; label: string }[] {
  const all = COUNTRY_CODES.map(code => countryName(code))
    .filter((name, i, list) => list.indexOf(name) === i)
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map(name => ({ value: name, label: name }))
  const kept = current.trim()
  return kept && !all.some(o => o.value === kept) ? [{ value: kept, label: kept }, ...all] : all
}

/** "Riga — Rīga, Latvia": the city, then its region (when it says more than the city) and country. */
export function placeLabel(place: Place): string {
  const rest = [place.region && place.region !== place.name ? place.region : null, place.country].filter(Boolean).join(', ')
  return rest ? `${place.name} — ${rest}` : place.name
}

/** Whether a stored time zone says nothing about where the location is (empty, or a name of UTC). */
export function zoneIsUnset(zone: string): boolean {
  return /^(?:|utc|gmt|z|etc\/utc|etc\/gmt|universal)$/i.test(zone.trim())
}

/**
 * The form after a city is picked: its name and country (English, from its code), and its time zone where the
 * location has none yet — a zone someone chose is never overwritten.
 */
export function applyPlace<F extends { city: string; country: string; timezone: string }>(form: F, place: Place): F {
  return {
    ...form,
    city: place.name,
    country: place.country_code ? countryName(place.country_code) : (place.country ?? form.country),
    timezone: place.timezone && zoneIsUnset(form.timezone) ? place.timezone : form.timezone,
  }
}

/** The time zones this browser knows, for the time zone field's suggestions. */
export function timeZoneNames(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
    return supported ? supported('timeZone') : []
  } catch {
    return []
  }
}
