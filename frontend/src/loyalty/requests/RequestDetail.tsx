import { useState, type ReactNode, type Ref } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useApi, useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { errorKey, refusalKey } from '../lib/errors'
import { when, points } from '../lib/format'
import { memberPath } from '../lib/links'
import { REQUEST_STATE_WORDS } from '../lib/words'
import type { RequestState } from '../lib/types'
import { OverviewButton, OverviewDialog } from '../overview/OverviewUI'
import { rewardsApi } from '../rewards/api'
import { ERRORS } from '../rewards/errors'
import { redemptionActions } from '../rewards/rewardsMath'
import { REDEMPTION_STATE_WORDS, REFERRAL_STATE_WORDS } from '../rewards/words'
import { requestActions } from './requestMath'
import { recordLabel, recordTitle, recordWhen } from './inboxMath'
import { refreshInbox } from './inboxApi'
import { useRequestWords } from './words'
import type { InboxMember, InboxRecord, ReferralRecord } from './types'

export function RecordStatus({ row }: { row: InboxRecord }) {
  const { t } = useTranslation()
  const family = row.kind === 'benefit' ? 'requests.state' : row.kind === 'redemption' ? 'rewards.redemption_state' : 'rewards.referral_state'
  const words: Record<string, string> = row.kind === 'benefit' ? REQUEST_STATE_WORDS : row.kind === 'redemption' ? REDEMPTION_STATE_WORDS : REFERRAL_STATE_WORDS
  const tone = ['pending', 'eligible'].includes(row.state) ? 'waiting' : ['approved', 'qualified'].includes(row.state) ? 'approved' : ['fulfilled', 'rewarded'].includes(row.state) ? 'done' : 'closed'
  return <span className="l-rq-status" data-state={tone}>{words[row.state] ? t(`loyalty.${family}.${row.state}`, words[row.state]) : row.state}</span>
}
function Fact({ label, children }: { label: string; children: ReactNode }) { return <div className="l-rq-fact"><dt>{label}</dt><dd>{children}</dd></div> }
function Person({ member }: { member: InboxMember | null }) {
  const say = useRequestWords()
  return member ? <Link to={memberPath(member.id)}>{member.name || member.number || `#${member.id}`}</Link> : <>{say('unavailableMember')}</>
}
function Activity({ row }: { row: InboxRecord }) {
  const say = useRequestWords()
  const { i18n } = useTranslation()
  const boot = useBoot()
  const date = (at: string | null) => when(at, i18n.language, boot.venue.timezone) || '—'
  return <div className="l-rq-activity"><h4>{say('activity')}</h4><p>{say(row.kind === 'benefit' ? 'received' : row.kind === 'redemption' ? 'claimReceived' : 'referralReceived')} · {date(row.at)}</p>
    {row.kind !== 'referral' && row.fulfilled_at && <p>{say('completed')} · {date(row.fulfilled_at)}</p>}
    {row.kind === 'redemption' && row.cancelled_at && <p>{say('cancelled')} · {date(row.cancelled_at)}</p>}
    {row.kind === 'referral' && row.qualified_at && <p>{say('qualified')} · {date(row.qualified_at)}</p>}
    {row.kind === 'referral' && row.rewarded_at && <p>{say('rewarded')} · {date(row.rewarded_at)}</p>}
    {row.kind === 'referral' ? <p>{row.points.referrer + row.points.referee === 0 ? say('noPayment') : say('pointsPaid') + ': ' + say('points', { n: points(row.points.referrer + row.points.referee, i18n.language) })}</p>
      : ['pending', 'eligible', 'approved'].includes(row.state) ? <p>{say(row.kind === 'benefit' && row.state !== 'approved' ? 'awaitingApproval' : 'awaitingFulfilment')}</p> : <RecordStatus row={row} />}
    {row.kind === 'benefit' && row.state === 'declined' && row.decline_reason && <p className="l-rq-reason">{row.decline_reason}</p>}
  </div>
}

