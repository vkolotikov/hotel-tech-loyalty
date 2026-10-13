import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShortcutsSheet } from './ShortcutsSheet'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'en' },
  }),
}))

const draw = (open: boolean, modKey = 'Ctrl') => renderToStaticMarkup(<ShortcutsSheet open={open} onClose={() => {}} modKey={modKey} />)
const tag = (html: string, pattern: RegExp): string => html.match(pattern)?.[0] ?? ''

/** The keys beside a row's name, in order, each as drawn in its kbd. */
function keysOf(html: string, name: string): string[] | null {
  const row = html.match(new RegExp(`<dt[^>]*>${name}</dt><dd[^>]*>((?:(?!</dd>)[\\s\\S])*)</dd>`))?.[1]
  return row === undefined ? null : [...row.matchAll(/<kbd[^>]*>([^<]*)<\/kbd>/g)].map(m => m[1])
}

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
    expect(dialog).toContain('rounded-2xl')
    expect(dialog).toContain('shadow-a-lg')
    const scrim = tag(html, /<button[^>]*aria-label="Close"[^>]*>/)
    expect(scrim).toContain('type="button"')
    expect(scrim).toContain('bg-a-scrim/40')
    expect(scrim).toContain('tabindex="-1"')
  })

  it('lists every shortcut, each key in a kbd', () => {
    const html = draw(true)
    expect(keysOf(html, 'Find')).toEqual(['Ctrl K', '/'])
    expect(keysOf(html, 'New appointment')).toEqual(['N'])
    expect(keysOf(html, 'Today')).toEqual(['T'])
    expect(keysOf(html, 'Previous or next day \\(week in the week view\\)')).toEqual(['←', '→'])
    expect(keysOf(html, 'Day, week, list')).toEqual(['D', 'W', 'L'])
    expect(keysOf(html, 'Close the panel')).toEqual(['Esc'])
    expect(keysOf(html, 'Move a selected appointment')).toEqual(['↑', '↓', '←', '→'])
    expect(keysOf(html, 'This list')).toEqual(['?'])
    expect((html.match(/<kbd/g) ?? []).length).toBe(15)
  })

  // The sheet opens on every page; the day, view and card keys work only on the calendar.
  it('lists the keys for every page first, then the calendar\'s own under an "On the calendar" heading', () => {
    const html = draw(true)
    const names = (part: string) => [...part.matchAll(/<dt[^>]*>([^<]*)<\/dt>/g)].map(m => m[1])
    const lists = [...html.matchAll(/<dl[^>]*>([\s\S]*?)<\/dl>/g)].map(m => m[1])
    expect(lists).toHaveLength(2)
    expect(names(lists[0])).toEqual(['Find', 'New appointment', 'This list'])
    expect(names(lists[1])).toEqual(['Today', 'Previous or next day (week in the week view)', 'Day, week, list', 'Close the panel', 'Move a selected appointment'])
    // The heading sits between the two lists, below the sheet's title, in the strip's eyebrow look.
    const heading = html.match(/<h3 class="([^"]*)">On the calendar<\/h3>/)
    expect(heading).not.toBeNull()
    expect(heading?.[1]).toContain('font-a-mono')
    expect(heading?.[1]).toContain('uppercase')
    expect(html.indexOf('</dl>')).toBeLessThan(html.indexOf('On the calendar'))
    expect(html.indexOf('On the calendar')).toBeLessThan(html.lastIndexOf('<dl'))
  })

  it('says "or" between the two ways to Find, and names the key of the device', () => {
    const html = draw(true, '⌘')
    expect(keysOf(html, 'Find')).toEqual(['⌘ K', '/'])
    expect(html).toMatch(/<kbd[^>]*>⌘ K<\/kbd>\s*<span[^>]*>or<\/span>\s*<kbd[^>]*>\/<\/kbd>/)
  })

  it('draws its keys the way the rest of the workspace does, and has a Close button', () => {
    const html = draw(true)
    for (const k of html.match(/<kbd[^>]*>/g) ?? []) {
      expect(k).toContain('rounded-md')
      expect(k).toContain('border-a-border')
      expect(k).toContain('font-a-mono')
      expect(k).toContain('text-xs')
    }
    const close = html.match(/<button[^>]*type="button"[^>]*>(?:(?!<\/button>)[\s\S])*Close<\/button>/g) ?? []
    expect(close).toHaveLength(1)
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
