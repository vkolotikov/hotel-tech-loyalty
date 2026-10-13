import type { AppointmentSummary, ClientSummary, DateKey } from '../lib/types'
import { dateOf, timeOf, wallMinutes } from '../lib/wallClock'

/** Where choosing a result goes: to a page, or to something the shell does itself. */
export type FindTarget = { to: string } | { run: 'theme' | 'rail' | 'shortcuts' }
export interface FindItem { id: string; kind: 'action' | 'appointment' | 'client' | 'search'; label: string; sub?: string; go: FindTarget }
export interface FindLabels {
  actions: string; goTo: string; comingUp: string; appointments: string; clients: string; searchAll: (q: string) => string
  /** A day as the workspace writes it in the active language ("Wed 30 Sept"). */
  day: (date: DateKey) => string
}

/** Lower case without accents, so "emilie" finds "Émilie". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

const LIMIT = 6

function apptItem(a: AppointmentSummary, day: FindLabels['day']): FindItem {
  return {
    id: `appt-${a.id}`, kind: 'appointment',
    label: `${timeOf(a.start)} · ${a.client.name}`,
    sub: [a.service?.name, a.master?.name, day(dateOf(a.start))].filter(Boolean).join(' · '),
    go: { to: `/appointments?open=${a.id}&date=${dateOf(a.start)}` },
  }
}

export function buildResults({ query, actions, appointments, clients, now, labels }: {
  query: string; actions: FindItem[]; appointments: AppointmentSummary[]; clients: ClientSummary[]
  now: { date: DateKey; minutes: number }; labels: FindLabels
}): { title: string; items: FindItem[] }[] {
  const q = fold(query.trim())
  const live = appointments.filter(a => a.status !== 'cancelled')
    .sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id)
  // The same day can sit in more than one loaded range (a week and its day): list it once.
  const seen = new Set<number>()
  const unique = live.filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)))

  if (q === '') {
    const comingUp = unique.filter(a => dateOf(a.start) === now.date && wallMinutes(a.start) >= now.minutes).slice(0, 3)
    // Every action: with nothing typed, the box is how a person finds out what it can do (typing narrows them to LIMIT).
    return [
      { title: labels.actions, items: actions },
      ...(comingUp.length ? [{ title: labels.comingUp, items: comingUp.map(a => apptItem(a, labels.day)) }] : []),
    ]
  }

  const hit = (...texts: (string | null | undefined)[]) => texts.some(t => t && fold(t).includes(q))
  const groups = [
    { title: labels.actions, items: actions.filter(a => hit(a.label, a.sub)).slice(0, LIMIT) },
    { title: labels.appointments, items: unique.filter(a => hit(a.client.name, a.service?.name, a.master?.name)).slice(0, LIMIT).map(a => apptItem(a, labels.day)) },
    { title: labels.clients, items: clients.slice(0, LIMIT).map((c): FindItem => ({
      id: `client-${c.id}`, kind: 'client', label: c.name, sub: [c.phone, c.email].filter(Boolean).join(' · ') || undefined,
      go: { to: `/appointments/clients/${c.id}` },
    })) },
  ].filter(g => g.items.length > 0)

  // From two letters the client list itself can be searched in full. Its item closes the Clients group, or is that group.
  if (q.length >= 2) {
    const raw = query.trim()
    const all: FindItem = { id: 'search-all', kind: 'search', label: labels.searchAll(raw), go: { to: `/appointments/clients?search=${encodeURIComponent(raw)}` } }
    const clientGroup = groups.find(g => g.items.some(i => i.kind === 'client'))
    if (clientGroup) clientGroup.items.push(all)
    else groups.push({ title: labels.clients, items: [all] })
  }
  return groups
}

/**
 * Every appointment the loaded calendars hold, once each. Calendars of
 * different ranges overlap, and one fetched earlier may still show an
 * appointment at the time it had before it was moved or cancelled: the copy
 * from the calendar fetched most recently wins (the first, on a tie).
 */