type Action = 'approve' | 'done' | 'decline' | 'fulfil' | 'cancel'
export function RecordDetail({ row, blocked, hold, onDetails, detailRef }: { row: InboxRecord; blocked: boolean; hold: () => void; onDetails: () => void; detailRef?: Ref<HTMLElement> }) {
  const say = useRequestWords()
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const api = useApi()
  const client = useQueryClient()
  const [more, setMore] = useState(false)
  const [action, setAction] = useState<Action | null>(null)
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const [success, setSuccess] = useState(false)
  const benefits = row.kind === 'benefit' ? requestActions(row.state as RequestState) : []
  const rewards = row.kind === 'redemption' ? redemptionActions(row.state, boot.staff.can) : { fulfil: false, cancel: false }
  const allowed = (next: Action) => next === 'fulfil' ? rewards.fulfil : next === 'cancel' ? rewards.cancel : benefits.includes(next)
  const step = useMutation({ mutationFn: async (next: Action): Promise<unknown> => {
    if (next === 'approve') return api.approve(row.id)
    if (next === 'done') return api.done(row.id)
    if (next === 'decline') return api.decline(row.id, reason.trim())
    return next === 'fulfil' ? rewardsApi.fulfil(row.id) : rewardsApi.cancel(row.id)
  }, onMutate: () => setSuccess(false), onSuccess: () => { setAction(null); setMore(false); setSuccess(true); hold(); refreshInbox(client, row) }, onError: () => refreshInbox(client, row) })
  const failure = step.isError ? failureOf(step.error) : null
  const error = failure ? t(...(row.kind === 'benefit' ? errorKey('requests', failure) : refusalKey('loyalty.rewards', ERRORS, 'redemption', failure))) : null
  const open = (next: Action) => { step.reset(); setSuccess(false); setAction(next); setReason(''); setTried(false); setMore(false) }
  const title = recordTitle(row, say)
  const first = benefits.includes('approve') ? 'approve' : benefits.includes('done') ? 'done' : rewards.fulfil ? 'fulfil' : null
  const busy = blocked || step.isPending
  const close = () => { if (!step.isPending) setAction(null) }
  const confirmLabel = action === 'approve' ? say('approve') : action === 'decline' ? t('loyalty.requests.decline', 'Decline') : action === 'cancel' ? t('loyalty.rewards.cancel.confirm', 'Cancel redemption') : say('done')
  return <aside ref={detailRef} tabIndex={-1} className="l-ov-panel l-rq-detail" aria-label={title}>
    <div className="l-rq-accent" />
    <div className="l-rq-kind"><span>{say(row.kind)}</span><RecordStatus row={row} /></div><h2>{title}</h2><small>{recordLabel(row)}</small>
    {row.kind === 'referral' ? <><ReferralFacts row={row} /><h3>{say(row.points.referrer + row.points.referee === 0 ? 'noReward' : 'rewardRecorded')}</h3><p>{say('referralLine')}</p><OverviewButton onClick={onDetails}>{say('details')}</OverviewButton><Link className="l-ov-link" to="/loyalty/options?tab=bonus&way=referrals">{say('rules')}</Link></>
      : <><div className="l-rq-facts"><dl><Fact label={say('member')}><Person member={row.member} /></Fact><Fact label={say('membership')}>{row.member?.tier ?? '—'}</Fact><Fact label={say(row.kind === 'benefit' ? 'requested' : 'claimed')}>{recordWhen(row.at, i18n.language, boot.venue.timezone)}</Fact><Fact label={say(row.kind === 'benefit' ? 'request' : 'pointsCost')}>{row.kind === 'benefit' ? say('oneRequest') : say('points', { n: points(row.points, i18n.language) })}</Fact>{row.kind === 'redemption' && <Fact label={say('code')}>{row.code}</Fact>}</dl>{row.member && <Link className="l-ov-link" to={memberPath(row.member.id)}>{say('profile')}</Link>}</div>
      {row.kind === 'benefit' && <div className="l-rq-stages" aria-label={say('benefit')}>{(['pending', 'approved', 'fulfilled'] as const).map((state, i) => <span key={state}>{i > 0 && <span aria-hidden>→</span>}<span className="l-rq-status" data-state={(state === row.state || state === 'pending' && row.state === 'eligible') ? state === 'pending' ? 'waiting' : state === 'approved' ? 'approved' : 'done' : 'inactive'}>{state === 'pending' ? say('waiting') : state === 'approved' ? say('approved') : t('loyalty.requests.state.fulfilled', 'Done')}</span></span>)}</div>}
      {first ? <div className="l-rq-next"><h3>{say(first === 'approve' ? 'approveTitle' : row.kind === 'benefit' ? 'deliverBenefit' : 'deliverReward')}</h3><p>{say(first === 'approve' ? 'approveLine' : row.kind === 'benefit' ? 'deliverBenefitLine' : 'deliverRewardLine')}</p></div>
        : row.kind === 'redemption' && row.state === 'pending' ? <div className="l-rq-next"><p>{t('loyalty.rewards.redemptions.read_only', 'Only staff allowed to redeem points can fulfil or cancel a redemption.')}</p></div> : <p>{say('closedLine')}</p>}
      {first && <div className="l-rq-actions"><OverviewButton disabled={busy} aria-expanded={more} onClick={() => setMore(!more)}>{say('more')}</OverviewButton><OverviewButton primary disabled={busy} onClick={() => open(first)}>{say(first === 'approve' ? 'approve' : 'done')}</OverviewButton></div>}
      {more && <div className="l-rq-more">{benefits.includes('decline') && <OverviewButton disabled={busy} onClick={() => open('decline')}>{t('loyalty.requests.decline', 'Decline')}</OverviewButton>}{rewards.cancel && <OverviewButton disabled={busy} onClick={() => open('cancel')}>{t('loyalty.rewards.cancel.confirm', 'Cancel redemption')}</OverviewButton>}</div>}
    </>}
    {success && <p role="status" className="l-rq-success">{say('updated')}</p>}
    {error && !action && <p role="alert" className="l-rq-error">{error}</p>}
    <Activity row={row} />
    {action && <OverviewDialog kind="form" className="l-rq-dialog" busy={step.isPending} title={action === 'approve' ? say('confirmApprove', { item: title }) : action === 'decline' ? t('loyalty.requests.decline_title', 'Decline {{benefit}}', { benefit: title }) : action === 'cancel' && row.kind === 'redemption' ? t('loyalty.rewards.cancel.title', 'Cancel redemption {{code}}?', { code: row.code }) : say('confirmDone')} onClose={close}>
      <form className="l-rq-confirm" onSubmit={e => { e.preventDefault(); setTried(true); if (!busy && allowed(action) && (action !== 'decline' || reason.trim().length >= 2)) step.mutate(action) }}>
        {action === 'decline' ? <label><span>{t('loyalty.requests.decline_reason', 'Why')}</span><input autoFocus value={reason} maxLength={255} disabled={step.isPending} onChange={e => setReason(e.target.value)} aria-invalid={tried && reason.trim().length < 2} /><small>{t('loyalty.requests.decline_hint', 'Kept with the request for the team; the member is not sent it.')}</small></label>
          : <p>{action === 'approve' ? say('confirmApproveLine') : action === 'cancel' && row.kind === 'redemption' ? t('loyalty.rewards.cancel.body', '{{points}} points go back to {{name}}, and the reward returns to stock if it has a limit. The code stops working.', { points: points(row.points, i18n.language), name: row.member?.name || row.member?.number || '—' }) : say('confirmDoneLine', { name: row.member?.name || row.member?.number || '—', item: title })}</p>}
        {tried && action === 'decline' && reason.trim().length < 2 && <p role="alert" className="l-rq-error">{t('loyalty.requests.decline_needs_reason', 'Say why, in a few words.')}</p>}
        {error && <p role="alert" className="l-rq-error">{error}</p>}
        <div className="l-rq-actions"><OverviewButton type="button" disabled={step.isPending} onClick={close}>{t('loyalty.common.cancel', 'Cancel')}</OverviewButton><OverviewButton primary type="submit" disabled={busy || !allowed(action)} aria-busy={step.isPending}>{confirmLabel}</OverviewButton></div>
      </form>
    </OverviewDialog>}
  </aside>
}

