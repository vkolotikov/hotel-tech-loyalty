import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShortcutsSheet, type ShortcutSection } from './ShortcutsSheet'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'en' },
  }),
}))

const sections: ShortcutSection[] = [
  { rows: [{ name: 'Find', keys: [['Ctrl K'], ['/']] }, { name: 'This list', keys: [['?']] }] },
  { title: 'On the plan', rows: [{ name: 'Previous or next week', keys: [['←', '→']] }, { name: 'Week, month, list', keys: [['W', 'M', 'L']] }] },
]
const draw = (open: boolean) => renderToStaticMarkup(<ShortcutsSheet open={open} onClose={() => {}} sections={sections} />)
const tag = (html: string, pattern: RegExp): string => html.match(pattern)?.[0] ?? ''

describe('ShortcutsSheet', () => {
  it('draws nothing while closed', () => {
    expect(draw(false)).toBe('')
  })

  it('is a modal dialog named Keyboard shortcuts, over a scrim that closes it', () => {
    const html = draw(true)
    const dialog = tag(html, /<div[^>]*role="dialog"[^>]*>/)
    expect(dialog).toContain('aria-modal="true"')
    expect(dialog).toContain('aria-label="Keyboard shortcuts"')
    expect(dialog).toContain('animate-a-pop')
    const scrim = tag(html, /<button[^>]*aria-label="Close"[^>]*>/)
    expect(scrim).toContain('bg-a-scrim/40')
    expect(scrim).toContain('tabindex="-1"')
  })

  it('draws each section: the first without a heading, a later one under its own eyebrow heading', () => {
    const html = draw(true)
    const lists = [...html.matchAll(/<dl class="([^"]*)">([\s\S]*?)<\/dl>/g)]
    expect(lists).toHaveLength(2)
    expect(lists[0][1]).toBe('mt-2 divide-y divide-a-border')
    expect(lists[1][1]).toBe('mt-1 divide-y divide-a-border')
    const heading = html.match(/<h3 class="([^"]*)">On the plan<\/h3>/)
    expect(heading?.[1]).toContain('font-a-mono')
    expect(html.indexOf('</dl>')).toBeLessThan(html.indexOf('On the plan'))
  })

  it('joins the ways to press one shortcut with "or", each key in its own kbd', () => {
    const html = draw(true)
    expect(html).toMatch(/<kbd[^>]*>Ctrl K<\/kbd>\s*<span[^>]*>or<\/span>\s*<kbd[^>]*>\/<\/kbd>/)
    expect(html).toMatch(/<kbd[^>]*>W<\/kbd><kbd[^>]*>M<\/kbd><kbd[^>]*>L<\/kbd>/)
    expect((html.match(/<kbd/g) ?? []).length).toBe(8)
  })

  it('has one Close button and no input', () => {
    const html = draw(true)
    expect(html.match(/<button[^>]*type="button"[^>]*>(?:(?!<\/button>)[\s\S])*Close<\/button>/g) ?? []).toHaveLength(1)
    expect(html).not.toContain('<input')
  })

  // Effects do not run in a static render: the wiring is read from the source.
  it('remembers where the focus was once, so React\'s development re-run cannot replace it with its own Close button', () => {
    const source = readFileSync(new URL('./ShortcutsSheet.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/useRef<HTMLElement \| null \| undefined>\(undefined\)/)
    expect(source).toMatch(/firstFocus\(\w+, document\.activeElement instanceof HTMLElement \? document\.activeElement : null\)/)
    expect(source).not.toMatch(/const before = document\.activeElement/)
  })
})
