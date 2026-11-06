import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SideMenu } from '../../../workspace/shell/SideMenu'
import type { ThemeName } from '../../../workspace/theme/accent'
import { OverviewButton } from '../../overview/OverviewUI'
import { useRedesignWords } from '../../redesign/words'
import { FormField } from '../../ui/formParts'
import { TierChip } from '../../ui/TierChip'
import { decimal, chosenTiers } from '../../lib/forms'
import { points, when } from '../../lib/format'
import { boostState, examplePoints, needsTimeCheck, weekdaysText } from '../programMath'
import { BOOST_STATE_WORDS } from '../words'
import type { Boost, Program } from '../types'
import { programAssets } from './assets'

/** The server decides live/upcoming; filters only narrow its complete programme answer. */
export function BoostDirectory({ program, manage, theme, locale, timeZone, onEdit, onRemove }: {
  program: Program; manage: boolean; theme: ThemeName; locale: string; timeZone: string;
  onEdit: (boost: Boost) => void; onRemove: (boost: Boost) => void;
}) {
  const { t } = useTranslation(), say = useRedesignWords()
  const [q, setQ] = useState(''), [status, setStatus] = useState('liveUpcoming'), [sort, setSort] = useState('start'), [selectedId, setSelectedId] = useState<number | null>(null)
  const rows = program.boosts.filter(b => b.name.toLocaleLowerCase(locale).includes(q.toLocaleLowerCase(locale)) && (status === 'all' || (status === 'liveUpcoming' ? ['live', 'upcoming'].includes(boostState(b.state)) : boostState(b.state) === status)))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, locale) : (a.starts_at ?? '').localeCompare(b.starts_at ?? '') || a.id - b.id)
  const selected = rows.find(b => b.id === selectedId) ?? rows[0]
  const stateName = (state: string) => t(`loyalty.program.boost_state.${state}`, BOOST_STATE_WORDS[state])
  const clear = () => { setQ(''); setStatus('all'); setSort('start') }
  const statePill = (b: Boost) => {
    const state = boostState(b.state)
    return <span className="l-pg-pill" data-tone={state === 'live' ? 'green' : state === 'upcoming' ? 'cyan' : 'neutral'}><img src={state === 'live' ? programAssets.activeDot : state === 'upcoming' ? programAssets.upcomingDot : programAssets.entryDot} alt="" />{stateName(state)}</span>
  }
  return <div className="l-pg-boost-columns">
    <div className="l-pg-boost-main">
      <section className="l-ov-panel l-pg-boost-directory" aria-labelledby="program-boosts">
        <h2 id="program-boosts"><span className="l-pg-icon" data-tone="green"><img src={programAssets.calendar} alt="" /></span>{status === 'liveUpcoming' ? say('pgLiveUpcoming') : t('loyalty.program.boosts.title', 'Boost events')}</h2>
        <div className="l-pg-boost-filters">
          <FormField label={say('pgSearchBoost')}><input type="search" value={q} maxLength={100} placeholder={say('pgSearchBoostHint')} onChange={e => setQ(e.target.value)} /></FormField>
          <FormField label={say('status')}><select value={status} onChange={e => setStatus(e.target.value)}><option value="liveUpcoming">{say('pgLiveUpcoming')}</option><option value="all">{say('allStates')}</option>{Object.keys(BOOST_STATE_WORDS).map(key => <option key={key} value={key}>{stateName(key)}</option>)}</select></FormField>
          <FormField label={say('sort')}><select value={sort} onChange={e => setSort(e.target.value)}><option value="start">{say('pgStartDate')}</option><option value="name">{t('loyalty.program.boost.name', 'Name')}</option></select></FormField>
        </div>
        <ul className="l-pg-boost-list">{rows.map(b => <li key={b.id} data-boost={b.id} data-selected={selected?.id === b.id || undefined} className="l-pg-boost-row">
          <span className="l-pg-icon" data-tone={boostState(b.state) === 'live' ? 'green' : 'cyan'}><img src={boostState(b.state) === 'live' ? programAssets.calendar : programAssets.liveCalendar} alt="" /></span>
          <button className="l-pg-boost-identity" aria-pressed={selected?.id === b.id} onClick={() => setSelectedId(b.id)}><strong>{b.name}</strong><small>{when(b.starts_at, locale, timeZone)} → {when(b.ends_at, locale, timeZone)}</small>{needsTimeCheck(b) && <small data-time-check="">{t('loyalty.program.time_check.confirm_title', 'Are these times right?')}</small>}</button>
          <span className="l-pg-boost-value">×{decimal(b.multiplier, locale)}</span>{statePill(b)}
          <OverviewButton className="l-pg-row-arrow" aria-label={b.name} aria-pressed={selected?.id === b.id} onClick={() => setSelectedId(b.id)}>→</OverviewButton>
        </li>)}</ul>
        {!rows.length && <div className="l-pg-empty"><p>{say('pgNoResults')}</p><OverviewButton onClick={clear}>{say('pgClearFilters')}</OverviewButton></div>}
      </section>
      <section className="l-ov-panel l-pg-schedule-note"><h2><img src={programAssets.liveCalendar} alt="" />{say('pgBeforeSchedule')}</h2><p>{say('pgCheckTimes')}</p><p>{say('pgCheckMultipliers')}</p><p>{say('pgCheckOverlap')}</p><Link className="l-ov-link" to="/loyalty/options?tab=rules">{say('pgReviewRules')}</Link></section>
    </div>
    {selected && <aside className="l-ov-panel l-pg-boost-preview" aria-label={selected.name}>
      <div className="l-pg-preview-state">{statePill(selected)}</div><h2>{selected.name}</h2>
      <section className="l-pg-boost-example"><small>{t('loyalty.program.boost.multiplier', 'Multiplier')}</small><strong>×{decimal(selected.multiplier, locale)} {t('loyalty.member.points', 'Points')}</strong><p>{say('rateExample', { n: points(examplePoints(String(selected.multiplier)) ?? 0, locale) })}</p><small>{say('pgExampleBefore')}</small></section>
      <dl><div><dt>{t('loyalty.program.boost.starts_at', 'Starts')}</dt><dd>{when(selected.starts_at, locale, timeZone)}</dd></div><div><dt>{t('loyalty.program.boost.ends_at', 'Ends')}</dt><dd>{when(selected.ends_at, locale, timeZone)}</dd></div><div><dt>{t('loyalty.program.boost.weekdays', 'Weekdays')}</dt><dd>{weekdaysText(selected.days_of_week, locale) || t('loyalty.program.boosts.every_day', 'Every day')}</dd></div></dl>
      <small>{t('loyalty.program.boost.clock_hint', 'On the venue’s clock ({{zone}}).', { zone: timeZone })}</small>
      {needsTimeCheck(selected) && <p data-time-check-detail="" className="l-pg-time-warning">{t('loyalty.program.time_check.row', 'Check the time: saved before boost times were read on the venue’s clock everywhere. If it was last saved in the full admin, it may start and end hours off. Open it, check the times and save.')}</p>}
      <div className="l-pg-eligible-tiers">{chosenTiers(selected.tier_ids, program.tiers).length ? chosenTiers(selected.tier_ids, program.tiers).map(tier => <TierChip key={tier.id} tier={tier} theme={theme} size="sm" />) : <span>{t('loyalty.program.boosts.every_tier', 'Every tier')}</span>}</div>
      <div className="l-pg-eligible-note"><strong>{say('pgEligibleOnly')}</strong><small>{say('pgMultiplierRules')}</small>{selected.description && <p>{selected.description}</p>}</div>
      {manage && <div className="l-rd-actions"><OverviewButton primary aria-label={`${t('loyalty.program.edit', 'Edit')} ${selected.name}`} onClick={() => onEdit(selected)}>{t('loyalty.program.edit', 'Edit')}</OverviewButton><SideMenu kind="menu" named place="down-right" label={`${t('loyalty.membership.more.label', 'More')} ${selected.name}`} buttonClassName="l-ov-button" listClassName="w-56" face="…"><button role="menuitem" className="l-rd-menu-item" onClick={() => onRemove(selected)}>{t('loyalty.program.boosts.remove', 'Remove')}</button></SideMenu></div>}
    </aside>}
  </div>
}
