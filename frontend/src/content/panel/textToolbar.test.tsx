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

import type { Snippet } from '../lib/types'
import { EmojiPicker } from './EmojiPicker'
import { newForm } from './panelState'
import { PostFormFields } from './PostFormFields'
import { AddressBox, TextToolbar } from './TextToolbar'

const snippets: Snippet[] = [{ id: 1, kind: 'text', name: 'Sign-off', body: 'See you soon!' }]
const groups: Snippet[] = [{ id: 2, kind: 'hashtags', name: 'Autumn colour', body: '#autumnhair' }]
const tools = { onInsert: () => {}, shortUrl: null, typedLink: '', snippets, groups, onHashtags: () => {} }

describe('the text toolbar (spec 2026-10-21 §7.5)', () => {
  it('names each tool for a screen reader', () => {
    const html = renderToStaticMarkup(<TextToolbar {...tools} />)
    for (const w of ['Emoji', 'Insert link', 'Insert snippet', 'Insert hashtag group']) expect(html).toContain(`aria-label="${w}"`)
  })

  it('keeps Snippet and Hashtag group for a brand that has none yet: the open list says so', () => {
    const html = renderToStaticMarkup(<TextToolbar {...tools} snippets={[]} groups={[]} />)
    expect(html).toContain('aria-label="Insert snippet"')
    expect(html).toContain('aria-label="Insert hashtag group"')
  })

  it('draws the emoji picker with its search box, the recent ones and the groups, each emoji named', () => {
    const html = renderToStaticMarkup(<EmojiPicker recent={['🎉']} onPick={() => {}} />)
    expect(html).toMatch(/<input[^>]*type="search"[^>]*aria-label="Search emoji"/)
    expect(html).toMatch(/>Recent<[\s\S]*🎉/)
    for (const g of ['Smileys', 'People', 'Hearts', 'Nature', 'Food', 'Activities', 'Objects', 'Symbols']) expect(html).toContain(`>${g}<`)
    expect(html).toMatch(/<button[^>]*aria-label="heart"[^>]*>❤️<\/button>/)
  })

  // Final review: every emoji was a tab stop (about 160); one per grid, the arrows move inside it.
  it('gives each grid one tab stop', () => {
    const out = renderToStaticMarkup(<EmojiPicker recent={['🎉']} onPick={() => {}} />)
    expect(out.match(/data-emoji=""[^>]*tabindex="0"/g)).toHaveLength(9)
    expect(out.match(/data-emoji=""[^>]*tabindex="-1"/g)?.length).toBeGreaterThan(150)
  })

  // Found by the release check's browser pass: the browser's own check of type="url" stopped the box's submit, so its
  // "Check this field." never showed (a bubble in the browser's language instead).
  it('checks the typed address itself, in the panel\'s words', () => {
    const out = renderToStaticMarkup(<AddressBox onInsert={() => {}} />)
    expect(out).toMatch(/<form[^>]*novalidate=""/i)
    expect(out).toMatch(/<input[^>]*type="url"/)
  })

  it('leaves the Recent row out until an emoji has been used', () => {
    expect(renderToStaticMarkup(<EmojiPicker recent={[]} onPick={() => {}} />)).not.toContain('>Recent<')
  })
})

describe('the toolbar in the panel', () => {
  const html = renderToStaticMarkup(
    <PostFormFields form={newForm({ date: '2026-10-07', platform: 'instagram' }, ['instagram'])} onChange={() => {}}
      platforms={['instagram']} statuses={['draft']} pillars={[]} audiences={[]} published={false} invalid={[]} locale="en" industry={null}
      snippets={[...snippets, ...groups]} />,
  )

  it('sits between the Post text label and its box', () => {
    expect(html).toMatch(/>Post text<[\s\S]*?aria-label="Emoji"[\s\S]*?aria-label="Insert hashtag group"[\s\S]*?<textarea/)
  })

  it('takes over the hashtag Insert beside the field; the call to action keeps its own snippets', () => {
    expect(html).not.toContain('aria-label="Insert"')
    expect(html).toMatch(/>Call to action<[\s\S]*?aria-label="Insert snippet"/)
  })
})
