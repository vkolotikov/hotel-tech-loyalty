import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, PostDetail } from '../lib/types'
import { AiTools } from './AiTools'

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

const boot = {
  brand: { id: 3, name: 'Lumière Salon' }, ai: { status: 'under', percent: 10 }, rewrites: ['shorter', 'longer', 'professional', 'friendly', 'alternative'],
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' },
} as unknown as Bootstrap
const post = {
  id: 5, platform: 'instagram', status: 'draft', hook: 'Three colours', main_copy: 'Warm tones.', cta: null, hashtags: [],
  quality: null, visual_brief: null, published_url: null, published_at: null,
} as unknown as PostDetail

function render(p: PostDetail, dirty = false, data: Bootstrap = boot) {
  return renderToStaticMarkup(
    <ContentContext.Provider value={{ data, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
      <AiTools post={p} dirty={dirty} onPost={() => {}} onUseCopy={() => {}} />
    </ContentContext.Provider>,
  )
}
// The attribute itself (disabled=""), not Tailwind's disabled: variant in every button's class.
const disabled = (html: string, label: string) => new RegExp(`<button[^>]*\\bdisabled=""[^>]*>(?:<[^>]+>)*[^<]*${label}`).test(html)

describe('AiTools', () => {
  it('offers the text, the five rewrites, the quality score, the visual brief and the image', () => {
    const html = render(post)
    for (const label of ['Write the text', 'Rewrite', 'Check quality', 'Visual brief', 'Create image']) expect(html).toContain(label)
    for (const kind of ['Shorter', 'Longer', 'More professional', 'Friendlier', 'Another version']) expect(html).toContain(kind)
    expect(disabled(html, 'Write the text')).toBe(false)
  })

  it('while the post has unsaved edits, the tools that would overwrite them wait and say why; a rewrite still works', () => {
    const html = render(post, true)
    expect(html).toContain('Save your changes first.')
    for (const label of ['Write the text', 'Check quality', 'Visual brief', 'Create image']) expect(disabled(html, label), label).toBe(true)
    expect(disabled(html, 'Rewrite')).toBe(false)
  })

  it('shows the quality score, its verdict and how to improve', () => {
    const html = render({ ...post, quality: { scores: {}, overall: 7.46, flags: [], improvements: ['Shorten the hook'], verdict: 'Good, a little long.' } })
    expect(html).toContain('Score: 7.5 of 10')
    expect(html).toContain('Good, a little long.')
    expect(html).toContain('Shorten the hook')
  })

  it('shows the visual brief and the image, with a download and a new image', () => {
    const brief = { visual_type: 'Photo', aspect_ratio: '4:5', style: null, description: 'A warm still life', scene: null, mood: 'Calm', composition: null, text_overlay: null, avoid: null, image_url: '/storage/a.png', image_status: 'ready', image_error: null }
    const html = render({ ...post, visual_brief: brief })
    expect(html).toContain('A warm still life')
    expect(html).toContain('Calm')
    expect(html).toContain('src="/storage/a.png"')
    expect(html).toMatch(/<a href="\/storage\/a.png" download=""/)
    expect(html).toContain('New image')
    expect(render({ ...post, visual_brief: { ...brief, image_status: 'failed', image_url: null } })).toContain('The image could not be created.')
  })

  it('with the month\'s budget used up, says so and waits', () => {
    const html = render(post, false, { ...boot, ai: { status: 'over', percent: 100 } } as Bootstrap)
    expect(html).toContain('AI budget is used up.') // static markup writes the apostrophe of "month's" as &#x27;
    for (const label of ['Write the text', 'Rewrite', 'Check quality']) expect(disabled(html, label), label).toBe(true)
  })
})
