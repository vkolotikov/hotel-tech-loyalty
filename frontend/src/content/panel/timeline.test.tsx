import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
import type { PostDetail, TimelineItem } from '../lib/types'
import { Timeline } from './Timeline'

const post = { id: 5, comments_count: 3 } as unknown as PostDetail
const items: TimelineItem[] = [
  { type: 'event', id: 1, kind: 'sent_for_approval', user: { id: 7, name: 'Anna' }, note: null, at: '2026-10-05T07:00:00.000000Z' },
  { type: 'comment', id: 2, user: { id: 9, name: 'Maria' }, body: 'Shorter, please.\nAnd a warmer photo.', edited: true, mine: false, at: '2026-10-05T08:00:00.000000Z' },
  { type: 'event', id: 3, kind: 'sent_back', user: { id: 9, name: 'Maria' }, note: 'Two lines at most.', at: '2026-10-05T08:01:00.000000Z' },
  { type: 'comment', id: 4, user: { id: 7, name: 'Anna' }, body: 'On it.', edited: false, mine: true, at: '2026-10-05T09:00:00.000000Z' },
  { type: 'comment', id: 5, user: null, body: 'From someone who left', edited: false, mine: false, at: '2026-10-05T10:00:00.000000Z' },
]
function render(list: TimelineItem[] | null, manager = false) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ContentContext.Provider value={{ data: bootFor(manager), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <Timeline post={post} items={list} />
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}
const count = (html: string, text: string) => html.split(text).length - 1

describe('Comments and history (spec 2026-10-16 §7.1)', () => {
  it('shows comments and approval steps oldest first, each with who and when', () => {
    const html = render(items)
    expect(html).toContain('Comments and history')
    const at = ['Anna sent it for approval', 'Shorter, please.\nAnd a warmer photo.', 'Maria sent it back', 'Two lines at most.', 'On it.', 'From someone who left'].map(text => html.indexOf(text))
    expect(at.every((place, i) => place >= 0 && (i === 0 || place > at[i - 1]))).toBe(true)
    expect(html).toContain('5 Oct')
  })

  // Review Focus 5: someone who has left is not a blank.
  it('marks an edited comment, keeps its lines, and names someone who has left "Former team member"', () => {
    const html = render(items)
    expect(html).toContain('edited')
    expect(html).toContain('whitespace-pre-wrap')
    expect(html).toContain('Former team member')
  })

  it('offers Edit and Delete on your own comment; a manager may also delete anyone’s', () => {
    const staff = render(items)
    expect(count(staff, '>Edit<')).toBe(1)
    expect(count(staff, '>Delete<')).toBe(1)
    const manager = render(items, true)
    expect(count(manager, '>Edit<')).toBe(1)
    expect(count(manager, '>Delete<')).toBe(3)
  })

  it('says when there is nothing yet, and while it loads', () => {
    expect(render([])).toContain('No comments yet.')
    expect(render(null)).toContain('Loading…')
  })

  it('has a box that says how to send', () => {
    const html = render(items)
    expect(html).toContain('Write a comment')
    expect(html).toContain('Enter sends · Shift + Enter adds a line')
  })
})
