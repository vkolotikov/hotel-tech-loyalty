/**
 * The venue's "now" for every dashboard (2026-11-09): its wall clock and part of the day, and what a weather code
 * means. Pure, shared by the full admin's dashboard and the workspaces' PulseCard; the figures are the server's
 * (`…/pulse`, App\Services\Dashboard\VenuePulse).
 */

/** What every interface's `…/pulse` answers. Times of the sun and the hours are the venue's wall clock. */
export interface Pulse {
  timezone: string
  /** Whose zone the clock is in: the venue's, or for a venue on UTC its location's or the place found's. */
  timezone_source?: 'venue' | 'location' | 'place'
  /** Why there is no weather when there is none (VenuePulse). */
  weather_status?: 'ok' | 'no_place' | 'place_not_found' | 'unavailable' | 'off'
  now: string
  today: string
  currency?: string
  place: { name: string; country: string | null; source: 'location' | 'timezone' } | null
  weather: {
    current: { temp: number | null; feels_like: number | null; code: number | null; is_day: boolean; wind: number | null; humidity: number | null }
    today: { date: string; max: number | null; min: number | null; code: number | null; rain_chance: number | null; sunrise: string | null; sunset: string | null } | null
    hours: { time: string; temp: number | null; code: number | null; rain_chance: number | null; is_day: boolean }[]
    days: { date: string; max: number | null; min: number | null; code: number | null; rain_chance: number | null }[]
    units: { temp: 'C' | 'F'; wind: string }
    source: string
  } | null
}

// ── The venue's clock ───────────────────────────────────────────────────────────────────────────────────────────────

export interface VenueParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** `YYYY-MM-DD`, the venue's date. */
  date: string
  /** Minutes since the venue's midnight. */
  minutes: number
}

/** The wall clock at the venue for an instant, read through Intl in the venue's zone (never the browser's). */
export function venueParts(now: Date, zone: string | null | undefined): VenueParts {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone || undefined, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(now)
  } catch {
    parts = new Intl.DateTimeFormat('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(now)
  }
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0)
  const year = get('year'), month = get('month'), day = get('day')
  const hour = get('hour') % 24, minute = get('minute'), second = get('second')
  const pad = (n: number) => String(n).padStart(2, '0')
  return { year, month, day, hour, minute, second, date: `${year}-${pad(month)}-${pad(day)}`, minutes: hour * 60 + minute }
}

export type Greeting = 'morning' | 'afternoon' | 'evening' | 'night'

export function greetingFor(hour: number): Greeting {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 23) return 'evening'
  return 'night'
}

/** Minutes since midnight of a `YYYY-MM-DDTHH:mm` wall time (Open-Meteo's sunrise and sunset), or null. */
export function wallMinutes(wall: string | null | undefined): number | null {
  const m = /T(\d{2}):(\d{2})/.exec(wall ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night'

/**
 * The part of the venue's day the hero's sky shows: dawn and dusk are the 45 minutes either side of sunrise and
 * sunset; without the sun's times, 6–8 and 17–19.
 */
export function dayPhase(minutes: number, sunrise: number | null, sunset: number | null): DayPhase {
  const rise = sunrise ?? 7 * 60
  const set = sunset ?? 18 * 60
  if (Math.abs(minutes - rise) <= 45) return 'dawn'
  if (Math.abs(minutes - set) <= 45) return 'dusk'
  if (minutes > rise && minutes < set) return 'day'
  return 'night'
}

/** How far the sun is across the sky, 0 at sunrise to 1 at sunset; null when it is down or the times are unknown. */
export function sunProgress(minutes: number, sunrise: number | null, sunset: number | null): number | null {
  if (sunrise === null || sunset === null || sunset <= sunrise) return null
  if (minutes < sunrise || minutes > sunset) return null
  return (minutes - sunrise) / (sunset - sunrise)
}

// ── Weather codes (WMO, as Open-Meteo answers them) ────────────────────────────────────────────────────────────────

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

/** The picture a code draws. Unknown codes draw a cloud. */
export function weatherKind(code: number | null | undefined): WeatherKind {
  if (code === 0 || code === 1) return 'clear'
  if (code === 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code !== null && code !== undefined && code >= 51 && code <= 57) return 'drizzle'
  if (code !== null && code !== undefined && ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))) return 'rain'
  if (code !== null && code !== undefined && ((code >= 71 && code <= 77) || code === 85 || code === 86)) return 'snow'
  if (code === 95 || code === 96 || code === 99) return 'storm'
  return 'cloudy'
}

/** The words for a code: an i18n key under `dashboard.weather.` and its English. */
export function weatherWords(code: number | null | undefined): { key: string; en: string } {
  const table: [number[], string, string][] = [
    [[0], 'clear', 'Clear sky'],
    [[1], 'mainly_clear', 'Mainly clear'],
    [[2], 'partly_cloudy', 'Partly cloudy'],
    [[3], 'overcast', 'Overcast'],
    [[45, 48], 'fog', 'Fog'],
    [[51, 53, 55], 'drizzle', 'Drizzle'],
    [[56, 57], 'freezing_drizzle', 'Freezing drizzle'],
    [[61, 63, 65], 'rain', 'Rain'],
    [[66, 67], 'freezing_rain', 'Freezing rain'],
    [[71, 73, 75, 77], 'snow', 'Snow'],
    [[80, 81, 82], 'showers', 'Rain showers'],
    [[85, 86], 'snow_showers', 'Snow showers'],
    [[95], 'thunderstorm', 'Thunderstorm'],
    [[96, 99], 'thunder_hail', 'Thunderstorm with hail'],
  ]
  const row = table.find(([codes]) => code !== null && code !== undefined && codes.includes(code))
  return row ? { key: row[1], en: row[2] } : { key: 'unknown', en: 'Weather' }
}

/** A temperature as the venue reads it: rounded, with its unit (`6°`, the unit is said once beside the big figure). */
export function degrees(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${Math.round(value)}°`
}
