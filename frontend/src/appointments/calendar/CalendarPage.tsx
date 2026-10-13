import { useEffect, useMemo, useReducer, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../AppointmentsProvider'
import { appointmentsApi } from '../lib/api'
import { loadPrefs, savePrefs, type Prefs, type View } from '../lib/prefs'
import { onShortcuts } from '../lib/shortcuts'
import type { AppointmentSummary, DateKey } from '../lib/types'
import { hhmm, isDateKey, venueNow } from '../lib/wallClock'
import { AppointmentPanel } from '../panel/AppointmentPanel'
import { CLOSED, newKey, nextPanelMotion, panelKey, panelReducer, type PanelMotion } from '../panel/panelState'
import { Notice } from '../ui/Notice'
import { CalendarSkeleton } from '../ui/Skeleton'
import { DayOverview } from './DayOverview'
import type { DropTarget } from './DropConfirm'
import { saveDrop } from './saveDrop'
import { ListView } from './ListView'
import { MiniMonth } from './MiniMonth'
import { TimeGrid } from './TimeGrid'
import { TeamChips, toggleHidden } from './TeamChips'
import { TodayStrip } from './TodayStrip'
import { PANEL_CLEARANCE, Toolbar } from './Toolbar'
import { columnsFor, dayTeam, needsWindows, rangeFor, shift } from './calendarState'

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
  // The panel slides in when it opens; going from one appointment to another it stays put (adjusted while rendering).
  const shownKey = panelKey(panel)
  const [motion, setMotion] = useState<PanelMotion>({ key: null, slide: true })
  if (motion.key !== shownKey) setMotion(nextPanelMotion(motion, shownKey))
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

  // Shortcuts for this page (spec §5.2): today, the days or weeks, the views. The ones for every page (Find, ?, N) are the shell's.
  // The updates are written as functions of what was there, so a key held down steps once per press.
  useEffect(() => onShortcuts(window, document, (hit, e) => {
    if (hit === 'today') setDate(now.date)
    else if (hit === 'prev') setDate(d => shift(view, d, -1))
    else if (hit === 'next') setDate(d => shift(view, d, 1))
    else if (hit === 'day' || hit === 'week' || hit === 'list') {
      if (narrow) return // the list is the only view on a narrow screen
      setPrefs(p => (p.view === hit ? p : { ...p, view: hit }))
    } else return
    e.preventDefault()
  }), [now.date, view, narrow])

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

  const queryClient = useQueryClient()
  // Part F: a drop saves through the same move call as the Move form, with the card's revision (R4).
  // The drop dialog closes only once the calendar is fetched again, on the card at its new place (polish F6).
  const dropAppointment = (appointment: AppointmentSummary, to: DropTarget) => saveDrop({
    move: () => appointmentsApi.move(appointment.id, {
      start: to.start, master_id: to.masterId, revision: appointment.revision, notify_client: to.notify,
      ...(to.length !== null ? { length: to.length } : {}),
    }),
    refetch: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['appointments', 'calendar'] }),
      queryClient.invalidateQueries({ queryKey: ['appointments', 'booking', appointment.id] }),
    ]),
  })

  const masters = query.data?.masters ?? []
  const appointments = useMemo(() => query.data?.appointments ?? [], [query.data])
  // The week view shows one person; with no one chosen that is the first, and the filter says so.
  const masterId = view === 'week' ? (masters.find(m => m.id === prefs.masterId) ?? masters[0])?.id ?? null : prefs.masterId
  // The day view shows the people the chips leave on (the picker is only for the week and list views).
  const team = dayTeam(masters, appointments, prefs.hiddenMasters)
  // A filter hides cards; it never makes a slot look free (slots come from the person's own column).
  const shown = view === 'day' ? team.appointments
    : masterId === null ? appointments : appointments.filter(a => a.master?.id === masterId)
  const updatedAt = query.dataUpdatedAt ? venueNow(zone, new Date(query.dataUpdatedAt)).minutes : null

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <section className="flex-1 min-w-0 flex flex-col">
        <h1 className="sr-only">{t('appointments.nav.calendar', 'Calendar')}</h1>
        <Toolbar
          view={view} viewLocked={narrow} panelOpen={panel.mode !== 'closed'} date={date} locale={locale}
          masters={masters} masterId={masterId} personPicker={view !== 'day'} showCancelled={prefs.showCancelled}
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

        {view === 'day' && query.data && (
          // The day at a glance, then the team chips. Both are kept clear of the open panel the way the toolbar is
          // (see Toolbar), so nothing hides under it. The strip counts the whole day: it takes the unfiltered
          // appointments and people, not what the chips leave on the grid. It waits for the first load so it never shows false zeros,
          // and while the next day loads over the previous payload (keepPreviousData) it stays mounted but shows dashes (`pending`).
          <div className={`px-4 lg:px-6 ${panel.mode !== 'closed' ? PANEL_CLEARANCE : ''}`}>
            <TodayStrip date={date} now={now} appointments={appointments} masters={masters} pending={query.isPlaceholderData} />
            {/* A team of one has no one to hide: no chips. */}
            {masters.length > 1 && (
              <div className="pb-3">
                <TeamChips
                  masters={masters} hidden={team.hidden} counts={team.counts} pending={query.isPlaceholderData}
                  onToggle={(id) => setPrefs({ ...prefs, hiddenMasters: toggleHidden(team.hidden, id, masters.map(m => m.id)) })}
                />
              </div>
            )}
          </div>
        )}

        {query.isError && (
          <div className="px-4 pt-3">
            <Notice tone="danger">{t('appointments.calendar.load_failed', 'The calendar could not be refreshed. What you see may be out of date.')}</Notice>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto mx-4 lg:mx-6 mb-4 rounded-xl border border-a-border bg-a-surface shadow-a-sm" data-calendar-scroll="">
          {query.isLoading && <CalendarSkeleton />}
          {!query.isLoading && view !== 'list' && (
            <TimeGrid
              columns={view === 'day'
                ? columnsFor('day', date, team.masters, null, now.date, locale)
                : columnsFor(view, date, masters, masterId, now.date, locale)}
              appointments={shown} now={now} today={now.date} selectedId={selectedId}
              onSlot={(masterId, slotDate, minutes) => dispatch({ type: 'openCreate', key: newKey(), draft: { date: slotDate, time: hhmm(minutes), masterId } })}
              onOpen={(id) => dispatch({ type: 'openView', id })}
              services={query.data?.services ?? []} locale={locale}
              tellDefault={boot.messages?.staff_default ?? false} onDrop={dropAppointment}
            />
          )}
          {!query.isLoading && view === 'list' && (
            <ListView from={range.from} to={range.to} appointments={shown} locale={locale} selectedId={selectedId} onOpen={(id) => dispatch({ type: 'openView', id })} />
          )}
        </div>
      </section>

      <aside className="hidden xl:block w-72 shrink-0 bg-a-canvas overflow-y-auto" aria-label={t('appointments.overview.title', 'Day overview')}>
        <MiniMonth date={date} today={now.date} locale={locale} onPick={setDate} />
        <DayOverview />
      </aside>

      {panel.mode !== 'closed' && (
        <AppointmentPanel
          key={shownKey} slide={motion.slide}
          state={panel} dispatch={dispatch} masters={masters} services={query.data?.services ?? []} today={now.date}
        />
      )}
    </div>
  )
}
