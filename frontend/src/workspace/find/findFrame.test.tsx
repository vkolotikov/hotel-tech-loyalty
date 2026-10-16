import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FileText, Plus } from 'lucide-react'
import { FindFrame } from './FindFrame'
import type { FindItem } from './findCore'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const items: FindItem[] = [
  { id: 'new', kind: 'action', label: 'New post', go: { to: '/content?new=1' } },
  { id: 'post-7', kind: 'post', label: 'Autumn menu', sub: 'Instagram · Thu 16 Oct', go: { to: '/content/posts/7' } },
]
const iconOf = (item: FindItem) => (item.kind === 'post' ? FileText : Plus)
const draw = (query = '', waiting: string | null = null, groups = [{ title: 'Posts', items }]) => renderToStaticMarkup(
  <FindFrame prompt="Find a post or action" query={query} onQuery={() => {}} groups={groups} iconOf={iconOf}
    onPick={() => {}} onShortcuts={() => {}} onClose={() => {}} waiting={waiting} />,
)
const tag = (html: string, pattern: RegExp): string => html.match(pattern)?.[0] ?? ''

describe('FindFrame', () => {
  it('is a modal named Find, over a scrim that closes it, with one combobox named by the workspace\'s prompt', () => {
    const html = draw()
    const dialog = tag(html, /<div[^>]*role="dialog"[^>]*>/)
    expect(dialog).toContain('aria-modal="true"')
    expect(dialog).toContain('aria-label="Find"')
    expect(tag(html, /<button[^>]*aria-label="Close"[^>]*>/)).toContain('bg-a-scrim/40')
    const input = tag(html, /<input[^>]*>/)
    expect(input).toContain('role="combobox"')
    expect(input).toContain('aria-label="Find a post or action"')
    expect(input).toContain('aria-controls="find-list"')
    expect((html.match(/<input/g) ?? []).length).toBe(1)
  })

  it('lists the workspace\'s groups with its own icons, the first option active', () => {
    const html = draw()
    expect(html).toContain('aria-label="Posts"')
    expect(tag(html, /<li[^>]*id="find-opt-new"[^>]*>/)).toContain('aria-selected="true"')
    expect(tag(html, /<li[^>]*id="find-opt-post-7"[^>]*>/)).toContain('aria-selected="false"')
    expect(html).toContain('lucide-plus')
    expect(html).toContain('lucide-file-text')
    expect(html).toContain('Instagram · Thu 16 Oct')
  })

  it('says how many results there are, and that nothing matches a query that found none', () => {
    expect(draw()).toContain('Results: 2')
    const none = draw('zzz', null, [])
    expect(none).toContain('Nothing matches “zzz”.')
  })

  it('shows the workspace\'s waiting line only while it is looking', () => {
    expect(draw('au', 'Looking for posts…')).toContain('Looking for posts…')
    expect(draw('au', null)).not.toContain('Looking for posts…')
  })

  // Owner, 2026-10-15: "Nothing matches" while the search is still on its way told people a post was missing.
  it('says nothing matches only once nothing is still on its way', () => {
    const looking = draw('zzz', 'Looking for posts…', [])
    expect(looking).not.toContain('Nothing matches')
    expect(looking).toContain('Looking for posts…')
    expect(draw('zzz', null, [])).toContain('Nothing matches “zzz”.')
  })

  it('names the keys in its footer, the list of shortcuts last', () => {
    const footer = draw().slice(draw().lastIndexOf('<div class="hidden items-center'))
    for (const word of ['move', 'open', 'close']) expect(footer).toContain(word)
    expect(footer).toMatch(/<kbd[^>]*>\?<\/kbd>This list<\/span>/)
    expect(footer.indexOf('>Esc<')).toBeLessThan(footer.indexOf('>?<'))
  })
})
