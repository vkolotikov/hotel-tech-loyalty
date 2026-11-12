import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Droplets, MapPin, Sunrise, Sunset, Wind } from 'lucide-react'
import { WeatherIcon } from '../../components/WeatherIcon'
import { useNow } from '../../hooks/useNow'
import { dayPhase, degrees, greetingFor, sunProgress, venueParts, wallMinutes, weatherKind, weatherWords, type Pulse } from '../../lib/venuePulse'
import './pulse.css'

/** `YYYY-MM-DDTHH:mm` (the venue's wall clock) as a time of day, read as written — never through the browser's zone. */
function wallTime(wall: string | null | undefined, lang: string, opts: Intl.DateTimeFormatOptions): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall ?? '')
  if (!m) return ''
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])))
  return new Intl.DateTimeFormat(lang, { ...opts, timeZone: 'UTC' }).format(at)
}

/**
 * Every workspace's "now" (2026-11-09, owner: "maybe weather info, time … for all portals"): good morning by the
 * venue's own clock, its date and a ticking clock, the place's weather now, the next hours and the sun, under a sky
 * that follows the venue's part of the day. `pulse` is the workspace's own `…/pulse` answer (VenuePulse); before it
 * arrives, or without a place, the clock stands alone. `children` are the workspace's own figures for today, shown
 * along the bottom. The `strip` variant is one line, for a page whose work starts at the top (Content's plan).
 */
