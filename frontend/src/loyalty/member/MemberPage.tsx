import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, Coins, Gem, History as HistoryIcon, Inbox, Mail, Minus, Pencil, Phone, Plus, QrCode, Undo2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useApi, useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { errorKey, refusalKey } from '../lib/errors'
import { day, money, points, signedPoints, when } from '../lib/format'
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
import { CARD, CardHead, ICON_BUTTON } from './CardHead'
import { DetailsCard } from './DetailsCard'
import { lineType, memberActions, offersReverse, progressLine, type PointsMode, type ProgressIn } from './memberMath'
import { MoreMenu } from './MoreMenu'
import { NfcCards } from './NfcCards'
import { CreditPanel } from '../credit/CreditPanel'
import { ValidityCard } from '../membership/ValidityCard'
import { VisitsPanel } from '../visits/VisitsPanel'
import { PointsDialog } from './PointsDialog'
import { ReverseDialog } from './ReverseDialog'
import { benefitDetail } from '../scan/verdict'
import { useTypedPhrase } from '../scan/useTypedPhrase'

/**
 * A member's page (spec 2026-10-21 §4.3): who they are and their tier, their points and how far the next tier is, the
 * tier's benefits, the requests that wait for staff, Award and Redeem, and the whole points history with Reverse for a
 * manager. Release 2 (§4.1) adds their details with Edit details, the card, and a More menu (Resend the welcome email;
 * a manager's Change tier, Deactivate / Reactivate, Delete). A deleted member shows only what stays: the number and
 * the history. Release 5 adds the member's NFC cards (link, switch off). What the workspace does not do (bookings,
 * CRM) is one link away in the full admin. Release 9: each fact once (identity and contact in the header only), Award
 * and Redeem as words, Edit details and Card as named icons, the full admin and the rest under ⋯; cards with an icon
 * and a short title, in two columns from lg.
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
  const typedPhrase = useTypedPhrase()
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
          <Notice tone="info">{t('loyalty.membership.page.erased', 'Deleted: name and contact details are gone; the number and points history stay.')}</Notice>
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

      {/* Who they are and how to reach them, once; the money actions as words, the rest as icons and the ⋯ menu. */}
      <header className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="break-words font-a-display text-[40px] font-normal leading-none text-a-text">{member.name || member.email || `#${member.id}`}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-a-text-2">
            <TierChip tier={tier} theme={look.resolved} />
            {member.member_number && <span className="font-a-mono">{member.member_number}</span>}
            <span>{t('loyalty.member.joined', 'Joined {{day}}', { day: day(member.joined_at, locale, timeZone) })}</span>
            <span>{member.last_activity_at ? t('loyalty.member.last_seen', 'Last seen {{day}}', { day: day(member.last_activity_at, locale, timeZone) }) : t('loyalty.member.not_seen', 'Not seen yet')}</span>
            {!member.is_active && <span className="l-minus font-semibold">{t('loyalty.member.inactive', 'Account switched off')}</span>}
          </div>
          {(member.email || member.phone) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-a-text-2">
              {member.email && <span data-contact="email" className="inline-flex min-w-0 items-center gap-1.5 break-all"><Mail size={14} aria-hidden className="shrink-0" />{member.email}</span>}
              {member.phone && <span data-contact="phone" className="inline-flex items-center gap-1.5"><Phone size={14} aria-hidden className="shrink-0" />{member.phone}</span>}
            </div>
          )}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
          {(actions.award || actions.redeem) && (
            <div className="flex w-full gap-2 sm:w-auto">
              {actions.award && <Button className="flex-1 sm:flex-none" onClick={() => setDialog('award')}><Plus size={15} aria-hidden />{t('loyalty.member.award', 'Award points')}</Button>}
              {actions.redeem && <Button className="flex-1 sm:flex-none" variant="secondary" onClick={() => setDialog('redeem')}><Minus size={15} aria-hidden />{t('loyalty.member.redeem', 'Redeem points')}</Button>}
            </div>
          )}
          {/* Right-aligned: the More menu is always at the row's right end, where its list opens leftwards. */}
          <div className="ml-auto flex items-center gap-2">
            {own.edit && <IconButton label={t('loyalty.membership.page.edit', 'Edit details')} onClick={() => setDialog('details')}><Pencil size={16} aria-hidden /></IconButton>}
            {own.card && <IconButton label={t('loyalty.membership.page.card', 'Card')} onClick={() => setDialog('card')}><QrCode size={16} aria-hidden /></IconButton>}
            <MoreMenu items={more} fullAdmin={fullAdminMemberPath(member.id)} onPick={pick} />
          </div>
        </div>
      </header>

      {welcome.isSuccess && (
        <div className="max-w-2xl"><Notice tone="success">{t('loyalty.membership.page.welcome_sent', 'The welcome email is on its way to {{email}}, with a new code to set a password.', { email: welcome.data.sent_to })}</Notice></div>
      )}
      {welcomeFailure && (
        <div className="max-w-2xl"><Notice tone="danger">{t(...refusalKey('loyalty.membership', MEMBERSHIP_ERRORS, 'welcome', welcomeFailure), { minutes: waitMinutes(welcomeFailure.extra.retry_after) })}</Notice></div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-labelledby="points-title" className={CARD}>
          <CardHead id="points-title" icon={Coins} title={t('loyalty.member.points_title', 'Points')} />
          <div className="space-y-1">
            <p className="font-a-display text-5xl font-light leading-none tabular-nums text-a-text">{points(member.points, locale)}</p>
            <p className="text-sm text-a-text-2">{t('loyalty.member.lifetime', '{{points}} earned in all', { points: points(member.lifetime_points, locale) })}</p>
          </div>
          <ProgressBlock progress={progress} locale={locale} currency={boot.venue.currency} />
        </section>

        <section aria-labelledby="benefits-title" className={CARD}>
          <CardHead id="benefits-title" icon={Gem} title={t('loyalty.member.benefits_title', 'Tier benefits')} />
          {detail.benefits.length === 0
            ? <p className="text-sm text-a-text-2">{t('loyalty.member.no_benefits', 'This tier has no benefits yet.')}</p>
            : (
              <ul className="space-y-2">
                {detail.benefits.map(b => (
                  <li key={b.id} className="flex items-start gap-2 text-sm">
                    <Check size={15} aria-hidden className="mt-0.5 shrink-0 text-a-accent-text" />
                    <span className="min-w-0">
                      <span className="font-medium text-a-text">{b.name}</span>
                      {benefitDetail(b, typedPhrase) && <span className="text-a-text-2"> · {benefitDetail(b, typedPhrase)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section aria-labelledby="requests-title" className="space-y-3 rounded-2xl border border-a-border bg-a-surface py-5">
          <div className="px-5"><CardHead id="requests-title" icon={Inbox} title={t('loyalty.member.requests_title', 'Requests')} /></div>
          {detail.requests.length === 0
            ? <p className="px-5 text-sm text-a-text-2">{t('loyalty.member.no_requests', 'Nothing waits for the team.')}</p>
            : <ul className="divide-y divide-a-border">{detail.requests.map(r => <RequestRow key={r.id} request={r} showMember={false} compact />)}</ul>}
        </section>
      </div>

      {/*
        Two columns from lg: the desk's cards and the history (two thirds), the membership, details and NFC cards (one
        third). On a phone one column, in the order the desk needs: membership, visits, credit, details, cards, history.
        A card a venue does not use renders nothing, and its slot (empty) takes no room.
      */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start">
        <div className="contents lg:col-span-2 lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {/* Release 7: the stamp card with Check in and Add a purchase, and cashback credit — each when the venue uses it. */}
          <div className="order-2 min-w-0 empty:hidden"><VisitsPanel member={member} locale={locale} timeZone={timeZone} /></div>
          <div className="order-3 min-w-0 empty:hidden"><CreditPanel member={member} locale={locale} timeZone={timeZone} /></div>
          <div className="order-6 min-w-0"><History memberId={member.id} balance={member.points} locale={locale} /></div>
        </div>
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {/* Release 8: the membership — valid until, Extend (managers). */}
          <div className="order-1 min-w-0 empty:hidden"><ValidityCard member={member} locale={locale} timeZone={timeZone} /></div>
          <div className="order-4 min-w-0"><DetailsCard member={member} locale={locale} timeZone={timeZone} /></div>
          <div className="order-5 min-w-0"><NfcCards member={member} locale={locale} timeZone={timeZone} /></div>
        </div>
      </div>

      {(dialog === 'award' || dialog === 'redeem') && <PointsDialog mode={dialog} memberId={member.id} name={member.name} balance={member.points} onClose={() => setDialog(null)} />}
      {dialog === 'details' && <EditDetailsDialog member={member} languages={detail.options.languages} onClose={() => setDialog(null)} />}
      {dialog === 'card' && <CardDialog memberId={member.id} onClose={() => setDialog(null)} />}
      {dialog === 'tier' && <ChangeTierDialog member={member} onClose={() => setDialog(null)} />}
      {(dialog === 'deactivate' || dialog === 'reactivate') && <StatusDialog member={member} mode={dialog} onClose={() => setDialog(null)} />}
      {dialog === 'erase' && <EraseDialog member={member} onClose={() => setDialog(null)} />}
    </div>
  )
}

/** A round icon-only button with its name for a screen reader and the hover tip. */
function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={ICON_BUTTON}>{children}</button>
}

/**
 * How far the member is from the next tier, in the programme's terms (release 8, spec 2026-10-25 §3): "1,250 more to
 * reach Gold", "3 more visits to Gold", "€120 more to Gold"; what the member has on a measure other than points; and
 * the bar. The numbers and the measure are the server's (an answer without `by` reads as points, as before).
 */
function ProgressBlock({ progress, locale, currency }: { progress: ProgressIn; locale: string; currency: string }) {
  const { t } = useTranslation()
  const line = progressLine(progress)
  const sofar = line.by === 'visits'
    ? (progress.qualifying === 1
      ? t('loyalty.membership.progress.visits_sofar_one', '1 visit counted towards the tiers.')
      : t('loyalty.membership.progress.visits_sofar_many', '{{n}} visits counted towards the tiers.', { n: points(progress.qualifying, locale) }))
    : line.by === 'spend'
      ? t('loyalty.membership.progress.spend_sofar', '{{amount}} spent towards the tiers.', { amount: money(progress.qualifying, currency, locale) })
      : null
  const sentence = (() => {
    switch (line.kind) {
      case 'top': return t('loyalty.member.top_tier', 'In the top tier.')
      case 'ready': return t('loyalty.membership.progress.ready', 'Qualifies for {{tier}}: the move comes with the next visit or points.', { tier: line.tier ?? '' })
      case 'visit': return t('loyalty.membership.progress.visit_one', '1 more visit to {{tier}}', { tier: line.tier ?? '' })
      case 'visits': return t('loyalty.membership.progress.visits_many', '{{n}} more visits to {{tier}}', { n: points(line.needed, locale), tier: line.tier ?? '' })
      case 'spend': return t('loyalty.membership.progress.spend', '{{amount}} more to {{tier}}', { amount: money(line.needed, currency, locale), tier: line.tier ?? '' })
      default: return t('loyalty.member.to_next', '{{points}} more to reach {{tier}}', { points: points(line.needed, locale), tier: line.tier ?? '' })
    }
  })()

  return (
    <div data-progress-by={line.by} className="space-y-1.5">
      {sofar && <p className="text-sm text-a-text-2">{sofar}</p>}
      {progress.next_tier && (
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}
          aria-label={t('loyalty.member.progress_label', 'Progress to {{tier}}', { tier: progress.next_tier.name })}
          className="h-2 overflow-hidden rounded-full bg-a-surface-2">
          <div className="h-full rounded-full bg-a-accent" style={{ width: `${progress.percent}%` }} />
        </div>
      )}
      <p className="text-sm text-a-text-2">{sentence}</p>
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
    <section aria-labelledby="history-title" className="space-y-4 overflow-hidden rounded-2xl border border-a-border bg-a-surface pt-5">
      <div className="px-5"><CardHead id="history-title" icon={HistoryIcon} title={t('loyalty.history.title', 'Points history')} /></div>
      {query.isError && <div className="px-5 pb-5"><Notice tone="danger">{t(...errorKey('load', failureOf(query.error)))}</Notice></div>}
      {!data && query.isLoading && <div className="px-5 pb-5"><Skeleton className="h-40" /></div>}
      {data && data.lines.length === 0 && <p className="px-5 pb-5 text-sm text-a-text-2">{t('loyalty.history.none', 'No points yet.')}</p>}
      {data && data.lines.length > 0 && (
        <>
          <ul className="divide-y divide-a-border border-t border-a-border">
            {data.lines.map(line => {
              const type = lineType(line.type)
              const kind = t(`loyalty.history.type.${type}`, LINE_TYPE_WORDS[type])
              const reverse = t('loyalty.history.reverse', 'Reverse')
              return (
                <li key={line.id} data-line={line.id} className={`flex items-center gap-x-4 px-5 py-3 ${line.is_reversed ? 'opacity-70' : ''}`}>
                  <span className={`w-16 shrink-0 text-right font-semibold tabular-nums sm:w-20 ${line.points >= 0 ? 'l-plus' : 'l-minus'}`}>{signedPoints(line.points, locale)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm text-a-text">{line.description || kind}</span>
                    <span className="block text-xs text-a-text-2">
                      {/* The kind once: in the meta only when the line has a description of its own. */}
                      {[
                        line.description ? kind : null,
                        when(line.at, locale, boot.venue.timezone),
                        line.by ? t('loyalty.history.by', 'by {{name}}', { name: line.by }) : null,
                        line.balance_after !== null ? t('loyalty.history.balance_after', 'balance {{points}}', { points: points(line.balance_after, locale) }) : null,
                      ].filter(Boolean).join(' · ')}
                      {line.is_reversed && <> · <strong className="font-semibold">{t('loyalty.history.reversed', 'Reversed')}</strong></>}
                    </span>
                  </span>
                  {offersReverse(line, boot.staff.can) && (
                    <button type="button" data-reverse={line.id} aria-label={reverse} title={reverse} onClick={() => setReversing(line)}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-a-accent-text hover:bg-a-accent/10 sm:h-9 sm:w-9">
                      <Undo2 size={16} aria-hidden />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="!mt-0 px-5 pb-4 empty:hidden"><Pager page={data.page} pages={data.pages} onPage={setPage} /></div>
        </>
      )}
      {reversing && <ReverseDialog memberId={memberId} line={reversing} balance={balance} onClose={() => setReversing(null)} />}
    </section>
  )
}
