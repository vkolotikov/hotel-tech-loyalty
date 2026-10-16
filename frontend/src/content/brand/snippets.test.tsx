import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

import type { Snippet } from '../lib/types'
import { brandWith, renderBrand } from './brandTesting'
import { SnippetsSection } from './sections/Snippets'

const snippets: Snippet[] = [
  { id: 1, kind: 'hashtags', name: 'Autumn colour', body: '#autumnhair #copperhair' },
  { id: 2, kind: 'text', name: 'Sign-off', body: 'See you at the studio!' },
]
const addButton = (html: string, words: string) => html.match(new RegExp(`<button(?:(?!</button>).)*${words}</button>`))?.[0] ?? ''

// Spec 2026-10-15 §6: everyone reads the hashtag groups and snippets; managers add, edit, remove and ask the AI.
describe('SnippetsSection', () => {
  it('shows everyone the hashtag groups and snippets; only managers get the buttons', () => {
    const brand = brandWith({ snippets })
    const staff = renderBrand(brand, false, <SnippetsSection brand={brand} canEdit={false} />)
    expect(staff).toContain('Hashtags and snippets')
    expect(staff).toContain('#autumnhair #copperhair')
    expect(staff).toContain('See you at the studio!')
    expect(staff).not.toContain('Add a hashtag group')
    expect(staff).not.toContain('Suggest hashtag groups with AI')
    const manager = renderBrand(brand, true, <SnippetsSection brand={brand} canEdit />)
    expect(manager).toContain('Add a hashtag group')
    expect(manager).toContain('Add a snippet')
    expect(manager).toContain('Suggest hashtag groups with AI')
  })

  it('says when there are none yet, and stops adding at fifty of a kind', () => {
    const empty = brandWith({ snippets: [] })
    expect(renderBrand(empty, true, <SnippetsSection brand={empty} canEdit />)).toContain('No hashtag groups yet.')
    const full = brandWith({ snippets: Array.from({ length: 50 }, (_, i) => ({ id: i + 1, kind: 'hashtags' as const, name: `G${i}`, body: '#a' })) })
    const out = renderBrand(full, true, <SnippetsSection brand={full} canEdit />)
    expect(addButton(out, 'Add a hashtag group')).toContain('disabled=""')
    expect(addButton(out, 'Add a snippet')).not.toContain('disabled=""')
    expect(out).toContain('A brand keeps at most 50 of each. Remove one first.')
  })

  // Release check (Task 11): on a phone in Russian a row's text shrank to a word a line; it keeps 12rem and the buttons wrap below.
  it('keeps each row\'s text a readable width, its buttons wrapping below it on a phone', () => {
    const brand = brandWith({ snippets })
    expect(renderBrand(brand, true, <SnippetsSection brand={brand} canEdit />)).toContain('class="min-w-0 grow basis-48"')
    // The AI's suggestions (drawn only after asking) use the same column.
    expect(fs.readFileSync(new URL('./sections/Snippets.tsx', import.meta.url), 'utf8')).not.toContain('"min-w-0 flex-1"')
  })
})
