import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area,
  CartesianGrid, Legend, PieChart, Pie, Cell, LabelList, ReferenceLine,
} from 'recharts'
import {
  Clock, Hash, GitCompare, PieChart as PieIcon, BarChart3, Download, X,
} from 'lucide-react'
import { api } from '../lib/api'
import { resolveGroupMeta, parsePlannerGroups, parsePlannerChannels } from '../lib/plannerMeta'

/**
 * Planner analytics — the /planner "Stats" tab, extracted from the page so
 * the interactive controls (measure toggle, chart-type switches, period
 * comparison, click-to-drill) can carry their own local state without
 * bloating Planner.tsx.
 *
 * Derived from the two payloads the page fetches: `stats` (current window)
 * and `statsPrev` (the equal window immediately before). The endpoint
 * returns, beyond the per-employee / per-type / per-task / per-day rollups:
 *   - completion  { on_time, late, untracked }   — on-time-vs-late split
 *   - by_dow_hour [{ dow, hour, total, worked_minutes }] — busy-times matrix
 *   - pool_aging  { total, d0, d1, d3, d7, oldest } — open-pool age snapshot
 *
 * Headline capabilities:
 *   - Measure toggle (Hours ⇄ Tasks) every breakdown respects.
 *   - "Hours per task" bars coloured by PARENT TYPE (identity + magnitude).
 *   - Click a type slice/bar to FOCUS the task + hierarchy views on it.
 *   - "Compare to previous period" overlays the trend, adds current-vs-prev
 *     type bars, per-task/-type deltas, a Δ table column, and gates the KPIs.
 *   - CSV export of the type→task breakdown for the active range.
 */

