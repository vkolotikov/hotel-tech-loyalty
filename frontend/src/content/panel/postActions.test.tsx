import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, PostDetail } from '../lib/types'
import { MoreList } from './PanelMore'
import { ProgressActions } from './ProgressActions'
import { usePostActions } from './postActionsState'

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

/** The panel draws both from one state (spec 2026-10-21 §7.2, §7.4): the progress beside the status, the rest in ⋯. */
function Both({ p, dirty }: { p: PostDetail; dirty: boolean }) {
  const actions = usePostActions({ post: p, dirty, onPost: () => {}, onDuplicated: () => {}, onDeleted: () => {} })
  return <><ProgressActions post={p} actions={actions} /><MoreList actions={actions} /></>
}
const renderAs = (value: Bootstrap, p: PostDetail, dirty = false) => renderToStaticMarkup(
  <ContentContext.Provider value={{ data: value, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
    <Both p={p} dirty={dirty} />
  </ContentContext.Provider>,
)
const render = (p: PostDetail, dirty = false) => renderAs(boot, p, dirty)
const progressOf = (value: Bootstrap, p: PostDetail) => renderToStaticMarkup(
  <ContentContext.Provider value={{ data: value, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
    <ProgressOnly p={p} />
  </ContentContext.Provider>,
)
function ProgressOnly({ p }: { p: PostDetail }) {
  const actions = usePostActions({ post: p, dirty: false, onPost: () => {}, onDuplicated: () => {}, onDeleted: () => {} })
  return <ProgressActions post={p} actions={actions} />
}

describe('the post\'s actions', () => {
  it('offers Mark ready and Mark published beside the status, and Duplicate, Copy text, Copy link and Delete in ⋯ — all waiting while there are unsaved edits', () => {
    const html = render(post)
    for (const label of ['Mark ready', 'Mark published', 'Duplicate', 'Copy text', 'Copy link for the team', 'Delete']) expect(html).toContain(label)
    expect(progressOf(boot, post)).not.toContain('Duplicate')
    // The attribute itself, not a Tailwind variant in the class. Final review: ⋯'s items wait as aria-disabled (the arrow
    // keys still reach them, and the menu says why), not disabled.
    expect(html).not.toMatch(/<button[^>]*\baria-disabled="true"[^>]*>(?:<[^>]+>)*Duplicate/)
    expect(render(post, true)).toMatch(/<button[^>]*\baria-disabled="true"[^>]*>(?:<[^>]+>)*Duplicate/)
    expect(render(post, true)).toContain('Save your changes first.')
  })

  it('draws the menu\'s choices as menu items', () => {
    expect(render(post)).toMatch(/role="menuitem"[^>]*>(?:<[^>]+>)*Duplicate/)
  })

  it('a ready post is not marked ready again; a published post says when, links to itself and is not marked published again', () => {
    expect(render({ ...post, status: 'ready_to_publish' } as PostDetail)).not.toContain('Mark ready')
    const html = render({ ...post, status: 'published', published_at: '2026-10-07T08:30:00.000000Z', published_url: 'https://instagram.com/p/abc' } as PostDetail)
    expect(html).toContain('Published 7 Oct')
    expect(html).toContain('href="https://instagram.com/p/abc"')
    expect(html).not.toContain('Mark published')
  })
})

describe('the post\'s actions while approvals are on (spec 2026-10-16 §6.2)', () => {
  const locked = { ...boot, profile: { id: 1, setup_completed: true, readiness: 80, requires_approval: true } } as unknown as Bootstrap

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
    expect(html).toContain('Save as template')
  })
})

describe('the post\'s actions: the poster under approvals (spec 2026-10-19 §4.4)', () => {
  const locked = { brand: { id: 3, name: 'Lumière Salon' }, venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' },
    staff: { can_manage: false, id: 7 }, profile: { id: 1, setup_completed: true, readiness: 60, requires_approval: true } } as unknown as Bootstrap

  it('offers Mark published to the post’s own poster on an approved post, and says why', () => {
    const html = renderAs(locked, { ...post, status: 'approved', poster_id: 7 } as PostDetail)
    expect(html).toContain('Mark published')
    expect(html).toContain('You post this one: mark it published once it is out.')
    expect(html).not.toContain('Mark ready')
  })

  it('offers nothing of the kind on someone else’s post, which still says a manager publishes', () => {
    const html = renderAs(locked, { ...post, status: 'approved', poster_id: 8 } as PostDetail)
    expect(html).not.toContain('Mark published')
    expect(html).toContain('While approvals are on, a manager approves, marks ready and publishes.')
  })
})
