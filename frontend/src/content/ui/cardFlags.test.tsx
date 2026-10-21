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

import { ContentContext } from '../ContentProvider'
import { bootFor } from '../brand/brandTesting'
import type { Bootstrap, PostCard } from '../lib/types'
import { PostCardView } from '../plan/PostCardView'
import { PostRow } from '../posts/PostRow'
import { CardFlags } from './CardFlags'

const card = (more: Partial<PostCard> = {}): PostCard => ({
  id: 5, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: '09:00', status: 'needs_review', title: null,
  hook: 'Three colours', topic: null, pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z', ...more,
})
const render = (requires: boolean, element: ReactElement) => renderToStaticMarkup(
  <ContentContext.Provider value={{
    data: { ...bootFor(false), profile: { id: 1, setup_completed: true, readiness: 64, requires_approval: requires } } as Bootstrap,
    isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {},
  }}>
    {element}
  </ContentContext.Provider>,
)

describe('card flags (spec 2026-10-16 §6.3, §7.1)', () => {
  it('say "Waiting for approval" on a post in review only while approvals are on', () => {
    expect(render(true, <CardFlags post={card()} />)).toContain('Waiting for approval')
    expect(render(false, <CardFlags post={card()} />)).toBe('')
  })

  it('say "Sent back" on a sent-back draft, and count comments without reading the number twice', () => {
    const html = render(false, <CardFlags post={card({ status: 'draft', sent_back: true, comments_count: 2 })} />)
    expect(html).toContain('Sent back')
    expect(html).toContain('<span aria-hidden="true">2</span><span class="sr-only">Comments: 2</span>')
  })

  it('draw only the marks on a compact card, each with its words for a screen reader', () => {
    const html = render(true, <CardFlags post={card({ comments_count: 1 })} compact />)
    expect(html).toContain('title="Waiting for approval"')
    expect(html).toContain('<span class="sr-only">Waiting for approval</span>')
    expect(html).not.toContain('rounded-full')
  })

  it('end a Plan card’s name and show on the card, in the month and on a Posts row', () => {
    const html = render(true, <PostCardView post={card({ comments_count: 2 })} onOpen={() => {}} />)
    expect(html).toContain('aria-label="instagram 09:00: needs_review, Three colours, Waiting for approval, Comments: 2"')
    expect(html).toContain('data-flags=""')
    expect(render(true, <PostCardView post={card()} size="tray" onOpen={() => {}} />)).toContain('title="Waiting for approval"')
    expect(render(false, <PostRow post={card({ comments_count: 3 })} locale="en-GB" pillar={null} selected={false} onOpen={() => {}} />)).toContain('Comments: 3')
  })
})

describe('release 5a: the versions mark (spec 2026-10-19 §3.4)', () => {
  it('marks a post that is one of several versions, with its words for a screen reader, and nothing for none', () => {
    expect(render(false, <CardFlags post={card({ status: 'draft', group_size: 3 })} />)).toContain('Versions: 3')
    expect(render(false, <CardFlags post={card({ status: 'draft', group_size: 3 })} compact />)).toContain('Versions: 3')
    expect(render(false, <CardFlags post={card({ status: 'draft', group_size: 0 })} />)).toBe('')
  })

  it('ends a Plan card’s name with it', () => {
    expect(render(false, <PostCardView post={card({ status: 'draft', group_size: 2 })} onOpen={() => {}} />)).toMatch(/aria-label="[^"]*Versions: 2"/)
  })
})

describe('clicks on cards (spec 2026-10-19 §5.5)', () => {
  it('count a post’s short-link clicks from 1 without reading the number twice, and end a Plan card’s name with them', () => {
    expect(render(false, <CardFlags post={card({ status: 'draft', clicks: 0 })} />)).toBe('')
    expect(render(false, <CardFlags post={card({ status: 'draft', clicks: 12 })} />)).toContain('<span aria-hidden="true">12</span><span class="sr-only">Clicks: 12</span>')
    expect(render(false, <CardFlags post={card({ status: 'draft', clicks: 1 })} compact />)).toContain('title="Clicks: 1"')
    expect(render(false, <PostCardView post={card({ status: 'draft', clicks: 3, group_size: 2 })} onOpen={() => {}} />))
      .toContain('aria-label="instagram 09:00: draft, Three colours, Versions: 2, Clicks: 3"')
  })
})
