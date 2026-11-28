import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Droplets, MapPin, Sunrise, Sunset, Wind } from 'lucide-react'
import { formatWallTime } from '../../lib/venueTime'
import type { Pulse } from '../../lib/venuePulse'
import { dayPhase, degrees, greetingFor, sunProgress, venueParts, wallMinutes, weatherKind, weatherWords } from './dashboardMath'
import { useNow } from '../../hooks/useNow'
import { WeatherIcon } from '../../components/WeatherIcon'

export type { Pulse } from '../../lib/venuePulse'

/**
 * The dashboard's first card (2026-11-09): good morning by the venue's own clock, its date and a clock that ticks, the
 * place and its weather now, the next hours and the sun's way across today's sky. The sky behind follows the venue's
 * part of the day (dawn, day, dusk, night). Without a place (a venue on UTC with no location's city) the clock stands
 * alone and a manager is shown where to add the city.
 */
export function NowHero({ pulse, name, canSetPlace, index = 0 }: { pulse: Pulse | undefined; name: string | null; canSetPlace: boolean; index?: number }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language || 'en'
  const now = useNow(1000)
  const zone = pulse?.timezone ?? null
  const clock = venueParts(now, zone)
  const weather = pulse?.weather ?? null
  const rise = wallMinutes(weather?.today?.sunrise)
  const set = wallMinutes(weather?.today?.sunset)
  const phase = dayPhase(clock.minutes, rise, set)
  const progress = sunProgress(clock.minutes, rise, set)
  const greeting = greetingFor(clock.hour)
  const hello = {
    morning: t('dashboard.hero.morning', 'Good morning'),
    afternoon: t('dashboard.hero.afternoon', 'Good afternoon'),
    evening: t('dashboard.hero.evening', 'Good evening'),
    night: t('dashboard.hero.night', 'Good night'),
  }[greeting]
  const fmt = (opts: Intl.DateTimeFormatOptions) => {
    try { return new Intl.DateTimeFormat(lang, { timeZone: zone ?? undefined, ...opts }).format(now) } catch { return new Intl.DateTimeFormat(lang, opts).format(now) }
  }
  const time = fmt({ hour: '2-digit', minute: '2-digit' })
  const seconds = String(clock.second).padStart(2, '0')
  const date = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const kind = weatherKind(weather?.current.code)
  const words = weatherWords(weather?.current.code)
  const night = weather ? !weather.current.is_day : phase === 'night'
  const unit = weather?.units.temp === 'F' ? '°F' : '°C'
  const zoneCity = zone && zone.includes('/') ? zone.split('/').pop()!.replace(/_/g, ' ') : zone
  const wall = (v: string | null | undefined) => formatWallTime(v, lang, { hour: '2-digit', minute: '2-digit' })

  return (
    <section className="dash-card dash-sky relative overflow-hidden rounded-3xl" data-phase={phase} style={{ '--i': index } as React.CSSProperties} aria-label={t('dashboard.hero.label', 'Now at the venue')}>
      <div className="dash-sky-glow dash-sky-glow-a" aria-hidden="true" />
      <div className="dash-sky-glow dash-sky-glow-b" aria-hidden="true" />
      {phase === 'night' && <div className="dash-stars" aria-hidden="true" />}

      <div className="relative grid gap-5 p-5 sm:p-6 md:grid-cols-[1.2fr_1fr]">
        {/* The venue's day and clock */}
        <div className="min-w-0">
          <p className="dash-sky-soft text-xs font-semibold uppercase tracking-[0.14em]">{date}</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-[28px]">
            {name ? t('dashboard.hero.hello_name', '{{greeting}}, {{name}}', { greeting: hello, name }) : hello}
          </h1>
          <div className="mt-4 flex items-end gap-2">
            <span className="dash-clock text-5xl font-bold leading-none tabular-nums tracking-tight sm:text-6xl" aria-live="off">{time}</span>
            <span className="dash-sky-soft mb-1 text-lg font-semibold tabular-nums" aria-hidden="true">{seconds}</span>
          </div>
          <p className="dash-sky-soft mt-2 flex items-center gap-1.5 text-xs">
            <MapPin size={12} aria-hidden="true" />
            {pulse?.place
              ? t('dashboard.hero.place_time', '{{place}} · venue time ({{zone}})', { place: pulse.place.name, zone: zoneCity ?? '' })
              : zoneCity ? t('dashboard.hero.zone_time', 'Venue time ({{zone}})', { zone: zoneCity }) : t('dashboard.hero.local_time', 'Local time')}
          </p>
        </div>

        {/* The weather now */}
        {weather ? (
          <div className="flex min-w-0 items-center gap-4 md:justify-end">
            <WeatherIcon kind={kind} night={night} size={76} />
            <div className="min-w-0">
              <p className="flex items-start text-5xl font-bold leading-none tabular-nums">
                {degrees(weather.current.temp)}<span className="dash-sky-soft ml-0.5 mt-1 text-lg font-semibold">{unit.slice(1)}</span>
              </p>
              <p className="mt-1 text-sm font-semibold">{t(`dashboard.weather.${words.key}`, words.en)}</p>
              <p className="dash-sky-soft mt-0.5 text-xs">
                {t('dashboard.hero.feels_like', 'Feels like {{temp}}', { temp: degrees(weather.current.feels_like) })}
                {weather.today && ` · ${t('dashboard.hero.high_low', 'H {{max}} L {{min}}', { max: degrees(weather.today.max), min: degrees(weather.today.min) })}`}
              </p>
              <p className="dash-sky-soft mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                {weather.current.wind !== null && <span className="inline-flex items-center gap-1"><Wind size={12} aria-hidden="true" />{Math.round(weather.current.wind)} {weather.units.wind}</span>}
                {weather.current.humidity !== null && <span className="inline-flex items-center gap-1"><Droplets size={12} aria-hidden="true" />{t('dashboard.hero.humidity', '{{value}}% humidity', { value: weather.current.humidity })}</span>}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center md:justify-end">
            <p className="dash-sky-soft max-w-xs text-sm">
              {!pulse || pulse.weather_status === 'off' ? ' '
                : !pulse.place || pulse.weather_status === 'no_place'
                  ? (canSetPlace
                    ? <>{t('dashboard.hero.no_place', 'Add your city to a location to see the weather here.')} <Link to="/properties" className="font-semibold underline underline-offset-2">{t('dashboard.hero.add_city', 'Add a city')}</Link></>
                    : t('dashboard.hero.no_place_staff', 'The weather shows here once a location has its city.'))
                  : pulse.weather_status === 'place_not_found'
                    ? (canSetPlace
                      ? <>{t('dashboard.hero.not_found', 'We could not find “{{city}}” on the map. Pick the city from the list in Locations.', { city: pulse.place.name })} <Link to="/properties" className="font-semibold underline underline-offset-2">{t('dashboard.hero.open_locations', 'Open Locations')}</Link></>
                      : t('dashboard.hero.not_found_staff', 'The weather shows here once the location’s city is found on the map.'))
                    : t('dashboard.hero.no_weather', 'The weather is not available right now.')}
            </p>
          </div>
        )}
      </div>

      {/* The next hours and the sun */}
      {weather && (weather.hours.length > 0 || (rise !== null && set !== null)) && (
        <div className="dash-sky-strip relative grid gap-4 border-t px-5 py-4 sm:px-6 lg:grid-cols-[1fr_auto]">
          <ol className="flex gap-2 overflow-x-auto pb-1" aria-label={t('dashboard.hero.next_hours', 'The next hours')}>
            {weather.hours.slice(0, 8).map((h, i) => (
              <li key={h.time} className="dash-hour flex min-w-[56px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-center" style={{ animationDelay: `${200 + i * 60}ms` }}>
                <span className="dash-sky-soft whitespace-nowrap text-[10px] font-semibold tabular-nums">{i === 0 ? t('dashboard.hero.now', 'Now') : formatWallTime(h.time, lang, { hour: 'numeric' })}</span>
                <WeatherIcon kind={weatherKind(h.code)} night={!h.is_day} size={24} />
                <span className="text-xs font-bold tabular-nums">{degrees(h.temp)}</span>
                {(h.rain_chance ?? 0) >= 20 && <span className="dash-sky-rain text-[9px] font-semibold tabular-nums">{h.rain_chance}%</span>}
              </li>
            ))}
          </ol>
          {rise !== null && set !== null && (
            <div className="flex items-center gap-3">
              <span className="dash-sky-soft flex flex-col items-center text-[10px]"><Sunrise size={14} aria-hidden="true" /><span className="tabular-nums">{wall(weather.today?.sunrise)}</span></span>
              <svg viewBox="0 0 120 52" className="h-[52px] w-[120px]" role="img" aria-label={t('dashboard.hero.sun', 'Sunrise {{rise}}, sunset {{set}}', { rise: wall(weather.today?.sunrise), set: wall(weather.today?.sunset) })}>
                <path d="M6 48 A54 44 0 0 1 114 48" className="dash-sun-path" />
                {progress !== null && (() => {
                  const a = Math.PI * (1 - progress)
                  const x = 60 + 54 * Math.cos(a), y = 48 - 44 * Math.sin(a)
                  return (
                    <>
                      <path d={`M6 48 A54 44 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`} className="dash-sun-done" />
                      <circle cx={x} cy={y} r={5} className="dash-sun-dot" />
                    </>
                  )
                })()}
                <line x1="0" y1="48" x2="120" y2="48" className="dash-sun-horizon" />
              </svg>
              <span className="dash-sky-soft flex flex-col items-center text-[10px]"><Sunset size={14} aria-hidden="true" /><span className="tabular-nums">{wall(weather.today?.sunset)}</span></span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
