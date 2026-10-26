import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { PortalContext, type PortalContextValue } from '../../PortalProvider'
import { PortalShell } from '../../PortalShell'
import type { PortalBootstrap, PortalMember } from '../../lib/types'
import { HelpPage } from './HelpPage'
import { QUESTIONS, STEPS, TOPICS, fold, narrow, questionsFor, topicsFor, type Say } from './helpMath'
import { HELP_WORDS } from './words'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = typeof fallback === 'object' ? fallback : opts
      let text = typeof fallback === 'string' ? fallback : _k
      for (const [k, v] of Object.entries(vars ?? {})) text = text.replace(`{{${k}}}`, String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../../stores/authStore', () => ({
  useAuthStore: () => ({ user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', user_type: 'member' }, token: 't' }),
}))
vi.mock('../../../lib/logout', () => ({ logoutAndRedirect: vi.fn() }))

const member: PortalMember = {
  member_number: 'HL-000123', name: 'Ada Lovelace', tier: { id: 2, name: 'Gold' }, current_points: 1250, lifetime_points: 4100,
  referral_code: null, progress: { percentage: 25, points_needed: 3750, next_tier: null }, recent_activity: [],
  marketing_consent: false, email_notifications: true, push_notifications: true, member_since: '2026-01-15',
  user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', phone: null, language: 'en' }, benefits: [],
}
const base: PortalBootstrap = {
  venue: { name: 'Numa', logo_url: null, industry: 'beauty', currency: 'EUR', timezone: 'Europe/Riga', contact: { email: 'hi@numa.test', phone: '+371 2000 0000' },
    accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' }, display_face: 'cormorant' },
  capabilities: { loyalty: true, services: true, stays: false, chat: true, payments: { services: false, stays: false, publishable_key: null } },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '', booking_cancellation_policy: '', check_in_time: '15:00', check_out_time: '11:00' },
  member, counts: { unread_notifications: 0, upcoming_bookings: 0 },
}
const withCaps = (caps: Partial<PortalBootstrap['capabilities']>, more: Partial<PortalBootstrap> = {}): PortalBootstrap =>
  ({ ...base, ...more, capabilities: { ...base.capabilities, ...caps } })