function ReferralFacts({ row }: { row: ReferralRecord }) {
  const say = useRequestWords()
  const { i18n } = useTranslation()
  const boot = useBoot()
  return <dl className="l-rq-facts"><Fact label={say('referrer')}><Person member={row.member} /></Fact><Fact label={say('referee')}><Person member={row.referee} /></Fact><Fact label={say('created')}>{recordWhen(row.at, i18n.language, boot.venue.timezone)}</Fact><Fact label={say('pointsPaid')}>{say('points', { n: points(row.points.referrer + row.points.referee, i18n.language) })}</Fact>
    {row.points.referrer + row.points.referee !== 0 && <><Fact label={say('referrer')}>{say('points', { n: points(row.points.referrer, i18n.language) })}</Fact><Fact label={say('referee')}>{say('points', { n: points(row.points.referee, i18n.language) })}</Fact></>}
  </dl>
}
export function ReferralDialog({ row, onClose }: { row: ReferralRecord; onClose: () => void }) {
  const say = useRequestWords()
  const { t } = useTranslation()
  return <OverviewDialog kind="form" className="l-rq-dialog l-rq-referral-dialog" title={say('referral')} onClose={onClose}>
    <div className="l-rq-kind"><small>{recordLabel(row)}</small><RecordStatus row={row} /></div><ReferralFacts row={row} /><h3>{say(row.points.referrer + row.points.referee === 0 ? 'noReward' : 'rewardRecorded')}</h3><p>{say('referralLine')}</p><Link className="l-ov-link" to="/loyalty/options?tab=bonus&way=referrals">{say('rules')}</Link><Activity row={row} /><OverviewButton primary onClick={onClose}>{t('loyalty.overview.close', 'Close')}</OverviewButton>
  </OverviewDialog>
}