const TOOLTIP_STYLE = { backgroundColor: '#1a1a2e', border: '1px solid #2e2e50', borderRadius: 8, fontSize: 12 }
const num = (v: any) => Number(v) || 0
const r1 = (n: number) => Math.round(n * 10) / 10
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtD = (s: any) => { const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}` : String(s) }
const csvCell = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }

type Measure = 'hours' | 'count'

/** localStorage-backed state so control choices survive leaving the tab. */
function useLocal<T extends string | number | boolean>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key)
      if (s === null) return initial
      if (typeof initial === 'boolean') return (s === '1') as T
      if (typeof initial === 'number') { const n = Number(s); return (Number.isFinite(n) ? n : initial) as T }
      return s as T
    } catch { return initial }
  })
  useEffect(() => {
    try { localStorage.setItem(key, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)) } catch { /* private mode */ }
  }, [key, v])
  return [v, setV]
}

interface Props {
  stats: any
  statsPrev: any
  statsEmployee: string
  statsFrom: string
  statsTo: string
}

function Seg<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: Array<[T, string, any?]>
}) {
  return (
    <div className="inline-flex rounded-lg border border-dark-border bg-dark-surface p-0.5">
      {options.map(([v, label, Icon]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={'px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors ' +
            (value === v ? 'bg-primary-500 text-black' : 'text-gray-400 hover:text-white')}>
          {Icon ? <Icon size={12} /> : null}{label}
        </button>
      ))}
    </div>
  )
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0] // Monday-first display

export default function PlannerStats({ stats, statsPrev, statsEmployee, statsFrom, statsTo }: Props) {
  /* ─── interactive controls (persisted) ─────────────────────────── */
  const [measure, setMeasure] = useLocal<Measure>('planner-stats-measure', 'hours')
  const [compare, setCompare] = useLocal<boolean>('planner-stats-compare', false)
  const [typeChart, setTypeChart] = useLocal<'pie' | 'bar'>('planner-stats-typechart', 'pie')
  const [taskChart, setTaskChart] = useLocal<'bar' | 'pie'>('planner-stats-taskchart', 'bar')
  const [taskTopN, setTaskTopN] = useLocal<number>('planner-stats-topn', 12)
  // Ephemeral (data-dependent) — not persisted.
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())
  const [typeFocus, setTypeFocus] = useState<string | null>(null)

  const isH = measure === 'hours'
  const unit = isH ? 'h' : ''
  const measureLabel = isH ? 'Hours' : 'Tasks'
  const fmtVal = (v: number) => isH ? `${v}h` : String(v)

  /* ─── settings (group colours + work-hour targets) ─────────────── */
  const { data: rawSettings } = useQuery<Record<string, any>>({
    queryKey: ['crm-settings'],
    queryFn: () => api.get('/v1/admin/crm-settings').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const customGroupMeta = useMemo(() => parsePlannerGroups(rawSettings?.planner_groups).custom, [rawSettings])
  const groupColor = (g: string | null | undefined) => resolveGroupMeta(g, customGroupMeta).color
  const taskLabelMap = useMemo(() => Object.fromEntries(
    parsePlannerChannels(rawSettings?.planner_channels).map((c: any) => [String(c.key), c.label])
  ), [rawSettings])
  const prettyTask = (s: any) => taskLabelMap[String(s)] || String(s || '—')
  const workHoursPerDay = Number(rawSettings?.planner_work_hours_per_day) || 8
  const workDaysPerWeek = Number(rawSettings?.planner_work_days_per_week) || 5

  // Previous-window date bounds (for the compare label) — the equal window
  // immediately before [statsFrom, statsTo], matching how the page fetches it.
  const prevRange = useMemo(() => {
    const f = new Date(statsFrom + 'T00:00:00')
    const N = Math.max(1, Math.round((new Date(statsTo + 'T00:00:00').getTime() - f.getTime()) / 86400000) + 1)
    const pt = new Date(f); pt.setDate(f.getDate() - 1)
    const pf = new Date(pt); pf.setDate(pt.getDate() - (N - 1))
    return { from: fmtD(ymd(pf)), to: fmtD(ymd(pt)), N }
  }, [statsFrom, statsTo])

  /* ─── derived series ───────────────────────────────────────────── */
  const d = useMemo(() => {
    const byEmp = (stats?.by_employee ?? []) as any[]
    const total = byEmp.reduce((s, e) => s + num(e.total), 0)
    const done = byEmp.reduce((s, e) => s + num(e.completed), 0)
    const rate = total > 0 ? Math.round((done / total) * 100) : 0
    const workedMin = byEmp.reduce((s, e) => s + num(e.worked_minutes), 0)
    const plannedMin = byEmp.reduce((s, e) => s + num(e.planned_minutes), 0)
    const workedH = workedMin / 60
    const plannedH = plannedMin / 60
    const avgTaskMin = total > 0 ? Math.round(plannedMin / total) : 0

    const pEmp = (statsPrev?.by_employee ?? []) as any[]
    const pTotal = pEmp.reduce((s, e) => s + num(e.total), 0)
    const pDone = pEmp.reduce((s, e) => s + num(e.completed), 0)
    const pWorkedH = pEmp.reduce((s, e) => s + num(e.worked_minutes), 0) / 60
    const pRate = pTotal > 0 ? Math.round((pDone / pTotal) * 100) : 0
    const hasPrev = !!statsPrev && pTotal > 0

    // Trend, with previous-window value aligned by the same day-offset (N).
    const N = prevRange.N
    const prevDayMap: Record<string, any> = Object.fromEntries(
      ((statsPrev?.by_day ?? []) as any[]).map(r => [String(r.task_date).slice(0, 10), r])
    )
    const byDay = (stats?.by_day ?? []) as any[]
    const perDay = byDay.map((row: any) => {
      const cd = new Date(String(row.task_date).slice(0, 10) + 'T00:00:00')
      const pd = new Date(cd); pd.setDate(cd.getDate() - N)
      const p = prevDayMap[ymd(pd)] || {}
      return {
        date: fmtD(row.task_date),
        tasks: num(row.total_tasks), done: num(row.completed_tasks),
        worked: r1(num(row.worked_minutes) / 60),
        pTasks: num(p.total_tasks), pDone: num(p.completed_tasks),
        pWorked: r1(num(p.worked_minutes) / 60),
      }
    })
    const daysWithWork = byDay.filter((x: any) => num(x.worked_minutes) > 0).length
    const avgPerDay = daysWithWork > 0 ? workedH / daysWithWork : 0
    const busiest = [...perDay].sort((a, b) => b.worked - a.worked)[0]
    const topEmp = [...byEmp].filter(e => num(e.worked_minutes) > 0).sort((a, b) => num(b.worked_minutes) - num(a.worked_minutes))[0]

    // Per-type — measure-aware, with previous match by task_group.
    const pGroupMap: Record<string, any> = Object.fromEntries(
      ((statsPrev?.by_group ?? []) as any[]).map(g => [g.task_group || '—', g])
    )
    const gVal = (g: any) => isH ? r1(num(g.worked_minutes) / 60) : num(g.total)
    const byType = ((stats?.by_group ?? []) as any[]).map((g: any) => {
      const name = g.task_group || '—'
      const prev = pGroupMap[name]
      return {
        task_group: name, color: groupColor(g.task_group),
        val: gVal(g), prev: prev ? gVal(prev) : 0,
        count: num(g.total), completed: num(g.completed), workedH: r1(num(g.worked_minutes) / 60),
      }
    }).filter((g: any) => g.val > 0).sort((a: any, b: any) => b.val - a.val)
    const typeTotalVal = byType.reduce((s: number, g: any) => s + g.val, 0)

    // Per-task, coloured by parent type. Honours hidden-type filter + focus.
    const pTaskMap: Record<string, any> = Object.fromEntries(
      ((statsPrev?.by_group_task ?? []) as any[]).map(r => [`${r.task_group || '—'} ${r.task}`, r])
    )
    const tVal = (r: any) => isH ? r1(num(r.minutes) / 60) : num(r.total)
    const byTask = ((stats?.by_group_task ?? []) as any[])
      .filter((r: any) => !hiddenTypes.has(r.task_group || '—') && (!typeFocus || (r.task_group || '—') === typeFocus))
      .map((r: any) => {
        const type = r.task_group || '—'
        const prev = pTaskMap[`${type} ${r.task}`]
        return { task: prettyTask(r.task), type, color: groupColor(r.task_group), val: tVal(r), prev: prev ? tVal(prev) : 0, count: num(r.total), completed: num(r.completed) }
      })
      .filter((r: any) => r.val > 0)
      .sort((a: any, b: any) => b.val - a.val)
      .slice(0, taskTopN)

    // Type → task hierarchy (measure-aware bar widths, honours focus).
    const groupTaskTree = Object.values(
      ((stats?.by_group_task ?? []) as any[])
        .filter((r: any) => !typeFocus || (r.task_group || '—') === typeFocus)
        .reduce((acc: Record<string, any>, r: any) => {
          const g = r.task_group || '—'
          acc[g] = acc[g] || { type: g, color: groupColor(g), total: 0, completed: 0, minutes: 0, tasks: [] as any[] }
          const tt = num(r.total), tc = num(r.completed), tm = num(r.minutes)
          acc[g].total += tt; acc[g].completed += tc; acc[g].minutes += tm
          acc[g].tasks.push({ task: prettyTask(r.task), total: tt, completed: tc, workedH: r1(tm / 60) })
          return acc
        }, {})
    ).map((g: any) => ({ ...g, workedH: r1(g.minutes / 60), tasks: g.tasks.sort((a: any, b: any) => b.total - a.total) }))
      .sort((a: any, b: any) => b.total - a.total)

    // Priority — measure-aware value.
    const priMeta: Record<string, string> = { high: '#ef4444', normal: '#3b82f6', low: '#9ca3af' }
    const pPriMap: Record<string, any> = Object.fromEntries(
      ((statsPrev?.by_priority ?? []) as any[]).map(r => [r.priority || 'normal', r])
    )
    // Priority rows carry no minutes, so 'hours' falls back to count here.
    const byPriority = (['high', 'normal', 'low'] as const).map(p => {
      const row = (stats?.by_priority ?? []).find((r: any) => (r.priority || 'normal') === p)
      return { priority: p[0].toUpperCase() + p.slice(1), key: p, total: num(row?.total), completed: num(row?.completed), fill: priMeta[p] }
    }).filter(r => r.total > 0)
    void pPriMap

    // Type × employee → stacked bars (measure-aware).
    const empGroup = (stats?.by_employee_group ?? []) as any[]
    const groupsInData = Array.from(new Set(empGroup.map((r: any) => r.task_group).filter(Boolean))) as string[]
    const typeByEmp = Object.values(empGroup.reduce((acc: Record<string, any>, r: any) => {
      const emp = r.employee_name || 'Unassigned'
      acc[emp] = acc[emp] || { employee: emp }
      acc[emp][r.task_group] = isH ? r1(num(r.minutes) / 60) : num(r.total)
      return acc
    }, {})).sort((a: any, b: any) => {
      const sum = (o: any) => groupsInData.reduce((s, g) => s + (o[g] || 0), 0)
      return sum(b) - sum(a)
    })

    // Per-employee (measure-aware bars + planned/worked + table + Δ).
    const pEmpMap: Record<string, any> = Object.fromEntries(pEmp.map(e => [e.employee_name || 'Unassigned', e]))
    const hoursByEmployee = byEmp.map((e: any) => {
      const name = e.employee_name || 'Unassigned'
      const prev = pEmpMap[name]
      return {
        name, total: num(e.total), completed: num(e.completed),
        workedH: r1(num(e.worked_minutes) / 60), plannedH: r1(num(e.planned_minutes) / 60),
        val: isH ? r1(num(e.worked_minutes) / 60) : num(e.total),
        pWorkedH: prev ? r1(num(prev.worked_minutes) / 60) : 0,
      }
    }).filter((e: any) => e.total > 0).sort((a: any, b: any) => b.val - a.val)

    const allTypes = Array.from(new Set(((stats?.by_group_task ?? []) as any[]).map((r: any) => r.task_group || '—')))

    // On-time vs late completions.
    const c = stats?.completion || {}
    const onTime = num(c.on_time), late = num(c.late), untracked = num(c.untracked)
    const completedTracked = onTime + late

    // Busy-times heatmap (weekday × start hour).
    const hmMap: Record<string, number> = {}
    let hmMax = 0
    const hourSet = new Set<number>()
    ;((stats?.by_dow_hour ?? []) as any[]).forEach((r: any) => {
      const val = isH ? r1(num(r.worked_minutes) / 60) : num(r.total)
      if (val <= 0) return
      hmMap[`${num(r.dow)}-${num(r.hour)}`] = val
      hourSet.add(num(r.hour)); if (val > hmMax) hmMax = val
    })
    const hmHours = [...hourSet].sort((a, b) => a - b)

    // Open-pool aging snapshot.
    const pa = stats?.pool_aging || {}
    const poolAging = {
      total: num(pa.total), d0: num(pa.d0), d1: num(pa.d1), d3: num(pa.d3), d7: num(pa.d7),
      oldest: pa.oldest || null,
    }

    return {
      total, done, rate, workedH, plannedH, avgTaskMin, avgPerDay, daysWithWork, busiest, topEmp,
      pTotal, pDone, pWorkedH, pRate, hasPrev,
      perDay, byType, typeTotalVal, byTask, groupTaskTree, byPriority,
      typeByEmp, groupsInData, hoursByEmployee, allTypes,
      onTime, late, untracked, completedTracked, hmMap, hmHours, hmMax, poolAging,
    }
  }, [stats, statsPrev, measure, hiddenTypes, typeFocus, taskTopN, prevRange, customGroupMeta, taskLabelMap])

  const showDelta = compare && d.hasPrev

  /* ─── CSV export of the type→task breakdown for the range ─────── */
  const exportCsv = () => {
    const header = ['Type', 'Task', 'Tasks', 'Completed', 'Worked hours']
    const rows = ((stats?.by_group_task ?? []) as any[]).map((r: any) =>
      [r.task_group || '—', prettyTask(r.task), num(r.total), num(r.completed), r1(num(r.minutes) / 60)])
    const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `planner-stats-${statsFrom}_to_${statsTo}${statsEmployee ? '-' + statsEmployee.replace(/\s+/g, '_') : ''}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  /* ─── render helpers ───────────────────────────────────────────── */
  const Delta = ({ cur, prev, pp = false, invert = false }: { cur: number; prev: number; pp?: boolean; invert?: boolean }) => {
    if (!showDelta) return null
    const diff = Math.round((cur - prev) * 10) / 10
    if (diff === 0) return <span className="text-[11px] text-gray-500 mt-1 inline-block">no change</span>
    const up = diff > 0
    const good = invert ? !up : up
    return (
      <span className={'text-[11px] font-medium mt-1 inline-flex items-center gap-0.5 ' + (good ? 'text-green-400' : 'text-red-400')}>
        {up ? '▲' : '▼'} {Math.abs(diff)}{pp ? 'pt' : ''} <span className="text-gray-600 font-normal">vs prev</span>
      </span>
    )
  }
  const KPI = ({ label, value, sub, color, delta }: { label: string; value: any; sub?: string; color?: string; delta?: any }) => (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={'text-3xl font-bold mt-2 ' + (color || 'text-white')}>{value}</p>
      {delta}
      {sub && <p className="text-[11px] text-gray-500 mt-1">{sub}</p>}
    </div>
  )
  const Card = ({ title, sub, right, children }: { title: string; sub?: string; right?: any; children: any }) => (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-white">{title}{sub && <span className="text-[11px] font-normal text-gray-500 ml-1.5">{sub}</span>}</h2>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </div>
  )
  const NoData = ({ h = 260, hint }: { h?: number; hint?: string }) => (
    <div style={{ height: h }} className="flex flex-col items-center justify-center text-gray-600 text-sm gap-1">
      <span>No data</span>{hint && <span className="text-[11px] text-gray-700">{hint}</span>}
    </div>
  )

  const toggleType = (t: string) => setHiddenTypes(prev => {
    const next = new Set(prev)
    next.has(t) ? next.delete(t) : next.add(t)
    return next
  })
  const drillType = (g: string | null | undefined) => {
    const name = g || '—'
    setTypeFocus(cur => cur === name ? null : name)
  }

  return (
    <div className="space-y-5">
      {/* ── Controls: measure + compare + export ── */}
      <div className="flex flex-wrap items-center gap-3 bg-dark-surface border border-dark-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Measure</span>
          <Seg value={measure} onChange={setMeasure} options={[['hours', 'Hours', Clock], ['count', 'Tasks', Hash]]} />
        </div>
        <label className={'flex items-center gap-2 text-xs font-medium cursor-pointer px-3 py-1.5 rounded-lg border transition-colors ' +
          (compare ? 'bg-primary-500/15 border-primary-500/40 text-primary-200' : 'bg-dark-surface border-dark-border text-gray-400 hover:text-white')}>
          <input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} className="accent-primary-500" />
          <GitCompare size={13} /> Compare to previous
          {compare && d.hasPrev && <span className="text-[10px] text-gray-500 font-normal">({prevRange.from}–{prevRange.to})</span>}
        </label>
        {compare && !d.hasPrev && <span className="text-[11px] text-amber-400/80">No activity in the previous window.</span>}
        <button type="button" onClick={exportCsv}
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-dark-border text-gray-300 hover:text-white hover:border-white/15 transition-colors">
          <Download size={13} /> Export CSV
        </button>
        <span className="text-[11px] text-gray-600">
          {statsEmployee ? <>Focused on <span className="text-primary-300 font-medium">{statsEmployee}</span></> : 'Whole team'}
        </span>
      </div>

      {/* ── KPI row 1 — throughput ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Total Tasks" value={d.total} delta={<Delta cur={d.total} prev={d.pTotal} />} />
        <KPI label="Completed" value={d.done} color="text-green-400" sub={`${d.done} of ${d.total}`} delta={<Delta cur={d.done} prev={d.pDone} />} />
        <KPI label="Pending" value={d.total - d.done} color="text-amber-400" delta={<Delta cur={d.total - d.done} prev={d.pTotal - d.pDone} invert />} />
        <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
          <p className="text-xs text-gray-500 font-medium">Completion Rate</p>
          <p className="text-3xl font-bold mt-2 text-primary-400">{d.rate}%</p>
          <Delta cur={d.rate} prev={d.pRate} pp />
          <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden"><div className="h-full rounded-full bg-primary-500" style={{ width: `${d.rate}%` }} /></div>
        </div>
      </div>

      {/* ── KPI row 2 — hours + efficiency ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Hours worked" value={`${d.workedH.toFixed(1)}h`} color="text-green-400" sub="done tasks" delta={<Delta cur={r1(d.workedH)} prev={r1(d.pWorkedH)} />} />
        <KPI label="Planned hours" value={`${d.plannedH.toFixed(1)}h`} sub="all scheduled" />
        <KPI label="Avg task length" value={d.avgTaskMin ? `${d.avgTaskMin}m` : '—'} color="text-primary-400" sub={`over ${d.total} task${d.total === 1 ? '' : 's'}`} />
        <KPI label="Avg / active day" value={`${d.avgPerDay.toFixed(1)}h`} sub={`${d.daysWithWork} day${d.daysWithWork === 1 ? '' : 's'} · target ${workHoursPerDay}h`} />
      </div>

      {/* ── Highlights ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPI label="Most active" value={d.topEmp?.employee_name || '—'} sub={d.topEmp ? `${(num(d.topEmp.worked_minutes) / 60).toFixed(1)}h worked` : 'no hours logged'} />
        <KPI label="Busiest day" value={d.busiest?.date || '—'} sub={d.busiest ? `${d.busiest.worked.toFixed(1)}h · ${d.busiest.done} done` : '—'} />
        <KPI label="Weekly capacity" value={`${workHoursPerDay * workDaysPerWeek}h`} sub={`${workHoursPerDay}h/day × ${workDaysPerWeek} days`} />
      </div>

      {/* ── Activity over time (measure-aware; capacity line in hours mode; dashed prev overlay) ── */}
      <Card title={isH ? 'Hours over time' : 'Task activity over time'} sub={isH ? `(worked hours per day · target ${workHoursPerDay}h)` : '(scheduled vs completed per day)'}>
        {d.perDay.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={d.perDay} margin={{ left: -18, right: 8, top: 6, bottom: 0 }}>
              <defs>
                <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c9a84c" stopOpacity={0.35} /><stop offset="100%" stopColor="#c9a84c" stopOpacity={0.02} /></linearGradient>
                <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.45} /><stop offset="100%" stopColor="#10b981" stopOpacity={0.03} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <YAxis allowDecimals={isH} tick={{ fontSize: 11, fill: '#6b7280' }} unit={unit} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {isH && <ReferenceLine y={workHoursPerDay} stroke="#f59e0b" strokeDasharray="5 4" strokeOpacity={0.7}
                label={{ value: `target ${workHoursPerDay}h`, fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} />}
              {isH ? (
                <Area type="monotone" dataKey="worked" stroke="#10b981" strokeWidth={2} fill="url(#gB)" name="Worked h" />
              ) : (<>
                <Area type="monotone" dataKey="tasks" stroke="#c9a84c" strokeWidth={2} fill="url(#gA)" name="Scheduled" />
                <Area type="monotone" dataKey="done" stroke="#10b981" strokeWidth={2} fill="url(#gB)" name="Completed" />
              </>)}
              {showDelta && <Area type="monotone" dataKey={isH ? 'pWorked' : 'pDone'} stroke="#6b7280" strokeWidth={1.5} strokeDasharray="4 3" fill="none" name="Previous period" />}
            </AreaChart>
          </ResponsiveContainer>
        ) : <NoData h={280} />}
      </Card>

      {/* ── On-time vs late + Open-pool aging ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="On-time vs late" sub="(of completed tasks in range)">
          {d.completedTracked > 0 ? (
            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <div><span className="text-3xl font-bold text-green-400">{Math.round((d.onTime / d.completedTracked) * 100)}%</span><span className="text-xs text-gray-500 ml-1.5">on time</span></div>
                <div className="text-right text-[11px] text-gray-500">{d.onTime} on time · {d.late} late{d.untracked > 0 ? ` · ${d.untracked} untracked` : ''}</div>
              </div>
              <div className="flex h-4 rounded-lg overflow-hidden bg-white/[0.04]">
                <div className="bg-green-500 flex items-center justify-center" style={{ width: `${(d.onTime / d.completedTracked) * 100}%` }} title={`${d.onTime} on time`} />
                <div className="bg-red-500/80 flex items-center justify-center" style={{ width: `${(d.late / d.completedTracked) * 100}%` }} title={`${d.late} late`} />
              </div>
              <div className="flex gap-4 text-[11px]">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" />On time — finished on/before the scheduled day</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/80" />Late</span>
              </div>
              {d.untracked > 0 && <p className="text-[10px] text-gray-600">{d.untracked} completed task{d.untracked === 1 ? '' : 's'} predate completion tracking and aren't scored.</p>}
            </div>
          ) : <NoData h={160} hint="No completed tasks with tracked timing in this range yet." />}
        </Card>

        <Card title="Open pool — right now" sub="(unassigned + unscheduled, by age)">
          {d.poolAging.total > 0 ? (
            <div className="space-y-3">
              {(() => {
                const parsedOldest = d.poolAging.oldest ? Date.parse(d.poolAging.oldest) : NaN
                const oldestDays = Number.isFinite(parsedOldest) ? Math.max(0, Math.floor((Date.now() - parsedOldest) / 86400000)) : 0
                const buckets = [
                  { label: '≤1 day', v: d.poolAging.d0, c: '#10b981' },
                  { label: '1–3 days', v: d.poolAging.d1, c: '#3b82f6' },
                  { label: '3–7 days', v: d.poolAging.d3, c: '#f59e0b' },
                  { label: '>7 days', v: d.poolAging.d7, c: '#ef4444' },
                ]
                return (<>
                  <div className="flex items-end justify-between">
                    <div><span className="text-3xl font-bold text-white">{d.poolAging.total}</span><span className="text-xs text-gray-500 ml-1.5">waiting</span></div>
                    <div className="text-right text-[11px] text-gray-500">oldest {oldestDays} day{oldestDays === 1 ? '' : 's'}</div>
                  </div>
                  <div className="flex h-4 rounded-lg overflow-hidden bg-white/[0.04]">
                    {buckets.map(b => b.v > 0 && <div key={b.label} style={{ width: `${(b.v / d.poolAging.total) * 100}%`, background: b.c }} title={`${b.label}: ${b.v}`} />)}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {buckets.map(b => (
                      <div key={b.label} className="text-center">
                        <div className="tabular-nums font-semibold" style={{ color: b.v > 0 ? b.c : '#4b5563' }}>{b.v}</div>
                        <div className="text-[10px] text-gray-600">{b.label}</div>
                      </div>
                    ))}
                  </div>
                </>)
              })()}
            </div>
          ) : <NoData h={160} hint="The open pool is empty — nothing waiting to be claimed." />}
        </Card>
      </div>

      {/* ── Type focus chip (drill) ── */}
      {typeFocus && (
        <div className="flex items-center gap-2 text-xs bg-primary-500/10 border border-primary-500/25 rounded-lg px-3 py-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: groupColor(typeFocus) }} />
          <span className="text-primary-200 font-semibold">Focused on type: {typeFocus}</span>
          <span className="text-gray-500">— the task + hierarchy views below show only this type.</span>
          <button onClick={() => setTypeFocus(null)} className="ml-auto text-gray-400 hover:text-white inline-flex items-center gap-1"><X size={12} /> Clear</button>
        </div>
      )}

      {/* ── Per type (donut/bar, click to focus, % slice labels) + priority ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card title={`${measureLabel} per type`} sub="(click a type to focus the views below)"
            right={<Seg value={typeChart} onChange={setTypeChart} options={[['pie', 'Donut', PieIcon], ['bar', 'Bars', BarChart3]]} />}>
            {d.byType.length > 0 ? (
              typeChart === 'pie' ? (
                <div className="flex items-center gap-4 flex-wrap">
                  <ResponsiveContainer width={220} height={220}>
                    <PieChart>
                      <Pie data={d.byType} dataKey="val" nameKey="task_group" innerRadius={58} outerRadius={90} paddingAngle={2}
                        stroke="#12121f" strokeWidth={2} onClick={(s: any) => drillType(s?.task_group ?? s?.payload?.task_group)}
                        label={d.byType.length <= 6 ? (p: any) => `${Math.round((p.percent || 0) * 100)}%` : false} labelLine={false}
                        style={{ cursor: 'pointer', fontSize: 11 }}>
                        {d.byType.map((g: any) => <Cell key={g.task_group} fill={g.color} opacity={typeFocus && typeFocus !== g.task_group ? 0.35 : 1} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any, n: any) => [fmtVal(Number(v)), n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 min-w-[180px] space-y-1.5">
                    {d.byType.map((g: any) => {
                      const share = d.typeTotalVal > 0 ? Math.round((g.val / d.typeTotalVal) * 100) : 0
                      const diff = r1(g.val - g.prev)
                      return (
                        <button key={g.task_group} onClick={() => drillType(g.task_group)}
                          className={'w-full flex items-center gap-2 text-xs rounded px-1 py-0.5 hover:bg-white/[0.04] ' + (typeFocus === g.task_group ? 'bg-white/[0.06]' : '')}>
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: g.color }} />
                          <span className="text-gray-200 truncate flex-1 min-w-0 text-left" title={g.task_group}>{g.task_group}</span>
                          <span className="tabular-nums text-white font-medium">{fmtVal(g.val)}</span>
                          <span className="tabular-nums text-gray-500 w-9 text-right">{share}%</span>
                          {showDelta && diff !== 0 && <span className={'tabular-nums w-12 text-right ' + (diff > 0 ? 'text-green-400' : 'text-red-400')}>{diff > 0 ? '▲' : '▼'}{Math.abs(diff)}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(240, d.byType.length * 40)}>
                  <BarChart data={d.byType} layout="vertical" margin={{ left: 10, right: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} unit={unit} allowDecimals={isH} />
                    <YAxis dataKey="task_group" type="category" tick={{ fontSize: 11, fill: '#9ca3af' }} width={110} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    {showDelta && <Legend wrapperStyle={{ fontSize: 11 }} />}
                    <Bar dataKey="val" radius={[0, 4, 4, 0]} name={`This period (${measureLabel.toLowerCase()})`} onClick={(data: any) => drillType(data?.task_group ?? data?.payload?.task_group)} style={{ cursor: 'pointer' }}>
                      {d.byType.map((g: any) => <Cell key={g.task_group} fill={g.color} opacity={typeFocus && typeFocus !== g.task_group ? 0.35 : 1} />)}
                      {!showDelta && <LabelList dataKey="val" position="right" formatter={(v: any) => fmtVal(Number(v))} style={{ fill: '#9ca3af', fontSize: 11 }} />}
                    </Bar>
                    {showDelta && <Bar dataKey="prev" radius={[0, 4, 4, 0]} fill="#4b5563" name="Previous" />}
                  </BarChart>
                </ResponsiveContainer>
              )
            ) : <NoData hint="Set a Type on the new-task form to build this breakdown." />}
          </Card>
        </div>

        <Card title="By priority" sub="(task count)">
          {d.byPriority.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={d.byPriority} dataKey="total" nameKey="priority" innerRadius={45} outerRadius={75} paddingAngle={2} stroke="#12121f" strokeWidth={2}
                    label={(p: any) => `${Math.round((p.percent || 0) * 100)}%`} labelLine={false} style={{ fontSize: 11 }}>
                    {d.byPriority.map((p: any) => <Cell key={p.key} fill={p.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {d.byPriority.map((p: any) => (
                  <div key={p.key} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.fill }} />{p.priority}</span>
                    <span className="tabular-nums text-gray-400">{p.completed}/{p.total} done</span>
                  </div>
                ))}
              </div>
            </>
          ) : <NoData h={180} />}
        </Card>
      </div>

      {/* ── Per task, coloured by parent type ── */}
      <Card title={`${measureLabel} per task`} sub="(each bar coloured by its type · what the work consisted of)"
        right={
          <div className="flex items-center gap-2">
            <select value={taskTopN} onChange={e => setTaskTopN(Number(e.target.value))}
              className="bg-dark-surface border border-dark-border rounded-lg px-2 py-1 text-xs text-gray-300">
              {[8, 12, 20, 40].map(n => <option key={n} value={n}>Top {n}</option>)}
            </select>
            <Seg value={taskChart} onChange={setTaskChart} options={[['bar', 'Bars', BarChart3], ['pie', 'Donut', PieIcon]]} />
          </div>
        }>
        {d.allTypes.length > 1 && !typeFocus && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {d.allTypes.map((tp: string) => {
              const on = !hiddenTypes.has(tp)
              return (
                <button key={tp} type="button" onClick={() => toggleType(tp)}
                  className={'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ' +
                    (on ? 'border-white/15 text-gray-200 bg-white/[0.04]' : 'border-dark-border text-gray-600 bg-transparent line-through')}>
                  <span className="w-2 h-2 rounded-sm" style={{ background: on ? groupColor(tp) : '#4b5563' }} />{tp}
                </button>
              )
            })}
          </div>
        )}
        {d.byTask.length > 0 ? (
          taskChart === 'bar' ? (
            <ResponsiveContainer width="100%" height={Math.max(220, d.byTask.length * 30)}>
              <BarChart data={d.byTask} layout="vertical" margin={{ left: 10, right: showDelta ? 64 : 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} unit={unit} allowDecimals={isH} />
                <YAxis dataKey="task" type="category" tick={{ fontSize: 10, fill: '#9ca3af' }} width={150} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  formatter={(v: any, _n: any, p: any) => [`${fmtVal(Number(v))}${showDelta ? ` · prev ${fmtVal(p?.payload?.prev ?? 0)}` : ''}`, p?.payload?.type]} />
                <Bar dataKey="val" radius={[0, 4, 4, 0]} name={measureLabel}>
                  {d.byTask.map((r: any, i: number) => <Cell key={i} fill={r.color} />)}
                  <LabelList dataKey="val" position="right" formatter={(v: any) => fmtVal(Number(v))} style={{ fill: '#9ca3af', fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <ResponsiveContainer width={240} height={240}>
                <PieChart>
                  <Pie data={d.byTask} dataKey="val" nameKey="task" innerRadius={60} outerRadius={95} paddingAngle={1.5} stroke="#12121f" strokeWidth={2}>
                    {d.byTask.map((r: any, i: number) => <Cell key={i} fill={r.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any, n: any, p: any) => [`${fmtVal(Number(v))} · ${p?.payload?.type}`, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 min-w-[200px] space-y-1 max-h-[220px] overflow-y-auto pr-1">
                {d.byTask.map((r: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: r.color }} />
                    <span className="text-gray-200 truncate flex-1 min-w-0" title={`${r.task} · ${r.type}`}>{r.task}</span>
                    {showDelta && (() => { const diff = r1(r.val - r.prev); return diff !== 0 ? <span className={'tabular-nums ' + (diff > 0 ? 'text-green-400' : 'text-red-400')}>{diff > 0 ? '▲' : '▼'}{Math.abs(diff)}</span> : null })()}
                    <span className="tabular-nums text-white font-medium">{fmtVal(r.val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : <NoData hint="Set a Task on the new-task form to break work down here." />}
      </Card>

      {/* ── Types & their tasks — the hierarchy ── */}
      <Card title="Types & their tasks" sub={statsEmployee ? `(${statsEmployee} — under each type, the tasks done)` : '(under each type, the tasks that made it up)'}>
        {d.groupTaskTree.length > 0 ? (
          <div className="space-y-2.5">
            {d.groupTaskTree.map((g: any) => {
              const gRate = g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0
              const gDenom = isH ? g.workedH : g.total
              return (
                <div key={g.type} className="rounded-lg border border-dark-border bg-dark-bg/40 p-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: g.color }} />
                    <span className="font-semibold text-white">{g.type}</span>
                    <span className="text-[11px] text-gray-500">{g.tasks.length} task{g.tasks.length === 1 ? '' : 's'}</span>
                    <div className="ml-auto flex items-center gap-3 text-[11px]">
                      <span className="tabular-nums text-gray-400"><span className="text-green-400 font-semibold">{g.completed}</span>/{g.total} done</span>
                      <span className="tabular-nums text-gray-500">{g.workedH}h</span>
                      <span className="tabular-nums font-semibold" style={{ color: gRate >= 80 ? '#10b981' : gRate >= 40 ? '#f59e0b' : '#6b7280' }}>{gRate}%</span>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    {g.tasks.map((tk: any, i: number) => {
                      const tkVal = isH ? tk.workedH : tk.total
                      const pct = gDenom > 0 ? (tkVal / gDenom) * 100 : 0
                      const donePct = tk.total > 0 ? (tk.completed / tk.total) * 100 : 0
                      return (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <span className="text-gray-300 w-40 truncate flex-shrink-0" title={tk.task}>{tk.task}</span>
                          <div className="flex-1 h-2.5 rounded bg-white/[0.04] overflow-hidden min-w-[60px]" title={`${tk.completed} of ${tk.total} done`}>
                            <div className="h-full rounded" style={{ width: `${pct}%`, background: g.color + '55' }}>
                              <div className="h-full rounded" style={{ width: `${donePct}%`, background: g.color }} />
                            </div>
                          </div>
                          <span className="tabular-nums text-gray-400 w-14 text-right flex-shrink-0">{tk.completed}/{tk.total}</span>
                          <span className="tabular-nums text-gray-600 w-12 text-right flex-shrink-0">{tk.workedH}h</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : <NoData h={140} hint="Set a Type + Task on the new-task form to build this breakdown." />}
      </Card>

      {/* ── When work happens — weekday × hour heatmap ── */}
      <Card title="When work happens" sub={`(${isH ? 'worked hours' : 'tasks'} by weekday × start hour · timed tasks only)`}>
        {d.hmHours.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="flex text-[10px] text-gray-600 mb-1">
                <div className="w-10 flex-shrink-0" />
                {d.hmHours.map(h => <div key={h} className="flex-1 text-center min-w-[26px]">{h}</div>)}
              </div>
              {DOW_ORDER.map(dow => (
                <div key={dow} className="flex items-center mb-0.5">
                  <div className="w-10 flex-shrink-0 text-[11px] text-gray-400">{DOW_LABELS[dow]}</div>
                  {d.hmHours.map(h => {
                    const v = d.hmMap[`${dow}-${h}`] || 0
                    const alpha = d.hmMax > 0 && v > 0 ? 0.14 + 0.86 * (v / d.hmMax) : 0
                    return (
                      <div key={h} className="flex-1 min-w-[26px] px-0.5">
                        <div className="h-6 rounded" title={v > 0 ? `${DOW_LABELS[dow]} ${h}:00 — ${fmtVal(r1(v))}` : `${DOW_LABELS[dow]} ${h}:00 — none`}
                          style={{ background: v > 0 ? `rgba(16,185,129,${alpha})` : 'rgba(255,255,255,0.03)' }} />
                      </div>
                    )
                  })}
                </div>
              ))}
              <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-600">
                <span>Less</span>
                {[0.14, 0.4, 0.65, 1].map(a => <span key={a} className="w-5 h-3 rounded" style={{ background: `rgba(16,185,129,${a})` }} />)}
                <span>More</span>
                <span className="ml-2">peak {fmtVal(r1(d.hmMax))}</span>
              </div>
            </div>
          </div>
        ) : <NoData h={140} hint="Give tasks a start time to see when the team is busiest." />}
      </Card>

      {/* ── Type by employee (stacked) ── */}
      <Card title="Type by employee" sub={`(${isH ? 'hours' : 'tasks'} per type, per person)`}>
        {d.typeByEmp.length > 0 && d.groupsInData.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(220, d.typeByEmp.length * 42)}>
            <BarChart data={d.typeByEmp} layout="vertical" margin={{ left: 10, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} unit={unit} allowDecimals={isH} />
              <YAxis dataKey="employee" type="category" tick={{ fontSize: 11, fill: '#9ca3af' }} width={110} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {d.groupsInData.map((g: string, i: number) => (
                <Bar key={g} dataKey={g} stackId="h" fill={groupColor(g)} radius={i === d.groupsInData.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]} name={g} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : <NoData />}
      </Card>

      {/* ── By employee (measure-aware) + Planned vs Worked (estimate accuracy) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="By employee" sub={`(${measureLabel.toLowerCase()}${showDelta ? ' · vs previous' : ''})`}>
          {d.hoursByEmployee.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(220, d.hoursByEmployee.length * 40)}>
              <BarChart data={d.hoursByEmployee} layout="vertical" margin={{ left: 10, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} unit={unit} allowDecimals={isH} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#9ca3af' }} width={100} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                {showDelta && isH && <Legend wrapperStyle={{ fontSize: 11 }} />}
                <Bar dataKey="val" fill="#10b981" radius={[0, 4, 4, 0]} name="This period" />
                {showDelta && isH && <Bar dataKey="pWorkedH" fill="#4b5563" radius={[0, 4, 4, 0]} name="Previous" />}
              </BarChart>
            </ResponsiveContainer>
          ) : <NoData />}
        </Card>
        <Card title="Planned vs worked" sub="(estimate accuracy — planned vs actual hours)">
          {d.hoursByEmployee.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(220, d.hoursByEmployee.length * 40)}>
              <BarChart data={d.hoursByEmployee} layout="vertical" margin={{ left: 10, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} unit="h" />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#9ca3af' }} width={100} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="plannedH" fill="#6b7280" radius={[0, 4, 4, 0]} name="Planned h" />
                <Bar dataKey="workedH" fill="#10b981" radius={[0, 4, 4, 0]} name="Worked h" />
              </BarChart>
            </ResponsiveContainer>
          ) : <NoData />}
        </Card>
      </div>

      {/* ── Hours & task table ── */}
      <Card title="Hours & task breakdown by employee" sub="(for the selected range)">
        {d.hoursByEmployee.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-dark-border">
                  <th className="py-2 font-semibold">Employee</th>
                  <th className="py-2 font-semibold text-right">Tasks</th>
                  <th className="py-2 font-semibold text-right">Done</th>
                  <th className="py-2 font-semibold text-right">Worked</th>
                  <th className="py-2 font-semibold text-right">Planned</th>
                  {showDelta && <th className="py-2 font-semibold text-right">Δ Worked</th>}
                </tr>
              </thead>
              <tbody>
                {d.hoursByEmployee.map((e: any) => {
                  const diff = r1(e.workedH - e.pWorkedH)
                  return (
                    <tr key={e.name} className="border-b border-dark-border/40">
                      <td className="py-2 text-white">{e.name}</td>
                      <td className="py-2 text-right text-gray-300 tabular-nums">{e.total}</td>
                      <td className="py-2 text-right text-green-400 tabular-nums">{e.completed}</td>
                      <td className="py-2 text-right text-green-400 font-semibold tabular-nums">{e.workedH.toFixed(1)}h</td>
                      <td className="py-2 text-right text-gray-400 tabular-nums">{e.plannedH.toFixed(1)}h</td>
                      {showDelta && <td className={'py-2 text-right tabular-nums ' + (diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-gray-500')}>{diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${diff}h`}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="h-[120px] flex items-center justify-center text-gray-600 text-sm">No hours logged</div>}
      </Card>
    </div>
  )
}
