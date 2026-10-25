import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check as CheckIcon, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { formatDate } from '../../workspace/lib/wallClock'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { Pager } from '../ui/Pager'
import { ERRORS } from './errors'
import { countsWords, entryTime, entryWords, pickedDay, shiftDay } from './placesMath'
import { entriesKey, placesApi, type Entry, type EntriesPage, type Place } from './placesApi'

/**
 * Who came in at a place (release 8, spec 2026-10-25 §1): a venue day's scans there, newest first — the time on the
 * venue's clock, the member, let in or refused (an icon and the reason in words, never colour alone), and who scanned.
 * Today first; the day before and after one tap away, or any day from the date field.
 */
export function EntriesDialog({ place, onClose }: { place: Place; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const today = useBoot().venue.today
  const [day, setDay] = useState(today)
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: entriesKey(place.id, day, page), queryFn: () => placesApi.entries(place.id, day, page) })
  const go = (next: string) => { setDay(next); setPage(1) }

  return (
    <Dialog title={t('loyalty.places.entries.title', 'Entries at {{place}}', { place: place.name })} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => go(shiftDay(day, -1, today))} aria-label={t('loyalty.places.entries.previous_day', 'The day before')}>
            <ChevronLeft size={15} aria-hidden />
          </Button>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{t('loyalty.places.entries.day', 'Day')}</span>
            <input type="date" value={day} max={today} onChange={(e) => go(pickedDay(e.target.value, today))}
              className="rounded-lg border border-a-border bg-a-surface px-3 py-1.5 text-sm text-a-text" />
          </label>
          <Button type="button" variant="secondary" size="sm" onClick={() => go(shiftDay(day, 1, today))} disabled={day >= today}
            aria-label={t('loyalty.places.entries.next_day', 'The day after')}>
            <ChevronRight size={15} aria-hidden />
          </Button>
          {day !== today && <Button type="button" variant="ghost" size="sm" onClick={() => go(today)}>{t('loyalty.places.entries.today', 'Today')}</Button>}
        </div>

        <EntriesBody query={query} day={day} today={today} locale={locale} onPage={setPage} />
      </div>
    </Dialog>
  )
}

function EntriesBody({ query, day, today, locale, onPage }: {
  query: { data?: EntriesPage; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }
  day: string
  today: string
  locale: string
  onPage: (page: number) => void
}) {
  const { t } = useTranslation()
  const data = query.data
  if (query.isError && !data) {
    return (
      <div className="space-y-3">
        <Notice tone="danger">{t(...refusalKey('loyalty.places', ERRORS, 'entries', failureOf(query.error)))}</Notice>
        <Button type="button" variant="secondary" size="sm" onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</Button>
      </div>
    )
  }
  if (!data) {
    return (
      <div role="status" className="space-y-2">
        <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
        <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" />
      </div>
    )
  }

  const dayName = day === today ? t('loyalty.places.entries.today', 'Today') : formatDate(day, locale, { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div className="space-y-3">
      <p role="status" className="text-sm text-a-text">
        <span className="font-medium">{dayName}</span>
        {' · '}
        {t(...countsWords(data.counts, locale))}
      </p>
      {data.entries.length > 0 && (
        <ol aria-label={t('loyalty.places.entries.list', 'Scans, newest first')} className="divide-y divide-a-border overflow-hidden rounded-xl border border-a-border">
          {data.entries.map(entry => <EntryRow key={entry.id} entry={entry} />)}
        </ol>
      )}
      <Pager page={data.page} pages={data.pages} onPage={onPage} />
    </div>
  )
}

/** One scan: its time, let in or refused (an icon and the words), the member or the code's refusal, and who scanned. */
export function EntryRow({ entry }: { entry: Entry }) {
  const { t } = useTranslation()
  const reason = t(...entryWords(entry))
  return (
    <li data-entry={entry.id} className="flex items-start gap-3 px-3 py-2.5">
      <span className="w-11 shrink-0 pt-0.5 font-a-mono text-xs tabular-nums text-a-text-2">{entryTime(entry.at)}</span>
      <span aria-hidden className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${entry.granted ? 'bg-a-st-confirmed/[0.15] text-a-st-confirmed' : 'bg-a-danger/[0.12] text-a-danger'}`}>
        {entry.granted ? <CheckIcon size={13} /> : <X size={13} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-a-text">
          <span className="sr-only">{entry.granted ? t('loyalty.places.entries.let_in', 'Let in:') : t('loyalty.places.entries.refused', 'Refused:')} </span>
          {entry.member
            ? <><span className="font-medium">{entry.member.name}</span>{entry.member.member_number && <span className="ml-2 font-a-mono text-xs text-a-text-2">{entry.member.member_number}</span>}</>
            : <span className="font-medium">{reason}</span>}
        </p>
        {/* Without a member the code's refusal is the line itself; it is not said again under it. */}
        {(entry.member || entry.by) && (
          <p className="text-xs text-a-text-2">
            {entry.member && reason}
            {entry.member && entry.by && ' · '}
            {entry.by && t('loyalty.places.entries.by', 'by {{name}}', { name: entry.by })}
          </p>
        )}
      </div>
    </li>
  )
}
