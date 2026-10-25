import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // i18next's plural pick, as far as English needs it: the one-form fallback for a count of 1.
    t: (_k: string, fallback?: string, opts?: Record<string, unknown>) => {
      let text = opts && opts.count === 1 && typeof opts.defaultValue_one === 'string' ? opts.defaultValue_one : (fallback ?? _k)
      for (const [k, v] of Object.entries(opts ?? {})) text = text.split(`{{${k}}}`).join(String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', user_type: 'member' }, token: 't' }),
}))
vi.mock('../../../lib/logout', () => ({ logoutAndRedirect: vi.fn() }))

import { PortalContext } from '../../PortalProvider'
import { PortalShell } from '../../PortalShell'
import type { PortalBootstrap } from '../../lib/types'
import { EventsLink } from './EventsLink'
import { EventsPage } from './EventsPage'
import { NextEvent } from './NextEvent'
import { ERROR_WORDS, EVENT_COUNTED, EVENT_WORDS, WHY_WORDS, actionOf, counted, errorPhrase, eventsInMenu, nextEvent, noteOf, pastEvents, timeRange, whenPhrase, whyPhrase } from './eventMath'
import type { PortalEvent, PortalEvents } from './eventsApi'

const event = (more: Partial<PortalEvent> = {}): PortalEvent => ({
  id: 7, title: 'Wine tasting', description: 'Six wines.', starts_at: '2026-10-09T18:00', ends_at: '2026-10-09T21:00', where: 'Main hall', points: 50,
  sign_up: true, walk_ins: true, capacity: 12, room_left: 12, my: 'none', checked_in: false, can_sign_up: true, why_not: null, can_cancel: false, ...more,
})
const answer = (upcoming: PortalEvent[], attended: PortalEvents['attended'] = []): PortalEvents => ({ upcoming, attended })
const base: PortalBootstrap = {
  venue: {
    name: 'Numa Club', logo_url: null, industry: 'other', currency: 'EUR', timezone: 'Europe/Riga', contact: { email: null, phone: null },
    accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' }, display_face: 'cormorant',
  },
  capabilities: { loyalty: true, services: false, stays: false, chat: true, payments: { services: false, stays: false, publishable_key: null }, events: true },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '', booking_cancellation_policy: '', check_in_time: '15:00', check_out_time: '11:00' },
  member: null,
  counts: { unread_notifications: 0, upcoming_bookings: 0 },
}

