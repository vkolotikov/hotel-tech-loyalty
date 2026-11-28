import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Table2 } from 'lucide-react'
import { count } from '../lib/format'
import { boardDay, type TeamBoard } from './teamBoard'

export function ActivityTrend({ board, lang, showDays }: { board: TeamBoard; lang: string; showDays: () => void }) {
  const { t } = useTranslation()
  const gradient = useId()
  const [selected, setSelected] = useState<string | null>(null)
  const days = board.days
  if (days.length === 0) return null
  const last = days.length - 1
  const found = days.findIndex(day => day.date === selected)
  const index = found < 0 ? last : found
  const day = days[index]
  const peak = Math.max(1, ...days.flatMap(d => [d.leads, d.wins]))
  const power = 10 ** Math.floor(Math.log10(peak))
  const top = ([2, 4, 6, 8, 10].find(n => n * power >= peak) ?? 10) * power
  const width = 600, height = 120
  const x = (i: number) => (i + .5) * width / days.length
  const y = (n: number) => height - n / top * height
  const points = days.map((d, i) => `${x(i)},${y(d.leads)}`).join(' L')
  const line = 'M' + points
  const bar = Math.min(18, width / days.length * .38)
  const pick = (i: number) => setSelected(days[Math.max(0, Math.min(last, i))].date)
  const atPointer = (clientX: number, rect: DOMRect) => pick(Math.floor((clientX - rect.left) / rect.width * days.length))
  return <section className="crm-team-trend crm-team-panel" aria-label={t('crm.team.trend')}>
    <header className="crm-team-panel-head"><h2>{t('crm.team.activity_chart')}</h2>
      <button type="button" className="crm-team-icon" aria-label={t('crm.team.daily_table')} title={t('crm.team.daily_table')} onClick={showDays}><Table2 size={17}/></button>
    </header>
    <div className="crm-team-trend-intro"><div><strong>{count(board.leads, lang)}</strong> <span>{t('crm.team.leads')}</span></div>
      <Change value={board.performance.lead_change} board={board} lang={lang}/></div>
    <div className="crm-team-plot"><div className="crm-team-y-axis" aria-hidden><span>{count(top, lang)}</span><span>{count(top / 2, lang)}</span><span>0</span></div>
      <div className="crm-team-plot-area" onPointerDown={e => atPointer(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerMove={e => { if (e.pointerType === 'mouse') atPointer(e.clientX, e.currentTarget.getBoundingClientRect()) }}>
        <svg className="crm-team-trend-svg" viewBox={`0 -4 ${width} ${height + 8}`} preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop className="crm-team-wash" offset="0%" stopOpacity=".24"/><stop className="crm-team-wash" offset="100%" stopOpacity=".015"/></linearGradient></defs>
          {[0, height / 2, height].map(mark => <line className="crm-team-gridline" key={mark} x1="0" x2={width} y1={mark} y2={mark} vectorEffect="non-scaling-stroke"/>)}
          <path d={line + ` L${x(last)},${height} L${x(0)},${height} Z`} fill={`url(#${gradient})`}/>
          {days.map((d, i) => d.wins > 0 && <rect className="crm-team-win-bar" key={d.date} x={x(i) - bar / 2} y={y(d.wins)} width={bar} height={height - y(d.wins)} rx="1.8"/>)}
          <path className="crm-team-trend-line" d={line} fill="none" vectorEffect="non-scaling-stroke"/>
          <line className="crm-team-crosshair" x1={x(index)} x2={x(index)} y1="0" y2={height} vectorEffect="non-scaling-stroke"/>
          <circle className="crm-team-crosspoint" cx={x(index)} cy={y(day.leads)} r="3.6" vectorEffect="non-scaling-stroke"/>
        </svg>
      </div>
    </div>
    <div className="crm-team-trend-axis"><span>{boardDay(board.from, lang)}</span>{board.from !== board.through && <span>{boardDay(board.through, lang)}</span>}</div>
    <div className="crm-team-trend-readout">
      <div className="crm-team-date-picker"><button type="button" className="crm-team-icon" disabled={index === 0} aria-label={t('crm.team.previous_day')} onClick={() => pick(index - 1)}><ChevronLeft size={15}/></button>
        <span>{boardDay(day.date, lang)}</span><button type="button" className="crm-team-icon" disabled={index === last} aria-label={t('crm.team.next_day')} onClick={() => pick(index + 1)}><ChevronRight size={15}/></button></div>
      <div className="crm-team-legend"><span><i aria-hidden/>{t('crm.team.leads')} <b>{count(day.leads, lang)}</b></span><span><i aria-hidden/>{t('crm.team.wins')} <b>{count(day.wins, lang)}</b></span></div>
    </div>
  </section>
}

export function Change({ value, board, lang }: { value: number; board: TeamBoard; lang: string }) {
  const { t } = useTranslation()
  const delta = new Intl.NumberFormat(lang, { signDisplay: 'exceptZero' }).format(value)
  const comparison = t('crm.team.comparison', { from: boardDay(board.performance.previous_from, lang), through: boardDay(board.performance.previous_through, lang) })
  return <span className="crm-team-change" data-direction={value > 0 ? 'up' : value < 0 ? 'down' : 'flat'} title={comparison}>
    <b>{delta}</b> <span>{t(board.period === 'week' ? 'crm.team.vs_week' : 'crm.team.vs_month')}</span><span className="sr-only"> {comparison}</span>
  </span>
}
