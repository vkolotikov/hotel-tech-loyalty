import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, History as HistoryIcon, Undo2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useApi, useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { errorKey, refusalKey } from '../lib/errors'
import { money, points, signedPoints, when } from '../lib/format'
import { fullAdminMemberPath } from '../lib/links'
import { onShortcuts } from '../lib/shortcuts'
import type { LedgerLine, MemberDetail } from '../lib/types'
import { LINE_TYPE_WORDS } from '../lib/words'
import { Pager } from '../ui/Pager'
import { membershipApi } from '../membership/api'
import { CardDialog } from '../membership/CardDialog'
import { ChangeTierDialog } from '../membership/ChangeTierDialog'
import { EditDetailsDialog } from '../membership/EditDetailsDialog'
import { EraseDialog } from '../membership/EraseDialog'
import { ERRORS as MEMBERSHIP_ERRORS } from '../membership/errors'
import { moreItems, pageActions, waitMinutes, type MoreItem } from '../membership/membershipMath'
import { StatusDialog } from '../membership/StatusDialog'
import { CardHead } from './CardHead'
import { DetailsCard } from './DetailsCard'
import { lineType, memberActions, offersReverse, progressLine, type PointsMode, type ProgressIn } from './memberMath'
import { MoreMenu } from './MoreMenu'
import { NfcCards } from './NfcCards'
import { CreditPanel } from '../credit/CreditPanel'
import { VisitsPanel } from '../visits/VisitsPanel'
import { PointsDialog } from './PointsDialog'
import { ReverseDialog } from './ReverseDialog'
import { ProfileBenefits } from '../redesign/ProfileBenefits'
import { useRedesignWords } from '../redesign/words'
import { OverviewButton } from '../overview/OverviewUI'
import { initials } from '../members/membersQuery'
import memberDiagonal from '../redesign/assets/member-diagonal.svg'
import { usePhone } from '../overview/useOverview'
import { MobileTitle, MobileTile } from '../mobile/MobileUI'
import { mobileIcons } from '../mobile/assets'
import { useMobileWords } from '../mobile/words'
import { MemberBenefits } from '../mobile/MemberBenefits'

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
  return <Member key={id} detail={query.data} locale={i18n.language || 'en'} />
}

/** A dialog the member page has open: one of the points dialogs, or one of release 2's. */
type Open = PointsMode | 'details' | 'card' | Exclude<MoreItem, 'welcome'>

