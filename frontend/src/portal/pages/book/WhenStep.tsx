import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { apiErrorCode, bookErrorKey, portalApi } from '../../lib/portalApi'
import { formatDay, resolveLocale, venueToday } from '../../lib/dates'
import { Skeleton } from '../../ui/Skeleton'
import { EmptyState } from '../../ui/EmptyState'
import { Notice } from '../../ui/Notice'
import { Button } from '../../ui/Button'
import { visibleDay } from './steps'
import type { CatalogueRules } from '../../lib/types'

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (day: string, n: number) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d) }

interface Props { serviceId: number; masterId: number | null; rules: CatalogueRules; value: string | null; onPick: (startAt: string) => void; timezone: string }

/** A seven-day strip and the scheduler's slots for the chosen day; times are the venue's own labels. */
export function WhenStep({ serviceId, masterId, rules, value, onPick, timezone }: Props) {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  // The venue's own calendar day, not the client's — a member three time
  // zones away must see the same "today" the venue's desk sees.
  const today = venueToday(timezone)
  const selected = params.get('date') ?? today
  const [from, setFrom] = useState(selected)
  const to = addDays(from, 6)
  const last = addDays(today, rules.max_advance_days)

  // `retryOnMount: false` — see the same note in Book.tsx: a failed query stays
  // failed, with its own "Try again", instead of silently refetching every
  // time the day range changes back onto it.
  const calendar = useQuery({ queryKey: ['portal-calendar', serviceId, masterId, from, to], queryFn: () => portalApi.calendar(serviceId, masterId, from, to), retryOnMount: false })
  const available = new Set(calendar.data?.available_dates ?? [])
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  // The day whose times are listed: always one of the seven on screen (see `visibleDay`).
  const shown = visibleDay(selected, days, new Set(days.filter(d => available.has(d) && d <= last)))
  const slots = useQuery({ queryKey: ['portal-slots', serviceId, masterId, shown], queryFn: () => portalApi.availability(serviceId, masterId, shown as string), enabled: shown !== null, retryOnMount: false })
  const locale = resolveLocale(i18n.language)

  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  const rangeLabel = `${formatDay(from, locale, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${formatDay(to, locale, { day: 'numeric', month: 'short' })}`

  const genericError = t('portal.common.error', 'Something went wrong. Please try again.')
  const slotsErrorKey = bookErrorKey(apiErrorCode(slots.error))
  const slotsErrorMessage = slotsErrorKey === 'portal.book.too_far_ahead'
    ? t(slotsErrorKey, 'That date is beyond the booking window.')
    : genericError

  return (
    <div className="space-y-4">
      {/* The step's heading, focused by Book after a step change; visually hidden, as on Service. */}
      <h2 tabIndex={-1} data-step-heading="when" className="sr-only">{t('portal.book.heading_when', 'Choose a day and time')}</h2>
      {/* The two arrows live above the strip, not beside it: at 390px width, four
          44px-square controls sharing a row with seven day cells would squeeze
          each cell under the 44px touch-target minimum. */}
      <div data-strip-header="true" className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-p-text">{rangeLabel}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="w-11 h-11 rounded-p-control border border-p-border disabled:opacity-40"
            aria-label={t('portal.common.previous', 'Previous')}
            disabled={from <= today}
            onClick={() => setFrom(addDays(from, -7) < today ? today : addDays(from, -7))}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="w-11 h-11 rounded-p-control border border-p-border disabled:opacity-40"
            aria-label={t('portal.common.next', 'Next')}
            disabled={to >= last}
            onClick={() => setFrom(addDays(from, 7))}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </div>

      {calendar.isError ? (
        <div className="space-y-3">
          <Notice tone="danger">{genericError}</Notice>
          <Button variant="secondary" size="sm" onClick={() => { void calendar.refetch() }}>{t('portal.common.retry', 'Try again')}</Button>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {days.map(d => {
            const ok = available.has(d) && d <= last
            return (
              <button
                key={d}
                type="button"
                aria-disabled={!ok}
                aria-pressed={d === shown}
                disabled={!ok}
                className={`min-h-[56px] rounded-p-control text-xs flex flex-col items-center justify-center ${d === shown ? 'bg-p-accent text-p-accent-ink' : ok ? 'bg-p-surface border border-p-border' : 'text-p-text-2 opacity-50'}`}
                onClick={() => { params.set('date', d); setParams(params, { replace: true }) }}
              >
                <span>{formatDay(d, locale, { weekday: 'short' })}</span>
                <span className="font-semibold text-sm">{d.slice(8, 10)}</span>
              </button>
            )
          })}
        </div>
      )}

      {(calendar.isPending || (shown !== null && slots.isPending)) && <Skeleton className="h-24" />}
      {slots.isError && (
        <div className="space-y-3">
          <Notice tone="danger">{slotsErrorMessage}</Notice>
          <Button variant="secondary" size="sm" onClick={() => { void slots.refetch() }}>{t('portal.common.retry', 'Try again')}</Button>
        </div>
      )}
      {slots.isSuccess && slots.data.slots.length === 0 && <EmptyState title={t('portal.book.no_slots', 'No times left on this day.')} />}
      {slots.isSuccess && slots.data.slots.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {slots.data.slots.map(s => (
            <button
              key={s.start}
              type="button"
              aria-pressed={value === s.start}
              className={`min-h-[44px] rounded-p-control border ${value === s.start ? 'bg-p-accent text-p-accent-ink border-p-accent' : 'bg-p-surface border-p-border'}`}
              onClick={() => onPick(s.start)}
            >
              {s.time_label}
            </button>
          ))}
        </div>
      )}
      {calendar.isSuccess && available.size === 0 && <EmptyState title={t('portal.book.no_days', 'No days available in the next {{count}} days.', { count: rules.max_advance_days })} />}
      <p className="text-xs text-p-text-2">{t('portal.book.lead_note', "Times are shown in the venue's local time.")}</p>
    </div>
  )
}
