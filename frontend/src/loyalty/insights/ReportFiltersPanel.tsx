import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import { useBoot } from '../LoyaltyProvider'
import { OverviewButton } from '../overview/OverviewUI'
import { presetRange, reportFilters, selectedPreset, shiftDay, validReportRange, type ReportPreset } from './reportMath'
import type { InsightsReport, ReportFilters } from './reportTypes'
import { useReportWords } from './reportWords'

const preference = 'loyalty:insights-filters-hidden'
const stateWords = { all: 'stateAll', active: 'stateActive', inactive: 'stateInactive' } as const
const consentWords = { all: 'consentAll', yes: 'consentYes', no: 'consentNo' } as const
const presetWords = { '7d': 'last7', '28d': 'last28', '90d': 'last90', month: 'lastMonth', year: 'last365', custom: 'customDates' } as const

export function ReportFiltersPanel({ value, options, busy, onApply }: {
  value: ReportFilters; options?: InsightsReport['filter_options']; busy: boolean; onApply: (value: ReportFilters) => void
}) {
  const boot = useBoot(), say = useReportWords(), { i18n } = useTranslation()
  const [draft, setDraft] = useState(value)
  const [preset, setPreset] = useState<ReportPreset>(() => selectedPreset(value, boot.venue.today))
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(preference) === 'true' } catch { return false } })
  const valid = validReportRange(draft, boot.venue.today), dirty = JSON.stringify(draft) !== JSON.stringify(value)
  const defaults = reportFilters('', boot.venue.today), isDefault = JSON.stringify(value) === JSON.stringify(defaults)
  const date = (v: string) => formatDate(v, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
  const level = value.tier_id === 'none' ? say('noLevel') : boot.programme.tiers.find(t => String(t.id) === value.tier_id)?.name ?? say('allLevels')
  const change = <K extends keyof ReportFilters>(key: K, next: ReportFilters[K]) => setDraft(d => ({ ...d, [key]: next }))
  const toggle = () => { setHidden(!hidden); try { localStorage.setItem(preference, String(!hidden)) } catch { /* Storage may be disabled. */ } }
  const choosePreset = (next: ReportPreset) => { setPreset(next); if (next !== 'custom') setDraft(d => ({ ...d, ...presetRange(next, boot.venue.today) })) }
  return <section className="l-ov-panel l-in-filter-panel" aria-label={say('filters')}>
    <div className="l-in-filter-heading"><button className="l-in-filter-toggle" type="button" onClick={toggle} aria-expanded={!hidden} aria-controls="report-filter-fields"><SlidersHorizontal size={16} aria-hidden /><span>{say(hidden ? 'showFilters' : 'hideFilters')}</span><ChevronDown size={16} aria-hidden /></button>
      <div className="l-in-filter-tools">{dirty && <span role="status">{say('unapplied')}</span>}<OverviewButton type="button" disabled={isDefault && !dirty} onClick={() => { setDraft(defaults); setPreset('28d'); onApply(defaults) }}>{say('resetFilters')}</OverviewButton></div>
    </div>
    <div className="l-in-filter-summary" aria-label={say('appliedFilters')}><span>{date(value.from)} – {date(value.to)}</span><span>{say(value.compare === 'previous' ? 'previous' : 'none')}</span><span>{level}</span><span>{say(stateWords[value.state])}</span>{value.consent !== 'all' && <span>{say(consentWords[value.consent])}</span>}</div>
    <form id="report-filter-fields" hidden={hidden} onSubmit={e => { e.preventDefault(); if (valid && dirty && !busy) onApply(draft) }}>
      <div className="l-in-filter-fields">
        <label>{say('period')}<select aria-label={say('period')} value={preset} onChange={e => choosePreset(e.target.value as ReportPreset)}>{Object.entries(presetWords).map(([key, word]) => <option key={key} value={key}>{say(word)}</option>)}</select></label>
        <label>{say('compare')}<select aria-label={say('compare')} value={draft.compare} onChange={e => change('compare', e.target.value as ReportFilters['compare'])}><option value="previous">{say('previous')}</option><option value="none">{say('none')}</option></select></label>
        <label>{say('level')}<select aria-label={say('level')} value={draft.tier_id} onChange={e => change('tier_id', e.target.value)}><option value="">{say('allLevels')}</option><option value="none">{say('noLevel')}</option>{boot.programme.tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>{say('memberState')}<select aria-label={say('memberState')} disabled={!options} value={draft.state} onChange={e => change('state', e.target.value as ReportFilters['state'])}>{(options?.states ?? [draft.state]).map(key => <option key={key} value={key}>{say(stateWords[key])}</option>)}</select></label>
        <label>{say('emailConsent')}<select aria-label={say('emailConsent')} disabled={!options} value={draft.consent} onChange={e => change('consent', e.target.value as ReportFilters['consent'])}>{(options?.consents ?? [draft.consent]).map(key => <option key={key} value={key}>{say(consentWords[key])}</option>)}</select></label>
      </div>
      {preset === 'custom' && <div className="l-in-filter-dates"><label>{say('start')}<input required type="date" max={draft.to} value={draft.from} onChange={e => change('from', e.target.value)} aria-invalid={!valid} aria-describedby={!valid ? 'report-range-error' : undefined} /></label><label>{say('end')}<input required type="date" min={draft.from} max={shiftDay(boot.venue.today, -1)} value={draft.to} onChange={e => change('to', e.target.value)} aria-invalid={!valid} aria-describedby={!valid ? 'report-range-error' : undefined} /></label></div>}
      {!valid && <p className="l-in-filter-error" role="alert" id="report-range-error">{say('rangeError')}</p>}
      <div className="l-in-filter-bottom"><p>{say('scopeCurrent')}</p><div>{dirty && <OverviewButton type="button" onClick={() => { setDraft(value); setPreset(selectedPreset(value, boot.venue.today)) }}>{say('discardChanges')}</OverviewButton>}<OverviewButton primary type="submit" disabled={!valid || !dirty || busy}>{say('apply')}</OverviewButton></div></div>
    </form>
  </section>
}
