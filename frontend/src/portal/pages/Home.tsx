import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CalendarDays, CalendarPlus, Gift, Sparkles } from 'lucide-react'
import { usePortal } from '../PortalProvider'
import { portalApi } from '../lib/portalApi'
import { useVocab } from '../lib/vocab'
import { formatDay, resolveLocale } from '../lib/dates'
import { Card } from '../ui/Card'
import { Chip } from '../ui/Chip'
import { DateTime } from '../ui/DateTime'
import { Money } from '../ui/Money'
import { EmptyState } from '../ui/EmptyState'
import { Skeleton } from '../ui/Skeleton'
import { MemberCard } from './MemberCard'
import { statusLabel, statusTone } from './BookingRow'
import { activityTypeLabel } from './Activity'

/**
 * First screenful answers what a member opens the portal for: how many
 * points, what level, what to show at the desk, and when they are next
 * expected. Everything else is one tap away.
 */
export function Home() {
  const { t, i18n } = useTranslation()
  const { data } = usePortal()
  const vocab = useVocab()
  const { data: upcoming, isSuccess: upcomingLoaded, isPending: upcomingPending } = useQuery({ queryKey: ['portal-bookings', 'upcoming', 1], queryFn: () => portalApi.bookings('upcoming', 1) })

  if (!data) return null
  const { member, capabilities, venue } = data
  const next = upcoming?.data[0]
  const canBook = capabilities.services || capabilities.stays
  // A venue that sells only stays says so; every other venue keeps its own noun ("Book appointment").
  const bookLabel = capabilities.stays && !capabilities.services
    ? t('portal.stay.cta_home', 'Book a stay')
    : t('portal.book.cta_home', 'Book {{noun}}', { noun: vocab('booking') })

  return (
    <div className="space-y-5">
      {member && <MemberCard member={member} loyalty={capabilities.loyalty} />}

      <section>
        <h2 className="text-sm font-semibold text-p-text mb-2">{t('portal.home.next_booking', 'Your next {{noun}}', { noun: vocab('booking') })}</h2>
        {next ? (
          <Link to={`/portal/bookings/${next.kind}/${next.id}`} className="block">
            <Card className="p-4 p-lift flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center shrink-0"><CalendarDays size={18} aria-hidden /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{next.title}</p>
                <p className="text-xs text-p-text-2">
                  {next.starts_at && <DateTime iso={next.starts_at} mode={next.kind === 'stay' ? 'day' : 'datetime'} />}
                  {next.subtitle && next.kind === 'service' && ` · ${next.subtitle}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <Money amount={next.total} currency={next.currency} className="text-sm font-semibold" />
                <div className="mt-1"><Chip tone={statusTone(next.status)}>{t(`portal.bookings.status.${next.status}`, statusLabel(next.status))}</Chip></div>
              </div>
            </Card>
          </Link>
        ) : upcomingLoaded ? (
          <div className="space-y-3">
            <EmptyState icon={<CalendarDays size={18} aria-hidden />} title={t('portal.home.no_upcoming', 'Nothing booked yet.')} />
            {canBook && (
              <Link to="/portal/book" className="flex items-center justify-center gap-2 bg-p-accent text-p-accent-ink rounded-p-control min-h-[44px] px-4 text-sm font-semibold p-lift">
                <CalendarPlus size={16} aria-hidden /> {bookLabel}
              </Link>
            )}
          </div>
        ) : upcomingPending ? (
          <Skeleton className="h-[72px]" />
        ) : null}
      </section>

      {next && canBook && (
        <Link to="/portal/book" className="flex items-center justify-center gap-2 bg-p-surface border border-p-border text-p-text rounded-p-control min-h-[44px] px-4 text-sm font-semibold p-lift">
          <CalendarPlus size={16} aria-hidden /> {bookLabel}
        </Link>
      )}

      {capabilities.loyalty && (
        <div className="grid grid-cols-2 gap-3">
          <Link to="/portal/rewards?tab=catalogue" className="block">
            <Card className="p-4 p-lift h-full">
              <Gift size={18} className="text-p-accent-deep mb-2" aria-hidden />
              <p className="text-sm font-semibold">{t('portal.home.quick_rewards', 'Spend points')}</p>
              <p className="text-[11px] text-p-text-2">{t('portal.home.quick_rewards_hint', 'Browse the rewards catalogue')}</p>
            </Card>
          </Link>
          <Link to="/portal/rewards?tab=offers" className="block">
            <Card className="p-4 p-lift h-full">
              <Sparkles size={18} className="text-p-accent-deep mb-2" aria-hidden />
              <p className="text-sm font-semibold">{t('portal.home.quick_offers', 'Your offers')}</p>
              <p className="text-[11px] text-p-text-2">{t('portal.home.quick_offers_hint', 'Discounts available to you')}</p>
            </Card>
          </Link>
        </div>
      )}

      {capabilities.loyalty && member && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">{t('portal.home.recent_activity', 'Recent activity')}</h2>
            <Link to="/portal/activity" className="flex items-center gap-1 text-xs text-p-accent-deep">{t('portal.common.see_all', 'See all')} <ArrowRight size={12} aria-hidden /></Link>
          </div>
          {member.recent_activity?.length ? (
            <Card className="overflow-hidden divide-y divide-p-border">
              {member.recent_activity.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{a.description || activityTypeLabel(t, a.type)}</p>
                    <p className="text-[11px] text-p-text-2">{formatDay(a.created_at, i18n.language)}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${a.points >= 0 ? 'text-p-success' : 'text-p-text-2'}`}>{a.points >= 0 ? '+' : ''}{a.points.toLocaleString(resolveLocale(i18n.language))}</span>
                </div>
              ))}
            </Card>
          ) : (
            <EmptyState title={t('portal.home.no_activity', 'Your points will appear here after your first visit.')} />
          )}
        </section>
      )}

      <p className="text-center text-[11px] text-p-text-2">
        {member && t('portal.home.member_since', 'Member since {{date}}', { date: formatDay(member.member_since, i18n.language) })}
        {(venue.contact.email || venue.contact.phone) && (
          <>
            {' · '}
            <a href={venue.contact.email ? `mailto:${venue.contact.email}` : `tel:${venue.contact.phone}`} className="text-p-accent-deep">
              {t('portal.home.contact', 'Questions? Contact {{venue}}', { venue: venue.name })}
            </a>
            {venue.contact.email && <span className="sr-only">{venue.contact.email}</span>}
          </>
        )}
      </p>
    </div>
  )
}