function render(node: ReactNode, data: PortalBootstrap = base) {
  const value: PortalContextValue = { data, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/portal/help']}>
      <PortalContext.Provider value={value}>{node}</PortalContext.Provider>
    </MemoryRouter>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const english: Say = (_key, fallback) => fallback
const ids = (data: PortalBootstrap) => questionsFor(data).map(q => q.id)

describe('Help (owner 2026-10-26)', () => {
  it('a loyalty member sees the search, how it works in three steps, the questions by topic and the venue’s contact', () => {
    const html = render(<HelpPage />)
    const words = text(html)
    for (const part of ['Help', 'How it works', 'Show your card', 'Collect points', 'Enjoy rewards', 'Questions', 'Card & points', 'Where is my membership card?', 'Still need help?', 'Numa is happy to help.']) {
      expect(words).toContain(part)
    }
    expect(html).toContain('placeholder="Search questions"')
    expect(html.match(/data-help-step=/g)).toHaveLength(3)
    expect(html.match(/data-help-question=/g)).toHaveLength(questionsFor(base).length)
    expect(html).toContain('href="mailto:hi@numa.test"')
    expect(html).toContain('href="tel:+371 2000 0000"')
  })

  it('asks only about what this member’s portal has', () => {
    // A loyalty venue selling appointments, no events, no end date: no events, no "membership ends".
    expect(topicsFor(questionsFor(base))).toEqual(['card', 'rewards', 'bookings', 'account'])
    expect(ids(base)).not.toContain('ends')
    // Events while the menu offers them; "what happens when it ends" only for a membership with an end date.
    const more = withCaps({ events: true }, { member: { ...member, membership: { valid_until: '2027-01-31', state: 'active' } } })
    expect(topicsFor(questionsFor(more))).toEqual(TOPICS)
    expect(ids(more)).toEqual(expect.arrayContaining(['sign_up', 'door', 'ends']))
    // A venue without loyalty that books: no steps, no points or rewards questions.
    const booking = withCaps({ loyalty: false })
    expect(topicsFor(questionsFor(booking))).toEqual(['bookings', 'account'])
    const html = render(<HelpPage />, booking)
    expect(html).not.toContain('data-help-step=')
    expect(html).not.toContain('Where is my membership card?')
    // Nothing to book, no membership row: only the account's questions that need no member.
    const bare = withCaps({ loyalty: false, services: false, stays: false }, { member: null })
    expect(ids(bare)).toEqual(['details', 'password', 'install', 'delete'])
    // No contact on file: no contact card.
    expect(render(<HelpPage />, { ...base, venue: { ...base.venue, contact: { email: null, phone: null } } })).not.toContain('Still need help?')
  })

  it('the search keeps the questions holding every word, accents and case aside, within the topic', () => {
    const all = questionsFor(withCaps({ events: true }))
    expect(narrow('', 'all', all, english)).toEqual(all.map(q => q.id))
    expect(narrow('wallet', 'all', all, english)).toEqual(['wallet'])
    expect(narrow('QR CODE', 'all', all, english)).toEqual(['card', 'door'])
    expect(narrow('qr', 'card', all, english)).toEqual(['card'])
    expect(narrow('zzz', 'all', all, english)).toEqual([])
    expect(narrow('', 'bookings', all, english)).toEqual(['book', 'cancel', 'change'])
    // A question is found by its topic's name too.
    expect(narrow('events', 'all', all, english)).toEqual(expect.arrayContaining(['sign_up', 'door']))
    expect(fold('Réservation Ёлка')).toBe('reservation елка')
  })

  it('the header and Profile lead to Help', () => {
    expect(render(<PortalShell><p>page</p></PortalShell>)).toContain('href="/portal/help"')
    const profile = fs.readFileSync(path.resolve(__dirname, '../Profile.tsx'), 'utf8')
    expect(profile).toContain('to="/portal/help"')
  })

  it('every step and answer leads to a page the portal has', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../../PortalApp.tsx'), 'utf8')
    const routes = new Set([...app.matchAll(/path="([^"*]+)"/g)].map(m => `/portal/${m[1]}`))
    routes.add('/portal')
    for (const to of [...STEPS.map(s => s.to), ...QUESTIONS.flatMap(q => (q.to ? [q.to] : []))]) {
      expect(routes, to).toContain(to.split(/[?#]/)[0])
    }
  })
})

describe('Help’s words', () => {
  const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const
  const bundle = (lang: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../i18n/help.${lang}.json`), 'utf8'))
  const flatten = (o: unknown, prefix = ''): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
  const values = (o: unknown): string[] =>
    typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(values) : []

  it('the five bundles carry the same keys, and the English is the page’s own', () => {
    const en = bundle('en')
    for (const lang of LOCALES) {
      expect(flatten(bundle(lang)).sort(), `${lang} keys differ from en`).toEqual(flatten(en).sort())
      expect(bundle(lang).contact_line, lang).toContain('{{venue}}')
    }
    expect({ step: en.step, topic: en.topic, q: en.q, a: en.a }).toEqual(HELP_WORDS)
    for (const q of QUESTIONS) expect(HELP_WORDS.q[q.id], q.id).toMatch(/\?$/)
  })

  // A button an answer names in quotes is the one the member sees on that screen, in that language.
  const QUOTED: Record<(typeof LOCALES)[number], RegExp> = { en: /“([^”]+)”/g, ru: /«([^»]+)»/g, de: /„([^“]+)“/g, fr: /«\s?([^»]+?)\s?»/g, es: /«([^»]+)»/g }
  for (const lang of LOCALES) {
    it(`${lang}: every label quoted in an answer is the portal’s own`, () => {
      const portal = ['portal', 'events', 'stamps', 'credit'].flatMap(f => values(JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../i18n/${f}.${lang}.json`), 'utf8'))))
      const common = values(JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../i18n/locales/${lang}/common.json`), 'utf8')))
      const known = new Set([...portal, ...common])
      const quoted = Object.values(bundle(lang).a as Record<string, string>).flatMap(a => [...a.matchAll(QUOTED[lang])].map(m => m[1]))
      expect(quoted.length, lang).toBeGreaterThanOrEqual(8)
      expect(quoted.filter(q => !known.has(q)), lang).toEqual([])
    })
  }
})
