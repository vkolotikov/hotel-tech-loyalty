import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePortal } from '../PortalProvider'
import { portalApi } from '../lib/portalApi'
import { useVocab } from '../lib/vocab'
import { resolveLocale } from '../lib/dates'
import { counted } from '../lib/plural'
import { Chip } from '../ui/Chip'
import { Button } from '../ui/Button'
import { DateTime } from '../ui/DateTime'
import { Money } from '../ui/Money'
import { Skeleton } from '../ui/Skeleton'
import { Notice } from '../ui/Notice'
import { MemberCard } from './MemberCard'
import { CreditBalance } from './credit/CreditBalance'
import { StampCard } from './stamps/StampCard'
import { NextEvent } from './events/NextEvent'
import { statusLabel, statusTone } from './BookingRow'
import { activityTypeLabel } from './Activity'
import { instantDay, nextHeading } from './homeMath'
import { PortalIcon } from '../design/PortalIcon'
import { usePortalPanels } from '../design/panels'
import { useProgramme } from '../design/programme'

export function Home() {
  const { t, i18n } = useTranslation()
  const { data } = usePortal()
  const vocab = useVocab()
  const panels = usePortalPanels()
  const programme = useProgramme(!!data?.member && !!data.capabilities.loyalty)
  const upcoming = useQuery({ queryKey: ['portal-bookings', 'upcoming', 1], queryFn: () => portalApi.bookings('upcoming', 1), staleTime: 10_000, refetchOnWindowFocus: true })
  if (!data) return null
  const { member, capabilities, venue } = data
  const next = upcoming.data?.data[0]
  const canBook = capabilities.services || capabilities.stays
  const bookLabel = capabilities.stays && !capabilities.services ? t('portal.stay.cta_home', 'Book a stay') : t('portal.book.cta_home', 'Book {{noun}}', { noun: vocab('booking') })
  const heading = nextHeading(next?.kind, capabilities, venue.industry)
  return (
    <div className="space-y-5">
      <div className="p-page-heading"><h1>{t('portal.design.hello', 'Hi, {{name}}', { name: member?.name.split(' ')[0] ?? venue.name })}</h1></div>
      <div className="p-home-grid">
        {member && <MemberCard member={member} loyalty={capabilities.loyalty} currency={venue.currency} />}
        <section className="p-next-booking">
          <h2>{t(heading.key, heading.fallback)}</h2>
          {upcoming.isPending ? <Skeleton className="h-20" /> : upcoming.isError ? <><Notice tone="warning">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice><Button variant="ghost" onClick={() => { void upcoming.refetch() }}>{t('portal.common.retry', 'Try again')}</Button></> : next ? <>
            <Link to={`/portal/bookings/${next.kind}/${next.id}`} className="p-next-title"><PortalIcon name={next.kind === 'stay' ? 'bed' : 'calendar'} tile /><span>{next.title}</span></Link>
            <p className="p-next-meta">{next.starts_at && <DateTime iso={next.starts_at} mode={next.kind === 'stay' ? 'day' : 'datetime'} />}{next.kind === 'stay' && next.nights ? ` · ${counted(t, 'bookings.night_count', next.nights, i18n.language)}` : ''}{next.kind === 'service' && next.subtitle ? ` · ${next.subtitle}` : ''}</p>
            <footer><Chip tone={statusTone(next.status)}>{t(`portal.bookings.status.${next.status}`, statusLabel(next.status))}</Chip><Link to={`/portal/bookings/${next.kind}/${next.id}`} className="text-xs font-semibold text-p-accent-deep">{t('portal.design.view_booking', 'View booking')} <span aria-hidden>→</span></Link></footer>
            <span className="sr-only"><Money amount={next.total} currency={next.currency} /></span>
          </> : <><p className="text-sm text-p-text-2 mb-4">{t('portal.home.no_upcoming', 'Nothing booked yet.')}</p>{canBook && <Link to="/portal/book" className="p-home-action justify-center text-p-accent-deep mt-auto">{bookLabel}<PortalIcon name="arrow" /></Link>}</>}
          {next && canBook && <Link to="/portal/book" className="text-xs text-p-accent-deep mt-3">{bookLabel} <span aria-hidden>+</span></Link>}
        </section>
        {capabilities.loyalty && <div className="p-home-actions">
          <Link to="/portal/rewards?tab=catalogue" className="p-home-action"><PortalIcon name="coin" tile /><span>{t('portal.home.quick_rewards', 'Spend points')}</span><PortalIcon name="chevron" /></Link>
          <button type="button" className="p-home-action" onClick={() => panels.open('earn')}><PortalIcon name="earn" tile /><span>{t('portal.design.earn_points', 'Earn points')}</span><PortalIcon name="chevron" /></button>
          {programme.data?.earning?.referrals ? <button type="button" className="p-home-action" onClick={() => panels.open('invite')}><PortalIcon name="invite" tile /><span>{t('portal.profile.invite_title', 'Invite a friend')}</span><PortalIcon name="chevron" /></button> : <Link to="/portal/rewards?tab=offers" className="p-home-action"><PortalIcon name="ticket" tile /><span>{t('portal.home.quick_offers', 'Your offers')}</span><PortalIcon name="chevron" /></Link>}
        </div>}
      </div>
      {capabilities.loyalty && member && <section>
        <div className="p-section-heading"><h2>{t('portal.home.recent_activity', 'Recent activity')}</h2><button type="button" onClick={() => panels.open('activity')}>{t('portal.common.see_all', 'See all')} <span aria-hidden>→</span></button></div>
        {member.recent_activity?.length ? <div className="p-activity-list">{member.recent_activity.slice(0, 3).map(a => <div key={a.id} className="p-activity-row">
          <PortalIcon name={a.points < 0 ? 'ticket' : a.type === 'referral' ? 'person' : a.type === 'bonus' ? 'rewards' : 'calendar'} tile />
          <div><strong>{a.description || activityTypeLabel(t, a.type)}</strong><small>{instantDay(a.created_at, i18n.language, venue.timezone)}</small></div>
          <span className={a.points >= 0 ? 'text-p-success' : 'text-p-accent-deep'}>{a.points >= 0 ? '+' : ''}{a.points.toLocaleString(resolveLocale(i18n.language))} {t('portal.design.pts', 'pts')}</span>
        </div>)}</div> : <p className="text-sm text-p-text-2">{t('portal.home.no_activity', 'Your points will appear here after your first visit.')}</p>}
      </section>}
      {member && <div className="p-secondary-grid">{capabilities.loyalty && <><StampCard /><CreditBalance /></>}{capabilities.events && <NextEvent />}</div>}
      {(venue.contact.email || venue.contact.phone) && <p className="text-xs text-p-text-2 text-center"><a href={venue.contact.email ? `mailto:${venue.contact.email}` : `tel:${venue.contact.phone}`}>{t('portal.home.contact', 'Questions? Contact {{venue}}', { venue: venue.name })}</a>{venue.contact.email && <span className="sr-only">{venue.contact.email}</span>}</p>}
    </div>
  )
}

