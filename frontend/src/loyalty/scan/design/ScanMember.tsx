import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useApi, useBoot } from '../../LoyaltyProvider'
import { failureOf } from '../../lib/api'
import type { MemberRow } from '../../lib/types'
import { memberPath } from '../../lib/links'
import { points } from '../../lib/format'
import { PointsDialog } from '../../member/PointsDialog'
import { memberActions, type PointsMode } from '../../member/memberMath'
import { DeskActions } from '../../visits/DeskActions'
import { CreditSummary } from '../../credit/CreditSummary'
import { RequestRow } from '../../requests/RequestRow'
import { OverviewButton, OverviewSkeleton } from '../../overview/OverviewUI'
import { overviewScope } from '../../overview/overviewMath'
import { overviewAssets } from '../../overview/assets'
import { Validity } from '../ScannedCard'
import { deskValidity } from '../verdict'
import { useScanWords } from './words'

export function ScanIdentity({ member }: { member: MemberRow }) {
  const boot = useBoot()
  const { t, i18n } = useTranslation()
  const tier = boot.programme.tiers.find(tier => tier.id === member.tier_id)
  const validity = deskValidity(member, boot.venue.today, i18n.language)
  const expired = member.membership_state === 'expired' || (member.valid_until && member.valid_until < boot.venue.today)
  const status = !member.is_active ? t('loyalty.common.inactive', 'Inactive') : expired ? t('loyalty.membership.list.state.expired', 'Expired') : t('loyalty.common.active', 'Active')
  return <div className="l-sc-identity"><span className="l-sc-avatar" aria-hidden>{member.name.split(/\s+/).map(p => p[0]).slice(0, 2).join('')}</span><div><strong>{member.name || member.member_number}</strong><small className="l-sc-desktop">{[tier?.name, member.member_number].filter(Boolean).join(' · ')}</small><small className="l-sc-mobile">{[tier?.name, status, member.member_number].filter(Boolean).join(' · ')}</small><div className="l-sc-mobile-facts"><span>{points(member.points, i18n.language)} {t('loyalty.scan.points', 'points')}</span>{validity && <Validity line={validity} />}</div></div><span className="l-sc-status l-sc-desktop">{status}</span></div>
}

