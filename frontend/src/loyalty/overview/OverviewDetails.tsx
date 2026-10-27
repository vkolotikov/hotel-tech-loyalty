import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../LoyaltyProvider'
import { money, points, signedPoints, when } from '../lib/format'
import { mediaUrl } from '../lib/api'
import { ADVICE_WORDS } from '../options/words'
import { overviewAssets as assets } from './assets'
import { FILTERS } from './overviewMath'
import { OverviewBadge, OverviewButton, OverviewRecovery, OverviewSkeleton } from './OverviewUI'
import { useOverviewWords, type OverviewWord } from './words'
import type { useOverviewModule } from './useOverview'
import type { ActivityFilter, ActivityItem, MetricKey, Panel, Period } from './types'

const definition: Record<MetricKey, OverviewWord> = { members: 'membersDefinition', rewards_used: 'rewardsDefinition', points_available: 'pointsDefinition', offers_used: 'offersDefinition', active_offers: 'activeOffersDefinition', checkins: 'visitsDefinition', benefits_fulfilled: 'benefitsDefinition', active_benefits: 'activeBenefitsDefinition' }
type Read<M extends Parameters<typeof useOverviewModule>[0]> = ReturnType<typeof useOverviewModule<M>>

export function OverviewDetails({ panel, summary, checks, metrics, queue, activity, period, filter, onFilter }: {
  panel: Panel; summary: Read<'summary'>; checks: Read<'checks'>; metrics: Read<'metrics'>; queue: Read<'queue'>; activity: Read<'activity'>; period: Period; filter: ActivityFilter; onFilter: (filter: ActivityFilter) => void
}) {
  const say = useOverviewWords()
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const locale = i18n.language || 'en'
  const n = (value: number) => points(value, locale)
  const s = summary.data?.data
  const request = panel === 'issues' ? checks : panel === 'numbers' ? metrics : panel === 'activity' ? activity : panel === 'requests' ? queue : summary
  if (request.forbidden || (request.isError && !request.data)) return <OverviewRecovery forbidden={request.forbidden} busy={request.isFetching} onRetry={() => { void request.refetch() }} />
  if (!request.data) return <OverviewSkeleton rows={6} />
  const insights = `/loyalty/insights?period=${period}`
  const report = boot.staff.can.view_insights && <Link className="l-ov-link" to={insights}>{say('openInsights')} →</Link>
  const qualification = say(s?.options.tier_progress_by === 'visits' ? 'qualificationVisits' : s?.options.tier_progress_by === 'spend' ? 'qualificationSpend' : 'qualificationPoints')
  const purchaseEarning = s?.options.points_on_bookings || s?.options.desk_earn_enabled
  if (panel === 'program' && s) return <>
    <OverviewBadge tone="green">{say(`${s.mode}Enabled`)}</OverviewBadge>
    {s.mode === 'points' && <DetailGroup title={say('earning')} href="/loyalty/options?tab=earn&way=earn_rate" action={say('editEarning')}><DetailRow label={say('purchase')}>{purchaseEarning ? say('earnLine', { points: n(Number(s.options.points_per_currency)), currency: money(1, boot.venue.currency, locale) }) : say('purchaseOff')}</DetailRow><DetailRow label={say('welcome')}>{say('exampleBalance', { points: n(Number(s.options.welcome_bonus_points)) })}</DetailRow></DetailGroup>}
    <DetailGroup title={say('membership')} href="/loyalty/program" action={say('openLevels')}><DetailRow label={say('membership')}>{say('levels', { count: s.tiers.length })}</DetailRow><DetailRow label={say('qualification')}>{qualification}</DetailRow>{s.tiers.map(tier => <DetailRow key={tier.id} label={tier.name}>{tier.invitation_only ? say('invitation') : s.options.tier_progress_by === 'spend' ? money(Number(tier.min_spend ?? 0), boot.venue.currency, locale) : n(Number(s.options.tier_progress_by === 'visits' ? tier.min_visits ?? 0 : tier.min_points))}</DetailRow>)}</DetailGroup>
    <DetailGroup title={say('catalogue')} href="/loyalty/rewards" action={say('openCatalogue')}>{s.mode === 'points' && <DetailRow label={say('pointsRewards')}>{n(s.rewards)}</DetailRow>}<DetailRow label={say('benefits')}>{n(s.benefits)}</DetailRow><DetailRow label={say('active_offers')}>{n(s.offers)}</DetailRow></DetailGroup>
    {s.mode === 'points' && <DetailGroup title={say('rules')} href="/loyalty/options?tab=rule&way=points_expiry" action={say('reviewRules')}><DetailRow label={say('expiry')}>{Number(s.options.points_expiry_months) === 0 ? say('never') : say('months', { count: Number(s.options.points_expiry_months) })}</DetailRow><DetailRow label={say('separate')}>{say('separateValue')}</DetailRow></DetailGroup>}
    <p className="l-ov-muted">{say('separateHint')}</p><Link className="l-ov-link" to="/loyalty/start">{say('checklist')} →</Link>
  </>
  if (panel === 'issues') return <><p>{say('issuesIntro')}</p>{checks.data?.data.issues.length === 0 && <div className="l-ov-inset"><h3>{say('clear')}</h3><p>{say('clearLine')}</p></div>}{checks.data?.data.issues.map(issue => {
    const names = issue.entities.map(e => e.name).join(' · ')
    const title = issue.code === 'tiers_share_threshold' ? say('duplicateTitle') : issue.code === 'benefit_unused' ? say('unusedBenefits') : t(`loyalty.options.advice.${issue.code}`, ADVICE_WORDS[issue.code] ?? say('reviewSettings'), issue.params)
    return <section className="l-ov-panel l-ov-issue" key={issue.id}><OverviewBadge tone={issue.level === 'warn' ? 'amber' : 'neutral'}>{issue.area === 'program' ? say('membership') : say('earning')}</OverviewBadge><h3>{title}</h3>{issue.code === 'tiers_share_threshold' && <p>{say('duplicateLine', { names, value: `${n(issue.params.value)} ${qualification}` })}</p>}{issue.code === 'benefit_unused' && <p>{say('unusedBenefitsLine', { names })}</p>}<Link className={`l-ov-button ${issue.level === 'warn' ? 'l-ov-primary' : ''}`} to={issue.href}>{say('reviewSettings')}</Link></section>
  })}<hr /><h3>{say('optional')}</h3><p>{say('optionalLine')}</p>{boot.staff.can.manage_app && <Link to="/loyalty/app?tab=wallet" className="l-ov-link">{say('wallet')} →</Link>}<small>{say('checksFoot')}</small></>
  if (panel === 'numbers') return <><p>{say('numbersIntro')}</p>{metrics.data?.data.items.map(item => <section className="l-ov-panel" key={item.key}><h3>{say(item.key)}</h3><strong className="l-ov-definition-value">{item.value === null ? '—' : item.kind === 'current' ? say('now', { value: n(item.value) }) : `${n(item.value)} · ${say(`period${period}`)}`}</strong><p>{say(definition[item.key])}</p></section>)}<p>{say('periodDefinition')}</p>{metrics.data && <p className="l-ov-muted">{say('interval', { from: metrics.data.period.from, to: metrics.data.period.to, zone: metrics.data.period.timezone })}</p>}<small>{say('unavailableValue')}</small>{report}</>
  if (panel === 'activity') return <><p className="l-ov-muted">{say(`period${period}`)}</p><div className="l-ov-filters" role="group" aria-label={say('activity')}>{FILTERS.map(f => <OverviewButton key={f} onClick={() => onFilter(f)} aria-pressed={f === filter}>{say(f)}{filter === f ? ' ✓' : ''}</OverviewButton>)}</div><ActivityRows items={activity.data?.data.items ?? []} filter={filter} onClear={() => onFilter('all')} detailed /><small>{say('activityLimit', { count: activity.data?.data.limit ?? 20 })}</small>{report}</>
  if (panel === 'requests') return <div className="l-ov-queue-choices"><Link className="l-ov-button" to="/loyalty/requests">{say('benefitQueue')} →</Link>{queue.data?.data.sources.includes('redemptions') && <Link className="l-ov-button" to="/loyalty/rewards?tab=redemptions">{say('redemptionQueue')} →</Link>}</div>
  if (panel === 'preview' && s) return <><OverviewBadge>{say('previewOnly')}</OverviewBadge><p>{say('previewExplanation')}</p><div className="l-ov-preview-columns"><div className="l-ov-phone-preview">{s.appearance.logo_url && <img className="l-ov-preview-logo" src={mediaUrl(s.appearance.logo_url)} alt={boot.organization.name} />}<span className="l-ov-eyebrow">{boot.organization.name}</span><h2>{say('previewHello')}</h2><div className="l-ov-panel"><small>{say(s.mode === 'points' ? 'points_available' : 'membership')}</small><strong className="l-ov-preview-balance">{s.mode === 'points' ? say('exampleBalance', { points: n(Math.round((s.minimum_reward?.points_cost ?? 0) * 1.5)) }) : s.tiers[0]?.name ?? say('membership')}</strong>{s.tiers[0] && <OverviewBadge>{s.tiers[0].name}</OverviewBadge>}</div>{s.mode === 'points' && s.minimum_reward && <div className="l-ov-inset"><img src={assets.gift} alt="" /><h3>{s.minimum_reward.name}</h3><p>{say('fromReward', { points: n(s.minimum_reward.points_cost) })}</p></div>}<h3>{say('benefits')}</h3><p>{say('levelIncludesLine')}</p><small>{say('exampleFoot')}</small></div><div className="l-ov-preview-explanation"><h3>{say('previewQuestion')}</h3>{s.mode === 'points' && <><h4>{say('howEarn')}</h4><p>{purchaseEarning ? say('earnLine', { points: n(Number(s.options.points_per_currency)), currency: money(1, boot.venue.currency, locale) }) : say('purchaseOff')}</p></>}<h4>{say('whatGet')}</h4><p>{s.minimum_reward?.name ?? say('levelIncludesLine')}</p><h4>{say('howUse')}</h4><p>{say('useLine')}</p><h4>{say('levelIncludes')}</h4><p>{say('levelIncludesLine')}</p>{boot.staff.can.manage_app && <Link to="/loyalty/app?tab=app" className="l-ov-button">{say('openAppearance')}</Link>}<small>{say('appearanceHint')}</small></div></div></>
  return null
}

