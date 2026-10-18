import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, PostDetail } from '../lib/types'
import { PostActions } from './PostActions'

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

// The bootstrap always names the person's role: "Save as template" is offered to managers (spec 2026-10-16 §5.2).
const boot = { brand: { id: 3, name: 'Lumière Salon' }, venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' }, staff: { can_manage: false } } as unknown as Bootstrap
const post = { id: 5, status: 'draft', hook: 'Three colours', main_copy: 'Warm tones.', cta: null, hashtags: [], published_url: null, published_at: null } as unknown as PostDetail

function render(p: PostDetail, dirty = false) {
  return renderToStaticMarkup(
    <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
      <PostActions post={p} dirty={dirty} onPost={() => {}} onDuplicated={() => {}} onDeleted={() => {}} />
    </ContentContext.Provider>,
  )
}

describe('PostActions', () => {
  it('offers Mark ready, Mark published, Duplicate, Copy text and Delete — all waiting while there are unsaved edits', () => {
    const html = render(post)
    for (const label of ['Mark ready', 'Mark published', 'Duplicate', 'Copy text', 'Delete']) expect(html).toContain(label)
    // The attribute itself (disabled=""), not Tailwind's disabled: variant in the class.
    expect(html).not.toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:<[^>]+>)*Duplicate/)
    expect(render(post, true)).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:<[^>]+>)*Duplicate/)
    expect(render(post, true)).toContain('Save your changes first.')
  })

  it('a ready post is not marked ready again; a published post says when, links to itself and is not marked published again', () => {
    expect(render({ ...post, status: 'ready_to_publish' })).not.toContain('Mark ready')
    const html = render({ ...post, status: 'published', published_at: '2026-10-07T08:30:00.000000Z', published_url: 'https://instagram.com/p/abc' })
    expect(html).toContain('Published 7 Oct')
    expect(html).toContain('href="https://instagram.com/p/abc"')
    expect(html).not.toContain('Mark published')
  })
})

describe('PostActions while approvals are on (spec 2026-10-16 §6.2)', () => {
  const locked = { ...boot, profile: { id: 1, setup_completed: true, readiness: 80, requires_approval: true } } as unknown as Bootstrap
  const renderAs = (value: Bootstrap, p: PostDetail) => renderToStaticMarkup(
    <ContentContext.Provider value={{ data: value, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
      <PostActions post={p} dirty={false} onPost={() => {}} onDuplicated={() => {}} onDeleted={() => {}} />
    </ContentContext.Provider>,
  )

  it('hides Mark ready and Mark published from staff, and says who does them', () => {
    const html = renderAs(locked, post)
    expect(html).not.toContain('Mark ready')
    expect(html).not.toContain('Mark published')
    expect(html).toContain('While approvals are on, a manager approves, marks ready and publishes.')
    expect(html).toContain('Duplicate')
  })

  it('keeps them for managers', () => {
    const html = renderAs({ ...locked, staff: { can_manage: true } } as unknown as Bootstrap, post)
    expect(html).toContain('Mark ready')
    expect(html).toContain('Mark published')
    expect(html).not.toContain('While approvals are on')
  })
})
