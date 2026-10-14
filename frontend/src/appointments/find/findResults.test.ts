import { describe, expect, it } from 'vitest'
import { buildResults, findActions, latestAppointments, settledClients, type FindItem } from './findResults'
import { fold } from '../../workspace/find/findCore'
import type { AppointmentSummary, ClientSummary } from '../lib/types'

const appt = (id: number, start: string, client: string, service: string, master: string, status: AppointmentSummary['status'] = 'confirmed'): AppointmentSummary => ({
  id, reference: `R${id}`, start, end: start, duration_minutes: 60, service: { id: 1, name: service }, master: { id: 1, name: master },
  client: { id: id, name: client, is_member: false }, status, payment: { state: 'not_paid_online' }, revision: 'r',
})
const labels = { actions: 'Actions', goTo: 'Go to', comingUp: 'Coming up today', appointments: 'Appointments', clients: 'Clients', searchAll: (q: string) => `Search all clients for “${q}”`, day: (d: string) => `<day ${d}>` }
const actions: FindItem[] = [
  { id: 'new', kind: 'action', label: 'New appointment', go: { to: '/appointments?new=1' } },
  { id: 'clients', kind: 'action', label: 'Clients', sub: 'Go to', go: { to: '/appointments/clients' } },
]
const now = { date: '2026-10-12', minutes: 13 * 60 }
const day = [
  appt(1, '2026-10-12T10:00', 'Émilie Durand', 'Gloss', 'Marie'),
  appt(2, '2026-10-12T14:00', 'Mia Chen', 'Cut', 'Anouk'),
  appt(3, '2026-10-12T15:00', 'Noah Taylor', 'Beard', 'Marie', 'cancelled'),
  appt(4, '2026-10-13T09:00', 'Zoe Scott', 'Nails', 'Ilze'),
]

describe('find', () => {
  it('folds case and accents', () => {
    expect(fold('Émilie')).toBe('emilie')
    expect(fold('MIA')).toBe('mia')
  })

  it('with nothing typed shows the actions and the rest of today, cancelled left out', () => {
    const groups = buildResults({ query: '', actions, appointments: day, clients: [], now, labels })
    expect(groups.map(g => g.title)).toEqual(['Actions', 'Coming up today'])
    expect(groups[1].items.map(i => i.id)).toEqual(['appt-2'])
  })

  it('matches appointments by client, service or person, accent- and case-blind', () => {
    const ids = (q: string) => buildResults({ query: q, actions, appointments: day, clients: [], now, labels }).flatMap(g => g.items.map(i => i.id))
    expect(ids('emilie')).toContain('appt-1')
    expect(ids('MIA')).toContain('appt-2')
    expect(ids('marie')).toEqual(expect.arrayContaining(['appt-1']))
    expect(ids('beard')).not.toContain('appt-3') // cancelled
  })

  it('lists clients from the server search and offers to search them all from two letters', () => {
    const clients: ClientSummary[] = [{ id: 9, name: 'Mia Chen', phone: null, email: 'mia@example.test', member: null }]
    const groups = buildResults({ query: 'mi', actions, appointments: day, clients, now, labels })
    const all = groups.flatMap(g => g.items)
    expect(all.find(i => i.id === 'client-9')?.go).toEqual({ to: '/appointments/clients/9' })
    expect(all.at(-1)).toMatchObject({ kind: 'search', label: 'Search all clients for “mi”', go: { to: '/appointments/clients?search=mi' } })
    expect(buildResults({ query: 'm', actions, appointments: day, clients, now, labels }).flatMap(g => g.items).some(i => i.kind === 'search')).toBe(false)
  })

  it('keeps "search all" last inside the Clients group when clients were found, and under a Clients title of its own when none were', () => {
    const clients: ClientSummary[] = [{ id: 9, name: 'Mia Chen', phone: '+44 7700 900123', email: null, member: null }]
    const found = buildResults({ query: 'mi', actions, appointments: day, clients, now, labels })
    expect(found.filter(g => g.title === 'Clients')).toHaveLength(1)
    expect(found.find(g => g.title === 'Clients')?.items.map(i => i.id)).toEqual(['client-9', 'search-all'])
    expect(found.find(g => g.title === 'Clients')?.items[0].sub).toBe('+44 7700 900123')

    const none = buildResults({ query: 'zzz', actions, appointments: day, clients: [], now, labels })
    expect(none).toEqual([{ title: 'Clients', items: [expect.objectContaining({ id: 'search-all', kind: 'search' })] }])
  })

  it('sends the typed words to the client list encoded, trimmed and unfolded', () => {
    const item = buildResults({ query: '  Émilie D ', actions, appointments: [], clients: [], now, labels }).flatMap(g => g.items).find(i => i.kind === 'search')
    expect(item?.label).toBe('Search all clients for “Émilie D”')
    expect(item?.go).toEqual({ to: `/appointments/clients?search=${encodeURIComponent('Émilie D')}` })
  })

  it('finds actions by their name or their group, and shows each section at most six deep', () => {
    const ids = (q: string) => buildResults({ query: q, actions, appointments: day, clients: [], now, labels }).flatMap(g => g.items.map(i => i.id))
    expect(ids('new')).toContain('new')
    expect(ids('go to')).toContain('clients')
    expect(ids('go to')).not.toContain('new')
    const many = Array.from({ length: 9 }, (_, i) => appt(100 + i, '2026-10-12T16:00', `Ana ${i}`, 'Cut', 'Marie'))
    const groups = buildResults({ query: 'ana', actions, appointments: many, clients: [], now, labels })
    expect(groups.find(g => g.title === 'Appointments')?.items).toHaveLength(6)
  })

  it('shows an appointment once however many loaded ranges hold it', () => {
    const twice = [...day, ...day]
    const items = buildResults({ query: 'mia', actions, appointments: twice, clients: [], now, labels }).flatMap(g => g.items).filter(i => i.id === 'appt-2')
    expect(items).toHaveLength(1)
  })

  it('opens an appointment on its own day', () => {
    const item = buildResults({ query: 'zoe', actions, appointments: day, clients: [], now, labels }).flatMap(g => g.items).find(i => i.id === 'appt-4')
    expect(item?.go).toEqual({ to: '/appointments?open=4&date=2026-10-13' })
  })

  it('names an appointment\'s day with the date words it is given, never as an ISO date', () => {
    const item = buildResults({ query: 'zoe', actions, appointments: day, clients: [], now, labels }).flatMap(g => g.items).find(i => i.id === 'appt-4')
    expect(item?.sub).toBe('Nails · Ilze · <day 2026-10-13>')
  })
})

