import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppointmentsContext, type AppointmentsContextValue } from './AppointmentsProvider'
import { AppointmentsShell } from './AppointmentsShell'
import type { Bootstrap } from './lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))
vi.mock('../lib/logout', () => ({ logoutAndRedirect: vi.fn() }))
vi.mock('../i18n', () => ({ SUPPORTED_LANGUAGES: [{ code: 'en', label: 'English' }, { code: 'ru', label: 'Русский' }] }))
const auth = vi.hoisted(() => ({ user: null as unknown }))
vi.mock('../stores/authStore', () => ({
  useAuthStore: (select?: (s: { user: unknown }) => unknown) => (select ? select({ user: auth.user }) : { user: auth.user }),
}))

const boot: Bootstrap = {
  name: 'HexaTech Appointments',
  organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-06', currency: 'GBP' },
  staff: { name: 'Vitalij K', role: 'manager' },
  loyalty: { programme_on: true, points_on_bookings: true },
  readiness: { services: 5, team: 4, bookable: true, checklist: { steps: [], complete: true } },
}

function render(value: Partial<AppointmentsContextValue>, path = '/appointments') {
  const full: AppointmentsContextValue = { data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, ...value }
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>full admin dashboard</p>} />
        <Route path="/appointments/*" element={
          <AppointmentsContext.Provider value={full}>
            <AppointmentsShell><p>page body</p></AppointmentsShell>
          </AppointmentsContext.Provider>
        } />
      </Routes>
    </MemoryRouter>,
  )
}

const refused = (code: string) => ({ response: { status: 403, data: { error: code } } })

