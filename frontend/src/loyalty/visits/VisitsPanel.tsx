import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { BedDouble, CalendarCheck, LogIn, ShoppingBag, Stamp, Ticket, type LucideIcon } from 'lucide-react'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { Notice } from '../../workspace/ui/Notice'
import { formatDate } from '../../workspace/lib/wallClock'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { day, points } from '../lib/format'
import type { MemberRow } from '../lib/types'
import { CARD, CardHead } from '../member/CardHead'
import { DeskActions } from './DeskActions'
import { ERRORS } from './errors'
import { stampsKey, visitsApi, type StampsView } from './visitsApi'
import { circles, givenSentence, rewardSentence, shownCard, showVisits, sourceSentence } from './visitsMath'

/** A stamp's visit as an icon beside its word; a source without one shows the stamp. */
const SOURCE_ICONS: Record<string, LucideIcon> = { appointment: CalendarCheck, stay: BedDouble, check_in: LogIn, purchase: ShoppingBag, event: Ticket }

/**
 * A member's visits on their page (release 7, spec 2026-10-25 §2), when the venue uses the stamp card, check-in or
 * earning at the desk: the open card as filled and empty circles ("7 of 10 — 3 to go") and what a full card gives,
 * Check in and Add a purchase, and the recent stamps (the visit and its venue day) with the completed cards (their
 * count beside the heading) and what each gave.
 */
export function VisitsPanel({ member, locale, timeZone }: { member: MemberRow & { is_erased?: boolean }; locale: string; timeZone: string }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const show = showVisits(boot.programme.ways)
  const query = useQuery({ queryKey: stampsKey(member.id), queryFn: () => visitsApi.stamps(member.id), enabled: show })
  if (!show) return null
  const view = query.data

  return (
    <section aria-labelledby="visits-title" className={CARD}>
      <CardHead id="visits-title" icon={Stamp} title={t('loyalty.visits.title', 'Visits')} />
      {query.isError && <Notice tone="danger">{t(...refusalKey('loyalty.visits', ERRORS, 'load', failureOf(query.error)))}</Notice>}
      {!view && query.isLoading && <Skeleton className="h-16" />}
      {view && (view.enabled || view.card !== null) && <CardFace view={view} locale={locale} />}
      <DeskActions member={member} />
      {view && <Recent view={view} locale={locale} timeZone={timeZone} />}
    </section>
  )
}

/** The open card's circles, how many to go and what a full card gives. */
export function CardFace({ view, locale }: { view: StampsView; locale: string }) {
  const { t } = useTranslation()
  const card = shownCard(view)
  const gives = rewardSentence(view.reward, locale)
  const counts = { have: points(card.count, locale), needed: points(card.needed, locale), left: points(card.left, locale) }

  return (
    <div className="space-y-2" data-stamp-card="">
      <div role="img" aria-label={t('loyalty.visits.card_label', '{{have}} of {{needed}} stamps', counts)} className="flex flex-wrap gap-1.5">
        {circles(card.count, card.needed).map((filled, i) => (
          <span key={i} data-filled={filled ? '' : undefined}
            className={`h-7 w-7 rounded-full border-2 ${filled ? 'border-a-accent-text bg-a-accent' : 'border-a-border bg-a-surface-2'}`} />
        ))}
      </div>
      <p className="text-sm">
        <span className="font-semibold text-a-text">{t('loyalty.visits.card_line', '{{have}} of {{needed}} — {{left}} to go', counts)}</span>
        <span className="text-a-text-2"> · {t(gives.key, gives.fallback, gives.vars)}</span>
      </p>
      {!view.enabled && <p className="text-xs text-a-text-2">{t('loyalty.visits.off', 'The stamp card is switched off: this card keeps its stamps but gets no new ones.')}</p>}
    </div>
  )
}

/** The recent stamps — the visit, its venue day, who gave it — and the completed cards with what each gave. */
function Recent({ view, locale, timeZone }: { view: StampsView; locale: string; timeZone: string }) {
  const { t } = useTranslation()
  const stamps = view.history.stamps.slice(0, 10)
  const cards = view.history.cards.slice(0, 5)
  if (stamps.length === 0 && cards.length === 0) return null

  return (
    <div className="grid gap-4 border-t border-a-border pt-4 md:grid-cols-2">
      {stamps.length > 0 && (
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-a-text-2">{t('loyalty.visits.recent', 'Recent stamps')}</p>
          <ul className="divide-y divide-a-border">
            {stamps.map((s, i) => {
              const source = sourceSentence(s.source)
              const Icon = SOURCE_ICONS[s.source] ?? Stamp
              return (
                <li key={s.id ?? `${s.venue_day}-${i}`} data-stamp-source={s.source} className="flex flex-wrap items-center justify-between gap-x-3 py-1.5 text-sm">
                  <span className="inline-flex min-w-0 items-center gap-2 text-a-text"><Icon size={14} aria-hidden className="shrink-0 text-a-text-2" />{t(source.key, source.fallback)}</span>
                  <span className="text-a-text-2">
                    {formatDate(s.venue_day, locale, { day: 'numeric', month: 'short', year: 'numeric' })}
                    {s.by ? ` · ${s.by}` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {cards.length > 0 && (
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 text-xs font-medium text-a-text-2">
            {t('loyalty.visits.cards', 'Completed cards')}
            <span data-completed-cards="" className="rounded-full bg-a-surface-2 px-1.5 text-xs font-semibold tabular-nums text-a-text">{points(view.completed_cards, locale)}</span>
          </p>
          <ul className="divide-y divide-a-border">
            {cards.map(c => {
              const given = c.reward ? givenSentence(c.reward, locale) : null
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 py-1.5 text-sm">
                  <span className="text-a-text">
                    {t('loyalty.visits.card_number', 'Card {{number}}', { number: String(c.number) })}
                    {given ? ` · ${t(given.key, given.fallback, given.vars)}` : ''}
                  </span>
                  <span className="text-a-text-2">{day(c.completed_at, locale, timeZone)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
