import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { ComponentProps } from 'react'
import { CalendarDays, FileText } from 'lucide-react'
import { WorkspaceShell, type WorkspaceNavItem } from './WorkspaceShell'
import { accentTokens } from './theme/accent'
import type { LiveLook } from './lib/look'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))
vi.mock('../lib/logout', () => ({ logoutAndRedirect: vi.fn() }))
vi.mock('../i18n', () => ({ SUPPORTED_LANGUAGES: [{ code: 'en', label: 'English' }, { code: 'ru', label: 'Русский' }] }))

const nav: WorkspaceNavItem[] = [
  { to: '/content', end: true, icon: CalendarDays, label: 'Plan' },
  { to: '/content/posts', end: false, icon: FileText, label: 'Posts' },
]
const look = (rail: 'full' | 'slim' = 'full'): LiveLook => ({ theme: 'light', rail, resolved: 'light', setTheme: () => {}, setRail: () => {} })

type Extra = Partial<Pick<ComponentProps<typeof WorkspaceShell>, 'variant' | 'railLabel' | 'footer' | 'phoneMenu' | 'crumbs'>>
function render({ rail = 'full', fullAdmin = '/marketing', ...extra }: { rail?: 'full' | 'slim'; fullAdmin?: string | null } & Extra = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/content']}>
      <WorkspaceShell workspace="content" look={look(rail)} accent={accentTokens('#c9a84c', 'light')} initial="L"
        organization="Lumière Salon" product="HexaTech Content" person="Vitalij K" nav={nav} fullAdmin={fullAdmin}
        header={<p data-header-own="">the workspace header</p>} overlays={<p>an overlay</p>} {...extra}>
        <main>page body</main>
      </WorkspaceShell>
    </MemoryRouter>,
  )
}

describe('WorkspaceShell', () => {
  // Release 7a (spec 2026-10-21 §4): options only Content passes; without them the frame is today's (Appointments).
  it('draws the frame as it is today when no option is given (Appointments)', () => {
    const html = render()
    expect(html).not.toContain('data-rail-variant="cards"')
    expect(html).toMatch(/data-rail=""[^>]*class="[^"]*w-64/)
    expect(html).toContain('Collapse menu')
  })

  it('draws the side buttons as cards with the label above them when asked', () => {
    const html = render({ variant: 'cards', railLabel: 'Workspace' })
    expect(html).toContain('data-rail-variant="cards"')
    expect(html).toMatch(/data-rail=""[^>]*class="[^"]*w-60/)
    expect(html).toMatch(/<p[^>]*>Workspace<\/p>/)
    expect(html).toMatch(/aria-current="page"[^>]*class="[^"]*from-a-accent[^"]*text-a-accent-ink/)
  })

  it('puts a workspace footer, phone menu and breadcrumb in place of the usual ones', () => {
    const html = render({ footer: <div data-own-footer="" />, phoneMenu: <div data-own-phone="" />, crumbs: <nav data-crumbs="" /> })
    expect(html).toContain('data-own-footer=""')
    expect(html).toContain('data-own-phone=""')
    expect(html.indexOf('data-crumbs=""')).toBeLessThan(html.indexOf('data-header-own'))
    expect(html).not.toContain('Collapse menu')
  })

  it('is the token scope for the shared core and for the workspace by its name', () => {
    const html = render()
    const root = html.match(/^<div[^>]*>/)?.[0] ?? ''
    expect(root).toContain('data-workspace=""')
    expect(root).toContain('data-content=""')
    expect(root).not.toContain('data-appointments')
    expect(root).toContain('data-theme="light"')
    expect(root).toContain('--a-accent:201 168 76')
  })

  it('draws the workspace\'s areas, its header, its page and its overlays', () => {
    const html = render()
    expect(html).toContain('href="/content"')
    expect(html).toContain('href="/content/posts"')
    expect(html).toContain('the workspace header')
    expect(html).toContain('page body')
    expect(html).toContain('an overlay')
  })

  it('names the organisation, the product and the person, with their marks', () => {
    const html = render()
    expect(html).toContain('Lumière Salon')
    expect(html).toContain('HexaTech Content')
    expect(html).toContain('Vitalij K')
    expect(html).toMatch(/text-a-accent-ink">L</)
    expect(html).toMatch(/>V<\/span>/)
  })

  it('keeps a way back to the full admin, in the side panel and in the phone menu, only where there is one', () => {
    expect((render().match(/href="\/marketing"/g) ?? []).length).toBe(2)
    expect(render({ fullAdmin: null })).not.toContain('Full admin')
  })

  it('keeps every name in the slim side panel, for a screen reader and as a label beside the icon', () => {
    const html = render({ rail: 'slim' })
    expect(html).toContain('data-rail-size="slim"')
    expect(html).toContain('data-tip="Plan"')
    expect(html).toContain('data-tip="Expand menu"')
    expect(html).toContain('aria-expanded="false"')
  })

  // Effects do not run in a static render: the wiring is read from the source.
  it('marks <html> with the workspace\'s name before the first paint', () => {
    const source = readFileSync(new URL('./WorkspaceShell.tsx', import.meta.url), 'utf8')
    expect(source).toContain('useLayoutEffect(() => markShell(document.documentElement, workspace), [workspace])')
  })

  // Owner, 2026-10-15: both workspaces size the phone menu to what it holds ("Авто" ran past the fixed 14rem in Russian).
  it('sizes the phone menu to what it holds, at least 14rem and never past the screen', () => {
    const menu = render().match(/<summary[\s\S]*?<\/summary><div class="([^"]*)"/)?.[1] ?? ''
    expect(menu).toContain('w-max')
    expect(menu).toContain('min-w-56')
    expect(menu).toContain('max-w-[calc(100vw-2rem)]')
    expect(menu.split(' ')).not.toContain('w-56')
  })
})