function DetailGroup({ title, href, action, children }: { title: string; href: string; action: string; children: ReactNode }) {
  return <section className="l-ov-inset l-ov-detail-group"><h3>{title}</h3><dl>{children}</dl><Link className="l-ov-link" to={href}>{action} →</Link></section>
}
function DetailRow({ label, children }: { label: string; children: ReactNode }) { return <div className="l-ov-detail-row"><dt>{label}</dt><dd>{children}</dd></div> }

export function ActivityRows({ items, filter, onClear, detailed = false }: { items: ActivityItem[]; filter: ActivityFilter; onClear: () => void; detailed?: boolean }) {
  const say = useOverviewWords()
  const boot = useBoot()
  const { i18n } = useTranslation()
  const locale = i18n.language || 'en'
  if (!items.length) return <div className="l-ov-empty"><h3>{say(filter === 'all' ? 'noActivity' : 'noMatches')}</h3><p>{say('noActivityLine')}</p>{filter !== 'all' && <OverviewButton onClick={onClear}>{say('clearFilter')}</OverviewButton>}</div>
  return <ul className={`l-ov-events ${detailed ? 'l-ov-events-detailed' : ''}`}>{items.map(item => {
    const name = item.member ?? say('noName')
    const title = item.source === 'points' ? say((item.amount ?? 0) > 0 ? 'earned' : 'changedPoints', { name, points: (item.amount ?? 0) > 0 ? points(item.amount ?? 0, locale) : signedPoints(item.amount ?? 0, locale) }) : item.source === 'offer' ? say('offerUsed', { name: item.label ?? say('active_offers') }) : item.source === 'reward' ? say('rewardUsed', { name: item.label ?? say('redemption') }) : item.source === 'visit' ? say('visited', { name }) : item.source === 'member' ? say('memberJoined', { name }) : item.source === 'tier' ? say('levelChanged', { name }) : say('delivered', { name: item.label ?? say('benefit') })
    return <li key={`${item.source}:${item.id}`}><img src={item.source === 'points' ? assets.activityCyan : item.source === 'tier' || item.source === 'visit' ? assets.activityGreen : assets.activityNeutral} alt="" /><div>{detailed ? <Link className="l-ov-event-title" to={item.href}>{title}</Link> : <strong>{title}</strong>}<small>{item.source === 'reward' && item.amount !== null ? `${say('exampleBalance', { points: points(item.amount, locale) })} · ` : item.label && item.source !== 'reward' ? `${item.label} · ` : ''}<time dateTime={item.at}>{when(item.at, locale, boot.venue.timezone)}</time></small></div></li>
  })}</ul>
}
