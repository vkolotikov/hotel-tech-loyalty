import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from './Button'
import { Sheet } from './Sheet'
import { Tabs } from './Tabs'
import { Toggle } from './Toggle'
import { Chip } from './Chip'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k, i18n: { language: 'en' } }),
}))

/**
 * Render-to-string, no DOM (vitest.config.ts is environment: 'node').
 * These pin the contracts a screen reader and a thumb depend on, not the
 * pixels: roles, labels, disabled states, the 44px target.
 */
describe('portal primitives', () => {
  it('a loading button is disabled and announces busy', () => {
    const html = renderToStaticMarkup(<Button variant="primary" loading>Save</Button>)
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('min-h-11')
  })

  // Task 21 browser pass: `size="sm"` ("Change", "Remove", "Try again", "Add to calendar") measured 36px tall
  // on a phone. It stays compact under a mouse, but on a touch screen it gets the full 44px target.
  it('a small button keeps its compact size under a mouse and a 44px target on touch screens', () => {
    const html = renderToStaticMarkup(<Button size="sm">Change</Button>)
    expect(html).toContain('min-h-9')
    expect(html).toContain('p-tap')
    const css = readFileSync(new URL('../theme/portal.css', import.meta.url), 'utf8').replace(/\s+/g, ' ')
    expect(css).toContain('@media (pointer: coarse) { [data-portal] .p-tap { min-height: 44px; } }')
  })

  it('a closed sheet renders nothing; an open one is a labelled dialog', () => {
    expect(renderToStaticMarkup(<Sheet open={false} onClose={() => {}} title="T">x</Sheet>)).toBe('')
    const html = renderToStaticMarkup(<Sheet open onClose={() => {}} title="Redeem">body</Sheet>)
    // The scrim dims in both modes (--p-scrim, see contrast.test.ts) — never the text colour, which is light in dark mode.
    expect(html).toContain('bg-p-scrim/')
    expect(html).not.toContain('bg-p-text/')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby="p-sheet-title"')
    expect(html).toContain('Redeem')
  })

  it('a sheet overlay cancels the margin a space-y parent gives it', () => {
    // Pages render their sheets inside `space-y-*`; its margin-top outranks
    // a plain class and would push the fixed overlay down the screen.
    const html = renderToStaticMarkup(<Sheet open onClose={() => {}} title="Redeem">body</Sheet>)
    const overlay = /^<div class="([^"]*)"/.exec(html)?.[1] ?? ''
    expect(overlay.split(' ')).toEqual(expect.arrayContaining(['fixed', 'inset-0', '!m-0']))
  })

  it('tabs expose the selected one', () => {
    const html = renderToStaticMarkup(
      <Tabs value="b" onChange={() => {}} items={[{ key: 'a', label: 'A' }, { key: 'b', label: 'B', badge: 3 }]} />,
    )
    expect(html).toContain('role="tablist"')
    expect(html).toMatch(/aria-selected="true"[^>]*>[^<]*B/)
    expect(html).toContain('>3<')
  })

  it('a toggle is a switch with its label', () => {
    const html = renderToStaticMarkup(<Toggle label="Push" checked onChange={() => {}} />)
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('aria-label="Push"')
  })

  it('a toggle is a 44px target whose thumb is anchored to the start of its track', () => {
    const classesOf = (html: string, pattern: RegExp) => (pattern.exec(html)?.[1] ?? '').split(' ')
    for (const checked of [false, true]) {
      const html = renderToStaticMarkup(<Toggle label="Push" checked={checked} onChange={() => {}} />)
      expect(classesOf(html, /role="switch"[^>]*class="([^"]*)"/)).toEqual(expect.arrayContaining(['h-11', 'w-11']))
      const thumb = classesOf(html, /class="([^"]*rounded-full bg-p-surface[^"]*)"/)
      expect(thumb).toEqual(expect.arrayContaining(['absolute', 'left-0', checked ? 'translate-x-5' : 'translate-x-0.5']))
    }
  })

  it('chips only use portal tones', () => {
    const html = renderToStaticMarkup(<Chip tone="success">Paid</Chip>)
    expect(html).toContain('p-success')
    expect(html).not.toMatch(/text-white|dark-/)
  })
})
