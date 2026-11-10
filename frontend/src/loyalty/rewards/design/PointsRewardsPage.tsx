import { ManagementVisual, ManagementFact } from '../../management/ManagementUI'
import { adminAssets } from '../../management/assets'
import { useAdminWords } from '../../management/words'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../../LoyaltyProvider'
import { failureOf, mediaUrl } from '../../lib/api'
import { Notice } from '../../../workspace/ui/Notice'
import { OverviewButton } from '../../overview/OverviewUI'
import { DesignDialog } from '../../redesign/DesignUI'
import type { Reward } from '../types'
import { amountOf, points, when } from '../../lib/format'
import { CATALOGUE_KEY, rewardsApi } from '../api'
import { LoadFailed, Loading } from '../parts'
import { APPLIES_TO_WORDS, DISCOUNT_PHRASE_WORDS } from '../words'
import { rewardDiscount } from '../rewardsMath'
import { RewardEditorPage } from './RewardEditorPage'
import { RewardColumns, RewardEmpty, RewardEyebrow, RewardHeading, RewardRow } from './RewardUI'
import { RewardIcon, RewardStatus } from './presentation'
import { rewardsUrl, rewardStatus } from './math'
import { useRewardWords } from './words'

export function PointsRewardsPage() {
  const { t, i18n } = useTranslation(), say = useRewardWords(), admin = useAdminWords(), boot = useBoot()
  const query = useQuery({ queryKey: CATALOGUE_KEY, queryFn: rewardsApi.catalogue })
  const location = useLocation(), navigate = useNavigate(), params = new URLSearchParams(location.search)
  const data = query.data, manage = boot.staff.can.manage_rewards, editor = params.get('reward')
  const q = params.get('q') ?? '', status = params.get('status') ?? 'all', selectedId = params.get('selected')
  const go = (patch: Record<string, string | number | null>) => navigate(rewardsUrl('catalogue', { q, status, selected: selectedId, ...patch }), { replace: true })
  if (editor && data) return <RewardEditorPage key={editor} id={editor} catalogue={data} />
  const rewards = data?.rewards ?? [], visible = rewards.filter(r => `${r.name} ${r.category ?? ''}`.toLocaleLowerCase().includes(q.toLocaleLowerCase()) && (status === 'all' || rewardStatus(r) === status))
  const selected = visible.find(r => String(r.id) === selectedId) ?? visible[0], discount = selected && rewardDiscount(selected)
  const allCount = rewards.filter(r => rewardStatus(r) === 'active').length
  return <div className="l-ad-page l-rd-page l-rb-page l-rc-page">
    <RewardHeading title={say('pointsRewards')} line={say('rewardsLine')}><Link className="l-ov-button" to="/loyalty/rewards?tab=redemptions">{t('loyalty.rewards.tab.redemptions', 'Redemptions')}</Link>{manage && data && <Link className="l-ov-button l-ov-primary" to={rewardsUrl('catalogue', { reward: 'new' })}>{say('addReward')}</Link>}</RewardHeading>
    {!manage && <p data-read-only="">{t('loyalty.rewards.catalogue.read_only', 'Only staff allowed to manage offers can add or change rewards.')}</p>}
    {query.isError && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
    {!data && query.isLoading && <Loading />}
    {params.get('saved') && <p role="status" className="l-rb-success">{say('saved')}</p>}
    {data && <><div className="l-rb-columns"><section className="l-ov-panel l-rb-list"><header><div className="l-rc-heading"><RewardIcon /><h2>{say('yourRewards')}</h2></div><small>{say('activeRewardTotal', { active: allCount, total: rewards.length })}</small></header>
      <div className="l-rb-filters l-rc-reward-filters"><label><span>{say('searchRewards')}</span><input type="search" value={q} placeholder={say('searchName')} onChange={e => go({ q: e.target.value })} /></label><label><span>{say('status')}</span><select value={status} onChange={e => go({ status: e.target.value })}><option value="all">{say('allStatuses')}</option>{(['active', 'off', 'ended', 'soldOut'] as const).map(s => <option key={s} value={s}>{say(s)}</option>)}</select></label></div>
      <RewardColumns first={say('rewardMethod')} value={say('pointsCost')} /><ul>{visible.map(r => <RewardRow key={r.id} id={`reward-${r.id}`} icon={rewardStatus(r) === 'ended' ? 'ended' : r.discount_type ? 'discount' : 'claim'} name={r.name} caption={`${say('allMembers')} · ${say('memberCode')}`} value={t('loyalty.earn.points', '{{n}} points', { n: points(r.points_cost, i18n.language) })} status={say(rewardStatus(r))} tone={rewardStatus(r)} selected={r.id === selected?.id} onSelect={() => go({ selected: r.id })} />)}</ul>{!visible.length && <RewardEmpty empty={!rewards.length ? say('emptyRewards') : undefined} onClear={rewards.length ? () => go({ q: '', status: 'all' }) : undefined} />}</section>
      {selected && <aside className="l-rb-side"><section id="management-detail" tabIndex={-1} className="l-ov-panel l-rb-detail l-rc-reward-detail"><div className="l-rb-section-head"><RewardEyebrow>{admin('selectedReward')}</RewardEyebrow><RewardStatus tone={rewardStatus(selected)}>{say(rewardStatus(selected))}</RewardStatus>{manage && <Link className="l-ov-button" to={rewardsUrl('catalogue', { reward: selected.id })}>{t('loyalty.program.edit', 'Edit')}</Link>}</div>{selected.image_url && <img className="l-rb-picture" src={mediaUrl(selected.image_url)} alt={selected.name} loading="lazy" />}<ManagementVisual art="rewardArt" label={say('pointsRewards')} title={selected.name} line={admin('pointsShort', { n: points(selected.points_cost, i18n.language) })} />{discount && <p>{t(`loyalty.rewards.discount_phrase.${discount.type}`, DISCOUNT_PHRASE_WORDS[discount.type] ?? '{{amount}}', { amount: amountOf(discount.type, discount.amount, boot.venue.currency, i18n.language) })} · {t(`loyalty.rewards.applies_to.${selected.applies_to}`, APPLIES_TO_WORDS[selected.applies_to] ?? selected.applies_to)}</p>}
      <ManagementFact icon="people" label={say('who')}>{say('allMembers')}</ManagementFact>
      <div className="l-rb-divider"><strong>{say('claimSteps')}</strong><ol className="l-ad-claim-steps"><li><img src={adminAssets.redeemCoin.src} width={19} height={19} alt="" /><span>{say('claimCost', { n: points(selected.points_cost, i18n.language) })}</span></li><li><img src={adminAssets.qr.src} width={14} height={14} alt="" /><span>{say('claimCode')}</span></li></ol></div>
      <details className="l-ad-more"><summary>{admin('advanced')}</summary><p>{selected.description}</p><dl className="l-rb-facts"><dt>{say('availability')}</dt><dd>{selected.stock === null ? say('unlimited') : say('stockLeft', { n: points(selected.stock, i18n.language) })}</dd><dt>{say('memberLimit')}</dt><dd>{selected.per_member_limit === null ? say('noLimit') : selected.per_member_limit === 1 ? say('once') : say('limit', { n: selected.per_member_limit })}</dd><dt>{say('validUntil')}</dt><dd>{selected.expires_at ? when(selected.expires_at, i18n.language, boot.venue.timezone) : say('noEnd')}</dd></dl>{manage && <RewardActions key={selected.id} reward={selected} onRemoved={() => go({ selected: null })} />}</details>
      <details className="l-ad-more"><summary>{say('terms')}</summary><p className="l-rb-prewrap">{selected.terms || say('noTerms')}</p>{selected.category && <p>{t('loyalty.rewards.reward.category', 'Category')}: {selected.category}</p>}<small>{t('loyalty.rewards.catalogue.redeemed', 'Redeemed')}: {points(selected.redeemed, i18n.language)} · {t('loyalty.rewards.catalogue.fulfilled', 'Fulfilled')}: {points(selected.fulfilled, i18n.language)}</small></details></section></aside>}
      </div></>}
  </div>
}

function RewardActions({ reward, onRemoved }: { reward: Reward; onRemoved: () => void }) {
  const { t } = useTranslation(), client = useQueryClient(), [confirm, setConfirm] = useState(false)
  const action = useMutation({
    mutationFn: async (kind: 'state' | 'delete') => { if (kind === 'delete') await rewardsApi.deleteReward(reward.id); else await rewardsApi.rewardState(reward.id, !reward.is_active) },
    onSuccess: (_, kind) => {
      setConfirm(false)
      for (const queryKey of [['loyalty', 'rewards'], ['loyalty', 'options'], ['loyalty', 'overview'], ['loyalty', 'start']]) void client.invalidateQueries({ queryKey })
      if (kind === 'delete') onRemoved()
    },
  })
  const error = action.isError ? failureOf(action.error) : null
  const notice = error && <Notice tone="danger">{t(error.code === 'reward_in_use' ? 'loyalty.launchpolish.rewardInUse' : 'loyalty.launchpolish.actionFailed')}</Notice>
  return <div className="l-rb-divider l-rb-management">
    <div className="l-rb-detail-actions"><OverviewButton disabled={action.isPending} onClick={() => action.mutate('state')}>{t(reward.is_active ? 'loyalty.launchpolish.disable' : 'loyalty.launchpolish.enable')}</OverviewButton><OverviewButton disabled={action.isPending} onClick={() => { action.reset(); setConfirm(true) }}>{t('loyalty.launchpolish.deleteReward')}</OverviewButton></div>
    {!confirm && notice}
    {confirm && <DesignDialog title={t('loyalty.launchpolish.deleteReward')} onClose={() => setConfirm(false)} busy={action.isPending}><p>{t('loyalty.launchpolish.deleteBody', { name: reward.name })}</p>{notice}<div className="l-rb-detail-actions"><OverviewButton disabled={action.isPending} onClick={() => setConfirm(false)}>{t('loyalty.overview.close', 'Close')}</OverviewButton><OverviewButton primary disabled={action.isPending} onClick={() => action.mutate('delete')}>{t('loyalty.launchpolish.confirmDelete')}</OverviewButton></div></DesignDialog>}
  </div>
}
