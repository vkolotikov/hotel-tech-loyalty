import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import PlannerStats from './PlannerStats'

/**
 * Self-contained Planner analytics panel — the range/employee controls +
 * the current-and-previous `stats` fetches that PlannerStats needs, bundled
 * so the panel can be dropped anywhere (the /analytics "Planner" tab today;
 * the /planner Stats tab keeps its own inline copy of the same wiring).
 *
 * It reads the SAME `['planner-stats', from, to, employee]` query keys the
 * Planner page primes, so navigating between the two shares cache and any
 * planner mutation invalidates both. `enabled` keeps the queries idle until
 * the host actually shows the panel.
 *
 * NOTE: the caller is responsible for the feature gate — /planner routes are
 * behind `feature:time_management`, so only mount this when the org is
 * entitled, else the fetch 402s and pops the upgrade modal.
 */

const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const filterSel = 'bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500/50'

type RangeKind = 'today' | 'week' | '2weeks' | 'month' | 'last30' | 'year'

export default function PlannerStatsPanel({ enabled = true }: { enabled?: boolean }) {
  // fmtDate (LOCAL) not toISOString: `new Date(y,m,1)` is local midnight, and
  // .toISOString() would shift it to the previous month's last day for UTC+
  // zones (the whole EU customer base).
  const [statsFrom, setStatsFrom] = useState(() => fmtDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [statsTo, setStatsTo] = useState(() => fmtDate(new Date()))
  const [statsRange, setStatsRange] = useState<RangeKind | 'custom'>('month')
  const [statsEmployee, setStatsEmployee] = useState('')

  const applyStatsRange = (kind: RangeKind) => {
    const now = new Date()
    let from = new Date(), to = new Date()
    if (kind === 'today') { from = new Date(now); to = new Date(now) }
    else if (kind === 'week') {
      const dow = (now.getDay() + 6) % 7 // Monday = 0
      from = new Date(now); from.setDate(now.getDate() - dow)
      to = new Date(from); to.setDate(from.getDate() + 6)
    } else if (kind === '2weeks') {
      const dow = (now.getDay() + 6) % 7
      from = new Date(now); from.setDate(now.getDate() - dow - 7)
      to = new Date(from); to.setDate(from.getDate() + 13)
    } else if (kind === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    } else if (kind === 'last30') {
      from = new Date(now); from.setDate(now.getDate() - 29); to = now
    } else { // year
      from = new Date(now.getFullYear(), 0, 1); to = new Date(now.getFullYear(), 11, 31)
    }
    setStatsFrom(fmtDate(from)); setStatsTo(fmtDate(to)); setStatsRange(kind)
  }

  // Previous equal-length window immediately before [from, to].
  const statsPrevRange = useMemo(() => {
    const f = new Date(statsFrom + 'T00:00:00'), t = new Date(statsTo + 'T00:00:00')
    const days = Math.max(0, Math.round((t.getTime() - f.getTime()) / 86400000)) + 1
    const pt = new Date(f); pt.setDate(f.getDate() - 1)
    const pf = new Date(pt); pf.setDate(pt.getDate() - (days - 1))
    return { from: fmtDate(pf), to: fmtDate(pt) }
  }, [statsFrom, statsTo])

  const { data: stats } = useQuery({
    queryKey: ['planner-stats', statsFrom, statsTo, statsEmployee],
    queryFn: () => api.get('/v1/admin/planner/stats', { params: { from: statsFrom, to: statsTo, employee: statsEmployee || undefined } }).then(r => r.data),
    enabled,
  })
  const { data: statsPrev } = useQuery({
    queryKey: ['planner-stats', statsPrevRange.from, statsPrevRange.to, statsEmployee],
    queryFn: () => api.get('/v1/admin/planner/stats', { params: { from: statsPrevRange.from, to: statsPrevRange.to, employee: statsEmployee || undefined } }).then(r => r.data),
    enabled,
  })

  // Employee options come straight from the payloads — no extra fetch.
  const employees = useMemo(() => {
    const set = new Set<string>()
    for (const src of [stats, statsPrev]) {
      for (const e of ((src?.by_employee ?? []) as any[])) {
        const n = e.employee_name
        if (n && String(n).trim()) set.add(String(n))
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [stats, statsPrev])

  const presets: Array<[RangeKind, string]> = [
    ['today', 'Today'], ['week', 'This week'], ['2weeks', '2 weeks'],
    ['month', 'This month'], ['last30', 'Last 30 days'], ['year', 'This year'],
  ]

  return (
    <div className="space-y-5">
      {/* Range presets + custom from/to + employee focus (mirrors /planner). */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          {presets.map(([k, label]) => (
            <button key={k} type="button" onClick={() => applyStatsRange(k)}
              className={'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ' +
                (statsRange === k
                  ? 'bg-primary-500 text-black border-primary-500'
                  : 'bg-dark-surface text-gray-400 border-dark-border hover:text-white hover:border-white/15')}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 ml-auto">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Employee</label>
            <select value={statsEmployee} onChange={e => setStatsEmployee(e.target.value)} className={filterSel}>
              <option value="">All team</option>
              {employees.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div><label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">From</label><input type="date" value={statsFrom} onChange={e => { setStatsFrom(e.target.value); setStatsRange('custom') }} className={filterSel} /></div>
          <div><label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">To</label><input type="date" value={statsTo} onChange={e => { setStatsTo(e.target.value); setStatsRange('custom') }} className={filterSel} /></div>
        </div>
      </div>
      {statsEmployee && (
        <div className="flex items-center gap-2 text-xs text-primary-300 bg-primary-500/10 border border-primary-500/25 rounded-lg px-3 py-2">
          <span className="font-semibold">Viewing: {statsEmployee}</span>
          <span className="text-gray-500">— every chart below is filtered to this person.</span>
          <button onClick={() => setStatsEmployee('')} className="ml-auto text-gray-400 hover:text-white">Show all team ✕</button>
        </div>
      )}
      {stats
        ? <PlannerStats stats={stats} statsPrev={statsPrev} statsEmployee={statsEmployee} statsFrom={statsFrom} statsTo={statsTo} />
        : <div className="h-[300px] flex items-center justify-center text-gray-600 text-sm">Loading planner analytics…</div>}
    </div>
  )
}
