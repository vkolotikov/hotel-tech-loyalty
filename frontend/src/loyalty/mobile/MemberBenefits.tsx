import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../LoyaltyProvider'
import type { MemberDetail, TierBenefitLine } from '../lib/types'
import { points } from '../lib/format'
import { failureOf } from '../lib/api'
import { rewardsApi, CATALOGUE_KEY } from '../rewards/api'
import type { Reward } from '../rewards/types'
import { overviewScope } from '../overview/overviewMath'
import { OverviewButton, OverviewDialog, OverviewRecovery, OverviewSkeleton } from '../overview/OverviewUI'
import { useTypedPhrase } from '../scan/useTypedPhrase'
import { benefitDetail } from '../scan/verdict'
import { APPLIES_TO_WORDS, FULFILLMENT_WORDS } from '../program/words'
import { useMobileWords } from './words'

export function MemberBenefits({ detail }: { detail: MemberDetail }) {
  const boot = useBoot(), say = useMobileWords(), { t, i18n } = useTranslation(), phrase = useTypedPhrase()
  const [selected, setSelected] = useState<TierBenefitLine | Reward | null>(null)
  const query = useQuery({ queryKey: [...CATALOGUE_KEY, overviewScope(boot)], queryFn: rewardsApi.catalogue, retry: false })
  const denied = [401, 402, 403].includes(failureOf(query.error).status)
  const rewards = denied ? [] : query.data?.rewards.filter(reward => reward.is_active) ?? []
  const [all, setAll] = useState(false)
  return <>
    {query.isError && <OverviewRecovery forbidden={denied} onRetry={() => { void query.refetch() }} />}
    {query.isPending && <OverviewSkeleton rows={2} />}
    {(all ? rewards : rewards.slice(0, 1)).map(reward => <section key={`reward:${reward.id}`} className="l-mw-panel l-mw-benefit"><small className="l-mw-eyebrow">{say('pointsReward')}</small><h2>{reward.name}</h2><p>{t('loyalty.common.points_count', '{{points}} pts', { points: points(reward.points_cost, i18n.language) })}</p><OverviewButton primary onClick={() => setSelected(reward)}>{say('rewardDetails')}</OverviewButton></section>)}
    {rewards.length > 1 && <OverviewButton onClick={() => setAll(!all)} aria-expanded={all}>{t('loyalty.redesign.viewAll', 'View all ({{n}})', { n: rewards.length })}</OverviewButton>}
    {detail.benefits.map(benefit => {
      return <section className="l-mw-panel l-mw-benefit" key={`benefit:${benefit.id}`}><h2>{benefit.name}</h2><p>{benefitDetail(benefit, phrase) || benefit.description}</p>{benefit.fulfillment_mode && <small>{t(`loyalty.program.fulfillment_mode.${benefit.fulfillment_mode}`, FULFILLMENT_WORDS[benefit.fulfillment_mode] ?? benefit.fulfillment_mode)}</small>}<OverviewButton onClick={() => setSelected(benefit)}>{t('loyalty.redesign.details', 'Details →')}</OverviewButton></section>
    })}
    {!detail.benefits.length && <p className="l-mw-panel">{t('loyalty.member.no_benefits', 'This tier has no benefits yet.')}</p>}
    <Link className="l-ov-button" to={`/loyalty/requests?view=all&q=${encodeURIComponent(detail.member.member_number || detail.member.name)}`}>{say('viewClaims')}</Link>
    {selected && <OverviewDialog kind="form" className="l-mw-sheet" title={selected.name} onClose={() => setSelected(null)}><p>{selected.description}</p>{'points_cost' in selected ? <><strong>{t('loyalty.common.points_count', '{{points}} pts', { points: points(selected.points_cost, i18n.language) })}</strong><p>{selected.terms}</p><p>{say('claimHint')}</p><Link className="l-ov-button l-ov-primary" to={`/loyalty/requests?type=redemption&view=all&q=${encodeURIComponent(detail.member.member_number || detail.member.name)}`}>{say('viewClaims')}</Link></> : <><p>{benefitDetail(selected, phrase)}</p>{selected.applies_to && <p>{t(`loyalty.program.applies_to.${selected.applies_to}`, APPLIES_TO_WORDS[selected.applies_to] ?? selected.applies_to)}</p>}</>}<OverviewButton onClick={() => setSelected(null)}>{t('loyalty.overview.close', 'Close')}</OverviewButton></OverviewDialog>}
  </>
}
