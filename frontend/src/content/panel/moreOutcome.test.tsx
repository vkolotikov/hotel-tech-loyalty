import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

import type { PostDetail } from '../lib/types'
import { MoreList } from './PanelMore'
import { MoreOutcome } from './MoreOutcome'
import type { PostActionsState } from './postActionsState'

const noop = () => {}
const state = (more: Partial<PostActionsState> = {}): PostActionsState => ({
  locked: false, publishable: false, waits: false, dirty: false, busy: null, error: null, copied: false, linkCopied: false, canManage: true,
  publishing: false, setPublishing: noop, url: '', setUrl: noop, urlOk: true, confirmDelete: false, setConfirmDelete: noop, templating: false,
  setTemplating: noop, markReady: noop, markPublished: noop, duplicate: noop, copy: noop, copyLink: noop, remove: noop, ...more,
})
const post = { id: 5, platform: 'instagram', hook: 'Three colours', hashtags: [] } as unknown as PostDetail

// Final review: what the ⋯ menu opens showed inside the Content tab (nothing from AI tools or Activity), and its
// "Copied" was on the menu item the click had just closed.
describe('MoreOutcome', () => {
  it('asks before deleting, in a place every tab shows', () => {
    const out = renderToStaticMarkup(<MoreOutcome post={post} actions={state({ confirmDelete: true })} />)
    expect(out).toMatch(/role="alert"[\s\S]*Delete this post\? This cannot be undone\.[\s\S]*Delete post[\s\S]*Cancel/)
  })

  it('says Copied and Link copied as a status line, and an action\'s refusal', () => {
    expect(renderToStaticMarkup(<MoreOutcome post={post} actions={state({ copied: true })} />)).toMatch(/role="status"[^>]*>(?:<[^>]+>)*Copied/)
    expect(renderToStaticMarkup(<MoreOutcome post={post} actions={state({ linkCopied: true })} />)).toMatch(/role="status"[^>]*>(?:<[^>]+>)*Link copied/)
    expect(renderToStaticMarkup(<MoreOutcome post={post} actions={state({ error: 'The post could not be duplicated.' })} />)).toContain('The post could not be duplicated.')
  })

  it('draws nothing while nothing was asked', () => {
    expect(renderToStaticMarkup(<MoreOutcome post={post} actions={state()} />)).toBe('')
  })
})

describe('MoreList while edits wait', () => {
  it('keeps its items reachable by keyboard and says why they wait', () => {
    const out = renderToStaticMarkup(<MoreList actions={state({ waits: true, dirty: true })} />)
    expect(out).toContain('Save your changes first.')
    expect(out).toMatch(/role="menuitem"[^>]*aria-disabled="true"/)
    expect(out).not.toMatch(/role="menuitem"[^>]*\bdisabled=""/)
  })
})