export function PulseCard({ pulse, name, variant = 'hero', greet = true, children }: {
  pulse: Pulse | undefined
  name?: string | null
  variant?: 'hero' | 'strip'
  /** false where the page's own title already greets and dates the day (CRM's Today, My day): the card leads with the clock. */
  greet?: boolean
  children?: ReactNode
}) {
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
  const hello = {
    morning: t('workspace.pulse.morning', 'Good morning'),
    afternoon: t('workspace.pulse.afternoon', 'Good afternoon'),
    evening: t('workspace.pulse.evening', 'Good evening'),
    night: t('workspace.pulse.night', 'Good night'),
  }[greetingFor(clock.hour)]
  const fmt = (opts: Intl.DateTimeFormatOptions) => {
    try { return new Intl.DateTimeFormat(lang, { timeZone: zone ?? undefined, ...opts }).format(now) } catch { return new Intl.DateTimeFormat(lang, opts).format(now) }
  }
  const time = fmt({ hour: '2-digit', minute: '2-digit' })
  const date = fmt({ weekday: 'long', day: 'numeric', month: 'long' })
  const kind = weatherKind(weather?.current.code)
  const words = weatherWords(weather?.current.code)
  const night = weather ? !weather.current.is_day : phase === 'night'
  const unit = weather?.units.temp === 'F' ? 'F' : 'C'
  const zoneCity = zone && zone.includes('/') ? zone.split('/').pop()!.replace(/_/g, ' ') : zone
  const placeLine = pulse?.place
    ? t('workspace.pulse.place_time', '{{place}} · venue time', { place: pulse.place.name })
    : zoneCity ? t('workspace.pulse.zone_time', 'Venue time ({{zone}})', { zone: zoneCity }) : null
  const greeting = name ? t('workspace.pulse.hello_name', '{{greeting}}, {{name}}', { greeting: hello, name }) : hello

  if (variant === 'strip') {
    return (
      <section className="ws-sky ws-sky-strip relative flex flex-wrap items-center gap-x-5 gap-y-2 overflow-hidden rounded-2xl px-4 py-3" data-phase={phase} aria-label={t('workspace.pulse.label', 'Now at the venue')}>
        <span className="ws-sky-glow" aria-hidden="true" />
        <span className="relative text-2xl font-bold tabular-nums leading-none">{time}</span>
        <span className="relative min-w-0">
          <span className="block truncate text-sm font-semibold">{greet ? greeting : date}</span>
          <span className="ws-sky-soft block truncate text-xs">{greet ? date : ''}{greet && placeLine ? ' · ' : ''}{placeLine ?? ''}</span>
        </span>
        {weather && (
          <span className="relative ml-auto flex items-center gap-2">
            <WeatherIcon kind={kind} night={night} size={36} />
            <span className="text-xl font-bold tabular-nums">{degrees(weather.current.temp)}<span className="ws-sky-soft text-xs font-semibold">{unit}</span></span>
            <span className="ws-sky-soft hidden text-xs sm:inline">{t(`workspace.pulse.weather.${words.key}`, words.en)}{weather.today ? ` · ${t('workspace.pulse.high_low', 'H {{max}} L {{min}}', { max: degrees(weather.today.max), min: degrees(weather.today.min) })}` : ''}</span>
          </span>
        )}
      </section>
    )
  }

  return (
    <section className="ws-sky relative overflow-hidden rounded-3xl" data-phase={phase} aria-label={t('workspace.pulse.label', 'Now at the venue')}>
      <span className="ws-sky-glow" aria-hidden="true" />
      {phase === 'night' && <span className="ws-stars" aria-hidden="true" />}
      <div className="relative grid gap-4 p-5 sm:grid-cols-[1.3fr_1fr]">
        <div className="min-w-0">
          {greet && (
            <>
              <p className="ws-sky-soft text-xs font-semibold uppercase tracking-[0.12em]">{date}</p>
              <h2 className="mt-1 text-xl font-bold leading-tight sm:text-2xl">{greeting}</h2>
            </>
          )}
          <p className={`${greet ? 'mt-3' : ''} text-4xl font-bold leading-none tabular-nums sm:text-5xl`}>
            {time}<span className="ws-sky-soft ml-1.5 text-base font-semibold" aria-hidden="true">{String(clock.second).padStart(2, '0')}</span>
          </p>
          {placeLine && <p className="ws-sky-soft mt-2 flex items-center gap-1.5 text-xs"><MapPin size={12} aria-hidden="true" />{placeLine}</p>}
        </div>
        {weather && (
          <div className="flex min-w-0 items-center gap-3 sm:justify-end">
            <WeatherIcon kind={kind} night={night} size={64} />
            <div className="min-w-0">
              <p className="text-4xl font-bold leading-none tabular-nums">{degrees(weather.current.temp)}<span className="ws-sky-soft ml-0.5 text-base font-semibold">{unit}</span></p>
              <p className="mt-1 text-sm font-semibold">{t(`workspace.pulse.weather.${words.key}`, words.en)}</p>
              <p className="ws-sky-soft mt-0.5 text-xs">
                {t('workspace.pulse.feels_like', 'Feels like {{temp}}', { temp: degrees(weather.current.feels_like) })}
                {weather.today && ` · ${t('workspace.pulse.high_low', 'H {{max}} L {{min}}', { max: degrees(weather.today.max), min: degrees(weather.today.min) })}`}
              </p>
              <p className="ws-sky-soft mt-1 flex flex-wrap gap-x-3 text-xs">
                {weather.current.wind !== null && <span className="inline-flex items-center gap-1"><Wind size={12} aria-hidden="true" />{Math.round(weather.current.wind)} {weather.units.wind}</span>}
                {weather.current.humidity !== null && <span className="inline-flex items-center gap-1"><Droplets size={12} aria-hidden="true" />{weather.current.humidity}%</span>}
              </p>
            </div>
          </div>
        )}
      </div>
      {(weather || children) && (
        <div className="ws-sky-foot relative flex flex-wrap items-center gap-3 px-5 py-3">
          {children && <div className="flex min-w-0 flex-1 flex-wrap gap-2">{children}</div>}
          {weather && weather.hours.length > 0 && (
            <ol className="flex gap-1.5 overflow-x-auto" aria-label={t('workspace.pulse.next_hours', 'The next hours')}>
              {weather.hours.slice(0, 6).map((h, i) => (
                <li key={h.time} className="ws-hour flex min-w-[52px] flex-col items-center rounded-xl px-1.5 py-1 text-center" style={{ animationDelay: `${150 + i * 60}ms` }}>
                  <span className="ws-sky-soft whitespace-nowrap text-xs font-semibold tabular-nums">{i === 0 ? t('workspace.pulse.now', 'Now') : wallTime(h.time, lang, { hour: 'numeric' })}</span>
                  <WeatherIcon kind={weatherKind(h.code)} night={!h.is_day} size={22} />
                  <span className="text-xs font-bold tabular-nums">{degrees(h.temp)}</span>
                </li>
              ))}
            </ol>
          )}
          {weather && rise !== null && set !== null && (
            <span className="ws-sky-soft flex items-center gap-2 text-xs tabular-nums" aria-label={t('workspace.pulse.sun', 'Sunrise {{rise}}, sunset {{set}}', { rise: wallTime(weather.today?.sunrise, lang, { hour: '2-digit', minute: '2-digit' }), set: wallTime(weather.today?.sunset, lang, { hour: '2-digit', minute: '2-digit' }) })}>
              <Sunrise size={14} aria-hidden="true" />{wallTime(weather.today?.sunrise, lang, { hour: '2-digit', minute: '2-digit' })}
              <span className="ws-sun-track relative h-1 w-16 overflow-hidden rounded-full" aria-hidden="true">
                <span className="ws-sun-done absolute inset-y-0 left-0 rounded-full" style={{ width: `${(progress ?? (clock.minutes > (set ?? 0) ? 1 : 0)) * 100}%` }} />
              </span>
              <Sunset size={14} aria-hidden="true" />{wallTime(weather.today?.sunset, lang, { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}
    </section>
  )
}

/** A figure of the workspace's own for the card's foot: a number and what it counts, on the sky. */
export function PulseFact({ value, label }: { value: ReactNode; label: string }) {
  return (
    <span className="ws-fact inline-flex items-baseline gap-1.5 rounded-xl px-3 py-1.5">
      <span className="text-base font-bold tabular-nums">{value}</span>
      <span className="ws-sky-soft max-w-[18rem] truncate text-xs">{label}</span>
    </span>
  )
}