describe('AppointmentsShell', () => {
  it('is the token scope, names the product and the organisation, and draws the page', () => {
    const html = render({})
    expect(html).toContain('data-appointments=""')
    expect(html).toContain('HexaTech Appointments')
    expect(html).toContain('Lumière Salon')
    expect(html).toContain('page body')
  })

  it('offers Calendar and Clients and nothing from the full admin', () => {
    const html = render({})
    expect(html).toContain('href="/appointments"')
    expect(html).toContain('href="/appointments/clients"')
    expect(html).toContain('href="/appointments?new=1"')
    expect(html).toContain('href="/appointments/setup"')
    for (const foreign of ['/leads', '/members', '/engagement', '/chatbot-setup', '/planner', '/marketing', '/analytics']) {
      expect(html).not.toContain(`href="${foreign}"`)
    }
  })

  it('keeps a way back to the full admin in the secondary area', () => {
    expect(render({})).toContain('Full admin')
  })

  it('offers Insights to managers only', () => {
    expect(render({ data: { ...boot, staff: { ...boot.staff, can_manage: true } } })).toContain('href="/appointments/insights"')
    expect(render({})).not.toContain('href="/appointments/insights"')
  })

  it('takes "Full admin" to the same tool there: the calendar to the service calendar, clients to the customer list', () => {
    const fullAdminHref = (html: string) => [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>(?:(?!<\/a>).)*Full admin/g)].map(m => m[1])
    expect(fullAdminHref(render({}, '/appointments'))).toEqual(['/service-bookings/calendar', '/service-bookings/calendar'])
    expect(fullAdminHref(render({}, '/appointments/clients'))).toEqual(['/leads?tab=customers', '/leads?tab=customers'])
  })

  it('marks the dark rail, and only the rail, for the pale focus ring', () => {
    const html = render({})
    expect((html.match(/data-rail=""/g) ?? []).length).toBe(1)
    expect(html).toMatch(/<aside[^>]*data-rail=""/)
  })

  it('prints the brand under the organisation only when it says something the organisation does not', () => {
    const header = (html: string) => html.slice(html.indexOf('<header'), html.indexOf('</header>'))
    const same = header(render({ data: { ...boot, brand: { id: 25, name: 'Lumière Salon' } } }))
    expect((same.match(/Lumière Salon/g) ?? []).length).toBe(1)
    expect(header(render({ data: { ...boot, brand: { id: 26, name: 'Lumière Riga' } } }))).toContain('Lumière Riga')
  })

  it('keeps Full admin, the language and Sign out within reach when the rail is hidden on a narrow screen', () => {
    const html = render({})
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'))
    const menu = header.slice(header.indexOf('<details'), header.indexOf('</details>'))
    expect(menu).toContain('lg:hidden')
    expect(menu).toContain('Full admin')
    expect(menu).toContain('<select')
    expect(menu).toContain('Sign out')
    expect(menu).toMatch(/<summary[^>]*aria-label="Menu"/)
  })

  it('fits a 390 px phone: the search can shrink and New appointment keeps only its icon below sm', () => {
    // With Calendar, Clients and Setup in the narrow header, the menu button was pushed off a phone screen.
    const header = (html: string) => html.slice(html.indexOf('<header'), html.indexOf('</header>'))
    const html = header(render({}))
    expect(html).toMatch(/<form role="search"[^>]*class="[^"]*min-w-0/)
    const newLink = html.match(/<a[^>]*href="\/appointments\?new=1"[^>]*>/)?.[0] ?? html.match(/<a[^>]*aria-label="New appointment"[^>]*>/)?.[0] ?? ''
    expect(newLink).toContain('href="/appointments?new=1"')
    expect(newLink).toContain('aria-label="New appointment"')
    expect(html).toMatch(/<span class="hidden sm:inline">New appointment<\/span>/)
  })

  it('shows the setup banner while the checklist is unfinished, and not on Setup itself', () => {
    const unfinished = { ...boot, readiness: { ...boot.readiness, checklist: { steps: [{ key: 'timezone' as const, done: false, optional: false }], complete: false } } }
    expect(render({})).not.toContain('Setup is not finished')
    expect(render({ data: unfinished })).toContain('Setup is not finished: 0 of 1 steps done.')
    expect(render({ data: unfinished }, '/appointments/setup')).not.toContain('Setup is not finished')
  })

  it('shows the switched-off notice on a 403 while the workspace was open', () => {
    const html = render({ isError: true, error: refused('workspace_disabled') })
    expect(html).toContain('has been switched off')
    expect(html).toContain('href="/"')
    expect(html).not.toContain('page body')
  })

  it('draws nothing but a redirect for an organisation that never had the workspace', () => {
    // <Navigate to="/"> acts in an effect, which a static render never runs:
    // the proof here is that no part of the shell is drawn.
    const html = render({ data: undefined, isError: true, error: refused('workspace_disabled') })
    expect(html).toBe('')
  })

  it('says the subscription is not active, and where it is put right, instead of "something went wrong"', () => {
    const lapsed = { response: { status: 403, data: { error: 'subscription_required', message: 'Your subscription was canceled. Please reactivate to restore access.' } } }

    const first = render({ data: undefined, isError: true, error: lapsed })
    expect(first).toContain('subscription is not active')
    expect(first).toContain('Billing')
    expect(first).toContain('href="/"')
    expect(first).not.toContain('Something went wrong')
    expect(first).not.toContain('Try again')

    // Lapsed while the workspace was open: the page gives way to the same notice.
    const open = render({ isError: true, error: lapsed })
    expect(open).toContain('subscription is not active')
    expect(open).not.toContain('page body')
  })

  it('shows a retry, not the page, when bootstrap fails for another reason', () => {
    const html = render({ data: undefined, isError: true, error: { response: { status: 500, data: {} } } })
    expect(html).toContain('Try again')
    expect(html).not.toContain('page body')
  })

  it('keeps the page up when a background refresh fails', () => {
    const html = render({ isError: true, error: { response: { status: 500, data: {} } } })
    expect(html).toContain('page body')
  })
})

