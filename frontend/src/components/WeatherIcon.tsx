import type { WeatherKind } from '../lib/venuePulse'
import './weatherIcon.css'

/**
 * The weather drawn, gently animated (weatherIcon.css): the sun's rays turn, clouds drift, rain and snow fall, a storm
 * flashes; at night the sun is a moon. Pure decoration: the words beside it say the same (aria-hidden). It sits on the
 * hero's own sky, whose ink it takes (currentColor), with warm and cool accents of its own.
 */
export function WeatherIcon({ kind, night = false, size = 64 }: { kind: WeatherKind; night?: boolean; size?: number }) {
  const showSun = kind === 'clear' || kind === 'partly'
  const showCloud = kind !== 'clear'
  const darkCloud = kind === 'rain' || kind === 'storm' || kind === 'drizzle'
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="hx-wx shrink-0 overflow-visible" aria-hidden="true">
      {showSun && !night && (
        <g className="hx-wx-sun" style={{ transformOrigin: kind === 'partly' ? '24px 24px' : '32px 32px' }}>
          <circle cx={kind === 'partly' ? 24 : 32} cy={kind === 'partly' ? 24 : 32} r={kind === 'partly' ? 9 : 12} className="hx-wx-sun-disc" />
          {Array.from({ length: 8 }, (_, i) => {
            const cx = kind === 'partly' ? 24 : 32, cy = cx, r1 = kind === 'partly' ? 13 : 17, r2 = kind === 'partly' ? 17 : 22
            const a = (i * Math.PI) / 4
            return <line key={i} x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1} x2={cx + Math.cos(a) * r2} y2={cy + Math.sin(a) * r2} className="hx-wx-ray" />
          })}
        </g>
      )}
      {showSun && night && (
        <path d={kind === 'partly' ? 'M27 13a11 11 0 1 0 9 17 9 9 0 0 1-9-17z' : 'M36 14a15 15 0 1 0 12 24 12 12 0 0 1-12-24z'} className="hx-wx-moon" />
      )}
      {showCloud && (
        <g className="hx-wx-cloud">
          <path d="M20 46h26a10 10 0 0 0 0-20 13 13 0 0 0-25-2 9 9 0 0 0-1 22z" className={darkCloud ? 'hx-wx-cloud-dark' : 'hx-wx-cloud-light'} />
        </g>
      )}
      {(kind === 'rain' || kind === 'drizzle' || kind === 'storm') && (
        <g className="hx-wx-rain">
          {[22, 30, 38, 46].map((x, i) => (
            <line key={x} x1={x} y1={50} x2={x - 3} y2={kind === 'drizzle' ? 54 : 58} className="hx-wx-drop" style={{ animationDelay: `${i * 180}ms` }} />
          ))}
        </g>
      )}
      {kind === 'snow' && (
        <g>
          {[22, 32, 42].map((x, i) => (
            <circle key={x} cx={x} cy={52} r={2.2} className="hx-wx-flake" style={{ animationDelay: `${i * 400}ms` }} />
          ))}
        </g>
      )}
      {kind === 'storm' && <path d="M33 44l-5 9h5l-3 8 8-11h-5l3-6z" className="hx-wx-bolt" />}
      {kind === 'fog' && (
        <g className="hx-wx-fog">
          {[50, 55, 60].map((y, i) => <line key={y} x1={14 + i * 3} y1={y} x2={50 - i * 2} y2={y} className="hx-wx-fogline" style={{ animationDelay: `${i * 300}ms` }} />)}
        </g>
      )}
    </svg>
  )
}
