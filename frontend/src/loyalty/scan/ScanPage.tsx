import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Minus, Plus, ScanLine } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useApi, useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { points } from '../lib/format'
import { memberPath } from '../lib/links'
import { useLook } from '../lib/look'
import type { MemberRow } from '../lib/types'
import { PointsDialog } from '../member/PointsDialog'
import { memberActions, type PointsMode } from '../member/memberMath'
import { RequestRow } from '../requests/RequestRow'
import { TierChip } from '../ui/TierChip'

const INPUT = 'w-full rounded-xl border border-a-border bg-a-surface px-4 py-3 font-a-mono text-base text-a-text'

/**
 * Scan (spec 2026-10-21 §4.7): one field for whatever a card reader types or a person enters — the member app's QR
 * code, an NFC card's ID, a member number. A reader ends with Enter, which sends it; the field empties and keeps the
 * focus for the next card. Found: the member's card with Award, Redeem and their open requests.
 */
export function ScanPage() {
  const { t } = useTranslation()
  const api = useApi()
  const [code, setCode] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const scan = useMutation({
    mutationFn: (value: string) => api.scan(value),
    onSettled: () => { setCode(''); field.current?.focus() },
  })

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader title={t('loyalty.scan.title', 'Scan')} line={t('loyalty.scan.line', 'Scan the member app’s QR code or a card, or type a member number.')} />

      <form className="flex max-w-2xl gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim() !== '') scan.mutate(code.trim()) }}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t('loyalty.scan.field', 'Card, QR code or member number')}</span>
          <input ref={field} value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off" spellCheck={false}
            placeholder={t('loyalty.scan.placeholder', 'Scan or type…')} className={INPUT} />
        </label>
        <Button type="submit" loading={scan.isPending}><ScanLine size={16} aria-hidden />{t('loyalty.scan.find', 'Find')}</Button>
      </form>

      {scan.isError && <div className="max-w-2xl"><Notice tone="warning">{t(...errorKey('scan', failureOf(scan.error)))}</Notice></div>}
      {scan.isSuccess && <ScannedCard key={`${scan.data.member.id}-${scan.submittedAt}`} member={scan.data.member} />}
    </div>
  )
}

/** The member a scan found: name, tier, points; Award and Redeem; the tier's benefits and what they asked for. */
function ScannedCard({ member }: { member: MemberRow }) {
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

  return (
    <section aria-label={now.name} className="max-w-2xl space-y-4 rounded-2xl border border-a-border bg-a-surface p-5 shadow-a-sm animate-a-pop">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Link to={memberPath(now.id)} className="block font-a-display text-3xl text-a-text hover:underline">{now.name || now.member_number}</Link>
          <div className="flex flex-wrap items-center gap-2 text-sm text-a-text-2">
            <TierChip tier={tier} theme={look.resolved} />
            {now.member_number && <span className="font-a-mono">{now.member_number}</span>}
          </div>
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
