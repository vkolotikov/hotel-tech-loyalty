import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
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

function render({ rail = 'full', fullAdmin = '/marketing' }: { rail?: 'full' | 'slim'; fullAdmin?: string | null } = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/content']}>
      <WorkspaceShell workspace="content" look={look(rail)} accent={accentTokens('#c9a84c', 'light')} initial="L"
        organization="Lumière Salon" product="HexaTech Content" person="Vitalij K" nav={nav} fullAdmin={fullAdmin}
        header={<p>the workspace header</p>} overlays={<p>an overlay</p>}>
        <main>page body</main>
      </WorkspaceShell>
    </MemoryRouter>,
  )
}

describe('WorkspaceShell', () => {
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
})
