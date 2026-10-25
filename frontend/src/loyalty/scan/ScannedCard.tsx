import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Minus, Plus } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useApi, useBoot } from '../LoyaltyProvider'
import { points } from '../lib/format'
import { memberPath } from '../lib/links'
import { useLook } from '../lib/look'
import type { MemberRow } from '../lib/types'
import { PointsDialog } from '../member/PointsDialog'
import { memberActions, type PointsMode } from '../member/memberMath'
import { RequestRow } from '../requests/RequestRow'
import { ToneBadge } from '../ui/formParts'
import { TierChip } from '../ui/TierChip'
import { CreditSummary } from '../credit/CreditSummary'
import { DeskActions } from '../visits/DeskActions'
import { deskValidity, type ValidityLine } from './verdict'

/**
 * The member a desk scan found (releases 5–7, kept as it was; release 8 adds the membership's end): name, tier,
 * number, points; Award and Redeem; Check in and Add a purchase and the credit, each when the venue uses it; the
 * tier's benefits and what the member asked for.
 */
export function ScannedCard({ member }: { member: MemberRow }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const look = useLook()
  const [dialog, setDialog] = useState<PointsMode | null>(null)
  const detail = useQuery({ queryKey: ['loyalty', 'member', member.id], queryFn: () => api.member(member.id) })
  const now = detail.data?.member ?? member
  const tier = boot.programme.tiers.find(tr => tr.id === now.tier_id) ?? null
  const actions = memberActions(boot.staff.can)
  const validity = deskValidity(now, boot.venue.today, locale)

  return (
    <section aria-label={now.name} className="max-w-2xl space-y-4 rounded-2xl border border-a-border bg-a-surface p-5 shadow-a-sm animate-a-pop">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Link to={memberPath(now.id)} className="block font-a-display text-3xl text-a-text hover:underline">{now.name || now.member_number}</Link>
          <div className="flex flex-wrap items-center gap-2 text-sm text-a-text-2">
            <TierChip tier={tier} theme={look.resolved} />
            {now.member_number && <span className="font-a-mono">{now.member_number}</span>}
          </div>
          {validity && <Validity line={validity} />}
        </div>
        <p className="text-right">
          <span className="block font-a-display text-4xl font-light tabular-nums text-a-text">{points(now.points, locale)}</span>
          <span className="text-xs text-a-text-2">{t('loyalty.scan.points', 'points')}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.award && <Button onClick={() => setDialog('award')}><Plus size={15} aria-hidden />{t('loyalty.member.award', 'Award points')}</Button>}
        {actions.redeem && <Button variant="secondary" onClick={() => setDialog('redeem')}><Minus size={15} aria-hidden />{t('loyalty.member.redeem', 'Redeem points')}</Button>}
        <Link to={memberPath(now.id)} className="inline-flex items-center rounded-full px-3 py-2 text-sm font-semibold text-a-accent-text hover:bg-a-accent/10">{t('loyalty.scan.open', 'Open member')}</Link>
      </div>
      {/* Release 7: Check in and Add a purchase; the credit balance and Use credit — each when the venue uses it. */}
      <DeskActions member={now} />
      <CreditSummary member={now} />
      {!detail.data && detail.isLoading && <Skeleton className="h-16" />}
      {detail.data && detail.data.benefits.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-a-text-2">{t('loyalty.member.benefits_title', 'Tier benefits')}</p>
          <ul className="flex flex-wrap gap-2">
            {detail.data.benefits.map(b => <li key={b.id} className="rounded-full bg-a-surface-2 px-2.5 py-1 text-xs text-a-text">{b.name}{b.value ? ` · ${b.value}` : ''}</li>)}
          </ul>
        </div>
      )}
      {detail.data && detail.data.requests.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-a-text-2">{t('loyalty.member.requests_title', 'Requests')}</p>
          <ul className="-mx-5 divide-y divide-a-border">{detail.data.requests.map(r => <RequestRow key={r.id} request={r} showMember={false} compact />)}</ul>
        </div>
      )}
      {dialog && <PointsDialog mode={dialog} memberId={now.id} name={now.name} balance={now.points} onClose={() => setDialog(null)} />}
    </section>
  )
}

/** The membership's end: a plain line, amber when it ends soon, red once it ended (verdict.ts `deskValidity`). */
export function Validity({ line }: { line: ValidityLine }) {
  const { t } = useTranslation()
  const words = t(line.sentence.key, line.sentence.fallback, line.sentence.vars)
  if (line.tone === 'neutral') {
    return <p data-validity="" className="flex items-center gap-1.5 text-sm text-a-text-2"><CalendarClock size={14} aria-hidden />{words}</p>
  }
  return <p data-validity=""><ToneBadge tone={line.tone === 'danger' ? 'declined' : 'pending'}>{words}</ToneBadge></p>
}
