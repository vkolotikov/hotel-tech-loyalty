import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarDays, CheckCircle2 } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Notice } from '../../ui/Notice'
import { Skeleton } from '../../ui/Skeleton'
import { EventCard } from './EventCard'
import { EVENT_WORDS, counted, dayText, pastEvents } from './eventMath'
import { EVENTS_KEY, eventsApi } from './eventsApi'

/**
 * The member's events (release 8, spec 2026-10-25 §4): the events coming up that their membership level may attend,
 * each with its one action (sign up, signed up · cancel, full, or why not), and the events they came to, with the
 * points each gave — each event once (pastEvents). Two columns of cards where there is room.
 */
export function EventsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const query = useQuery({ queryKey: EVENTS_KEY, queryFn: eventsApi.list, staleTime: 30_000 })
  const data = query.data
  const attended = data ? pastEvents(data) : []

  return (
    <div className="space-y-5">
      <h1 className="font-p-display text-2xl">{t('portal.events.title', EVENT_WORDS.title)}</h1>

      {query.isError && !data && (
        <div className="space-y-3">
          <Notice tone="danger">{t('portal.events.load_failed', EVENT_WORDS.load_failed)}</Notice>
          <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('portal.common.retry', 'Try again')}</Button>
        </div>
      )}
      {!data && query.isLoading && (
        <div className="space-y-3" aria-busy="true"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      )}

      {data && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-p-text">{t('portal.events.coming_up', EVENT_WORDS.coming_up)}</h2>
          {data.upcoming.length === 0
            ? <EmptyState icon={<CalendarDays size={18} aria-hidden />} title={t('portal.events.none', EVENT_WORDS.none)} body={t('portal.events.none_body', EVENT_WORDS.none_body)} />
            : <div className="grid gap-3 sm:grid-cols-2">{data.upcoming.map(event => <EventCard key={event.id} event={event} />)}</div>}
        </section>
      )}

      {attended.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-p-text">{t('portal.events.attended', EVENT_WORDS.attended)}</h2>
          <Card className="divide-y divide-p-border">
            {attended.map(e => {
              const points = e.points > 0 ? counted('points', e.points, locale) : null
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <CheckCircle2 size={16} className="text-p-success shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-p-text truncate">{e.title}</p>
                    <p className="text-[11px] text-p-text-2">{dayText(e.starts_at, locale)}</p>
                  </div>
                  {points && <span className="text-sm font-semibold text-p-success tabular-nums">{t(points.key, points.fallback, points.options)}</span>}
                </div>
              )
            })}
          </Card>
        </section>
      )}
    </div>
  )
}
