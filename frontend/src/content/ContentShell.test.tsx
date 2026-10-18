import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentContext, type ContentContextValue } from './ContentProvider'
import { ContentShell } from './ContentShell'
import { PanelProvider } from './panel/PanelProvider'
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
  brand: { id: 3, name: 'Lumière Salon' },
  brands: [{ id: 3, name: 'Lumière Salon' }],
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

function render(value: Partial<ContentContextValue> = {}, data: Partial<Bootstrap> = {}) {
  const full: ContentContextValue = { data: { ...boot, ...data }, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {}, ...value }
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/content']}>
      <Routes>
        <Route path="/" element={<p>full admin dashboard</p>} />
        <Route path="/content/*" element={
          <ContentContext.Provider value={full}>
            <PanelProvider><ContentShell><p>page body</p></ContentShell></PanelProvider>
          </ContentContext.Provider>
        } />
      </Routes>
    </MemoryRouter>
    </QueryClientProvider>,
  )
}
const refused = (code: string) => ({ response: { status: 403, data: { error: code } } })

describe('ContentShell: the bell (spec 2026-10-16 §8)', () => {
  it('puts the "For you" bell beside New post once the workspace is ready, and not while it loads', () => {
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
    expect(html).toContain('New post')
  })

  it('offers the brand switcher only to someone with more than one brand, and keeps it out of the desktop-only block', () => {
    expect(render()).not.toContain('data-brand-switcher')
    const html = render({}, { brands: [{ id: 3, name: 'Lumière Salon' }, { id: 7, name: 'Second Studio' }] })
    const label = html.match(/<label[^>]*data-brand-switcher[^>]*>/)?.[0] ?? ''
    expect(label).not.toBe('')
    expect(label).not.toContain('hidden')
    expect(html).toContain('Second Studio')
  })

  // Found by eyes on a phone: a long brand name's switcher kept its own width (up to 12rem) and slid under Find and New post.
  it('asks for the phone menu that fits what it holds (the theme switch is longer in Russian)', () => {
    expect(render()).toMatch(/<summary[\s\S]*?<\/summary><div class="[^"]*\bw-max\b/)
  })

  // Found by eyes at 390 px, then by the final review at 375 and 360 px: with the bell, the header's pieces outgrew a
  // phone, pushed the menu off the screen and squeezed the brand switcher to nothing. On a phone Find and the switcher
  // have their own row above the page, and the bell and New post are 32 px; from 640 px on nothing changes.
  it('on a phone gives Find and the brand switcher their own row above the page, so the header fits with the bell', () => {
    const html = render({}, { brands: [{ id: 3, name: 'Lumière Salon' }, { id: 7, name: 'Second Studio' }] })
    expect(html).toContain('<div class="hidden min-w-0 flex-1 sm:block sm:flex-initial">')
    expect(html).toMatch(/aria-label="Find a post or action" aria-keyshortcuts="[^"]*" aria-haspopup="dialog" class="hidden\b[^"]*\bsm:flex\b/)
    expect(html).toMatch(/data-phone-row="" class="[^"]*\bsm:hidden\b[^"]*">(?:(?!<\/div>).)*data-find-phone=""(?:(?!<\/div>).)*data-brand-switcher-phone=""/s)
    expect(html).toContain('<div class="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">')
    expect(html).toMatch(/aria-label="New post" class="[^"]*\bp-2\b[^"]*\bsm:px-4\b/)
    expect(html).toMatch(/data-bell=""[^>]*class="[^"]*\bh-8 w-8 sm:h-9 sm:w-9\b/)
    // One brand: the row still holds Find, and no switcher.
    expect(render()).toContain('data-find-phone=""')
    expect(render()).not.toContain('data-brand-switcher-phone')
  })

  it('lets the brand switcher shrink with the header, so a long name never slides under the buttons', () => {
    const html = render({}, { brands: [{ id: 3, name: 'Lumière Salon' }, { id: 7, name: 'Release check: a brand whose name is far too long for a phone header' }] })
    expect(html).toMatch(/<div class="[^"]*\bmin-w-0\b[^"]*\bflex-1\b[^"]*">/)
    expect(html).toMatch(/data-brand-switcher=""[^>]*>(?:(?!<\/label>).)*<select[^>]*class="[^"]*\bw-full\b/s)
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
