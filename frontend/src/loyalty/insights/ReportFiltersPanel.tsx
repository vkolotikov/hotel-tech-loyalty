import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, ChevronDown, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import { useBoot } from '../LoyaltyProvider'
import { OverviewDialog } from '../overview/OverviewUI'
import { presetRange, reportFilters, selectedPreset, shiftDay, validReportRange, type ReportPreset } from './reportMath'
import type { InsightsReport, ReportFilters } from './reportTypes'
import { useReportWords } from './reportWords'

const preference = 'loyalty:insights-filters-hidden'
const stateWords = { all: 'stateAll', active: 'stateActive', inactive: 'stateInactive' } as const
const consentWords = { all: 'consentAll', yes: 'consentYes', no: 'consentNo' } as const
const presetWords = { '7d': 'last7', '28d': 'last28', '90d': 'last90', month: 'lastMonth', year: 'last365', custom: 'customDates' } as const

export function ReportFiltersPanel({ value, options, busy, onChange }: {
  value: ReportFilters; options?: InsightsReport['filter_options']; busy: boolean; onChange: (value: Partial<ReportFilters>) => void
}) {
  const boot = useBoot(), say = useReportWords(), { i18n } = useTranslation()
  const [window, setWindow] = useState<'members' | 'dates' | null>(null)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(preference) === 'true' } catch { return false } })
  const defaults = reportFilters('', boot.venue.today), isDefault = JSON.stringify(value) === JSON.stringify(defaults)
  const date = (day: string) => formatDate(day, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
  const period = `${date(value.from)} – ${date(value.to)}`
  const change = <K extends keyof ReportFilters>(key: K, next: ReportFilters[K]) => onChange({ [key]: next })
  const toggle = () => { setHidden(!hidden); try { localStorage.setItem(preference, String(!hidden)) } catch { /* Storage may be disabled. */ } }
  const resetMembers = () => onChange({ tier_id: '', state: 'all', consent: 'all' })
  const chips = [
    ...(value.tier_id ? [{ key: 'tier_id' as const, label: say('level'), text: value.tier_id === 'none' ? say('noLevel') : boot.programme.tiers.find(t => String(t.id) === value.tier_id)?.name ?? say('allLevels'), clear: '' }] : []),
    ...(value.state !== 'all' ? [{ key: 'state' as const, label: say('memberState'), text: say(stateWords[value.state]), clear: 'all' as const }] : []),
    ...(value.consent !== 'all' ? [{ key: 'consent' as const, label: say('emailConsent'), text: say(consentWords[value.consent]), clear: 'all' as const }] : []),
  ]
  const choosePeriod = (next: ReportPreset) => {
    if (next === 'custom') setWindow('dates')
    else onChange(presetRange(next, boot.venue.today))
  }
  return <section className="l-ov-panel l-in-filter-panel" aria-label={say('filters')}>
    <div className="l-in-filter-heading">
      <button className="l-in-filter-toggle" type="button" onClick={toggle} aria-expanded={!hidden} aria-controls="report-filter-fields"><SlidersHorizontal size={16} aria-hidden /><span>{say(hidden ? 'showFilters' : 'hideFilters')}</span><ChevronDown size={14} aria-hidden /></button>
      <span className="l-in-filter-status" role="status" aria-live="polite">{busy ? say('updatingReport') : say('autoUpdates')}</span>
      {!isDefault && <button className="l-in-reset" type="button" onClick={() => onChange(defaults)}><RotateCcw size={14} aria-hidden />{say('resetFilters')}</button>}
    </div>
    <div id="report-filter-fields" hidden={hidden} className="l-in-filter-toolbar">
      <div className="l-in-period-control"><CalendarDays size={18} aria-hidden /><div><label htmlFor="report-period">{say('period')}</label><select id="report-period" value={window === 'dates' ? 'custom' : selectedPreset(value, boot.venue.today)} onChange={e => choosePeriod(e.target.value as ReportPreset)}>{Object.entries(presetWords).map(([key, word]) => <option key={key} value={key}>{say(word)}</option>)}</select></div><button type="button" className="l-in-date-link" aria-label={say('editDates')} onClick={() => setWindow('dates')}>{period}</button></div>
      <label className="l-in-compare-control">{say('compare')}<select aria-label={say('compare')} value={value.compare} onChange={e => change('compare', e.target.value as ReportFilters['compare'])}><option value="previous">{say('previous')}</option><option value="none">{say('none')}</option></select></label>
      <button className="l-in-member-filter-button" type="button" aria-haspopup="dialog" onClick={() => setWindow('members')}><SlidersHorizontal size={16} aria-hidden />{say('memberFilters')}{chips.length > 0 && <span>{chips.length}</span>}<ChevronDown size={14} aria-hidden /></button>
    </div>
    {(hidden || chips.length > 0) && <div className="l-in-filter-summary" aria-label={say('appliedFilters')}>
      {hidden && <><span>{period}</span><span>{say(value.compare === 'previous' ? 'previous' : 'none')}</span></>}
      {chips.map(chip => <button key={chip.key} type="button" aria-label={say('removeFilter', { name: chip.label })} onClick={() => change(chip.key, chip.clear)}><span>{chip.text}</span><X size={12} aria-hidden /></button>)}
    </div>}
    {window === 'members' && <OverviewDialog kind="form" className="l-in-dialog l-in-filter-window" title={say('memberFilters')} onClose={() => setWindow(null)}>
      <p className="l-in-window-intro">{say('memberFiltersLine')}</p>
      <div className="l-in-member-fields">
        <label>{say('level')}<select aria-label={say('level')} value={value.tier_id} onChange={e => change('tier_id', e.target.value)}><option value="">{say('allLevels')}</option><option value="none">{say('noLevel')}</option>{boot.programme.tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>{say('memberState')}<select aria-label={say('memberState')} disabled={!options} value={value.state} onChange={e => change('state', e.target.value as ReportFilters['state'])}>{(options?.states ?? [value.state]).map(key => <option key={key} value={key}>{say(stateWords[key])}</option>)}</select></label>
        <label>{say('emailConsent')}<select aria-label={say('emailConsent')} disabled={!options} value={value.consent} onChange={e => change('consent', e.target.value as ReportFilters['consent'])}>{(options?.consents ?? [value.consent]).map(key => <option key={key} value={key}>{say(consentWords[key])}</option>)}</select></label>
      </div>
      <div className="l-in-window-footer"><span role="status">{say(busy ? 'updatingReport' : 'autoUpdates')}</span>{chips.length > 0 && <button type="button" className="l-in-reset" onClick={resetMembers}><RotateCcw size={14} aria-hidden />{say('resetMembers')}</button>}</div>
      <details className="l-in-filter-about"><summary>{say('reportScope')}</summary><p>{say('scopeCurrent')}</p></details>
    </OverviewDialog>}
    {window === 'dates' && <ReportDateWindow value={value} onChange={onChange} onClose={() => setWindow(null)} />}
  </section>
}

function ReportDateWindow({ value, onChange, onClose }: { value: ReportFilters; onChange: (value: Partial<ReportFilters>) => void; onClose: () => void }) {
  const boot = useBoot(), say = useReportWords()
  const source = JSON.stringify(value)
  const [dates, setDates] = useState({ source, from: value.from, to: value.to })
  if (dates.source !== source) setDates({ source, from: value.from, to: value.to })
  const next = { ...value, from: dates.from, to: dates.to }
  const valid = validReportRange(next, boot.venue.today)
  const dirty = dates.from !== value.from || dates.to !== value.to
  useEffect(() => {
    if (!valid || !dirty) return
    const timer = setTimeout(() => onChange({ from: dates.from, to: dates.to }), 350)
    return () => clearTimeout(timer)
  }, [dates, valid, dirty, value, onChange])
  const close = () => { if (valid && dirty) onChange({ from: dates.from, to: dates.to }); onClose() }
  return <OverviewDialog kind="form" className="l-in-dialog l-in-filter-window" title={say('customDates')} onClose={close}>
    <p className="l-in-window-intro">{say('customDatesLine')}</p>
    <div className="l-in-filter-dates"><label>{say('start')}<input required type="date" value={dates.from} max={shiftDay(boot.venue.today, -1)} onChange={e => setDates(d => ({ ...d, from: e.target.value }))} aria-invalid={!valid} aria-describedby={!valid ? 'report-range-error' : undefined} /></label><label>{say('end')}<input required type="date" max={shiftDay(boot.venue.today, -1)} value={dates.to} onChange={e => setDates(d => ({ ...d, to: e.target.value }))} aria-invalid={!valid} aria-describedby={!valid ? 'report-range-error' : undefined} /></label></div>
    {!valid && <p className="l-in-filter-error" role="alert" id="report-range-error">{say('rangeError')}</p>}
    <p className="l-in-window-note" role="status">{say(valid ? 'autoUpdates' : 'datesNotApplied')}</p>
  </OverviewDialog>
}
