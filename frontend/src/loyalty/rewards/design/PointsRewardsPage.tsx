import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../../LoyaltyProvider'
import { mediaUrl } from '../../lib/api'
import { amountOf, points, when } from '../../lib/format'
import { CATALOGUE_KEY, rewardsApi } from '../api'
import { LoadFailed, Loading } from '../parts'
import { APPLIES_TO_WORDS, DISCOUNT_PHRASE_WORDS } from '../words'
import { rewardDiscount } from '../rewardsMath'
import { RewardEditorPage } from './RewardEditorPage'
import { RewardActivityLinks, RewardEmpty, RewardEyebrow, RewardHeading, RewardHero, RewardRow } from './RewardUI'
import { rewardsUrl, rewardStatus } from './math'
import { useRewardWords } from './words'

export function PointsRewardsPage() {
  const { t, i18n } = useTranslation(), say = useRewardWords(), boot = useBoot()
  const query = useQuery({ queryKey: CATALOGUE_KEY, queryFn: rewardsApi.catalogue })
  const location = useLocation(), navigate = useNavigate(), params = new URLSearchParams(location.search)
  const data = query.data, manage = boot.staff.can.manage_rewards, editor = params.get('reward')
  const q = params.get('q') ?? '', status = params.get('status') ?? 'all', selectedId = params.get('selected')
  const go = (patch: Record<string, string | number | null>) => navigate(rewardsUrl('catalogue', { q, status, selected: selectedId, ...patch }), { replace: true })
  if (editor && data) return <RewardEditorPage key={editor} id={editor} catalogue={data} />
  const rewards = data?.rewards ?? [], visible = rewards.filter(r => `${r.name} ${r.category ?? ''}`.toLocaleLowerCase().includes(q.toLocaleLowerCase()) && (status === 'all' || rewardStatus(r) === status))
  const selected = visible.find(r => String(r.id) === selectedId) ?? visible[0], discount = selected && rewardDiscount(selected)
  const allCount = rewards.filter(r => rewardStatus(r) === 'active').length
  return <div className="l-ov-page l-rd-page l-rb-page">
    <RewardHeading title={say('pointsRewards')} line={say('rewardsLine')}><Link className="l-ov-button" to="/loyalty/rewards?tab=redemptions">{t('loyalty.rewards.tab.redemptions', 'Redemptions')}</Link>{manage && data && <Link className="l-ov-button l-ov-primary" to={rewardsUrl('catalogue', { reward: 'new' })}>{say('addReward')}</Link>}</RewardHeading>
    {!manage && <p data-read-only="">{t('loyalty.rewards.catalogue.read_only', 'Only staff allowed to manage offers can add or change rewards.')}</p>}
    {query.isError && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
    {!data && query.isLoading && <Loading />}
    {params.get('saved') && <p role="status" className="l-rb-success">{say('saved')}</p>}
    {data && <><RewardHero title={say('rewardHero')} line={say('rewardHeroLine')} count={say('available', { n: allCount })} />
      <div className="l-rb-filters"><label><span>{say('searchRewards')}</span><input type="search" value={q} placeholder={say('searchName')} onChange={e => go({ q: e.target.value })} /></label><div className="l-rb-read-field"><span>{say('delivery')}</span><p>{say('memberCode')}</p></div><div className="l-rb-read-field"><span>{say('level')}</span><p>{say('allMembers')}</p></div><label><span>{say('status')}</span><select value={status} onChange={e => go({ status: e.target.value })}><option value="all">{say('allStatuses')}</option>{(['active', 'off', 'ended', 'soldOut'] as const).map(s => <option key={s} value={s}>{say(s)}</option>)}</select></label></div>
      <div className="l-rb-columns"><section className="l-ov-panel l-rb-list"><header><h2>{say('yourRewards')}</h2><small>{say('rewardCount', { n: visible.length })}</small></header><ul>{visible.map(r => <RewardRow key={r.id} id={`reward-${r.id}`} name={r.name} caption={`${say('allMembers')} · ${say('memberCode')}`} value={t('loyalty.earn.points', '{{n}} points', { n: points(r.points_cost, i18n.language) })} status={say(rewardStatus(r))} tone={rewardStatus(r)} selected={r.id === selected?.id} onSelect={() => go({ selected: r.id })} />)}</ul>{!visible.length && <RewardEmpty empty={!rewards.length ? say('emptyRewards') : undefined} onClear={rewards.length ? () => go({ q: '', status: 'all' }) : undefined} />}</section>
      {selected && <aside className="l-rb-side"><section className="l-ov-panel l-rb-detail"><RewardEyebrow>{say('selectedReward')}</RewardEyebrow><h2 className="l-rb-title">{selected.name}</h2>{selected.image_url && <img className="l-rb-picture" src={mediaUrl(selected.image_url)} alt={selected.name} loading="lazy" />}<div className="l-rb-preview"><strong className="l-rb-big">{t('loyalty.earn.points', '{{n}} points', { n: points(selected.points_cost, i18n.language) })}</strong>{selected.description && <p>{selected.description}</p>}{discount && <p>{t(`loyalty.rewards.discount_phrase.${discount.type}`, DISCOUNT_PHRASE_WORDS[discount.type] ?? '{{amount}}', { amount: amountOf(discount.type, discount.amount, boot.venue.currency, i18n.language) })} · {t(`loyalty.rewards.applies_to.${selected.applies_to}`, APPLIES_TO_WORDS[selected.applies_to] ?? selected.applies_to)}</p>}</div>
      <dl className="l-rb-facts"><dt>{say('who')}</dt><dd>{say('allMembers')}</dd><dt>{say('availability')}</dt><dd>{selected.stock === null ? say('unlimited') : say('stockLeft', { n: points(selected.stock, i18n.language) })}</dd><dt>{say('memberLimit')}</dt><dd>{selected.per_member_limit === null ? say('noLimit') : selected.per_member_limit === 1 ? say('once') : say('limit', { n: selected.per_member_limit })}</dd><dt>{say('validUntil')}</dt><dd>{selected.expires_at ? when(selected.expires_at, i18n.language, boot.venue.timezone) : say('noEnd')}</dd></dl>
      <div className="l-rb-divider"><strong>{say('claimSteps')}</strong><ol><li>{say('claimCost', { n: points(selected.points_cost, i18n.language) })}</li><li>{say('claimCode')}</li></ol></div>
      <div className="l-rb-detail-actions">{manage && <Link className="l-ov-button l-ov-primary" to={rewardsUrl('catalogue', { reward: selected.id })}>{say('editReward')}</Link>}<details className="l-rb-overflow"><summary className="l-ov-button" aria-label={t('loyalty.membership.more.label', 'More')}>…</summary><div className="l-ov-panel"><strong>{say('terms')}</strong><p className="l-rb-prewrap">{selected.terms || say('noTerms')}</p>{selected.category && <p>{t('loyalty.rewards.reward.category', 'Category')}: {selected.category}</p>}<small>{t('loyalty.rewards.catalogue.redeemed', 'Redeemed')}: {points(selected.redeemed, i18n.language)} · {t('loyalty.rewards.catalogue.fulfilled', 'Fulfilled')}: {points(selected.fulfilled, i18n.language)}</small></div></details></div></section><section className="l-ov-panel l-rb-detail"><strong>{say('included')}</strong><Link className="l-ov-link" to="/loyalty/rewards?tab=benefits">{say('manageBenefits')}</Link></section></aside>}
      </div><RewardActivityLinks /></>}
  </div>
}