describe('findActions', () => {
  const words = { newAppointment: 'New appointment', goTo: 'Go to', timeOff: 'Time off', toDark: 'Switch to dark', toLight: 'Switch to light', collapse: 'Collapse menu', expand: 'Expand menu', shortcuts: 'Keyboard shortcuts' }
  const nav = [
    { to: '/appointments', label: 'Calendar' },
    { to: '/appointments/clients', label: 'Clients' },
    { to: '/appointments/takings', label: 'Takings' },
    { to: '/appointments/setup', label: 'Setup' },
  ]
  const make = (over: Partial<Parameters<typeof findActions>[0]> = {}) => findActions({ nav, canManage: false, wide: true, dark: false, slim: false, words, ...over })

  it('offers a new appointment, then a way to each page the person can see, then the rest', () => {
    const items = make()
    expect(items.map(i => i.id)).toEqual(['new', 'go-calendar', 'go-clients', 'go-takings', 'go-setup', 'time-off', 'theme', 'rail', 'shortcuts'])
    expect(items[0]).toMatchObject({ kind: 'action', label: 'New appointment', go: { to: '/appointments?new=1' } })
    expect(items[1]).toMatchObject({ label: 'Calendar', sub: 'Go to', go: { to: '/appointments' } })
    expect(items[3]).toMatchObject({ label: 'Takings', sub: 'Go to', go: { to: '/appointments/takings' } })
  })

  it('takes a manager to the team tab for time off, and everyone else to Setup', () => {
    expect(make({ canManage: true }).find(i => i.id === 'time-off')?.go).toEqual({ to: '/appointments/setup?tab=team' })
    expect(make().find(i => i.id === 'time-off')?.go).toEqual({ to: '/appointments/setup' })
  })

  it('names the theme it would switch to', () => {
    expect(make({ dark: false }).find(i => i.id === 'theme')).toMatchObject({ label: 'Switch to dark', go: { run: 'theme' } })
    expect(make({ dark: true }).find(i => i.id === 'theme')).toMatchObject({ label: 'Switch to light', go: { run: 'theme' } })
  })

  it('collapses or expands the menu, and leaves it out where there is no menu to collapse', () => {
    expect(make({ slim: false }).find(i => i.id === 'rail')).toMatchObject({ label: 'Collapse menu', go: { run: 'rail' } })
    expect(make({ slim: true }).find(i => i.id === 'rail')).toMatchObject({ label: 'Expand menu', go: { run: 'rail' } })
    expect(make({ wide: false }).some(i => i.id === 'rail')).toBe(false)
  })

  it('offers the list of keyboard shortcuts, last, wherever the menu can or cannot be collapsed', () => {
    for (const wide of [true, false]) {
      const items = make({ wide })
      expect(items[items.length - 1]).toMatchObject({ id: 'shortcuts', kind: 'action', label: 'Keyboard shortcuts', go: { run: 'shortcuts' } })
    }
    expect(make().map(i => i.id)).toEqual(['new', 'go-calendar', 'go-clients', 'go-takings', 'go-setup', 'time-off', 'theme', 'rail', 'shortcuts'])
  })

  it('finds the list of shortcuts by typing "keyboard"', () => {
    const typed = buildResults({ query: 'keyb', actions: make(), appointments: [], clients: [], now, labels })
    expect(typed[0].items.map(i => i.id)).toEqual(['shortcuts'])
  })
})

