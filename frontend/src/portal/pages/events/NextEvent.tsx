import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CalendarCheck, CalendarDays, MapPin } from 'lucide-react'
import { Card } from '../../ui/Card'
import { EVENT_WORDS, nextEvent, whenPhrase } from './eventMath'
import { EVENTS_KEY, eventsApi } from './eventsApi'

/**
 * Home's event card (release 8, spec 2026-10-25 §4): the next event the member signed up for — what, when, where —
 * or, when they have signed up for none, the next one open to them, so they know it is there; "See events" either way.
 * Nothing at all before the answer arrives or when nothing is coming up.
 */
export function NextEvent() {
  const { t, i18n } = useTranslation()
  const { data } = useQuery({ queryKey: EVENTS_KEY, queryFn: eventsApi.list, staleTime: 60_000 })
  const next = nextEvent(data)
  if (!next) return null
  const { event, mine } = next
  const when = whenPhrase(event, i18n.language)
  const Icon = mine ? CalendarCheck : CalendarDays

  return (
    <Link to="/portal/events" className="block" data-next-event="">
      <Card className="p-4 p-lift flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center shrink-0"><Icon size={18} aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-p-text-2">
            {mine ? t('portal.events.your_next', EVENT_WORDS.your_next) : t('portal.events.next_up', EVENT_WORDS.next_up)}
          </p>
          <p className="text-sm font-semibold text-p-text truncate">{event.title}</p>
          <p className="text-xs text-p-text-2 tabular-nums">{t(when.key, when.fallback, when.options)}</p>
          {event.where && <p className="text-xs text-p-text-2 flex items-center gap-1"><MapPin size={12} aria-hidden /><span className="truncate">{event.where}</span></p>}
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-p-accent-deep">
          {t('portal.events.see_all', EVENT_WORDS.see_all)}<ArrowRight size={14} aria-hidden />
        </span>
      </Card>
    </Link>
  )
}
