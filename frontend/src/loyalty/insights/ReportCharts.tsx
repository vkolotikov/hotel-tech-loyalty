import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import { OverviewButton } from '../overview/OverviewUI'
import { ReportCard } from './ReportDashboard'
import type { InsightsReport } from './reportTypes'
import { useReportWords } from './reportWords'

function useChartWidth(initial: number) {
  const ref = useRef<SVGSVGElement>(null), [width, setWidth] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(entry.contentRect.width) })
    observer.observe(el)
    return () => observer.disconnect()
  })
  return { ref, width }
}

export function ReportTrend({ data }: { data: InsightsReport }) {
  const say = useReportWords(), { i18n } = useTranslation(), id = useId()
  const [metric, setMetric] = useState<'active' | 'sales'>('active'), [table, setTable] = useState(false), [selected, setSelected] = useState<number | null>(null)
  const { ref, width } = useChartWidth(704)
  const number = (v: number) => new Intl.NumberFormat(i18n.language, metric === 'sales' ? { style: 'currency', currency: data.current.money.currency, maximumFractionDigits: 0 } : {}).format(v)
  const short = (v: string) => formatDate(v, i18n.language, { month: 'short', day: 'numeric' })
  const values = data.series.map(w => w[metric]), previous = data.previous_series.map(w => w[metric])
  const top = Math.max(1, ...values, ...previous), magnitude = 10 ** Math.floor(Math.log10(top)), max = Math.ceil(top / magnitude) * magnitude
  const x = (i: number) => 44 + i / Math.max(1, values.length - 1) * (width - 80), y = (v: number) => 155 - v / max * 128
  const path = (v: number[]) => v.map((n, i) => `${i ? 'L' : 'M'}${x(i)},${y(n)}`).join(' ')
  const inspected = selected !== null ? data.series[selected] : null
  return <ReportCard className="l-in-trend" title={say('activity')} action={<div className="l-in-toggle"><OverviewButton primary={!table} aria-pressed={!table} onClick={() => setTable(false)}>{say('chart')}</OverviewButton><OverviewButton primary={table} aria-pressed={table} onClick={() => setTable(true)}>{say('table')}</OverviewButton></div>}>
    <div className="l-in-metric-switch">{(['active', 'sales'] as const).map(k => <OverviewButton key={k} primary={metric === k} aria-pressed={metric === k} onClick={() => { setMetric(k); setSelected(null) }}>{say(k)}</OverviewButton>)}<small>{say('weekly')}</small></div>
    <div className="l-in-legend"><span><i />{say('selected')}</span>{data.comparison && <span><i />{say('previous')}</span>}<small>{say('inspect')}</small></div>
    {table ? <div className="l-in-table-scroll" tabIndex={0} role="region" aria-label={say('activity')}><table className="l-in-trend-table"><caption className="sr-only">{say('activity')} · {say(metric)}</caption><thead><tr><th>{say('week')}</th><th>{say('selected')}</th>{data.comparison && <th>{say('previous')}</th>}</tr></thead><tbody>{data.series.map((w, i) => <tr key={w.from}><th scope="row">{short(w.from)} – {short(w.to)}</th><td>{number(w[metric])}</td>{data.comparison && <td>{data.previous_series[i] ? <>{number(data.previous_series[i][metric])}<small>{short(data.previous_series[i].from)} – {short(data.previous_series[i].to)}</small></> : '—'}</td>}</tr>)}</tbody></table></div> : <svg ref={ref} className="l-in-trend-svg" viewBox={`0 0 ${width} 196`} role="group" aria-labelledby={id}><title id={id}>{say('activity')} · {say(metric)}</title>
      {[0, 1, 2, 3].map(i => <g key={i}><line x1="44" x2={width - 20} y1={y(max * i / 3)} y2={y(max * i / 3)} className="l-in-gridline" /><text x="2" y={y(max * i / 3) + 4}>{new Intl.NumberFormat(i18n.language, { notation: 'compact', maximumFractionDigits: 1 }).format(max * i / 3)}</text></g>)}
      {values.length > 0 && <path d={`${path(values)} L${x(values.length - 1)},155 L44,155 Z`} className="l-in-wash" />}
      {previous.length > 0 && <path d={path(previous)} className="l-in-line l-in-previous-line" />}<path d={path(values)} className="l-in-line" />
      {data.series.map((w, i) => <g key={w.from}><circle cx={x(i)} cy={y(w[metric])} r="4" className="l-in-dot" /><circle cx={x(i)} cy={y(w[metric])} r="12" tabIndex={0} role="button" className="l-in-hit" aria-label={`${short(w.from)} – ${short(w.to)}: ${number(w[metric])}`} onMouseEnter={() => setSelected(i)} onFocus={() => setSelected(i)} onClick={() => setSelected(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(i) } }} />{(data.series.length <= 5 || i % Math.ceil(data.series.length / 5) === 0) && <text x={x(i)} y="181" textAnchor={i === 0 ? 'start' : i === data.series.length - 1 ? 'end' : 'middle'}>{short(w.from)}{width >= 500 && data.series.length <= 4 && `–${short(w.to)}`}</text>}</g>)}
    </svg>}
    {inspected && <p className="l-in-inspected" role="status">{short(inspected.from)} – {short(inspected.to)}: <strong>{number(inspected[metric])}</strong>{selected !== null && data.previous_series[selected] && <> · {say('previous')}: {number(data.previous_series[selected][metric])}</>}</p>}
    <small>{metric === 'active' ? say('activityHint') : say('salesLine', { currency: data.current.money.currency, n: data.current.money.other_currency.bookings })}</small>
  </ReportCard>
}
export function ReportLevels({ data }: { data: InsightsReport }) {
  const say = useReportWords(), { i18n } = useTranslation()
  const rows = [...data.tiers.rows, ...(data.tiers.none ? [{ id: 0, name: say('noLevel'), members: data.tiers.none }] : [])]
  const total = data.tiers.total, n = (v: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(v)
  const cumulative = rows.map((_, i) => rows.slice(0, i).reduce((sum, t) => sum + t.members, 0))
  return <ReportCard title={say('levels')}><p>{say('snapshot', { date: formatDate(data.snapshot_date, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) })}</p><div className="l-in-levels">
    <div className="l-in-donut"><svg viewBox="0 0 160 160" aria-hidden><circle cx="80" cy="80" r="67" className="l-in-donut-base" />{rows.map((row, i) => <circle key={row.id} cx="80" cy="80" r="67" pathLength="100" className={`l-in-donut-${i % 5}`} strokeDasharray={`${row.members / Math.max(1, total) * 100} 100`} strokeDashoffset={-cumulative[i] / Math.max(1, total) * 100} transform="rotate(-90 80 80)" />)}</svg><div><strong>{n(total)}</strong><small>{say('members')}</small></div></div>
    <ul>{rows.map((row, i) => <li key={row.id}><span><i className={`l-in-tone-${i % 5}`} />{row.name}</span><strong>{n(row.members)} · {total ? n(row.members / total * 100) : '0'}%</strong></li>)}</ul>
  </div><hr /><small>{say('levelHint')}</small><Link className="l-ov-link" to="/loyalty/insights?view=detailed#insights-tiers">{say('explore')}</Link></ReportCard>
}
export function ReportPoints({ data }: { data: InsightsReport }) {
  const say = useReportWords(), { i18n, t } = useTranslation()
  const { ref, width } = useChartWidth(524)
  const center = (i: number) => 48 + (width - 64) * (i + .5) / 3
  const barWidth = Math.min(64, (width - 64) / 5)
  const values = [data.current.issued, data.current.redeemed, data.current.expired], names = [t('loyalty.insights.points.issued', 'Issued'), t('loyalty.insights.points.redeemed', 'Redeemed'), say('expired')]
  const n = (v: number) => new Intl.NumberFormat(i18n.language).format(v)
  const peak = Math.max(1, ...values.map(Math.abs)), step = 10 ** Math.floor(Math.log10(peak)) / 2
  const max = Math.ceil(Math.max(1, ...values) / step) * step, min = Math.floor(Math.min(0, ...values) / step) * step, range = max - min
  const y = (v: number) => 150 - (v - min) / range * 120
  return <ReportCard title={say('pointsFlow')} action={<Link className="l-ov-link" to="/loyalty/insights?view=detailed#insights-points">{say('ledger')}</Link>}><p>{say('pointsLine')}</p>
    <svg ref={ref} className="l-in-points-svg" viewBox={`0 0 ${width} 182`} role="img" aria-label={values.map((v, i) => `${names[i]}: ${n(v)}`).join('; ')}>{[0, 1, 2, 3].map(i => { const v = min + range * i / 3; return <g key={i}><line x1="48" x2={width - 16} y1={y(v)} y2={y(v)} className="l-in-gridline" /><text x="0" y={y(v) + 4}>{new Intl.NumberFormat(i18n.language, { notation: 'compact', maximumFractionDigits: 1 }).format(v)}</text></g> })}{values.map((v, i) => <g key={i}><rect x={center(i) - barWidth / 2} y={Math.min(y(v), y(0))} width={barWidth} height={Math.abs(y(v) - y(0))} rx="4" className={`l-in-point-${i}`} /><text x={center(i)} y={Math.max(14, y(v) - 8)} textAnchor="middle">{n(v)}</text><text x={center(i)} y="177" textAnchor="middle">{names[i]}</text></g>)}</svg>
    <div className="l-in-balance"><strong>{n(data.outstanding)}</strong><span>{say('outstanding')}<small>{say('balanceHint')}</small></span></div>
  </ReportCard>
}