export function ScanMember({ member, onNext }: { member: MemberRow; onNext: () => void }) {
  const words = useScanWords()
  const boot = useBoot()
  const api = useApi()
  const { t, i18n } = useTranslation()
  const actions = memberActions(boot.staff.can)
  const [tab, setTab] = useState<PointsMode | 'benefits' | 'checkin'>(actions.award ? 'award' : actions.redeem ? 'redeem' : 'benefits')
  const [dialog, setDialog] = useState<PointsMode | null>(null)
  const [revision, setRevision] = useState(0)
  const detail = useQuery({ queryKey: ['loyalty', 'member', member.id, overviewScope(boot)], queryFn: () => api.member(member.id), retry: false })
  const denied = detail.isError && [401, 402, 403, 404].includes(failureOf(detail.error).status)
  const now = detail.data?.member ?? member
  const ready = detail.isSuccess
  const tier = boot.programme.tiers.find(tr => tr.id === now.tier_id)
  const validity = deskValidity(now, boot.venue.today, i18n.language)
  const award = t('loyalty.member.award', 'Award points'), redeem = t('loyalty.member.redeem', 'Redeem points')
  const saved = () => { setRevision(n => n + 1); setDialog(null) }
  const benefits = <><h2>{words('available')}</h2>{detail.data?.benefits.length ? <ul className="l-sc-benefits">{detail.data.benefits.map(b => <li key={b.id}><strong>{b.name}</strong>{b.value && <small>{b.value}</small>}</li>)}</ul> : <p>{words('noBenefits')}</p>}<Link className="l-ov-link" to="/loyalty/rewards?tab=benefits">{words('allBenefits')}</Link></>
  if (denied) return <section className="l-sc-panel" role="alert"><p>{words('unavailable')}</p><OverviewButton onClick={() => void detail.refetch()}>{words('retry')}</OverviewButton><OverviewButton onClick={onNext}>{words('next')}</OverviewButton></section>
  return <>
    <header className="l-sc-heading"><div><h1><span className="l-sc-desktop">{words('atDesk')}</span><span className="l-sc-mobile"><img src={overviewAssets.members} alt="" />{words('found')}</span></h1><p className="l-sc-desktop">{words('deskSubtitle')}</p><p className="l-sc-mobile">{words('readerPaused')} · {words('desk')}</p></div><div className="l-sc-desktop l-sc-actions"><Link className="l-ov-button" to={memberPath(now.id)}>{words('profile')}</Link><OverviewButton primary onClick={onNext}>{words('next')}</OverviewButton></div></header>
    <ScanIdentity member={now} />
    {detail.isPending && <OverviewSkeleton rows={2} />}
    {detail.isError && <div className="l-sc-panel" role="alert"><p>{words('unavailable')}</p><OverviewButton onClick={() => void detail.refetch()}>{words('retry')}</OverviewButton></div>}
    {revision > 0 && <p role="status">{words('saved')}</p>}
    <div className="l-sc-tabs l-sc-desktop" role="group" aria-label={words('moreActions')}>
      {actions.award && <button disabled={!ready} aria-pressed={tab === 'award'} onClick={() => setTab('award')}><strong>{award}</strong><small>{words('awardHint')}</small></button>}
      {actions.redeem && <button disabled={!ready} aria-pressed={tab === 'redeem'} onClick={() => setTab('redeem')}><strong>{redeem}</strong><small>{words('redeemHint')}</small></button>}
      <button disabled={!ready} aria-pressed={tab === 'benefits'} onClick={() => setTab('benefits')}><strong>{words('benefits')}</strong><small>{words('benefitsHint')}</small></button>
      <button disabled={!ready} aria-pressed={tab === 'checkin'} onClick={() => setTab('checkin')}><strong>{words('checkin')}</strong><small>{words('checkinHint')}</small></button>
    </div>
    <strong className="l-sc-mobile">{words('chooseAction')}</strong>
    <div className="l-sc-mobile l-sc-tiles">
      {actions.award && <OverviewButton primary disabled={!ready} aria-label={award} onClick={() => setDialog('award')}><img src={overviewAssets.options} alt="" /><span>{award}</span><small>{words('awardHint')}</small></OverviewButton>}
      {actions.redeem && <OverviewButton disabled={!ready} aria-label={redeem} onClick={() => setDialog('redeem')}><img src={overviewAssets.app} alt="" /><span>{redeem}</span><small>{words('redeemHint')}</small></OverviewButton>}
      <OverviewButton disabled={!ready} aria-label={words('benefits')} onClick={() => setTab(tab === 'benefits' ? 'checkin' : 'benefits')} aria-expanded={tab === 'benefits'}><img src={overviewAssets.rewards} alt="" /><span>{words('benefits')}</span><small>{words('benefitsHint')}</small></OverviewButton>
      <Link className="l-ov-button" to={memberPath(now.id)}><img src={overviewAssets.members} alt="" /><span>{words('profile')}</span><small>{words('moreActions')}</small></Link>
    </div>
    {ready && <div className="l-sc-columns"><section className={`l-sc-panel ${tab === 'award' || tab === 'redeem' ? 'l-sc-desktop' : ''}`}>
      {(tab === 'award' || tab === 'redeem') ? <><h2>{tab === 'award' ? award : redeem}</h2><PointsDialog key={`${tab}-${revision}`} inline mode={tab} memberId={now.id} name={now.name} balance={now.points} onClose={saved} /></> : tab === 'benefits' ? <>{benefits}{detail.data.requests.length > 0 && <ul>{detail.data.requests.map(r => <RequestRow key={r.id} request={r} showMember={false} compact />)}</ul>}</> : <><h2>{words('review')}</h2><DeskActions member={now} /><CreditSummary member={now} /><Link className="l-ov-link" to={memberPath(now.id)}>{words('openProfile')}</Link></>}
    </section><aside className="l-sc-stack l-sc-desktop"><section className="l-sc-panel l-sc-membership"><h2>{words('current')}</h2><dl><dt>{words('points')}</dt><dd>{points(now.points, i18n.language)} {t('loyalty.scan.points', 'points')}</dd><dt>{words('level')}</dt><dd>{tier?.name ?? '—'}</dd><dt>{words('validUntil')}</dt><dd>{validity ? <Validity line={validity} /> : '—'}</dd></dl><small>{words('qualification')}</small></section><section className="l-sc-panel">{benefits}</section><section className="l-sc-panel"><strong>{words('moreActions')}</strong><p>{words('moreLine')}</p><Link className="l-ov-link" to={memberPath(now.id)}>{words('openProfile')}</Link></section></aside></div>}
    <OverviewButton className="l-sc-mobile" disabled={!ready} onClick={() => setTab(tab === 'checkin' ? 'benefits' : 'checkin')} aria-expanded={tab === 'checkin'}>{words('review')}</OverviewButton>
    <section className="l-sc-panel l-sc-mobile"><p>{words('finished')}</p><OverviewButton onClick={onNext}>{words('next')}</OverviewButton></section>
    <small className="l-sc-desktop">{words('draftHint')}</small>
    {dialog && ready && <PointsDialog mode={dialog} memberId={now.id} name={now.name} balance={now.points} memberNumber={now.member_number} level={tier?.name} onClose={() => setDialog(null)} />}
  </>
}