describe('with nothing typed', () => {
  it('lists every action, not just the first six; typing narrows them to six', () => {
    const nine: FindItem[] = Array.from({ length: 9 }, (_, i) => ({ id: `a${i}`, kind: 'action', label: `Action ${i}`, go: { to: `/appointments/x${i}` } }))
    const empty = buildResults({ query: '', actions: nine, appointments: [], clients: [], now, labels })
    expect(empty).toHaveLength(1)
    expect(empty[0].items.map(i => i.id)).toEqual(nine.map(i => i.id))
    const typed = buildResults({ query: 'action', actions: nine, appointments: [], clients: [], now, labels })
    expect(typed[0].items).toHaveLength(6)
  })
})

describe('latestAppointments', () => {
  it('keeps one copy of each appointment: the one from the calendar fetched most recently', () => {
    const oldCopy = appt(7, '2026-10-12T14:00', 'Mia Chen', 'Cut', 'Anouk')
    const movedCopy = { ...oldCopy, start: '2026-10-12T16:30', end: '2026-10-12T16:30' }
    const cancelledCopy = { ...appt(8, '2026-10-12T10:00', 'Noah Taylor', 'Beard', 'Marie'), status: 'cancelled' as const }
    const staleOpen = appt(8, '2026-10-12T10:00', 'Noah Taylor', 'Beard', 'Marie')
    // Order in the cache does not matter: the newer fetch wins whichever comes first.
    const merged = latestAppointments([
      { updatedAt: 2000, appointments: [movedCopy, cancelledCopy] },
      { updatedAt: 1000, appointments: [oldCopy, staleOpen, appt(9, '2026-10-13T09:00', 'Zoe Scott', 'Nails', 'Ilze')] },
    ])
    expect(merged.map(a => a.id).sort()).toEqual([7, 8, 9])
    expect(merged.find(a => a.id === 7)?.start).toBe('2026-10-12T16:30')
    expect(merged.find(a => a.id === 8)?.status).toBe('cancelled')
    const flipped = latestAppointments([
      { updatedAt: 1000, appointments: [oldCopy] },
      { updatedAt: 2000, appointments: [movedCopy] },
    ])
    expect(flipped).toHaveLength(1)
    expect(flipped[0].start).toBe('2026-10-12T16:30')
  })

  it('keeps the first copy when two calendars were fetched at the same moment, and copes with nothing', () => {
    const a = appt(1, '2026-10-12T10:00', 'First', 'Gloss', 'Marie')
    const b = { ...a, client: { ...a.client, name: 'Second' } }
    expect(latestAppointments([{ updatedAt: 5, appointments: [a] }, { updatedAt: 5, appointments: [b] }])[0].client.name).toBe('First')
    expect(latestAppointments([])).toEqual([])
    expect(latestAppointments([{ updatedAt: 0, appointments: [] }])).toEqual([])
  })
})

describe('settledClients', () => {
  const found: ClientSummary[] = [{ id: 9, name: 'Mia Chen', phone: null, email: null, member: null }]
  it('gives the clients only once the server has answered for the words in the box', () => {
    expect(settledClients('mi', 'mi', found)).toEqual(found)
    expect(settledClients('mia', 'mi', found)).toEqual([]) // the answer to "mi" is not the answer to "mia"
    expect(settledClients('mi', '', found)).toEqual([])
  })
  it('gives none for fewer than two letters, and none while there is no answer yet', () => {
    expect(settledClients('m', 'm', found)).toEqual([])
    expect(settledClients('', '', found)).toEqual([])
    expect(settledClients('mi', 'mi', undefined)).toEqual([])
  })
})
