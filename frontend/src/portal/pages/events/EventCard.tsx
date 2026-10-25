import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, MapPin, Sparkles } from 'lucide-react'
import { apiErrorCode } from '../../lib/portalApi'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { Notice } from '../../ui/Notice'
import { EVENT_WORDS, actionOf, counted, dateBlock, errorPhrase, noteOf, whenPhrase, whyPhrase } from './eventMath'
import { EVENTS_KEY, eventsApi, type PortalEvent, type PortalEvents } from './eventsApi'

/**
 * One upcoming event as a card (release 8, spec 2026-10-25 §4): the day, when and where, what attending gives, and
 * the member's one action — Sign up, "You're signed up · Cancel", Full, or why not. The answer of a sign-up or a
 * cancel replaces the card's event at once; a refusal says why in the member's words.
 */
export function EventCard({ event }: { event: PortalEvent }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const client = useQueryClient()
  const block = dateBlock(event.starts_at, locale)
  const when = whenPhrase(event, locale)
  const action = actionOf(event)
  const note = noteOf(event, locale)

  const replace = (next: PortalEvent) => {
    client.setQueryData<PortalEvents>(EVENTS_KEY, old => old ? { ...old, upcoming: old.upcoming.map(e => (e.id === next.id ? next : e)) } : old)
    void client.invalidateQueries({ queryKey: EVENTS_KEY })
  }
  const signUp = useMutation({ mutationFn: () => eventsApi.signUp(event.id), onSuccess: (r) => replace(r.event), onError: () => { void client.invalidateQueries({ queryKey: EVENTS_KEY }) } })
  const cancel = useMutation({ mutationFn: () => eventsApi.cancel(event.id), onSuccess: (r) => replace(r.event), onError: () => { void client.invalidateQueries({ queryKey: EVENTS_KEY }) } })
  const failed = signUp.isError ? signUp.error : cancel.isError ? cancel.error : null
  const error = failed ? errorPhrase(apiErrorCode(failed)) : null
  const points = event.points > 0 ? counted('points', event.points, locale) : null
  const why = action.kind === 'why_not' ? whyPhrase(action.code) : null

  return (
    <Card className="p-4" data-event={event.id}>
      <div className="flex gap-3">
        <div aria-hidden className="w-12 shrink-0 rounded-p-control bg-p-accent/10 text-p-accent-deep flex flex-col items-center justify-center py-1.5">
          <span className="text-[11px] font-semibold uppercase">{block.weekday}</span>
          <span className="font-p-display text-xl leading-none">{block.day}</span>
          <span className="text-[11px] font-semibold uppercase">{block.month}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold text-p-text">{event.title}</h3>
          <p className="text-xs text-p-text-2 tabular-nums">{t(when.key, when.fallback, when.options)}</p>
          {event.where && <p className="text-xs text-p-text-2 flex items-center gap-1"><MapPin size={12} aria-hidden />{event.where}</p>}
          {points && <p className="text-xs font-semibold text-p-accent-deep flex items-center gap-1"><Sparkles size={12} aria-hidden />{t(points.key, points.fallback, points.options)}</p>}
        </div>
      </div>
      {event.description && <p className="text-sm text-p-text-2 mt-3 whitespace-pre-line">{event.description}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2" aria-live="polite">
        {action.kind === 'sign_up' && (
          <Button size="sm" loading={signUp.isPending} onClick={() => signUp.mutate()}>
            {t('portal.events.sign_up', EVENT_WORDS.sign_up)}<span className="sr-only"> {event.title}</span>
          </Button>
        )}
        {action.kind === 'signed_up' && (
          <>
            <Chip tone="success"><CheckCircle2 size={12} className="mr-1" aria-hidden />{t('portal.events.signed_up', EVENT_WORDS.signed_up)}</Chip>
            {action.canCancel && (
              <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                {t('portal.events.cancel', EVENT_WORDS.cancel)}<span className="sr-only"> {t('portal.events.cancel_sign_up', EVENT_WORDS.cancel_sign_up)}: {event.title}</span>
              </Button>
            )}
          </>
        )}
        {action.kind === 'checked_in' && <Chip tone="success"><CheckCircle2 size={12} className="mr-1" aria-hidden />{t('portal.events.checked_in', EVENT_WORDS.checked_in)}</Chip>}
        {action.kind === 'full' && <Chip tone="warning">{t('portal.events.full', EVENT_WORDS.full)}</Chip>}
        {why && <Chip tone="neutral">{t(why.key, why.fallback)}</Chip>}
        {action.kind === 'come_along' && <p className="text-xs text-p-text-2">{t('portal.events.come_along', EVENT_WORDS.come_along)}</p>}
        {note && <span className="text-xs text-p-text-2">{t(note.key, note.fallback, note.options)}</span>}
      </div>
      {error && <div className="mt-3"><Notice tone="warning">{t(error.key, error.fallback)}</Notice></div>}
    </Card>
  )
}
