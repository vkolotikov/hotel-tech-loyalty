import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../LoyaltyProvider'
import { OverviewButton } from '../overview/OverviewUI'
import { decimal, named } from '../lib/forms'
import { amountOf, points } from '../lib/format'
import { examplePoints, thresholds, typedValue } from '../program/programMath'
import { THRESHOLD_WORDS, VALUE_PHRASE_WORDS } from '../program/words'
import type { Program, Tier, TierBenefit } from '../program/types'
import { useRedesignWords } from '../redesign/words'
import { ManagementColumns, ManagementFact, ManagementHeading, ManagementIcon, ManagementPanel, ManagementSelection, ManagementStatus, ManagementVisual } from './ManagementUI'
import { adminAssets } from './assets'
import { focusManagementSelection } from './selection'
import { TierAssignmentEditor } from './TierAssignmentEditor'
import { ProgrammeSettings } from './ProgrammeSettings'
import { ProgrammeReadiness, TierChecks } from './ProgrammeReadiness'
import { useAdminWords } from './words'
import { LEVELS, QUALIFICATION, READINESS, SETUP } from './navigation'

export function LevelsPage({ program, manage }: { program: Program; manage: boolean }) {
  const say = useAdminWords(), rd = useRedesignWords(), { t, i18n } = useTranslation(), boot = useBoot()
  const location = useLocation(), navigate = useNavigate(), params = new URLSearchParams(location.search)
  const [assignment, setAssignment] = useState<{ tier: Tier; current: TierBenefit | null } | null>(null)
  if (params.get('settings') === 'qualification') return <ProgrammeSettings kind="qualification" />
  if (params.has('checks')) return <ProgrammeReadiness program={program} />
  const selected = program.tiers.find(t => String(t.id) === params.get('selected')) ?? program.tiers[0]
  const by = boot.programme.progress_by ?? 'points'
  const thresholdLabel = t(`loyalty.program.threshold.${by}`, THRESHOLD_WORDS[by])
  const floor = (tier: Tier) => thresholds(tier, by).map(x => {
    const label = named('loyalty.program.threshold', THRESHOLD_WORDS, x.kind)
    return x.value === null ? say('missingThreshold') : `${x.kind === 'spend' ? amountOf('fixed_amount', x.value, boot.venue.currency, i18n.language) : points(x.value, i18n.language)}${thresholds(tier, by).length > 1 ? ` ${label ? t(...label) : x.kind}` : ''}`
  }).join(' · ')
  const status = (tier: Tier) => <ManagementStatus state={tier.is_active ? 'active' : 'off'}>{t(tier.is_active ? 'loyalty.program.active' : 'loyalty.program.switched_off', tier.is_active ? 'Active' : 'Switched off')}</ManagementStatus>
  const icon = (i: number) => (['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const)[i % 5]
  const missing = program.advice?.find(a => a.code === 'tiers_missing_threshold')
  const entry = (tier: Tier) => thresholds(tier, by).every(x => x.value === 0)
  const perkIcon = (tb: TierBenefit) => tb.value_type === 'percent_discount' || tb.category === 'discount' ? 'perkPercent' : tb.category === 'dining' ? 'perkDrink' : tb.category === 'accommodation' ? 'perkBed' : tb.category === 'wellness' ? 'perkSun' : 'perkClock'
  return <div className="l-ad-page"><ManagementHeading title={say('levels')} line={say('levelsLine')}>
    {manage && <><Link className="l-ov-button" to={SETUP}>{rd('guidedSetup')}</Link><OverviewButton primary onClick={() => navigate(`${LEVELS}&tier=new`)}>{rd('addLevel')}</OverviewButton></>}
  </ManagementHeading>
    {!manage && <p data-read-only="">{t('loyalty.program.read_only', 'Only an owner or a manager can change the programme.')}</p>}
    <div className="l-ad-summary"><ManagementFact icon="steps" label={say('qualification')}><strong>{t(`loyalty.options.choice.tier_progress_by.${by}`, by)}</strong></ManagementFact><span className="l-ad-summary-note">{by === 'visits' ? say('dailyVisit') : say('qualificationNote')}</span><div className="l-ad-actions">{missing && <Link to={READINESS}><ManagementStatus state="missing">{say('thresholdsMissing', missing.params)}</ManagementStatus></Link>}<Link className="l-ov-button" to={QUALIFICATION}>{say(manage ? 'editRules' : 'qualification')}</Link></div></div>
    <ManagementColumns><div className="l-ad-stack"><ManagementPanel className="l-ad-ladder" title={say('tierPath')} count={<span>{say('activeLevels', { n: program.tiers.filter(t => t.is_active).length })} · {say('membersCount', { n: points(program.tiers.reduce((n,t) => n + t.members, 0), i18n.language) })}</span>}>
      <div className="l-ad-labels" aria-hidden><span>{rd('level')}</span><span>{thresholdLabel}</span><span>{say('earnRate')}</span><span>{t('loyalty.members.title', 'Members')}</span><span /></div>
      <ul className="l-ad-list">{program.tiers.map((tier, i) => <li key={tier.id} className="l-ad-row" data-record={`tier-${tier.id}`} data-selected={selected?.id === tier.id || undefined}><button type="button" aria-pressed={selected?.id === tier.id} onClick={() => { navigate(`${LEVELS}&selected=${tier.id}`, { replace: true }); focusManagementSelection() }}><span className="l-ad-identity"><ManagementIcon kind={icon(i)} tone={['gold', 'neutral', 'gold', 'violet', 'cyan'][i % 5]} /><span className="l-ad-row-name"><strong>{tier.name}</strong><small>{tier.is_active ? say('tierPosition', { n: i + 1, total: program.tiers.length }) : t('loyalty.program.switched_off', 'Switched off')}</small></span></span><span className="l-ad-threshold" data-kind={thresholds(tier, by).some(x => x.value === null) ? 'missing' : entry(tier) ? 'entry' : undefined}>{entry(tier) ? say('onJoining') : floor(tier)}</span><span className="l-ad-tier-rate">×{decimal(tier.earn_rate, i18n.language)}</span><span className="l-ad-tier-members">{points(tier.members, i18n.language)}</span><img className="l-ad-chevron" src={adminAssets.chevron.src} width={16} height={16} alt="" /></button></li>)}</ul>
      {!program.tiers.length && <p>{t('loyalty.program.get_started.tiers.line', 'A tier is a level members reach, such as Silver or Gold, with its own earn rate and benefits. The programme starts once a tier is in use.')}</p>}
    </ManagementPanel><details className="l-ad-more"><summary>{say('readiness')}</summary><TierChecks program={program} /><Link className="l-ov-link" to={READINESS}>{say('readiness')}</Link></details></div>
      {selected && <ManagementSelection title={selected.name} heading={say('selectedTier')} status={status(selected)} onEdit={manage ? () => navigate(`${LEVELS}&tier=${selected.id}`) : undefined}>
        <ManagementVisual art="tierCard" tone="gold" label={say('tierPosition', { n: program.tiers.indexOf(selected) + 1, total: program.tiers.length })} title={selected.name} line={<Link to={`/loyalty?tier=${selected.id}`}>{say('membersCount', { n: points(selected.members, i18n.language) })}</Link>} />
        <div className="l-ad-inset l-ad-tier-outcome"><div><small>{say('earnRate')}</small><strong>×{decimal(selected.earn_rate, i18n.language)}</strong></div><div><small>{say('baseExample')}</small><p className="l-ad-conversion">{say('basePointsShort', { n: 100 })}<img src={adminAssets.arrow.src} width={16} height={16} alt="" />{say('pointsShort', { n: points(examplePoints(String(selected.earn_rate)) ?? 100, i18n.language) })}</p></div></div>
        <div className="l-ad-panel-head"><h3>{say('includedPerks')}</h3>{manage && <OverviewButton onClick={() => setAssignment({ tier: selected, current: null })}>+ {say('addPerk')}</OverviewButton>}</div>
        <ul className="l-ad-perks">{selected.benefits.map(tb => <li key={tb.id}><button disabled={!manage} onClick={() => setAssignment({ tier: selected, current: tb })}><img src={adminAssets[perkIcon(tb)].src} width={17} height={17} alt="" /><span><strong>{tb.name}</strong><small>{typedValue(tb) && VALUE_PHRASE_WORDS[tb.value_type] ? t(`loyalty.program.value_phrase.${tb.value_type}`, VALUE_PHRASE_WORDS[tb.value_type], { amount: amountOf(tb.value_type, tb.value_amount!, boot.venue.currency, i18n.language) }) : tb.value}</small></span></button></li>)}</ul>
        {!selected.benefits.length && <p className="l-ad-muted">{say('noPerks')}</p>}
        <Link className="l-ov-link" to={`/loyalty/rewards?tab=benefits&level=${selected.id}`}>{say('manageAssignment')}</Link>
        {selected.description && <p className="l-ad-muted">{selected.description}</p>}
      </ManagementSelection>}
    </ManagementColumns>
    {assignment && <TierAssignmentEditor program={program} tierId={assignment.tier.id} current={assignment.current} onClose={() => setAssignment(null)} />}
  </div>
}
