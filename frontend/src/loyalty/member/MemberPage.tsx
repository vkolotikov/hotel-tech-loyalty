import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ExternalLink, Minus, Pencil, Plus, QrCode } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { Eyebrow, SectionTitle } from '../../workspace/ui/Typography'
import { useApi, useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { errorKey, refusalKey } from '../lib/errors'
import { day, points, signedPoints, when } from '../lib/format'
import { fullAdminMemberPath } from '../lib/links'
import { useLook } from '../lib/look'
import { onShortcuts } from '../lib/shortcuts'
import type { LedgerLine, MemberDetail } from '../lib/types'
import { LINE_TYPE_WORDS } from '../lib/words'
import { RequestRow } from '../requests/RequestRow'
import { Pager } from '../ui/Pager'
import { TierChip } from '../ui/TierChip'
import { membershipApi } from '../membership/api'
import { CardDialog } from '../membership/CardDialog'
import { ChangeTierDialog } from '../membership/ChangeTierDialog'
import { EditDetailsDialog } from '../membership/EditDetailsDialog'
import { EraseDialog } from '../membership/EraseDialog'
import { ERRORS as MEMBERSHIP_ERRORS } from '../membership/errors'
import { moreItems, pageActions, waitMinutes, type MoreItem } from '../membership/membershipMath'
import { StatusDialog } from '../membership/StatusDialog'
import { DetailsCard } from './DetailsCard'
import { lineType, memberActions, offersReverse, type PointsMode } from './memberMath'
import { MoreMenu } from './MoreMenu'
import { PointsDialog } from './PointsDialog'
import { ReverseDialog } from './ReverseDialog'

/**
 * A member's page (spec 2026-10-21 §4.3): who they are and their tier, their points and how far the next tier is, the
 * tier's benefits, the requests that wait for staff, Award and Redeem, and the whole points history with Reverse for a
 * manager. Release 2 (§4.1) adds their details with Edit details, the card, and a More menu (Resend the welcome email;
 * a manager's Change tier, Deactivate / Reactivate, Delete). A deleted member shows only what stays: the number and
 * the history. What the workspace does not do (bookings, CRM) is one link away in the full admin.
 */
export function MemberPage() {
  const { id: raw } = useParams()
  const id = Number(raw)
  const { t, i18n } = useTranslation()
  const api = useApi()
  const query = useQuery({ queryKey: ['loyalty', 'member', id], queryFn: () => api.member(id), enabled: Number.isInteger(id) && id > 0, retry: false })

  if (!Number.isInteger(id) || id <= 0 || (query.isError && failureOf(query.error).status === 404)) {
    return (
      <div className="max-w-xl space-y-3 px-4 py-6 lg:px-6">
        <Notice tone="warning">{t('loyalty.load.error.not_found', 'This member is not in your programme any more.')}</Notice>
        <Link to="/loyalty" className="text-sm text-a-accent-text hover:underline">{t('loyalty.member.back', 'All members')}</Link>
      </div>
    )
  }
  if (query.isError) {
    return (
      <div className="max-w-xl space-y-3 px-4 py-6 lg:px-6">
        <Notice tone="danger">{t(...errorKey('load', failureOf(query.error)))}</Notice>
        <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</Button>
      </div>
    )
  }
  if (!query.data) {
    return (
      <div role="status" className="space-y-4 px-4 py-6 lg:px-6">
        <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      </div>
    )
  }
  return <Member detail={query.data} locale={i18n.language || 'en'} />
}

/** A dialog the member page has open: one of the points dialogs, or one of release 2's. */
type Open = PointsMode | 'details' | 'card' | Exclude<MoreItem, 'welcome'>

function Member({ detail, locale }: { detail: MemberDetail; locale: string }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const look = useLook()
  const { member, progress } = detail
  const tier = boot.programme.tiers.find(tr => tr.id === member.tier_id) ?? null
  const erased = member.is_erased
  const actions = erased ? { award: false, redeem: false, reverse: false } : memberActions(boot.staff.can)
  const own = pageActions(member)
  const more = moreItems(boot.staff.can, member)
  const [dialog, setDialog] = useState<Open | null>(null)
  const timeZone = boot.venue.timezone

  // Resend the welcome email: at once, from the More menu; what came of it shows under the header.
  const welcome = useMutation({ mutationFn: () => membershipApi.welcome(member.id) })
  const welcomeFailure = welcome.isError ? failureOf(welcome.error) : null
  const pick = (item: MoreItem) => {
    if (item === 'welcome') welcome.mutate()
    else setDialog(item)
  }

  // A awards and R redeems while the page is open (spec §4.8), for whoever may.
  useEffect(() => onShortcuts(window, document, (hit, e) => {
    if (hit === 'award' && actions.award) setDialog('award')
    else if (hit === 'redeem' && actions.redeem) setDialog('redeem')
    else return
    e.preventDefault()
  }), [actions.award, actions.redeem])

  if (erased) {
    return (
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <Link to="/loyalty" className="inline-flex items-center gap-1 text-sm text-a-text-2 hover:text-a-text">
          <ArrowLeft size={15} aria-hidden />{t('loyalty.member.back', 'All members')}
        </Link>
        <div className="min-w-0 space-y-2">
          <h1 className="font-a-display text-[40px] font-normal leading-none text-a-text">{t('loyalty.membership.page.erased_title', 'Deleted member')}</h1>
          {member.member_number && <p className="font-a-mono text-sm text-a-text-2">{member.member_number}</p>}
        </div>
        <div className="max-w-2xl">
          <Notice tone="info">{t('loyalty.membership.page.erased', 'This member was deleted. Their name and contact details are gone; the member number and the points history stay, so the figures still add up.')}</Notice>
        </div>
        <History memberId={member.id} balance={member.points} locale={locale} />
      </div>
    )
  }

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <Link to="/loyalty" className="inline-flex items-center gap-1 text-sm text-a-text-2 hover:text-a-text">
        <ArrowLeft size={15} aria-hidden />{t('loyalty.member.back', 'All members')}
      </Link>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-2">
          <h1 className="break-words font-a-display text-[40px] font-normal leading-none text-a-text">{member.name || member.email || `#${member.id}`}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-a-text-2">
            <TierChip tier={tier} theme={look.resolved} />
            {member.member_number && <span className="font-a-mono">{member.member_number}</span>}
            <span>{t('loyalty.member.joined', 'Joined {{day}}', { day: day(member.joined_at, locale, timeZone) })}</span>
            <span>{member.last_activity_at ? t('loyalty.member.last_seen', 'Last seen {{day}}', { day: day(member.last_activity_at, locale, timeZone) }) : t('loyalty.member.not_seen', 'Not seen yet')}</span>
            {!member.is_active && <span className="l-minus font-semibold">{t('loyalty.member.inactive', 'Account switched off')}</span>}
          </div>
          {(member.email || member.phone) && <p className="break-words text-sm text-a-text-2">{[member.email, member.phone].filter(Boolean).join(' · ')}</p>}
        </div>
        {/* Right-aligned and wrapping from the right: the More menu is always at a row's right end, where its list opens leftwards. */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {actions.award && <Button onClick={() => setDialog('award')}><Plus size={15} aria-hidden />{t('loyalty.member.award', 'Award points')}</Button>}
          {actions.redeem && <Button variant="secondary" onClick={() => setDialog('redeem')}><Minus size={15} aria-hidden />{t('loyalty.member.redeem', 'Redeem points')}</Button>}
          {own.edit && <Button variant="secondary" onClick={() => setDialog('details')}><Pencil size={15} aria-hidden />{t('loyalty.membership.page.edit', 'Edit details')}</Button>}
          {own.card && <Button variant="secondary" onClick={() => setDialog('card')}><QrCode size={15} aria-hidden />{t('loyalty.membership.page.card', 'Card')}</Button>}
          <Link to={fullAdminMemberPath(member.id)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-a-accent-text hover:bg-a-accent/10">
            {t('loyalty.member.full_admin', 'Open in full admin')}<ExternalLink size={14} aria-hidden />
          </Link>
          <MoreMenu items={more} onPick={pick} />
        </div>
      </div>

      {welcome.isSuccess && (
        <div className="max-w-2xl"><Notice tone="success">{t('loyalty.membership.page.welcome_sent', 'The welcome email is on its way to {{email}}, with a new code to set a password.', { email: welcome.data.sent_to })}</Notice></div>
      )}
      {welcomeFailure && (
        <div className="max-w-2xl"><Notice tone="danger">{t(...refusalKey('loyalty.membership', MEMBERSHIP_ERRORS, 'welcome', welcomeFailure), { minutes: waitMinutes(welcomeFailure.extra.retry_after) })}</Notice></div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-labelledby="points-title" className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-5">
          <Eyebrow><span id="points-title">{t('loyalty.member.points_title', 'Points')}</span></Eyebrow>
          <p className="font-a-display text-5xl font-light tabular-nums text-a-text">{points(member.points, locale)}</p>
          <p className="text-sm text-a-text-2">{t('loyalty.member.lifetime', '{{points}} earned in all', { points: points(member.lifetime_points, locale) })}</p>
          {progress.next_tier ? (
            <div className="space-y-1.5">
              <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}
                aria-label={t('loyalty.member.progress_label', 'Progress to {{tier}}', { tier: progress.next_tier.name })}
                className="h-2 overflow-hidden rounded-full bg-a-surface-2">
                <div className="h-full rounded-full bg-a-accent" style={{ width: `${progress.percent}%` }} />
              </div>
              <p className="text-sm text-a-text-2">{t('loyalty.member.to_next', '{{points}} more to reach {{tier}}', { points: points(progress.needed, locale), tier: progress.next_tier.name })}</p>
            </div>
          ) : (
            <p className="text-sm text-a-text-2">{t('loyalty.member.top_tier', 'In the top tier.')}</p>
          )}
        </section>

        <section aria-labelledby="benefits-title" className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-5">
          <Eyebrow><span id="benefits-title">{t('loyalty.member.benefits_title', 'Tier benefits')}</span></Eyebrow>
          {detail.benefits.length === 0
            ? <p className="text-sm text-a-text-2">{t('loyalty.member.no_benefits', 'This tier has no benefits yet.')}</p>
            : (
              <ul className="space-y-2">
                {detail.benefits.map(b => (
                  <li key={b.id} className="text-sm">
                    <span className="font-medium text-a-text">{b.name}</span>
                    {b.value && <span className="text-a-text-2"> · {b.value}</span>}
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section aria-labelledby="requests-title" className="space-y-3 rounded-2xl border border-a-border bg-a-surface py-5">
          <div className="px-5"><Eyebrow><span id="requests-title">{t('loyalty.member.requests_title', 'Requests')}</span></Eyebrow></div>
          {detail.requests.length === 0
            ? <p className="px-5 text-sm text-a-text-2">{t('loyalty.member.no_requests', 'Nothing waits for the team.')}</p>
            : <ul className="divide-y divide-a-border">{detail.requests.map(r => <RequestRow key={r.id} request={r} showMember={false} compact />)}</ul>}
        </section>
      </div>

      <DetailsCard member={member} locale={locale} timeZone={timeZone} />

      <History memberId={member.id} balance={member.points} locale={locale} />

      {(dialog === 'award' || dialog === 'redeem') && <PointsDialog mode={dialog} memberId={member.id} name={member.name} balance={member.points} onClose={() => setDialog(null)} />}
      {dialog === 'details' && <EditDetailsDialog member={member} languages={detail.options.languages} onClose={() => setDialog(null)} />}
      {dialog === 'card' && <CardDialog memberId={member.id} onClose={() => setDialog(null)} />}
      {dialog === 'tier' && <ChangeTierDialog member={member} onClose={() => setDialog(null)} />}
      {(dialog === 'deactivate' || dialog === 'reactivate') && <StatusDialog member={member} mode={dialog} onClose={() => setDialog(null)} />}
      {dialog === 'erase' && <EraseDialog member={member} onClose={() => setDialog(null)} />}
    </div>
  )
}

/** The whole points history, newest first, 25 a page; Reverse for a manager on a line that can be reversed. */
function History({ memberId, balance, locale }: { memberId: number; balance: number; locale: string }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const api = useApi()
  const [page, setPage] = useState(1)
  const [reversing, setReversing] = useState<LedgerLine | null>(null)
  const query = useQuery({ queryKey: ['loyalty', 'history', memberId, page], queryFn: () => api.history(memberId, page), placeholderData: keepPreviousData })
  const data = query.data

  return (
    <section aria-labelledby="history-title" className="space-y-3">
      <SectionTitle><span id="history-title">{t('loyalty.history.title', 'Points history')}</span></SectionTitle>
      {query.isError && <Notice tone="danger">{t(...errorKey('load', failureOf(query.error)))}</Notice>}
      {!data && query.isLoading && <Skeleton className="h-40" />}
      {data && data.lines.length === 0 && <p className="text-sm text-a-text-2">{t('loyalty.history.none', 'No points yet.')}</p>}
      {data && data.lines.length > 0 && (
        <>
          <ul className="divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border bg-a-surface">
            {data.lines.map(line => {
              const type = lineType(line.type)
              return (
                <li key={line.id} data-line={line.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 ${line.is_reversed ? 'opacity-70' : ''}`}>
                  <span className={`w-20 shrink-0 text-right font-semibold tabular-nums ${line.points >= 0 ? 'l-plus' : 'l-minus'}`}>{signedPoints(line.points, locale)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-a-text">{line.description || t(`loyalty.history.type.${type}`, LINE_TYPE_WORDS[type])}</span>
                    <span className="block text-xs text-a-text-2">
                      {[
                        t(`loyalty.history.type.${type}`, LINE_TYPE_WORDS[type]),
                        when(line.at, locale, boot.venue.timezone),
                        line.by ? t('loyalty.history.by', 'by {{name}}', { name: line.by }) : null,
                        line.balance_after !== null ? t('loyalty.history.balance_after', 'balance {{points}}', { points: points(line.balance_after, locale) }) : null,
                      ].filter(Boolean).join(' · ')}
                      {line.is_reversed && <> · <strong className="font-semibold">{t('loyalty.history.reversed', 'Reversed')}</strong></>}
                    </span>
                  </span>
                  {offersReverse(line, boot.staff.can) && (
                    <Button size="sm" variant="ghost" onClick={() => setReversing(line)}>{t('loyalty.history.reverse', 'Reverse')}</Button>
                  )}
                </li>
              )
            })}
          </ul>
          <Pager page={data.page} pages={data.pages} onPage={setPage} />
        </>
      )}
      {reversing && <ReverseDialog memberId={memberId} line={reversing} balance={balance} onClose={() => setReversing(null)} />}
    </section>
  )
}
