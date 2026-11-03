/**
 * Country calling codes for the sign-up phone field (owner 2026-11-03: a country-code picker beside the number).
 * Names come from the browser (`Intl.DisplayNames`) in the page's language, so no list of country names is kept here.
 */
const RAW =
  'AD376 AE971 AF93 AG1 AL355 AM374 AO244 AR54 AT43 AU61 AZ994 BA387 BB1 BD880 BE32 BF226 BG359 BH973 BI257 BJ229 ' +
  'BN673 BO591 BR55 BS1 BT975 BW267 BY375 BZ501 CA1 CD243 CF236 CG242 CH41 CI225 CL56 CM237 CN86 CO57 CR506 CU53 ' +
  'CV238 CY357 CZ420 DE49 DJ253 DK45 DM1 DO1 DZ213 EC593 EE372 EG20 ER291 ES34 ET251 FI358 FJ679 FR33 GA241 GB44 ' +
  'GD1 GE995 GH233 GI350 GM220 GN224 GQ240 GR30 GT502 GW245 GY592 HK852 HN504 HR385 HT509 HU36 ID62 IE353 IL972 ' +
  'IN91 IQ964 IR98 IS354 IT39 JM1 JO962 JP81 KE254 KG996 KH855 KM269 KN1 KR82 KW965 KZ7 LA856 LB961 LC1 LI423 ' +
  'LK94 LR231 LS266 LT370 LU352 LV371 LY218 MA212 MC377 MD373 ME382 MG261 MK389 ML223 MM95 MN976 MO853 MR222 MT356 ' +
  'MU230 MV960 MW265 MX52 MY60 MZ258 NA264 NE227 NG234 NI505 NL31 NO47 NP977 NZ64 OM968 PA507 PE51 PG675 PH63 ' +
  'PK92 PL48 PR1 PS970 PT351 PY595 QA974 RO40 RS381 RU7 RW250 SA966 SC248 SD249 SE46 SG65 SI386 SK421 SL232 SM378 ' +
  'SN221 SO252 SR597 SS211 SV503 SY963 SZ268 TD235 TG228 TH66 TJ992 TL670 TM993 TN216 TR90 TT1 TW886 TZ255 UA380 ' +
  'UG256 US1 UY598 UZ998 VA39 VC1 VE58 VN84 YE967 ZA27 ZM260 ZW263'

export interface DialCode { country: string; dial: string }

export const DIAL_CODES: DialCode[] = RAW.split(' ').map(e => ({ country: e.slice(0, 2), dial: '+' + e.slice(2) }))

/** The regional-indicator flag for a two-letter country code (Windows shows the letters instead). */
export function flagOf(country: string): string {
  return String.fromCodePoint(...[...country.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
}

/** The country's name in `lang`, or the code itself where the browser has no names. */
export function countryName(country: string, lang: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(country) ?? country
  } catch {
    return country
  }
}

/** The visitor's country from the browser's languages (en-GB → GB), else the United Kingdom. */
export function guessCountry(languages: readonly string[] | undefined): string {
  for (const l of languages ?? []) {
    const region = l.split('-')[1]?.toUpperCase()
    if (region && DIAL_CODES.some(d => d.country === region)) return region
  }
  return 'GB'
}

/** The number as sent to the server: the country's code, then the number without a leading trunk 0. */
export function fullPhone(country: string, number: string): string {
  const dial = DIAL_CODES.find(d => d.country === country)?.dial ?? ''
  const n = number.trim()
  if (n === '' || n.startsWith('+')) return n
  return `${dial} ${n.replace(/^0+/, '')}`
}
