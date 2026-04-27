import type { ReactNode } from 'react'

type Tone = 'emerald' | 'blue' | 'amber' | 'orange' | 'red' | 'gray' | 'purple'

interface Tile {
  key: string
  label: string
  value: number | string
  sub?: string
  icon: ReactNode
  tone?: Tone
  active?: boolean
  onClick?: () => void
}

const TONES: Record<Tone, { bg: string; text: string; ring: string }> = {
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', ring: 'ring-emerald-500/40' },
  blue:    { bg: 'bg-blue-500/10',    text: 'text-blue-300',    ring: 'ring-blue-500/40' },
  amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-300',   ring: 'ring-amber-500/40' },
  orange:  { bg: 'bg-orange-500/10',  text: 'text-orange-300',  ring: 'ring-orange-500/40' },
  red:     { bg: 'bg-red-500/10',     text: 'text-red-300',     ring: 'ring-red-500/40' },
  gray:    { bg: 'bg-gray-500/10',    text: 'text-gray-300',    ring: 'ring-gray-500/40' },
  purple:  { bg: 'bg-purple-500/10',  text: 'text-purple-300',  ring: 'ring-purple-500/40' },
}

/**
 * Front-of-house "what's happening *now*" strip. Distinct from the period
 * KPI grid (week/month/year totals) — this is a glance at the next few
 * hours so reception/spa staff don't have to dig into the full table.
 *
 * Tiles are clickable when an `onClick` is provided — the host page wires
 * this up to a list filter so a click drills straight into the matching
 * rows (e.g. clicking "Arrivals Today" filters the list to today's check-ins).
 */
export function DailyOpsBar({ title, tiles, hint }: { title?: string; tiles: Tile[]; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] p-4"
      style={{ background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))' }}>
      {(title || hint) && (
        <div className="flex items-baseline justify-between mb-3">
          {title && <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">{title}</h3>}
          {hint && <span className="text-[10px] text-gray-600">{hint}</span>}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map(t => {
          const tone = TONES[t.tone ?? 'gray']
          const interactive = !!t.onClick
          const Tag = interactive ? 'button' : 'div'
          return (
            <Tag key={t.key}
              {...(interactive ? { type: 'button' as const, onClick: t.onClick } : {})}
              className={`group flex flex-col gap-1 px-4 py-3 rounded-xl text-left border transition-all ${
                t.active
                  ? `border-transparent ring-2 ${tone.ring} bg-white/[0.03]`
                  : 'border-white/[0.05] bg-white/[0.015] ' + (interactive ? 'hover:border-white/15 hover:bg-white/[0.04]' : '')
              }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 truncate">{t.label}</span>
                <div className={`p-1.5 rounded-lg ${tone.bg} ${tone.text}`}>{t.icon}</div>
              </div>
              <div className={`text-2xl font-bold tabular-nums ${tone.text}`}>{t.value}</div>
              {t.sub && <div className="text-[10px] text-gray-500 truncate">{t.sub}</div>}
            </Tag>
          )
        })}
      </div>
    </div>
  )
}