function Member({ detail, locale }: { detail: MemberDetail; locale: string }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const say = useRedesignWords()
  const { member, progress } = detail
  const tier = boot.programme.tiers.find(tr => tr.id === member.tier_id) ?? null
  const erased = member.is_erased
  const actions = erased ? { award: false, redeem: false, reverse: false } : memberActions(boot.staff.can)
  const own = pageActions(member)
  const more = moreItems(boot.staff.can, member)
  const [dialog, setDialog] = useState<Open | null>(null)
  const phone = usePhone()
  const mobile = useMobileWords()
  const [params, setParams] = useSearchParams()
  const view = params.get('view')
  const mobileView = (value: string | null) => { const next = new URLSearchParams(params); if (value) next.set('view', value); else next.delete('view'); setParams(next) }
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
      <div className="l-ov-page l-rd-page">
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
    <div className={`l-ov-page l-rd-page l-rd-profile-page ${phone ? 'l-mw-page l-mw-member' : ''}`}>
      {phone ? <>
        {welcome.isSuccess && <Notice tone="success">{t('loyalty.membership.page.welcome_sent', 'The welcome email is on its way to {{email}}, with a new code to set a password.', { email: welcome.data.sent_to })}</Notice>}
        {welcomeFailure && <Notice tone="danger">{t(...refusalKey('loyalty.membership', MEMBERSHIP_ERRORS, 'welcome', welcomeFailure), { minutes: waitMinutes(welcomeFailure.extra.retry_after) })}</Notice>}
        {view ? <button className="l-mw-back" onClick={() => mobileView(null)}>← {mobile('back')}</button> : <Link className="l-mw-back" to="/loyalty">← {mobile('back')}</Link>}
        <MobileTitle>{view === 'details' ? mobile('memberDetails') : view === 'benefits' ? t('loyalty.overview.rewardsNav', 'Rewards & benefits') : view === 'history' ? mobile('memberHistory') : member.name || member.email || `#${member.id}`}</MobileTitle>
        {view === 'details' ? <><DetailsCard member={member} locale={locale} timeZone={timeZone} redesigned onEdit={own.edit ? () => setDialog('details') : undefined} /><NfcCards member={member} locale={locale} timeZone={timeZone} />{own.card && <OverviewButton onClick={() => setDialog('card')}>{say('viewCard')}</OverviewButton>}</>
        : view === 'benefits' ? <><p className="l-mw-identity">{member.name} · {t('loyalty.common.points_count', '{{points}} pts', { points: points(member.points, locale) })}</p><MemberBenefits detail={detail} /></>
        : view === 'history' ? <><VisitsPanel member={member} locale={locale} timeZone={timeZone} /><CreditPanel member={member} locale={locale} timeZone={timeZone} /><History memberId={member.id} balance={member.points} locale={locale} /></>
        : <>
          <p className="l-mw-identity">{say('profileIdentity', { level: tier?.name ?? say('noLevel'), state: say(!member.is_active ? 'off' : member.membership_state ?? 'active'), number: member.member_number ?? member.id })}</p>
          <section className="l-mw-panel l-mw-balance"><small className="l-mw-eyebrow">{mobile('available')}</small><strong>{points(member.points, locale)}</strong><small>{mobile('earnedTotal', { n: points(member.lifetime_points, locale) })}</small></section>
          <div className="l-mw-tiles">{actions.award && <MobileTile primary icon={mobileIcons.award} title={t('loyalty.member.award', 'Award points')} hint={mobile('addBalance')} onClick={() => setDialog('award')} />}{actions.redeem && <MobileTile icon={mobileIcons.deduct} title={mobile('deduct')} hint={mobile('manualAdjustment')} onClick={() => setDialog('redeem')} />}<MobileTile icon={mobileIcons.benefits} title={mobile('benefits')} hint={mobile('rewardsClaims')} onClick={() => mobileView('benefits')} /><MobileTile icon={mobileIcons.members} title={mobile('memberDetails')} hint={mobile('contactMembership')} onClick={() => mobileView('details')} /></div>
          <section className="l-mw-panel l-mw-progress"><ProgressBlock progress={progress} locale={locale} currency={boot.venue.currency} /></section>
          <div className="l-mw-member-more"><MoreMenu items={more} fullAdmin={fullAdminMemberPath(member.id)} onPick={pick} /><OverviewButton onClick={() => mobileView('history')}>{mobile('memberHistory')}</OverviewButton></div>
        </>}
      </> : <>
      <Link to="/loyalty" className="inline-flex items-center gap-1 text-sm text-a-text-2 hover:text-a-text">
        <ArrowLeft size={15} aria-hidden />{t('loyalty.member.back', 'All members')}
      </Link>

      <header className="l-rd-profile-header">
        <img className="l-rd-member-diagonal" src={memberDiagonal} alt="" />
        <span className="l-rd-avatar l-rd-profile-avatar" aria-hidden>{initials(member.name || member.email || '')}</span>
        <div className="l-rd-profile-identity"><h1>{member.name || member.email || `#${member.id}`}</h1><small>{say('profileIdentity', { level: tier?.name ?? say('noLevel'), state: say(!member.is_active ? 'off' : member.membership_state ?? 'active'), number: member.member_number ?? member.id })}</small></div>
        <div className="l-rd-actions">
          {actions.award && <OverviewButton primary onClick={() => setDialog('award')}>{t('loyalty.member.award', 'Award points')}</OverviewButton>}
          {actions.redeem && <OverviewButton onClick={() => setDialog('redeem')}>{t('loyalty.member.redeem', 'Redeem points')}</OverviewButton>}
          {own.card && <OverviewButton onClick={() => setDialog('card')}>{say('viewCard')}</OverviewButton>}
          <MoreMenu items={more} fullAdmin={fullAdminMemberPath(member.id)} onPick={pick} />
        </div>
      </header>

      {welcome.isSuccess && (
        <div className="max-w-2xl"><Notice tone="success">{t('loyalty.membership.page.welcome_sent', 'The welcome email is on its way to {{email}}, with a new code to set a password.', { email: welcome.data.sent_to })}</Notice></div>
      )}
      {welcomeFailure && (
        <div className="max-w-2xl"><Notice tone="danger">{t(...refusalKey('loyalty.membership', MEMBERSHIP_ERRORS, 'welcome', welcomeFailure), { minutes: waitMinutes(welcomeFailure.extra.retry_after) })}</Notice></div>
      )}

      <div className="l-rd-profile-metrics">
        <section className="l-rd-balance" aria-labelledby="points-title"><span id="points-title">{say('pointsBalance')}</span><strong>{points(member.points, locale)}</strong><small>{say('available')}</small><small>{say('lifetime', { n: points(member.lifetime_points, locale) })}</small></section>
        <section className="l-ov-panel l-rd-progress"><ProgressBlock progress={progress} locale={locale} currency={boot.venue.currency} /></section>
      </div>
      <div className="l-rd-profile-columns">
        <div className="l-rd-profile-main">
          <ProfileBenefits detail={detail} />
          <div className="empty:hidden"><VisitsPanel member={member} locale={locale} timeZone={timeZone} /></div>
          <div className="empty:hidden"><CreditPanel member={member} locale={locale} timeZone={timeZone} /></div>
          <History memberId={member.id} balance={member.points} locale={locale} />
        </div>
        <div className="l-rd-profile-aside">
          <DetailsCard member={member} locale={locale} timeZone={timeZone} redesigned onEdit={own.edit ? () => setDialog('details') : undefined} />
          <NfcCards member={member} locale={locale} timeZone={timeZone} />
        </div>
      </div>

      </>}
      {(dialog === 'award' || dialog === 'redeem') && <PointsDialog mode={dialog} memberId={member.id} name={member.name} balance={member.points} memberNumber={member.member_number} level={tier?.name} onClose={() => setDialog(null)} />}
      {dialog === 'details' && <EditDetailsDialog member={member} languages={detail.options.languages} onClose={() => setDialog(null)} />}
      {dialog === 'card' && <CardDialog memberId={member.id} onClose={() => setDialog(null)} />}
      {dialog === 'tier' && <ChangeTierDialog member={member} onClose={() => setDialog(null)} />}
      {(dialog === 'deactivate' || dialog === 'reactivate') && <StatusDialog member={member} mode={dialog} onClose={() => setDialog(null)} />}
      {dialog === 'erase' && <EraseDialog member={member} onClose={() => setDialog(null)} />}
    </div>
  )
}