function render(node: ReactNode, data?: PortalEvents, boot: PortalBootstrap = base) {
  const client = new QueryClient()
  if (data) client.setQueryData(['portal-events'], data)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/portal']}>
        <PortalContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>{node}</PortalContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('what an event offers the member', () => {
  it('one action: sign up, signed up (cancel until the start), full, why not, or just come along', () => {
    expect(actionOf(event())).toEqual({ kind: 'sign_up' })
    expect(actionOf(event({ my: 'signed_up', can_sign_up: false, can_cancel: true }))).toEqual({ kind: 'signed_up', canCancel: true })
    expect(actionOf(event({ can_sign_up: false, why_not: 'event_full' }))).toEqual({ kind: 'full' })
    expect(actionOf(event({ can_sign_up: false, why_not: 'tier_not_allowed' }))).toEqual({ kind: 'why_not', code: 'tier_not_allowed' })
    expect(actionOf(event({ can_sign_up: false, why_not: 'something_new' }))).toEqual({ kind: 'why_not', code: 'closed' })
    expect(actionOf(event({ sign_up: false, can_sign_up: false }))).toEqual({ kind: 'come_along' })
    expect(actionOf(event({ checked_in: true, my: 'signed_up' }))).toEqual({ kind: 'checked_in' })
  })

  it('an event without sign-up says why the door would refuse this member, else just come along', () => {
    const walkIn = (more: Partial<PortalEvent> = {}) => event({ sign_up: false, can_sign_up: false, ...more })
    expect(actionOf(walkIn())).toEqual({ kind: 'come_along' })
    expect(actionOf(walkIn({ why_not: 'event_full' }))).toEqual({ kind: 'full' })
    expect(actionOf(walkIn({ why_not: 'inactive' }))).toEqual({ kind: 'why_not', code: 'inactive' })
    expect(actionOf(walkIn({ why_not: 'membership_expired' }))).toEqual({ kind: 'why_not', code: 'membership_expired' })
    expect(noteOf(walkIn({ why_not: 'inactive' }), 'en')).toBeNull()

    const expired = { ...base, member: { membership: { valid_until: '2026-10-01', state: 'expired' } } } as unknown as PortalBootstrap
    const words = text(render(<EventsPage />, answer([walkIn({ why_not: 'membership_expired' }), walkIn({ id: 8, title: 'Gala', why_not: 'event_full' })]), expired))
    expect(words).toContain('Your membership has ended')
    expect(words).toContain('Full')
    expect(words).not.toContain('just come along')
  })

  it('a line under it: places left, sign-up needed, or that it has started', () => {
    expect(noteOf(event({ room_left: 1 }), 'en')).toEqual(counted('places_left', 1, 'en'))
    expect(noteOf(event({ capacity: null, room_left: null, walk_ins: false }), 'en')?.key).toBe('portal.events.sign_up_needed')
    expect(noteOf(event({ capacity: null, room_left: null }), 'en')).toBeNull()
    expect(noteOf(event({ my: 'signed_up', can_sign_up: false, can_cancel: false }), 'en')?.key).toBe('portal.events.started')
  })

  it('says when from the wall-clock strings', () => {
    expect(timeRange(event(), 'en')).toBe('18:00–21:00')
    expect(whenPhrase(event(), 'en').options).toEqual({ day: 'Fri 9 Oct', time: '18:00–21:00' })
    expect(whenPhrase(event({ starts_at: '2026-10-09T22:00', ends_at: '2026-10-10T02:00' }), 'en'))
      .toEqual({ key: 'portal.events.from_to', fallback: EVENT_WORDS.from_to, options: { from: 'Fri 9 Oct 22:00', to: 'Sat 10 Oct 02:00' } })
  })

  it('Home shows the next event signed up for, else the next one open', () => {
    const a = event({ id: 1 })
    const b = event({ id: 2, my: 'signed_up' })
    expect(nextEvent(answer([a, b]))).toEqual({ event: b, mine: true })
    expect(nextEvent(answer([a]))).toEqual({ event: a, mine: false })
    expect(nextEvent(answer([]))).toBeNull()
    expect(nextEvent(undefined)).toBeNull()
    // An event the member is already checked in to is never Home's, not even as the one open to them.
    const inNow = event({ id: 3, my: 'signed_up', checked_in: true })
    expect(nextEvent(answer([inNow, a]))).toEqual({ event: a, mine: false })
    expect(nextEvent(answer([inNow]))).toBeNull()
  })

  it('an event the member came to that is still on is listed once, under Coming up', () => {
    const on = event({ id: 2, my: 'signed_up', checked_in: true })
    const data = answer([on], [{ id: 2, title: 'Wine tasting', starts_at: '2026-10-09T18:00', points: 50 }, { id: 1, title: 'Yoga', starts_at: '2026-10-03T08:00', points: 50 }])
    expect(pastEvents(data).map(e => e.id)).toEqual([1])
    const words = text(render(<EventsPage />, data))
    expect(words.split('Wine tasting').length - 1).toBe(1)
    expect(words).toContain('Yoga')
  })

  it('a membership that has already ended says so, not that it ends before the event', () => {
    expect(whyPhrase('membership_expired', 'active').key).toBe('portal.events.why.membership_expired')
    expect(whyPhrase('membership_expired', 'expired')).toEqual({ key: 'portal.events.why.membership_ended', fallback: WHY_WORDS.membership_ended, options: {} })
    expect(whyPhrase('tier_not_allowed', 'expired').key).toBe('portal.events.why.tier_not_allowed')
  })

  it('a refusal reads in the member’s words', () => {
    expect(errorPhrase('event_full')).toEqual({ key: 'portal.events.error.event_full', fallback: ERROR_WORDS.event_full, options: {} })
    expect(errorPhrase(null).key).toBe('portal.events.error.unknown')
  })
})

describe('the Events page', () => {
  it('lists the events coming up with their one action, and those the member came to', () => {
    const words = text(render(<EventsPage />, answer([
      event(),
      event({ id: 8, title: 'Members’ night', my: 'signed_up', can_sign_up: false, can_cancel: true, room_left: 3, points: 1 }),
      event({ id: 9, title: 'Gala', can_sign_up: false, why_not: 'event_full', room_left: 0 }),
      event({ id: 10, title: 'Open garden', sign_up: false, can_sign_up: false, capacity: null, room_left: null, points: 0, where: null }),
    ], [{ id: 3, title: 'Yoga', starts_at: '2026-10-03T08:00', points: 50 }])))
    expect(words).toContain('Wine tasting')
    expect(words).toContain('Fri 9 Oct · 18:00–21:00')
    expect(words).toContain('Main hall')
    expect(words).toContain('+50 points')
    expect(words).toContain('Sign up')
    expect(words).toContain('12 places left')
    expect(words).toContain('You’re signed up')
    expect(words).toContain('Cancel')
    expect(words).toContain('+1 point')
    expect(words).toContain('Full')
    expect(words).toContain('No sign-up needed: just come along.')
    expect(words).toContain('You came to')
    expect(words).toContain('Yoga')
    expect(words).toContain('Sat 3 Oct')
  })

  it('says when nothing is planned', () => {
    expect(text(render(<EventsPage />, answer([])))).toContain('Nothing is planned right now.')
  })
})

describe('Home’s card and the way in', () => {
  it('names the next event signed up for, with See events', () => {
    const words = text(render(<NextEvent />, answer([event({ my: 'signed_up', can_sign_up: false })])))
    expect(words).toContain('Your next event')
    expect(words).toContain('Wine tasting')
    expect(words).toContain('Main hall')
    expect(words).toContain('See events')
    expect(text(render(<NextEvent />, answer([event()])))).toContain('Coming up')
    expect(render(<NextEvent />, answer([]))).toBe('')
  })

  it('the Rewards header links to Events while the venue has one and the menu does not show it', () => {
    const caps = (more: Partial<PortalBootstrap['capabilities']>) => ({ ...base, capabilities: { ...base.capabilities, ...more } })
    expect(render(<EventsLink />, undefined, caps({ services: true }))).toContain('href="/portal/events"')
    expect(render(<EventsLink />)).toBe('')
    expect(render(<EventsLink />, undefined, caps({ services: true, events: false }))).toBe('')
    // The same rule as the menu's: Events is there exactly when Rewards does not link to it.
    for (const more of [{}, { services: true }, { stays: true }, { loyalty: false }, { loyalty: false, services: true }]) {
      const shell = render(<PortalShell><p>page</p></PortalShell>, undefined, caps(more))
      expect(shell.includes('href="/portal/events"'), JSON.stringify(more)).toBe(eventsInMenu(caps(more).capabilities))
    }
  })

  it('the menu holds Events as a fifth item, never a sixth', () => {
    const shell = (caps: Partial<PortalBootstrap['capabilities']>) => render(<PortalShell><p>page</p></PortalShell>, undefined, { ...base, capabilities: { ...base.capabilities, ...caps } })
    const four = shell({})
    expect(four.match(/href="\/portal\/events"/g)?.length).toBe(2)
    expect(four).toContain('grid-cols-5')
    const full = shell({ services: true })
    expect(full).not.toContain('href="/portal/events"')
    expect(full).toContain('grid-cols-5')
    expect(shell({ events: false })).not.toContain('href="/portal/events"')
  })
})

describe('the events bundles (portal.events)', () => {
  const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const
  const bundle = (l: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../i18n/events.${l}.json`), 'utf8')) as Record<string, unknown>
  const flat = (o: Record<string, unknown>, prefix = ''): Record<string, string> => Object.fromEntries(Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? Object.entries(flat(v as Record<string, unknown>, `${prefix}${k}.`)) : [[`${prefix}${k}`, String(v)]]))
  const holes = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()

  it('the five carry the same keys, none empty, every placeholder kept', () => {
    const en = flat(bundle('en'))
    for (const l of LOCALES) {
      const b = flat(bundle(l))
      expect(Object.keys(b).sort(), l).toEqual(Object.keys(en).sort())
      for (const [k, v] of Object.entries(b)) {
        expect(v.trim(), `${l}:${k}`).not.toBe('')
        expect(holes(v), `${l}:${k}`).toEqual(holes(en[k]))
      }
    }
  })

  it('the English is the code’s, and every plural family has its four forms', () => {
    const en = flat(bundle('en'))
    for (const [k, v] of Object.entries(EVENT_WORDS)) expect(en[k], k).toBe(v)
    for (const [k, v] of Object.entries(WHY_WORDS)) expect(en[`why.${k}`], k).toBe(v)
    for (const [k, v] of Object.entries(ERROR_WORDS)) expect(en[`error.${k}`], k).toBe(v)
    for (const [k, [one, other]] of Object.entries(EVENT_COUNTED)) {
      expect([en[`${k}_one`], en[`${k}_few`], en[`${k}_many`], en[`${k}_other`]], k).toEqual([one, other, other, other])
      for (const l of LOCALES) for (const form of ['one', 'few', 'many', 'other']) expect(typeof flat(bundle(l))[`${k}_${form}`], `${l}:${k}_${form}`).toBe('string')
      expect(en[k], `${k} is a plural family only`).toBeUndefined()
    }
  })

  it('a count reads right in each language', async () => {
    const say = async (lng: string, key: keyof typeof EVENT_COUNTED, n: number) => {
      const i18n = i18next.createInstance()
      await i18n.init({ lng, fallbackLng: 'en', defaultNS: 'common', ns: ['common'], interpolation: { escapeValue: false },
        resources: Object.fromEntries(LOCALES.map(l => [l, { common: { portal: { events: bundle(l) } } }])) })
      const p = counted(key, n, lng)
      return String(i18n.t(p.key, { defaultValue: p.fallback, ...p.options }))
    }
    expect(await say('en', 'places_left', 1)).toBe('1 place left')
    expect(await say('en', 'places_left', 3)).toBe('3 places left')
    expect(await say('ru', 'places_left', 1)).toBe('Осталось 1 место')
    expect(await say('ru', 'places_left', 3)).toBe('Осталось 3 места')
    expect(await say('ru', 'places_left', 5)).toBe('Осталось 5 мест')
    expect(await say('ru', 'points', 21)).toBe('+21 балл')
    expect(await say('de', 'points', 1)).toBe('+1 Punkt')
    expect(await say('fr', 'places_left', 0)).toBe('0 place restante')
    expect(await say('es', 'places_left', 2)).toBe('Quedan 2 plazas')
  })
})