describe('AppointmentsShell — Atelier frame', () => {
  const g = globalThis as unknown as { window?: unknown }
  afterEach(() => { delete g.window })
  const withLook = (look: string | null) => {
    g.window = { localStorage: { getItem: () => look, setItem: () => {} }, matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }) }
  }

  it('starts in the light theme with the full side panel', () => {
    const html = render({})
    expect(html).toMatch(/data-appointments=""[^>]*data-theme="light"/)
    expect(html).toContain('data-rail-size="full"')
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(?:(?!<\/button>)[\s\S])*>Light<\/span><\/button>/)
  })

  it('draws the dark theme when chosen, and Auto from the device', () => {
    withLook('{"theme":"dark","rail":"full"}')
    expect(render({})).toContain('data-theme="dark"')
    withLook('{"theme":"auto","rail":"full"}')
    expect(render({})).toContain('data-theme="dark"') // the stub device prefers dark
  })

  it("takes the accent from the organisation's brand colour", () => {
    const html = render({ data: { ...boot, accent: '#c9a84c' } })
    expect(html).toContain('--a-accent:201 168 76')
  })

  describe('before the bootstrap arrives', () => {
    const withStorage = (items: Record<string, string>) => {
      g.window = { localStorage: { getItem: (k: string) => items[k] ?? null, setItem: () => {} }, matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) }
    }
    const loading = { data: undefined, isLoading: true }
    const mark = (html: string) => html.match(/<span[^>]*class="grid h-9 [^"]*"[^>]*>([^<]*)<\/span>/)?.[1]

    it('paints the last accent and mark this device saw instead of the fallback blue and an H', () => {
      withStorage({ 'appointments:brand': '{"accent":"#c9a84c","initial":"Ж"}' })
      const html = render(loading)
      expect(html).toContain('--a-accent:201 168 76')
      expect(html).not.toContain('--a-accent:59 130 246')
      expect(mark(html)).toBe('Ж')
      // The same on a failed first load, where the page body gives way to the notice.
      expect(render({ data: undefined, isError: true, error: { response: { status: 500, data: {} } } })).toContain('--a-accent:201 168 76')
    })

    it('falls back to the default blue and H when nothing (or something damaged) was saved', () => {
      const nothing: Record<string, string> = {}
      for (const stored of [nothing, { 'appointments:brand': 'garbage' }, { 'appointments:brand': '{"accent":"red","initial":"L"}' }]) {
        withStorage(stored)
        const html = render(loading)
        expect(html).toContain('--a-accent:59 130 246')
        expect(mark(html)).toBe('H')
      }
      delete g.window
      expect(mark(render(loading))).toBe('H')
    })

    it('gives way to the organisation as soon as it is known', () => {
      withStorage({ 'appointments:brand': '{"accent":"#c9a84c","initial":"Ж"}' })
      const html = render({ data: { ...boot, accent: '#4a9fd8' } })
      expect(html).toContain('--a-accent:74 159 216')
      expect(html).not.toContain('--a-accent:201 168 76')
      expect(mark(html)).toBe('L')
      // An organisation without a brand colour is the fallback blue, not the remembered gold.
      expect(render({ data: { ...boot, accent: null } })).toContain('--a-accent:59 130 246')
    })

    it('lets the remembered accent take the edge a pale brand needs', () => {
      withStorage({ 'appointments:brand': '{"accent":"#ffffff","initial":"L"}' })
      expect(render(loading)).toContain('data-accent-edge=""')
    })
  })

  it('outlines accent fills when the brand is almost the page colour', () => {
    expect(render({ data: { ...boot, accent: '#ffffff' } })).toContain('data-accent-edge=""')
    expect(render({ data: { ...boot, accent: '#c9a84c' } })).not.toContain('data-accent-edge')
  })

  it('keeps every name in the slim side panel and says the toggle is collapsed', () => {
    withLook('{"theme":"light","rail":"slim"}')
    const html = render({})
    expect(html).toContain('data-rail-size="slim"')
    expect(html).toMatch(/aria-expanded="false"[^>]*>[\s\S]*?Expand menu/)
    // This file's i18n mock prints the key where no fallback is given, which is how the industry noun for Clients arrives here.
    for (const label of ['Calendar', 'appointments.vocab.beauty.clients', 'Setup']) expect(html).toMatch(new RegExp(`class="sr-only"[^>]*>${label}<`))
  })

  it('keeps the language control in the side panel in both sizes, under the same name', () => {
    const aside = (html: string) => html.slice(html.indexOf('<aside'), html.indexOf('</aside>'))
    const full = aside(render({}))
    expect((full.match(/<select/g) ?? []).length).toBe(1)
    expect(full).toMatch(/<label[^>]*><span class="sr-only">Language<\/span><select/)
    expect(full).not.toContain('data-tip="Language"')

    withLook('{"theme":"light","rail":"slim"}')
    const slim = aside(render({}))
    expect((slim.match(/<select/g) ?? []).length).toBe(1)
    expect(slim).toMatch(/<label[^>]*><span class="sr-only">Language<\/span><select/)
    // A globe with the picker laid over it, transparent: it opens on click and on the keyboard, and the rail names it on hover.
    expect(slim).toMatch(/<div[^>]*data-tip="Language"[^>]*class="[^"]*relative[^"]*">(?:(?!<\/div>)[\s\S])*<svg[^>]*aria-hidden="true"(?:(?!<\/div>)[\s\S])*<select[^>]*class="[^"]*absolute[^"]*inset-0[^"]*opacity-0/)
    expect(slim).toContain('<option value="ru"')
    // Opacity does not reach the opened list: it is drawn from the select's own colours, so they match full mode's (light text on the ink panel colour), not the wrapper's grey.
    const slimSelectClass = slim.match(/<select[^>]*class="([^"]*)"/)?.[1] ?? ''
    expect(slimSelectClass.split(' ')).toEqual(expect.arrayContaining(['bg-a-side-2', 'text-a-side-text']))
  })

  it('draws the whole of an emoji as the organisation mark, and H when the name is empty', () => {
    const mark = (html: string) => html.match(/<span[^>]*class="grid h-9 [^"]*"[^>]*>([^<]*)<\/span>/)?.[1]
    expect(mark(render({ data: { ...boot, organization: { ...boot.organization, name: '🌸 Bloom' } } }))).toBe('🌸')
    expect(mark(render({ data: { ...boot, organization: { ...boot.organization, name: '' } } }))).toBe('H')
    expect(mark(render({}))).toBe('L')
  })

  it('does the same for the staff avatar, and draws nothing in it when there is no name', () => {
    const avatar = (html: string) => html.match(/<span[^>]*class="grid h-8 w-8 [^"]*"[^>]*>([^<]*)<\/span>/)?.[1]
    expect(avatar(render({ data: { ...boot, staff: { ...boot.staff, name: '🌸 Mia' } } }))).toBe('🌸')
    expect(avatar(render({ data: { ...boot, staff: { ...boot.staff, name: '' } } }))).toBe('')
    expect(avatar(render({}))).toBe('V')
  })
})

describe('AppointmentsShell on the Appointments plan', () => {
  const planUser = { user_type: 'staff', workspaces: { appointments: { landing: true, has_services: true, only: true } } }
  afterEach(() => { auth.user = null })

  it('has no way into the full admin', () => {
    auth.user = planUser
    const html = render({})
    expect(html).not.toContain('Full admin')
    expect(html).not.toContain('href="/service-bookings/calendar"')
    expect(html).toContain('page body')
  })

  it('says HexaTech puts a lapsed subscription right, with no button to the full admin', () => {
    auth.user = planUser
    const html = render({ data: undefined, isError: true, error: refused('subscription_required') })
    expect(html).toContain('Contact HexaTech to restore it.')
    expect(html).not.toContain('Billing')
    expect(html).not.toContain('Open the full admin')
    expect(html).not.toContain('href="/"')
  })

  it('leaves a full customer as it was', () => {
    auth.user = { user_type: 'staff', workspaces: { appointments: { landing: false, has_services: true, only: false } } }
    expect(render({})).toContain('Full admin')
  })
})