export function latestAppointments(entries: { updatedAt: number; appointments: AppointmentSummary[] }[]): AppointmentSummary[] {
  const best = new Map<number, { updatedAt: number; appointment: AppointmentSummary }>()
  for (const { updatedAt, appointments } of entries) {
    for (const appointment of appointments) {
      const kept = best.get(appointment.id)
      if (!kept || updatedAt > kept.updatedAt) best.set(appointment.id, { updatedAt, appointment })
    }
  }
  return [...best.values()].map(b => b.appointment)
}

/** The clients to list: the server's answer, and only when it is the answer to the words in the box now and they are two letters or more. */
export function settledClients(typed: string, debounced: string, data: ClientSummary[] | undefined): ClientSummary[] {
  return typed.length >= 2 && debounced === typed ? (data ?? []) : []
}

export interface Focusable { isConnected: boolean; disabled?: boolean; focus: () => void }

/**
 * Where the focus goes when Find closes: where the person was; and when that
 * was nothing in particular (the page body, which is where Safari leaves it
 * after a click on a button) or is gone, the first fallback still on the page.
 * A place that cannot take focus is no place: a disabled button (Find's own,
 * once the workspace has stopped) is skipped, so the focus reaches `main`.
 */
export function focusTarget<T extends Focusable>(before: T | null, body: unknown, fallbacks: (T | null)[]): T | null {
  const candidates = before && before !== body ? [before, ...fallbacks] : fallbacks
  return candidates.find((c): c is T => c !== null && c.isConnected && c.disabled !== true) ?? null
}

/**
 * Where the focus was when a dialog opened, read once into `slot` (`undefined`
 * = not read yet; `null` = nothing in particular). React's development re-run
 * of a mount effect reads it again with the dialog's own button focused; the
 * first answer is the one that counts.
 */
export function firstFocus<T>(slot: { current: T | undefined }, now: T): T {
  if (slot.current === undefined) slot.current = now
  return slot.current
}

/** "?" in an empty box opens the list of shortcuts, as the footer says; with anything typed it is a character of the search. */
export function opensShortcuts(key: string, query: string): boolean {
  return key === '?' && query === ''
}

/** The option after (1) or before (-1) the current one, wrapping at both ends. A current option that is gone counts as the first. */
export function nextActive(ids: string[], current: string | null, delta: 1 | -1): string | null {
  if (ids.length === 0) return null
  const at = Math.max(0, current === null ? 0 : ids.indexOf(current))
  return ids[(at + delta + ids.length) % ids.length]
}

/**
 * The things Find can do without a search: start an appointment, go to a page
 * the person can see (the shell's own `nav` already leaves out what a person
 * may not open), time off, the theme, the menu and the list of keyboard
 * shortcuts. The words arrive translated, so this stays a plain function.
 */
export function findActions({ nav, canManage, wide, dark, slim, words }: {
  nav: { to: string; label: string }[]
  canManage: boolean
  /** The side menu only exists from 1024 px; below it there is nothing to collapse. */
  wide: boolean
  dark: boolean
  slim: boolean
  words: { newAppointment: string; goTo: string; timeOff: string; toDark: string; toLight: string; collapse: string; expand: string; shortcuts: string }
}): FindItem[] {
  const rail: FindItem = { id: 'rail', kind: 'action', label: slim ? words.expand : words.collapse, go: { run: 'rail' } }
  return [
    { id: 'new', kind: 'action', label: words.newAppointment, go: { to: '/appointments?new=1' } },
    ...nav.map((n): FindItem => ({
      id: `go-${n.to.replace(/^\/appointments\/?/, '') || 'calendar'}`, kind: 'action', label: n.label, sub: words.goTo, go: { to: n.to },
    })),
    { id: 'time-off', kind: 'action', label: words.timeOff, go: { to: canManage ? '/appointments/setup?tab=team' : '/appointments/setup' } },
    { id: 'theme', kind: 'action', label: dark ? words.toLight : words.toDark, go: { run: 'theme' } },
    ...(wide ? [rail] : []),
    { id: 'shortcuts', kind: 'action', label: words.shortcuts, go: { run: 'shortcuts' } },
  ]
}
