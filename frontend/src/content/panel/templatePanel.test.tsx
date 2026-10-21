import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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

import { ContentContext } from '../ContentProvider'
import { bootFor } from '../brand/brandTesting'
import type { Bootstrap, PostDetail, Template } from '../lib/types'
import { TemplatePicker } from '../plan/TemplatePicker'
import { PanelProvider } from './PanelProvider'
import { newForm } from './panelState'
import { MoreList } from './PanelMore'
import { usePostActions } from './postActionsState'
import { PostFormFields } from './PostFormFields'

const noop = () => {}
const offer: Template = {
  id: 3, name: 'Seasonal offer', platform: 'instagram', pillar_name: 'Offers', topic: null, hook: 'Book your [treatment] before [date]',
  main_copy: null, cta: null, hashtags: [],
}
const post: PostDetail = {
  id: 5, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: '09:00', status: 'draft',
  title: null, hook: 'Three colours', topic: 'Autumn', pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z',
  language: 'en', goal: null, format: null, main_copy: 'Warm tones.', short_copy: null, cta: null, hashtags: [],
  audience_id: null, campaign_id: null, weekday_role: null, funnel_stage: null, post_type: null, strategic_reason: null,
  quality: null, published_url: null, published_at: null, generated_by: 'manual', hook_alternatives: [], visual_brief: null,
}
/** The ⋯ menu's list, drawn from the panel's shared actions state. */
function MoreOf() {
  const actions = usePostActions({ post, dirty: false, onPost: noop, onDuplicated: noop, onDeleted: noop })
  return <MoreList actions={actions} />
}
const fields = (templates: Template[], hook = '') => renderToStaticMarkup(
  <PostFormFields form={{ ...newForm({ date: '2026-10-20', platform: 'instagram' }, ['instagram']), hook }} onChange={noop} platforms={['instagram']} statuses={['draft']}
    pillars={[]} audiences={[]} published={false} invalid={[]} locale="en" industry={null} snippets={[]} templates={templates} />,
)
const withBoot = (data: Bootstrap, el: ReactElement) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <ContentContext.Provider value={{ data, isLoading: false, isError: false, error: null, refetch: noop, switchBrand: noop }}>
      <PanelProvider>{el}</PanelProvider>
    </ContentContext.Provider>
  </QueryClientProvider>,
)

describe('templates in the post panel (spec 2026-10-16 §5.3)', () => {
  it('offers the brand’s templates beside the topic, and no menu when it has none', () => {
    expect(fields([offer])).toMatch(/<button[^>]*aria-haspopup="true"[^>]*aria-label="Template"/)
    expect(fields([])).not.toContain('aria-label="Template"')
  })

  it('says which blanks are left, and nothing when none are', () => {
    expect(fields([], 'Book your [treatment] before [date]')).toContain('Blanks to fill: 2 — [treatment], [date]')
    expect(fields([], 'Book your colour refresh')).not.toContain('Blanks to fill')
  })

  // Release 7a (spec 2026-10-21 §7.2): "Save as template" is in the panel's ⋯ menu.
  it('offers managers "Save as template" on a saved post, and not staff', () => {
    const actions = <MoreOf />
    expect(withBoot(bootFor(true), actions)).toContain('Save as template')
    expect(withBoot(bootFor(false), actions)).not.toContain('Save as template')
  })
})

describe('TemplatePicker (spec §5.3)', () => {
  it('lists the templates with their platform and pillar, each with Use and Write with AI', () => {
    const out = withBoot(bootFor(false), <TemplatePicker day="2026-10-20" templates={[offer]} slots={[]} channels={[]} onClose={noop} />)
    expect(out).toContain('Choose a template')
    expect(out).toContain('Seasonal offer')
    expect(out).toContain('instagram · Offers')
    expect(out).toMatch(/<button[^>]*>Use<\/button>/)
    expect(out).toContain('Write with AI')
  })

  it('waits on Write with AI while this month’s AI budget is used up', () => {
    const over = { ...bootFor(false), ai: { status: 'over', percent: 100 } } as unknown as Bootstrap
    const out = withBoot(over, <TemplatePicker day="2026-10-20" templates={[offer]} slots={[]} channels={[]} onClose={noop} />)
    expect(out).toMatch(/<button[^>]*\bdisabled=""[^>]*>(?:<[^>]+>)*[^<]*Write with AI/)
  })
})
