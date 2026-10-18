import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

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
import type { Bootstrap, PostDetail } from '../lib/types'
import { ReviewBar } from './ReviewBar'

const post = { id: 5, status: 'draft', updated_at: '2026-10-05T06:00:00.000000Z', author: null, sent_back: false } as unknown as PostDetail
const bootWith = (requires: boolean, manager: boolean) =>
  ({ ...bootFor(manager), profile: { id: 1, setup_completed: true, readiness: 64, requires_approval: requires } }) as Bootstrap
function render(p: PostDetail, requires: boolean, manager: boolean, dirty = false) {
  return renderToStaticMarkup(
    <ContentContext.Provider value={{ data: bootWith(requires, manager), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
      <ReviewBar post={p} dirty={dirty} onPost={() => {}} />
    </ContentContext.Provider>,
  )
}

describe('the panel’s review bar (spec 2026-10-16 §6.3, §7.1)', () => {
  it('offers staff Send for approval on a draft while approvals are on', () => {
    const html = render(post, true, false)
    expect(html).toContain('Send for approval')
    expect(html).not.toContain('Approve')
  })

  it('shows a post in review as waiting: no step for staff, Approve and Send back for a manager', () => {
    const inReview = { ...post, status: 'needs_review' } as PostDetail
    const staff = render(inReview, true, false)
    expect(staff).toContain('Waiting for approval')
    expect(staff).not.toContain('Send for approval')
    expect(staff).not.toContain('Approve')
    const manager = render(inReview, true, true)
    expect(manager).toContain('Approve')
    expect(manager).toContain('Send back')
  })

  it('says who wrote the post, and that it was sent back, also with approvals off', () => {
    const html = render({ ...post, author: 'Anna', sent_back: true } as PostDetail, false, true)
    expect(html).toContain('Written by Anna')
    expect(html).toContain('Sent back')
    expect(html).not.toContain('Approve')
  })

  // Review Focus 5: a post the AI wrote names nobody.
  it('says nothing for an AI post with approvals off', () => {
    expect(render(post, false, true)).toBe('')
  })

  it('waits while the post has unsaved edits', () => {
    const html = render(post, true, false, true)
    expect(html).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:<[^>]+>)*Send for approval/)
    expect(html).toContain('Save your changes first.')
  })
})