/**
 * How far the member is from the next tier, in the programme's terms (release 8, spec 2026-10-25 §3): "1,250 more to
 * reach Gold", "3 more visits to Gold", "€120 more to Gold"; what the member has on a measure other than points; and
 * the bar. The numbers and the measure are the server's (an answer without `by` reads as points, as before).
 */
function ProgressBlock({ progress, locale, currency }: { progress: ProgressIn; locale: string; currency: string }) {
  const { t } = useTranslation()
  const say = useRedesignWords()
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
    <div data-progress-by={line.by} className="space-y-1.5"><h2>{progress.next_tier ? say('progress', { name: progress.next_tier.name }) : say('qualification')}</h2>{progress.next_tier && <p>{say(line.by === 'visits' ? 'qualifyingVisits' : line.by === 'spend' ? 'qualifyingSpend' : 'qualifying', { current: line.by === 'spend' ? money(progress.qualifying, currency, locale) : points(progress.qualifying, locale), target: line.by === 'spend' ? money(progress.next_tier.floor ?? progress.next_tier.min_points, currency, locale) : points(progress.next_tier.floor ?? progress.next_tier.min_points, locale) })}</p>}
      {sofar && <p className="text-sm text-a-text-2">{sofar}</p>}
      {progress.next_tier && (
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}
          aria-label={t('loyalty.member.progress_label', 'Progress to {{tier}}', { tier: progress.next_tier.name })}
          className="l-rd-progress-track">
          <div className="l-rd-progress-fill" style={{ width: `${progress.percent}%` }} />
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
  const say = useRedesignWords()
  const [expanded, setExpanded] = useState(false)
  const [type, setType] = useState('all')
  const [reversing, setReversing] = useState<LedgerLine | null>(null)
  const query = useQuery({ queryKey: type === 'all' ? ['loyalty', 'history', memberId, page] : ['loyalty', 'history', memberId, page, type], queryFn: () => api.history(memberId, page, type), placeholderData: keepPreviousData })
  const data = query.data

  return (
    <section aria-labelledby="history-title" className="l-ov-panel l-rd-history">
      <div className="l-rd-card-head"><CardHead id="history-title" icon={HistoryIcon} title={t('loyalty.history.title', 'Points history')} /><select aria-label={say('allActivity')} value={type} onChange={e => { setType(e.target.value); setPage(1) }}><option value="all">{say('allActivity')}</option>{Object.entries(LINE_TYPE_WORDS).filter(([key]) => key !== 'other').map(([key, word]) => <option key={key} value={key}>{t(`loyalty.history.type.${key}`, word)}</option>)}</select></div>
      {query.isError && <div className="px-5 pb-5"><Notice tone="danger">{t(...errorKey('load', failureOf(query.error)))}</Notice><OverviewButton onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</OverviewButton></div>}
      {!data && query.isLoading && <div className="px-5 pb-5"><Skeleton className="h-40" /></div>}
      {data && data.lines.length === 0 && <p className="px-5 pb-5 text-sm text-a-text-2">{t('loyalty.history.none', 'No points yet.')}</p>}
      {data && data.lines.length > 0 && (
        <>
          <ul className="divide-y divide-a-border border-t border-a-border">
            {(expanded ? data.lines : data.lines.slice(0, 3)).map(line => {
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
          {expanded && <Pager page={data.page} pages={data.pages} onPage={setPage} />}<button className="l-ov-link" aria-expanded={expanded} onClick={() => { setExpanded(!expanded); setPage(1) }}>{say(expanded ? 'recentHistory' : 'fullHistory')}</button>
        </>
      )}
      {reversing && <ReverseDialog memberId={memberId} line={reversing} balance={balance} onClose={() => setReversing(null)} />}
    </section>
  )
}
