import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../LoyaltyProvider'
import { points, when } from '../lib/format'
import { decimal } from '../lib/forms'
import { useSay, wayTitle } from '../options/say'
import { isOn, sentenceOf } from '../options/optionsMath'
import type { OptionsAnswer } from '../options/types'
import { OverviewButton } from '../overview/OverviewUI'
import { PROGRAM_KEY, programApi } from '../program/api'
import { BoostDialog } from '../program/BoostDialog'
import { ConfirmTimes, RemoveBoost } from '../program/ProgramPage'
import { boostState, needsTimeCheck, timeCheckList, weekdaysText } from '../program/programMath'
import { BOOST_STATE_WORDS } from '../program/words'
import type { Boost } from '../program/types'
import type { EarnGuard } from '../earn/useLeaveGuard'
import { useEarnWords } from '../earn/words'
import { LoadFailed } from '../options/parts'
import { useAdminWords } from './words'
import { earningIcon } from './earningIcon'
import { ManagementColumns, ManagementFact, ManagementHeading, ManagementPanel, ManagementRow, ManagementSelection, ManagementStatus, ManagementVisual, ManagementOutcome } from './ManagementUI'
import { BONUSES } from './navigation'

export function BonusBoostsPage({ answer, guard }: { answer: OptionsAnswer; guard: EarnGuard }) {
  const query = useQuery({ queryKey: PROGRAM_KEY, queryFn: programApi.program }), program = query.data
  const admin = useAdminWords(), say = useEarnWords(), oldSay = useSay(), { t, i18n } = useTranslation(), boot = useBoot(), location = useLocation()
  const [open, setOpen] = useState<{ kind: 'edit' | 'remove'; boost: Boost | null } | { kind: 'times'; boosts: Boost[] } | null>(null)
  const params = new URLSearchParams(location.search), boostId = params.get('boost')
  const ways = answer.ways.filter(w => ['welcome_bonus', 'birthday_bonus', 'referrals'].includes(w.key))
  const chosenBoost = program?.boosts.find(b => String(b.id) === boostId)
  const selected = boostId ? undefined : ways.find(w => w.key === params.get('selected')) ?? ways[0]
  const text = (key: string) => sentenceOf(key, answer.options, { say: oldSay, currency: boot.venue.currency, locale: i18n.language, rewards: answer.catalogue.rewards })
  const badge = (state: string) => <ManagementStatus state={state}>{state === 'active' ? say('active') : state === 'off' ? say('off') : t(`loyalty.program.boost_state.${state}`, BOOST_STATE_WORDS[state] ?? state)}</ManagementStatus>
  const close = () => { setOpen(null); if (boostId === 'new') guard.go(BONUSES) }
  const timeChecks = timeCheckList(program?.boosts ?? [])
  return <div className="l-ad-page"><ManagementHeading title={admin('bonuses')} line={admin('bonusesLine')}>
    <Link className="l-ov-button" to="/loyalty/rewards?tab=referrals">{admin('referralActivity')}</Link>{answer.can_change && <OverviewButton primary onClick={() => setOpen({ kind: 'edit', boost: null })}>+ {t('loyalty.program.boosts.add', 'Add boost')}</OverviewButton>}
  </ManagementHeading><div className="l-ad-summary"><ManagementFact icon="welcome" label={admin('milestones')}><strong>{say('activeMethods', { n: ways.filter(w => isOn(w, answer.options)).length })}</strong></ManagementFact><ManagementFact icon="boost" label={admin('timedBoosts')}><strong>{admin('boostsScheduled', { n: program?.boosts.filter(b => b.state === 'upcoming').length ?? 0 })}</strong></ManagementFact></div><ManagementColumns><div className="l-ad-stack">
    <ManagementPanel title={admin('milestones')}><ul className="l-ad-list">{ways.map(w => <ManagementRow key={w.key} icon={earningIcon(w.key)} tone={w.key === 'birthday_bonus' ? 'gold' : 'violet'} title={wayTitle(oldSay, w.key)} caption={w.key === 'referrals' ? t(`loyalty.options.choice.referral_reward_on.${answer.options.referral_reward_on}`, String(answer.options.referral_reward_on)) : say(w.key === 'birthday_bonus' ? 'birthday' : 'joins')} value={w.key === 'referrals' ? `+${points(Number(answer.options.referrer_bonus_points ?? 0), i18n.language)} / +${points(Number(answer.options.referee_bonus_points ?? 0), i18n.language)}` : `+${admin('pointsShort', { n: points(Number(answer.options[w.zero_off!] ?? 0), i18n.language) })}`} status={badge(isOn(w, answer.options) ? 'active' : 'off')} selected={selected?.key === w.key} onSelect={() => guard.go(`${BONUSES}&selected=${w.key}`)} />)}</ul></ManagementPanel>
    <ManagementPanel title={admin('timedBoosts')} count={admin('boostsScheduled', { n: program?.boosts.filter(b => b.state === 'upcoming').length ?? 0 })}>
      <p className="l-ad-muted">{admin('automaticBoost')}</p>{query.isError && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
      <ul className="l-ad-list">{program?.boosts.map(b => <ManagementRow key={b.id} icon="boostSmall" tone="gold" title={b.name} caption={`${when(b.starts_at, i18n.language, boot.venue.timezone)} – ${when(b.ends_at, i18n.language, boot.venue.timezone)}`} value={`×${decimal(b.multiplier, i18n.language)}`} status={badge(boostState(b.state))} selected={chosenBoost?.id === b.id} onSelect={() => guard.go(`${BONUSES}&boost=${b.id}`)} />)}</ul>
      {!program?.boosts.length && <div className="l-ad-inset"><strong>{admin('weekendExample')}</strong><ManagementOutcome label={admin('example')} from={admin('pointsShort', { n: 100 })} to={admin('pointsShort', { n: 200 })} /></div>}
      {!!timeChecks.length && answer.can_change && <OverviewButton onClick={() => setOpen({ kind: 'times', boosts: timeChecks })}>{t('loyalty.program.time_check.confirm_all', 'These times are right')}</OverviewButton>}
    </ManagementPanel><div className="l-ad-summary"><ManagementFact icon="offerGift" label={admin('claimedOffers')}>{admin('highestWins')}</ManagementFact><Link className="l-ov-link" to="/loyalty/rewards?tab=offers">{t('loyalty.rewards.tab.offers', 'Offers')}</Link></div>
  </div>
    {selected && <ManagementSelection title={wayTitle(oldSay, selected.key)} heading={admin('selectedBonus')} status={badge(isOn(selected, answer.options) ? 'active' : 'off')} onEdit={answer.can_change ? () => guard.go(`${BONUSES}&way=${selected.key}`) : undefined}>
      <ManagementVisual art="referralArt" label={say('memberSees')} title={selected.key === 'referrals' ? `${points(Number(answer.options.referrer_bonus_points ?? 0), i18n.language)} / ${points(Number(answer.options.referee_bonus_points ?? 0), i18n.language)}` : admin('pointsShort', { n: points(Number(answer.options[selected.zero_off!] ?? 0), i18n.language) })} line={selected.key === 'referrals' ? say('referralSummary') : say(selected.key === 'birthday_bonus' ? 'birthday' : 'joins')} />
      <p>{text(selected.key)}</p>
      <ManagementFact icon="people" label={admin('who')}>{say('allLevels')}</ManagementFact><ManagementFact icon="bonusCalendar" label={admin('when')}>{selected.key === 'referrals' ? t(`loyalty.options.choice.referral_reward_on.${answer.options.referral_reward_on}`, String(answer.options.referral_reward_on)) : say(selected.key === 'birthday_bonus' ? 'birthday' : 'joins')}</ManagementFact>
      {selected.key === 'referrals' && <div className="l-ad-summary"><ManagementFact icon="referral" label={t('loyalty.options.field.referrer_bonus_points', 'Points for the member who refers')}>{points(Number(answer.options.referrer_bonus_points ?? 0), i18n.language)}</ManagementFact><ManagementFact icon="welcome" label={t('loyalty.options.field.referee_bonus_points', 'Points for the friend')}>{points(Number(answer.options.referee_bonus_points ?? 0), i18n.language)}</ManagementFact></div>}
    </ManagementSelection>}
    {chosenBoost && <ManagementSelection title={chosenBoost.name} heading={admin('selectedBonus')} status={badge(boostState(chosenBoost.state))} onEdit={answer.can_change ? () => setOpen({ kind: 'edit', boost: chosenBoost }) : undefined}>
      <ManagementVisual art="referralArt" label={admin('automaticBoost')} title={`×${decimal(chosenBoost.multiplier, i18n.language)}`} line={chosenBoost.description} />
      <ManagementFact icon="people" label={admin('who')}>{chosenBoost.tier_ids?.length ? program?.tiers.filter(t => chosenBoost.tier_ids?.includes(t.id)).map(t => t.name).join(' · ') : say('allLevels')}</ManagementFact>
      <ManagementFact icon="bonusCalendar" label={admin('when')}>{when(chosenBoost.starts_at, i18n.language, boot.venue.timezone)} – {when(chosenBoost.ends_at, i18n.language, boot.venue.timezone)}<p>{weekdaysText(chosenBoost.days_of_week, i18n.language) || t('loyalty.program.boosts.every_day', 'Every day')}</p></ManagementFact>
      <p className="l-ad-muted">{admin('highestWins')}</p>{needsTimeCheck(chosenBoost) && <p>{t('loyalty.program.time_check.all_line', 'Some boosts ask for their times to be checked. If the times shown are right, confirm them together.')}</p>}
      {answer.can_change && <details className="l-ad-more"><summary>{admin('advanced')}</summary><OverviewButton onClick={() => setOpen({ kind: 'remove', boost: chosenBoost })}>{t('loyalty.program.boosts.remove', 'Remove')}</OverviewButton></details>}
    </ManagementSelection>}
  </ManagementColumns>
    {answer.can_change && program && (open?.kind === 'edit' || boostId === 'new') && <BoostDialog boost={open?.kind === 'edit' ? open.boost : null} tiers={program.tiers} brands={program.options.brands} onClose={close} />}
    {open?.kind === 'remove' && open.boost && <RemoveBoost boost={open.boost} onClose={close} />}
    {open?.kind === 'times' && <ConfirmTimes boosts={open.boosts} locale={i18n.language} timeZone={boot.venue.timezone} onClose={close} />}
  </div>
}
