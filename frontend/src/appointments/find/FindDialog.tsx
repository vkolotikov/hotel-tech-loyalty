import { useEffect, useState, type RefObject } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FindFrame } from '../../workspace/find/FindFrame'
import { formatDate, venueNow } from '../../workspace/lib/wallClock'
import { useBoot } from '../AppointmentsProvider'
import { appointmentsApi } from '../lib/api'
import type { CalendarPayload } from '../lib/types'
import { useVocab } from '../lib/vocab'
import { buildResults, iconOf, latestAppointments, settledClients, type FindItem, type FindLabels, type FindTarget } from './findResults'

/**
 * Appointments' Find, on the shared frame: clients (searched on the server
 * from two letters), appointments (the calendars already loaded) and
 * actions. Nothing is drawn, and nothing is fetched, while it is closed.
 */
export function FindDialog({ open, onClose, onRun, actions, fallbackFocus }: {
  open: boolean
  onClose: () => void
  onRun: (target: FindTarget) => void
  actions: FindItem[]
  /** Where the focus goes on close when the person was on nothing in particular (or the place is gone), tried in order. */
  fallbackFocus?: RefObject<HTMLElement | null>[]
}) {
  if (!open) return null
  return <FindPanel onClose={onClose} onRun={onRun} actions={actions} fallbackFocus={fallbackFocus} />
}

function FindPanel({ onClose, onRun, actions, fallbackFocus }: { onClose: () => void; onRun: (target: FindTarget) => void; actions: FindItem[]; fallbackFocus?: RefObject<HTMLElement | null>[] }) {
  const { t, i18n } = useTranslation()
  const vocab = useVocab()
  const boot = useBoot()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  // What the venue's clock says, read once when Find opens.
  const [now] = useState(() => venueNow(boot.venue.timezone))
  // Every calendar already loaded, the most recently fetched copy of each appointment.
  const [appointments] = useState(() => latestAppointments(
    queryClient.getQueriesData<CalendarPayload>({ queryKey: ['appointments', 'calendar'] }).map(([key, payload]) => ({
      updatedAt: queryClient.getQueryState(key)?.dataUpdatedAt ?? 0,
      appointments: payload?.appointments ?? [],
    }))))

  // The server is asked once typing pauses; the state is set from the timer's callback.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [query])

  const typed = query.trim()
  const asking = typed.length >= 2
  const search = useQuery({
    queryKey: ['appointments', 'find-clients', debounced],
    queryFn: () => appointmentsApi.searchClients(debounced).then(r => r.clients),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
    retry: false,
  })
  // Only the answer to the words now in the box: the clients of an earlier search would be shown under a heading they do not belong to.
  const clients = settledClients(typed, debounced, search.data)
  const waiting = asking && (debounced !== typed || search.isFetching)

  const labels: FindLabels = {
    actions: t('appointments.find.actions', 'Actions'),
    goTo: t('appointments.find.go_to', 'Go to'),
    comingUp: t('appointments.find.coming_up', 'Coming up today'),
    appointments: t('appointments.find.appointments', 'Appointments'),
    clients: vocab('clients'),
    searchAll: q => t('appointments.find.search_all', 'Search all clients for “{{q}}”', { q }),
    // The short day the drop confirm uses ("Wed 30 Sept", "ср, 30 сент."), in the calendar's own locale.
    day: date => formatDate(date, i18n.language || 'en', { weekday: 'short', day: 'numeric', month: 'short' }),
  }
  const groups = buildResults({ query, actions, appointments, clients, now, labels })

  return (
    <FindFrame prompt={t('appointments.find.open', 'Find a client, appointment or action')} query={query} onQuery={setQuery}
      groups={groups} iconOf={iconOf}
      onPick={(item) => { onRun(item.go); onClose() }}
      onShortcuts={() => { onRun({ run: 'shortcuts' }); onClose() }}
      onClose={onClose}
      waiting={waiting ? t('appointments.find.searching', 'Searching clients…') : null}
      fallbackFocus={fallbackFocus} />
  )
}
