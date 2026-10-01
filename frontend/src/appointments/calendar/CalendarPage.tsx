import { useEffect, useMemo, useReducer, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../AppointmentsProvider'
import { appointmentsApi } from '../lib/api'
import { loadPrefs, savePrefs, type Prefs, type View } from '../lib/prefs'
import type { DateKey } from '../lib/types'
import { hhmm, isDateKey, venueNow } from '../lib/wallClock'
import { AppointmentPanel } from '../panel/AppointmentPanel'
import { CLOSED, newKey, panelReducer } from '../panel/panelState'
import { Notice } from '../ui/Notice'
import { DayOverview } from './DayOverview'
import { ListView } from './ListView'
import { MiniMonth } from './MiniMonth'
import { TimeGrid } from './TimeGrid'
import { Toolbar } from './Toolbar'
import { columnsFor, needsWindows, rangeFor, shift } from './calendarState'

const NARROW = '(max-width: 1023px)'

/** True below 1024 px, where a multi-column grid would be crushed and the list is shown instead. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW).matches)
  useEffect(() => {
    const media = window.matchMedia(NARROW)
    const onChange = () => setNarrow(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return narrow
}

export function CalendarPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const zone = boot.venue.timezone
  const locale = i18n.language || 'en'

  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [now, setNow] = useState(() => venueNow(zone))
  // The day to open on is the server's answer: a computer whose clock is off opens on the venue's today all the same.
  const [date, setDate] = useState<DateKey>(() => boot.venue.today)
  const [panel, dispatch] = useReducer(panelReducer, CLOSED)
  const selectedId = panel.mode === 'view' ? panel.id : null
  const [params, setParams] = useSearchParams()

  // Links into the calendar: ?new=1[&client&service&master][&date], ?open=<id>[&date].
  // The day a link names is adopted while rendering (React's documented way
  // to adjust state to a changed input; the lint rule forbids doing it in an
  // effect). The effect below opens the panel and then removes the link from
  // the address, so a reload does not repeat it.
  const linkDate = params.get('date')
  const [adoptedDate, setAdoptedDate] = useState<string | null>(null)
  if (linkDate !== adoptedDate) {
    setAdoptedDate(linkDate)
    if (linkDate !== null && isDateKey(linkDate)) setDate(linkDate)
  }

  useEffect(() => {
    const open = params.get('open')
    const isNew = params.get('new')
    const linked = params.get('date')
    if (!open && !isNew && !linked) return

    const target = linked && isDateKey(linked) ? linked : date
    const id = (name: string) => { const v = params.get(name); return v && /^\d+$/.test(v) ? Number(v) : null }

    if (open && /^\d+$/.test(open)) {
      dispatch({ type: 'openView', id: Number(open) })
    } else if (isNew) {
      dispatch({ type: 'openCreate', key: newKey(), draft: { date: target, masterId: id('master'), serviceId: id('service') } })
      const clientId = id('client')
      if (clientId !== null) {
        void appointmentsApi.client(clientId)
          .then(profile => dispatch({ type: 'edit', patch: { client: profile.client }, key: newKey() }))
          .catch(() => { /* the panel simply opens without a client */ })
      }
    }
    setParams({}, { replace: true })
  }, [params, setParams, date])

  useEffect(() => { savePrefs(prefs) }, [prefs])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(venueNow(zone)), 30_000)
    return () => window.clearInterval(timer)
  }, [zone])

  const narrow = useNarrow()
  const view: View = narrow ? 'list' : prefs.view
  const range = rangeFor(view, date)
  const weekMasterId = view === 'week' ? prefs.masterId : null
  const windows = needsWindows(view)

  const query = useQuery({
    queryKey: ['appointments', 'calendar', range.from, range.to, prefs.showCancelled, weekMasterId, windows],
    queryFn: () => appointmentsApi.calendar(range.from, range.to, { includeCancelled: prefs.showCancelled, masterId: weekMasterId, windows }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  })

  const masters = query.data?.masters ?? []
  const appointments = useMemo(() => query.data?.appointments ?? [], [query.data])
  // The week view shows one person; with no one chosen that is the first, and the filter says so.
  const masterId = view === 'week' ? (masters.find(m => m.id === prefs.masterId) ?? masters[0])?.id ?? null : prefs.masterId
  // A filter hides cards; it never makes a slot look free (slots come from the person's own column).
  const shown = masterId === null ? appointments : appointments.filter(a => a.master?.id === masterId)
  const updatedAt = query.dataUpdatedAt ? venueNow(zone, new Date(query.dataUpdatedAt)).minutes : null

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <section className="flex-1 min-w-0 flex flex-col">
        <h1 className="sr-only">{t('appointments.nav.calendar', 'Calendar')}</h1>
        <Toolbar
          view={view} viewLocked={narrow} panelOpen={panel.mode !== 'closed'} date={date} locale={locale}
          masters={masters} masterId={masterId} showCancelled={prefs.showCancelled}
          updatedAt={updatedAt} refreshing={query.isFetching}
          onView={(v) => setPrefs({ ...prefs, view: v })}
          onDate={setDate}
          onPrev={() => setDate(shift(view, date, -1))}
          onNext={() => setDate(shift(view, date, 1))}
          onToday={() => setDate(now.date)}
          onMaster={(id) => setPrefs({ ...prefs, masterId: id })}
          onShowCancelled={(on) => setPrefs({ ...prefs, showCancelled: on })}
          onRefresh={() => { void query.refetch() }}
        />

        {query.isError && (
          <div className="px-4 pt-3">
            <Notice tone="danger">{t('appointments.calendar.load_failed', 'The calendar could not be refreshed. What you see may be out of date.')}</Notice>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          {query.isLoading && <p className="p-6 text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
          {!query.isLoading && view !== 'list' && (
            <TimeGrid
              columns={columnsFor(view, date, masters, masterId, now.date, locale)}
              appointments={shown} now={now} today={now.date} selectedId={selectedId}
              onSlot={(masterId, slotDate, minutes) => dispatch({ type: 'openCreate', key: newKey(), draft: { date: slotDate, time: hhmm(minutes), masterId } })}
              onOpen={(id) => dispatch({ type: 'openView', id })}
            />
          )}
          {!query.isLoading && view === 'list' && (
            <ListView from={range.from} to={range.to} appointments={shown} locale={locale} selectedId={selectedId} onOpen={(id) => dispatch({ type: 'openView', id })} />
          )}
        </div>
      </section>

      <aside className="hidden xl:block w-72 shrink-0 border-l border-a-border bg-a-surface overflow-y-auto" aria-label={t('appointments.overview.title', 'Day overview')}>
        <MiniMonth date={date} today={now.date} locale={locale} onPick={setDate} />
        <DayOverview date={date} now={now} appointments={appointments} />
      </aside>

      {panel.mode !== 'closed' && (
        <AppointmentPanel
          key={panel.mode === 'view' ? `view-${panel.id}` : 'create'}
          state={panel} dispatch={dispatch} masters={masters} services={query.data?.services ?? []} today={now.date}
        />
      )}
    </div>
  )
}
