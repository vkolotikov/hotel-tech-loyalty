import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentContext, type ContentContextValue } from './ContentProvider'
import { ContentShell } from './ContentShell'
import { PanelProvider, type PanelTarget } from './panel/PanelProvider'
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
vi.mock('../lib/api', () => ({ api: {} }))

const boot: Bootstrap = {
  name: 'HexaTech Content',
  organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: { id: 3, name: 'Lumière Salon', logo_url: null },
  brands: [{ id: 3, name: 'Lumière Salon', logo_url: null }],
  accent: '#7c5cff',
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' },
  staff: { name: 'Vitalij K', role: 'manager', can_manage: true },
  profile: { id: 1, setup_completed: true, readiness: 80 },
  ai: { status: 'under', percent: 20 },
  platforms: ['instagram', 'linkedin'],
  statuses: ['draft', 'published'],
  rewrites: ['shorter'],
}
const staff = { name: 'Sam', role: 'staff', can_manage: false }

function render(value: Partial<ContentContextValue> = {}, data: Partial<Bootstrap> = {}, target?: PanelTarget) {
  const full: ContentContextValue = { data: { ...boot, ...data }, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {}, ...value }
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/content']}>
      <Routes>
        <Route path="/" element={<p>full admin dashboard</p>} />
        <Route path="/content/*" element={
          <ContentContext.Provider value={full}>
            <PanelProvider initial={target}><ContentShell><p>page body</p></ContentShell></PanelProvider>
          </ContentContext.Provider>
        } />
      </Routes>
    </MemoryRouter>
    </QueryClientProvider>,
  )
}
const refused = (code: string) => ({ response: { status: 403, data: { error: code } } })

describe('ContentShell: the bell (spec 2026-10-16 §8)', () => {
  it('puts the "For you" bell in the top bar once the workspace is ready, and not while it loads', () => {
    expect(render()).toContain('data-bell=""')
    expect(render({ data: undefined, isLoading: true })).not.toContain('data-bell=""')
  })
})

