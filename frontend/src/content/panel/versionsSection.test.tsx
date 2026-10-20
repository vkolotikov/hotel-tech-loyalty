import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentContext } from '../ContentProvider'
import { bootFor } from '../brand/brandTesting'
import type { BudgetStatus, Bootstrap, Platform, PostDetail, PostGroup } from '../lib/types'
import { PanelProvider } from './PanelProvider'
import { VersionsForm, VersionsSection } from './VersionsSection'

const post = { id: 5, platform: 'instagram', status: 'draft', scheduled_date: '2026-10-07' } as unknown as PostDetail
const group = (more: Partial<PostGroup> = {}): PostGroup => ({
  id: 5,
  posts: [
    { id: 5, platform: 'instagram', status: 'draft', scheduled_date: '2026-10-07', scheduled_time: null },
    { id: 6, platform: 'linkedin', status: 'ready_to_publish', scheduled_date: null, scheduled_time: null },
  ],
  adapting: [], kept_original: [], kept_reason: null, ...more,
})
function render(element: ReactElement, platforms: Platform[] = ['instagram', 'linkedin', 'x'], budget: BudgetStatus = 'under') {
  const boot = { ...bootFor(false), platforms, ai: { status: budget, percent: 10 } } as unknown as Bootstrap
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <PanelProvider>{element}</PanelProvider>
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}
const section = (g: PostGroup | null, dirty = false) => <VersionsSection post={post} group={g} dirty={dirty} onPost={() => {}} />

describe('the Versions section (spec 2026-10-19 §3)', () => {
  it('offers Make versions on a post in no group, and says what versions are', () => {
    const html = render(section(null))
    expect(html).toContain('Versions')
    expect(html).toContain('Make versions…')
    expect(html).toContain('The same post for other platforms. Each version is a post of its own.')
    expect(html).not.toContain('Unlink this post')
    expect(html).not.toContain('data-versions=""')
  })

  it('lists the group’s posts with platform, status and day, marks this one, and offers Unlink', () => {
    const html = render(section(group()))
    // (This test's t gives the fallback: the platform's code, the status's code.)
    expect(html).toContain('data-versions=""')
    expect(html).toMatch(/aria-current="true"[^>]*>instagram · draft · 7 Oct/)
    expect(html).toContain('linkedin · ready_to_publish · No day')
    expect(html).toContain('(This post)')
    expect(html).toContain('Unlink this post')
  })

  // Review Focus 1: a version copies the post as saved.
  it('waits while the panel holds unsaved edits', () => {
    const html = render(section(group(), true))
    expect(html).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:<[^>]+>)*Make versions…/)
    expect(html).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:<[^>]+>)*Unlink this post/)
    expect(html).toContain('Save your changes first.')
  })

  it('says when the AI adapts this version or the others, and when it kept the original text, and why', () => {
    expect(render(section(group({ adapting: [5] })))).toContain('Adapting for instagram…')
    expect(render(section(group({ adapting: [6] })))).toContain('The AI is adapting the versions…')
    expect(render(section(group({ kept_original: [5], kept_reason: 'budget' })))).toContain('The AI budget ran out; this version keeps the original text.')
    expect(render(section(group({ kept_original: [5], kept_reason: 'ai_failed' })))).toContain('The AI could not adapt this version; it keeps the original text.')
  })

  // Review Focus 3
  it('says when every platform has a version, and offers none', () => {
    const html = render(section(group()), ['instagram', 'linkedin'])
    expect(html).toContain('This post has a version for every platform.')
    expect(html).not.toContain('Make versions…')
  })
})

describe('the Make versions form (spec §3.1)', () => {
  const form = (budget: BudgetStatus) => render(<VersionsForm choices={['linkedin', 'x']} budget={budget} busy={false} dirty={false} onSubmit={() => {}} onCancel={() => {}} />)

  it('lists the platforms to pick and the two ways, Adapt with AI first; nothing to send before a platform is picked', () => {
    const html = form('under')
    expect(html).toContain('For which platforms')
    expect(html).toMatch(/type="checkbox"[^>]*\/?>(?:<!-- -->)?linkedin<\/label>/)
    expect(html).toMatch(/type="checkbox"[^>]*\/?>(?:<!-- -->)?x<\/label>/)
    expect(html).toMatch(/type="radio"[^>]*checked=""[^>]*\/?>(?:<!-- -->)?Adapt with AI/)
    expect(html).toContain('Copy as is')
    expect(html).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:<[^>]+>)*Make versions</)
  })

  // Review Focus 2
  it('at the budget cap the AI cannot be chosen and the form says the text is copied as it is', () => {
    const html = form('over')
    expect(html).toMatch(/type="radio"[^>]*disabled=""[^>]*\/?>(?:<!-- -->)?Adapt with AI/)
    expect(html).toMatch(/type="radio"[^>]*checked=""[^>]*\/?>(?:<!-- -->)?Copy as is/)
    expect(html).toContain('This month’s AI budget is used up: the versions copy the text as it is.')
  })
})
