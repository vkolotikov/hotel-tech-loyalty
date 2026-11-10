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
import { ManagementColumns, ManagementFact, ManagementHeading, ManagementLabels, ManagementPanel, ManagementRow, ManagementSelection, ManagementStatus, ManagementVisual } from './ManagementUI'
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
  const floor = (tier: Tier) => thresholds(tier, by).map(x => {
    const label = named('loyalty.program.threshold', THRESHOLD_WORDS, x.kind)
    return x.value === null ? say('missingThreshold') : `${x.kind === 'spend' ? amountOf('fixed_amount', x.value, boot.venue.currency, i18n.language) : points(x.value, i18n.language)} ${label ? t(...label) : x.kind}`
  }).join(' · ')
  const status = (tier: Tier) => <ManagementStatus state={tier.is_active ? 'active' : 'off'}>{t(tier.is_active ? 'loyalty.program.active' : 'loyalty.program.switched_off', tier.is_active ? 'Active' : 'Switched off')}</ManagementStatus>
  const icon = (i: number) => (['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const)[i % 5]
  return <div className="l-ad-page"><ManagementHeading title={say('levels')} line={say('levelsLine')}>
    <Link className="l-ov-button" to={READINESS}>{say('readiness')}</Link>{manage && <><Link className="l-ov-button" to={SETUP}>{rd('guidedSetup')}</Link><OverviewButton primary onClick={() => navigate(`${LEVELS}&tier=new`)}>+ {rd('addLevel')}</OverviewButton></>}
  </ManagementHeading>
    {!manage && <p data-read-only="">{t('loyalty.program.read_only', 'Only an owner or a manager can change the programme.')}</p>}
    <div className="l-ad-summary"><ManagementFact icon="steps" label={say('qualification')}><strong>{t(`loyalty.options.choice.tier_progress_by.${by}`, by)}</strong><p>{say('qualificationNote')}</p></ManagementFact><Link className="l-ov-link" to={QUALIFICATION}>{say(manage ? 'editRules' : 'qualification')}</Link></div>
    <ManagementColumns><div className="l-ad-stack"><ManagementPanel title={say('tierPath')} count={say('activeLevels', { n: program.tiers.filter(t => t.is_active).length })}>
      <ManagementLabels first={say('levels')} value={<span className="l-ad-pair"><span>{say('threshold')}</span><span>{say('earnRate')}</span></span>} status={rd('status')} />
      <ul className="l-ad-list">{program.tiers.map((tier, i) => <ManagementRow key={tier.id} record={`tier-${tier.id}`} icon={icon(i)} title={tier.name} caption={say('membersCount', { n: points(tier.members, i18n.language) })} value={<span className="l-ad-pair"><span>{floor(tier)}</span><strong>×{decimal(tier.earn_rate, i18n.language)}</strong></span>} status={status(tier)} selected={selected?.id === tier.id} tone={i === 2 ? 'gold' : 'cyan'} onSelect={() => navigate(`${LEVELS}&selected=${tier.id}`, { replace: true })} />)}</ul>
      {!program.tiers.length && <p>{t('loyalty.program.get_started.tiers.line', 'A tier is a level members reach, such as Silver or Gold, with its own earn rate and benefits. The programme starts once a tier is in use.')}</p>}
    </ManagementPanel><TierChecks program={program} /></div>
      {selected && <ManagementSelection title={selected.name} status={status(selected)} onEdit={manage ? () => navigate(`${LEVELS}&tier=${selected.id}`) : undefined}>
        <ManagementVisual art="tierCard" tone="gold" label={say('selectedTier', { name: selected.name })} title={selected.name} line={selected.description || floor(selected)} />
        <ManagementFact icon="steps" label={say('threshold')}>{floor(selected)}</ManagementFact>
        <ManagementFact icon="coins" label={say('earnRate')}>×{decimal(selected.earn_rate, i18n.language)}</ManagementFact>
        <div className="l-ad-inset"><small>{say('example')}</small><p>{rd('rateExample', { n: points(examplePoints(String(selected.earn_rate)) ?? 100, i18n.language) })}</p></div>
        <Link className="l-ov-link" to={`/loyalty?tier=${selected.id}`}>{say('membersCount', { n: points(selected.members, i18n.language) })}</Link>
        <div className="l-ad-panel-head"><h3>{say('includedPerks')}</h3>{manage && <button className="l-ov-link" onClick={() => setAssignment({ tier: selected, current: null })}>+ {say('addPerk')}</button>}</div>
        <ul className="l-ad-perks">{selected.benefits.map(tb => <li key={tb.id}><button disabled={!manage} onClick={() => setAssignment({ tier: selected, current: tb })}><span><strong>{tb.name}</strong><small>{typedValue(tb) && VALUE_PHRASE_WORDS[tb.value_type] ? t(`loyalty.program.value_phrase.${tb.value_type}`, VALUE_PHRASE_WORDS[tb.value_type], { amount: amountOf(tb.value_type, tb.value_amount!, boot.venue.currency, i18n.language) }) : tb.value}</small></span></button></li>)}</ul>
        {!selected.benefits.length && <p className="l-ad-muted">{say('noPerks')}</p>}
        <Link className="l-ov-link" to={`/loyalty/rewards?tab=benefits&level=${selected.id}`}>{say('manageAssignment')}</Link>
      </ManagementSelection>}
    </ManagementColumns>
    {assignment && <TierAssignmentEditor program={program} tierId={assignment.tier.id} current={assignment.current} onClose={() => setAssignment(null)} />}
  </div>
}