describe('ContentShell', () => {
  it('is the token scope, names the product and the organisation, and draws the page', () => {
    const html = render()
    expect(html).toContain('data-workspace=""')
    expect(html).toContain('data-content=""')
    expect(html).toContain('HexaTech Content')
    expect(html).toContain('Lumière Salon')
    expect(html).toContain('page body')
  })

  // Release 7a (spec 2026-10-21 §4.2): the brand chip and name with its menu, and the page, at the top bar's start.
  it('names the brand and the page at the start of the top bar, with the brand menu only for more than one brand', () => {
    const one = render()
    expect(one).toMatch(/aria-label="Breadcrumb"[\s\S]*?Lumière Salon[\s\S]*?aria-current="page"[^>]*>Plan</)
    expect(one).not.toMatch(/aria-label="Breadcrumb"(?:(?!<\/nav>).)*aria-haspopup/s)
    const two = render({}, { brands: [{ id: 3, name: 'Lumière Salon', logo_url: null }, { id: 7, name: 'Second Studio', logo_url: null }] })
    expect(two).toMatch(/aria-label="Breadcrumb"(?:(?!<\/nav>).)*aria-haspopup="menu"/s)
    expect(two).not.toContain('data-brand-switcher')
  })

  // Release 7a (spec 2026-10-21 §4.1): the owner's side panel — cards under "Workspace", and its own foot.
  it('draws the areas as cards under Workspace, with Settings, Help & resources and the person at the foot', () => {
    const html = render()
    expect(html).toContain('data-rail-variant="cards"')
    expect(html).toMatch(/<p[^>]*>Workspace<\/p>/)
    expect(html).toContain('data-frame-footer=""')
    expect(html).toMatch(/Settings[\s\S]*Help &amp; resources[\s\S]*Vitalij K[\s\S]*Manager/)
    expect(html).toContain('data-phone-menu=""')
  })

  it('asks for the phone menu that fits what it holds (the theme switch is longer in Russian)', () => {
    expect(render()).toMatch(/<summary[\s\S]*?<\/summary><div class="[^"]*\bw-max\b/)
  })

  // Found by eyes at 390 px, then by the final review at 375 and 360 px: with the bell, the header's pieces outgrew a
  // phone, pushed the menu off the screen and squeezed the brand switcher to nothing. On a phone Find and the switcher
  // have their own row above the page, and the bell and New post are 32 px; from 640 px on nothing changes.
  it('keeps Find and the bell in the top bar, Find on its own row on a phone, and New post in the page header', () => {
    const html = render({}, { brands: [{ id: 3, name: 'Lumière Salon', logo_url: null }, { id: 7, name: 'Second Studio', logo_url: null }] })
    expect(html).toMatch(/aria-label="Find a post or action" aria-keyshortcuts="[^"]*" aria-haspopup="dialog" class="hidden\b[^"]*\bsm:flex\b/)
    expect(html).toMatch(/data-phone-row="" class="[^"]*\bsm:hidden\b[^"]*">(?:(?!<\/div>).)*data-find-phone=""/s)
    expect(html).not.toContain('data-brand-switcher-phone')
    expect(html).toMatch(/data-bell=""[^>]*class="[^"]*\bh-8 w-8 sm:h-9 sm:w-9\b/)
    expect(html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '').not.toContain('New post')
  })

  it('cuts a long brand name in the breadcrumb, so it never slides under Find or the bell', () => {
    const html = render({}, { brand: { id: 3, name: 'Release check: a brand whose name is far too long for a phone header', logo_url: null } })
    expect(html).toMatch(/aria-label="Breadcrumb" class="[^"]*min-w-0/)
    expect(html).toMatch(/class="[^"]*min-w-0[^"]*truncate[^"]*"[^>]*>Release check: a brand/)
  })

  // Found by the release check's browser pass at 390 px: the brand menu's own box kept the whole name's width, so the
  // name never shortened, and on a phone the breadcrumb beside the six area buttons pushed the bar to 572 px (the panel
  // "filling the screen" then measured 572 px too). The brand menu's box may shrink; on a phone the breadcrumb is on the
  // row above the page with Find, and Find keeps room in the top bar from 640 px.
  it('lets the brand menu shrink, puts the breadcrumb on the phone row, and keeps Find usable beside a long name', () => {
    const two = { brands: [{ id: 3, name: 'Lumière Salon', logo_url: null }, { id: 7, name: 'Second Studio', logo_url: null }] }
    const html = render({}, two)
    // A button is as wide as its words unless held: the menu's button keeps to its box, so the name is cut there.
    expect(html).toMatch(/aria-label="Breadcrumb"[^>]*><div class="relative min-w-0"><button[^>]*class="[^"]*\bmax-w-full\b/)
    const bar = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? ''
    expect(bar).toMatch(/<div class="hidden min-w-0 sm:flex">\s*<nav aria-label="Breadcrumb"/)
    expect(html).toMatch(/data-phone-crumb="" class="[^"]*\bsm:hidden\b[^"]*">\s*<nav aria-label="Breadcrumb"/)
    expect(html.indexOf('data-phone-crumb')).toBeLessThan(html.indexOf('data-phone-row'))
    expect(bar).toMatch(/aria-label="Find a post or action"[^>]*class="[^"]*\bsm:min-w-\[10rem\]/)
  })

  // Release 7a (spec 2026-10-21 §7.1, Review Focus 3–4): from 1280 px the page makes room for the open panel, and gets it back.
  it('makes room for the open panel beside the page from 1280 px, and none while it is closed', () => {
    const open = render({}, {}, { kind: 'post', id: 5, seq: 1 })
    expect(open).toMatch(/<main[^>]*class="[^"]*min-w-0[^"]*xl:pr-\[400px\]/)
    expect(render()).not.toContain('xl:pr-[400px]')
  })

  // Final review: the notices above the page kept their full width, their right side under the docked panel.
  it('keeps the notices above the page clear of the docked panel too', () => {
    const open = render({}, { ai: { status: 'warn', percent: 85 } }, { kind: 'post', id: 5, seq: 1 })
    expect(open).toMatch(/<div class="[^"]*\bxl:pr-\[400px\][^"]*">(?:(?!<\/div>).)*AI budget is 85 % used/s)
  })

  it('warns at 80 % of the AI budget and says when it is used up', () => {
    // (Static markup writes an apostrophe as &#x27;: the expected words start after "month's".)
    expect(render({}, { ai: { status: 'warn', percent: 85 } })).toContain('AI budget is 85 % used.')
    expect(render({}, { ai: { status: 'over', percent: 100 } })).toContain('AI budget is used up.')
    expect(render()).not.toContain('AI budget')
  })

  it('says a brand is not set up yet, in the manager\'s words or the staff member\'s', () => {
    expect(render({}, { profile: null })).toContain('This brand is not set up yet')
    expect(render({}, { profile: { id: 1, setup_completed: false, readiness: 10 }, staff })).toContain('Your manager has not set up this brand yet.')
  })

  it('stops calmly when Content is switched off, and says it is loading while it loads', () => {
    const html = render({ isError: true, error: refused('workspace_disabled') })
    expect(html).toContain('switched off')
    expect(html).toContain('Open the full admin')
    expect(html).not.toContain('page body')
    expect(render({ data: undefined, isLoading: true })).toContain('role="status"')
  })

  // Spec §8.2: an organisation with Content switched off is told so calmly, not sent to the dashboard without a word.
  it('says calmly that Content is switched off when the first visit is refused, with the way back', () => {
    const html = render({ data: undefined, isLoading: false, isError: true, error: refused('workspace_disabled') })
    expect(html).toContain('HexaTech Content has been switched off for your organisation.')
    expect(html).toContain('Open the full admin')
    expect(html).not.toContain('full admin dashboard')
  })

  it('opens the full admin at the Marketing hub for managers and at the dashboard for staff', () => {
    expect(render()).toContain('href="/marketing"')
    expect(render({}, { staff })).not.toContain('href="/marketing"')
  })

  // Lighthouse (label in name): the visible shortcut hint is not part of the button's name; the shortcut is declared instead.
  it('names the Find button by its words alone, and declares its shortcut', () => {
    const html = render()
    expect(html).toMatch(/<button[^>]*aria-label="Find a post or action"[^>]*aria-keyshortcuts="Control\+K"/)
    expect(html).toMatch(/<kbd aria-hidden="true"/)
  })
})
