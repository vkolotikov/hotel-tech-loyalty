import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CalendarDays, Plus, Search, User } from 'lucide-react'
import { useBoot } from '../AppointmentsProvider'
import { appointmentsApi } from '../lib/api'
import { handBackFocus } from '../lib/handBack'
import type { CalendarPayload } from '../lib/types'
import { useVocab } from '../lib/vocab'
import { formatDate, venueNow } from '../lib/wallClock'
import { buildResults, focusTarget, latestAppointments, nextActive, opensShortcuts, settledClients, type FindItem, type FindLabels, type FindTarget } from './findResults'

const LIST_ID = 'find-list'
const optionId = (id: string): string => `find-opt-${id}`

function iconOf(item: FindItem) {
  if (item.kind === 'appointment') return CalendarDays
  if (item.kind === 'client') return User
  if (item.kind === 'search') return Search
  return item.id === 'new' ? Plus : ArrowRight
}

/** The grouped, selectable results: a listbox the input points at with aria-activedescendant. */
export function FindList({ groups, activeId, onPick, onHover }: {
  groups: { title: string; items: FindItem[] }[]
  activeId: string | null
  onPick: (item: FindItem) => void
  onHover: (id: string) => void
}) {
  return (
    <ul id={LIST_ID} role="listbox" className="max-h-[min(24rem,50vh)] overflow-y-auto p-2">
      {groups.map(group => (
        <li key={group.title} role="presentation" className="pb-1">
          <div aria-hidden className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-a-text-2">{group.title}</div>
          <ul role="group" aria-label={group.title}>
            {group.items.map(item => {
              const Icon = iconOf(item)
              const active = item.id === activeId
              return (
                <li key={item.id} id={optionId(item.id)} role="option" aria-selected={active}
                  onClick={() => onPick(item)} onMouseMove={() => { if (!active) onHover(item.id) }}
                  className={`flex scroll-mt-9 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ${active ? 'bg-a-surface-2 ring-1 ring-inset ring-a-accent-text' : ''}`}>
                  <Icon size={16} aria-hidden className="shrink-0 text-a-text-2" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-a-text">{item.label}</span>
                    {item.sub && <span className="block truncate text-xs text-a-text-2">{item.sub}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ul>
  )
}

const kbd = 'rounded-md border border-a-border px-1.5 font-a-mono text-xs text-a-text-2'

/**
 * One box for clients (searched on the server from two letters), appointments
 * (the calendars already loaded) and actions. Nothing is drawn, and nothing
 * is fetched, while it is closed.
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
  const [activeId, setActiveId] = useState<string | null>(null)
  // Where the person was before Find opened, and what the venue's clock says, both read once when it opens.
  const [before] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)))
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
  const items = groups.flatMap(g => g.items)
  const current = items.find(i => i.id === activeId) ?? items[0]
  const currentId = current?.id ?? null

  // Arrowing past the visible part of a long list brings the option into view.
  useEffect(() => {
    if (currentId) document.getElementById(optionId(currentId))?.scrollIntoView?.({ block: 'nearest' })
  }, [currentId])

  // Back to where the person was (or, if that was the page body or is gone, to the fallbacks), unless something else — a panel the choice opened — has taken the focus since.
  const fallbacks = useRef(fallbackFocus)
  useEffect(() => { fallbacks.current = fallbackFocus })
  useEffect(() => () => {
    const held = document.activeElement
    if (held && held !== document.body && held !== document.documentElement) return
    handBackFocus(focusTarget(before, document.body, (fallbacks.current ?? []).map(r => r.current)))
  }, [before])

  const focusInput = useCallback((el: HTMLInputElement | null) => { el?.focus({ preventScroll: true }) }, [])

  const run = (item: FindItem) => { onRun(item.go); onClose() }

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveId(nextActive(items.map(i => i.id), currentId, e.key === 'ArrowDown' ? 1 : -1))
    } else if (e.key === 'Enter' && current) {
      e.preventDefault()
      run(current)
    } else if (opensShortcuts(e.key, query)) {
      // The footer's "? This list": the one place a question mark is not a character of the search.
      e.preventDefault()
      onRun({ run: 'shortcuts' })
      onClose()
    }
  }
  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    // The input is the one control in the box: Tab would only leave it for the page behind the scrim.
    else if (e.key === 'Tab') e.preventDefault()
  }

  const none = typed !== '' && items.length === 0
  const status = none
    ? t('appointments.find.none', 'Nothing matches “{{q}}”.', { q: typed })
    : t('appointments.find.count', 'Results: {{count}}', { count: items.length })
  const prompt = t('appointments.find.open', 'Find a client, appointment or action')

  return (
    <>
      <button type="button" aria-label={t('appointments.common.close', 'Close')} tabIndex={-1} onClick={onClose}
        className="fixed inset-0 z-50 cursor-default bg-a-scrim/40 animate-a-fade" />
      {/* Centred with auto margins, not translate: the pop animation ends on transform: none and would undo a translate. */}
      <div role="dialog" aria-modal="true" aria-label={t('appointments.find.title', 'Find')} onKeyDown={onPanelKey}
        onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault() }}
        className="fixed inset-x-0 top-24 z-50 mx-auto w-[min(40rem,calc(100%-2rem))] overflow-hidden rounded-2xl border border-a-border bg-a-surface text-a-text shadow-a-lg animate-a-pop">
        {/* The focus never leaves the input: the row shows it, as an underline (appointments.css, [data-find-row]). */}
        <div data-find-row="" className="flex items-center gap-3 border-b border-a-border px-4 py-3">
          <Search size={18} aria-hidden className="shrink-0 text-a-text-2" />
          <input ref={focusInput} value={query} onChange={(e) => { setQuery(e.target.value); setActiveId(null) }} onKeyDown={onInputKey}
            role="combobox" aria-expanded="true" aria-controls={LIST_ID} aria-autocomplete="list" aria-activedescendant={current ? optionId(current.id) : undefined}
            aria-label={prompt} placeholder={prompt} autoComplete="off" spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base text-a-text placeholder:text-a-text-2 sm:text-sm" />
        </div>

        <FindList groups={groups} activeId={currentId} onPick={run} onHover={setActiveId} />

        {none && <p aria-hidden className="px-4 pb-4 text-sm text-a-text-2">{status}</p>}
        {waiting && <p className="px-4 pb-3 text-xs text-a-text-2">{t('appointments.find.searching', 'Searching clients…')}</p>}
        <p role="status" aria-live="polite" className="sr-only">{status}</p>

        <div className="hidden items-center gap-4 border-t border-a-border px-4 py-2 text-xs text-a-text-2 sm:flex">
          <span className="inline-flex items-center gap-1.5"><kbd className={kbd}>↑</kbd><kbd className={kbd}>↓</kbd>{t('appointments.find.hint_move', 'move')}</span>
          <span className="inline-flex items-center gap-1.5"><kbd className={kbd}>Enter</kbd>{t('appointments.find.hint_open', 'open')}</span>
          <span className="inline-flex items-center gap-1.5"><kbd className={kbd}>Esc</kbd>{t('appointments.find.hint_close', 'close')}</span>
          <span className="inline-flex items-center gap-1.5"><kbd className={kbd}>?</kbd>{t('appointments.shortcuts.help', 'This list')}</span>
        </div>
      </div>
    </>
  )
}
