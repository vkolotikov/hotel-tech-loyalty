import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, PostDetail } from '../lib/types'
import { keep, ownerOf } from './kept'
import { PanelProvider, type PanelTarget } from './PanelProvider'
import { formOf } from './panelState'
import { PostPanel } from './PostPanel'

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
  name: 'HexaTech Content', organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: { id: 3, name: 'Lumière Salon' }, brands: [], accent: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' },
  staff: { name: 'Sam', role: 'staff', can_manage: false }, profile: { id: 1, setup_completed: true, readiness: 80 },
  ai: { status: 'under', percent: 10 }, platforms: ['instagram', 'linkedin'], statuses: ['draft', 'published'],
  rewrites: ['shorter', 'longer'],
} as unknown as Bootstrap

const post: PostDetail = {
  id: 5, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: '09:00', status: 'draft',
  title: null, hook: 'Three colours', topic: 'Autumn', pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z',
  language: 'en', goal: null, format: null, main_copy: 'Warm tones.', short_copy: null, cta: null, hashtags: [],
  audience_id: null, campaign_id: null, weekday_role: null, funnel_stage: null, post_type: null, strategic_reason: null,
  quality: null, published_url: null, published_at: null, generated_by: 'manual', hook_alternatives: [], visual_brief: null,
}

function render(target: PanelTarget | undefined, cached: PostDetail | null = post, brand?: unknown) {
  const client = new QueryClient()
  if (cached) client.setQueryData(['content', 3, 'post', cached.id], cached)
  if (brand) client.setQueryData(['content', 3, 'brand'], brand)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <PanelProvider initial={target}><PostPanel /></PanelProvider>
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}

describe('PostPanel', () => {
  it('opens a post with its fields filled, its platform and status, and Save waiting for a change', () => {
    const html = render({ kind: 'post', id: 5, seq: 1 })
    expect(html).toContain('role="dialog"')
    expect(html).toContain('>Post<')
    expect(html).toContain('value="Autumn"')
    expect(html).toContain('>Three colours</textarea>')
    expect(html).toContain('Warm tones.')
    expect(html).toContain('value="2026-10-07"')
    expect(html).toContain('data-status="draft"')
    // The attribute itself (disabled=""), not Tailwind's disabled: variant in the class.
    expect(html).toMatch(/<button[^>]*\bdisabled=""[^>]*>Save</)
  })

  it('starts a new post from a slot on its day and platform, ready to be created', () => {
    const html = render({ kind: 'new', draft: { date: '2026-10-09', platform: 'linkedin' }, seq: 1 }, null)
    expect(html).toContain('>New post<')
    expect(html).toContain('value="2026-10-09"')
    expect(html).toMatch(/<option value="linkedin" selected="">/)
    expect(html).toMatch(/<button[^>]*>Create post</)
    expect(html).not.toMatch(/<button[^>]*\bdisabled=""[^>]*>Create post</)
  })

  it('keeps a published post\'s day, and says why', () => {
    const html = render({ kind: 'post', id: 6, seq: 1 }, { ...post, id: 6, status: 'published' })
    expect(html).toMatch(/<input type="date"[^>]*disabled/)
    expect(html).toContain('A published post keeps the date it went out.')
  })

  // Found by eyes (Task 8): while a saved post loaded, its panel was headed "New post".
  it('says it is loading a post it does not have yet, under the title of a post (not a new one)', () => {
    const html = render({ kind: 'post', id: 9, seq: 1 }, null)
    expect(html).toContain('role="status"')
    expect(html).toContain('>Post</h2>')
    expect(html).not.toContain('>New post</h2>')
  })

  it('offers AI and the actions on a saved post, and asks a new post to be created first', () => {
    const saved = render({ kind: 'post', id: 5, seq: 1 })
    expect(saved).toContain('Write the text')
    expect(saved).toContain('Mark ready')
    expect(render({ kind: 'new', draft: { date: '2026-10-09', platform: 'linkedin' }, seq: 1 }, null)).toContain('Create the post first to use AI.')
  })

  it('starts a post from the New post button on the brand\'s own channel', () => {
    const brand = { audiences: [], channels: [{ id: 1, platform: 'linkedin', label: 'LinkedIn', active: true }] }
    const html = render({ kind: 'new', draft: { date: null, platform: null }, seq: 1 }, null, brand)
    expect(html).toMatch(/<option value="linkedin" selected="">/)
  })

  it('hands back the edits kept when the person left the portal by Back, and says so', () => {
    const base = formOf(post)
    keep({ owner: ownerOf(3), target: { kind: 'post', id: 5, seq: 7 }, editing: { base, draft: { ...base, hook: 'Typed before leaving' }, post } })
    const html = render(undefined)
    expect(html).toContain('>Typed before leaving</textarea>')
    expect(html).toContain('Your unsaved changes were kept.')
    expect(html).toMatch(/<button[^>]*>Save</)
    expect(html).not.toMatch(/<button[^>]*\bdisabled=""[^>]*>Save</)
  })

  it('offers only the active pillars (and the post\'s own), and names an audience it does not know', () => {
    const client = new QueryClient()
    client.setQueryData(['content', 3, 'post', 5], { ...post, pillar_id: null, audience_id: 42 })
    client.setQueryData(['content', 3, 'strategies'], { strategies: [{ id: 2, title: null, summary: null, status: 'active', created_at: null }] })
    client.setQueryData(['content', 3, 'strategy', 2], { strategy: { id: 2, title: null, summary: null, status: 'active', created_at: null, ai_output: null, balance: null,
      pillars: [{ id: 7, name: 'Hair care', active: true, description: null, purpose: null, frequency_weight: 50 }, { id: 8, name: 'Old pillar', active: false, description: null, purpose: null, frequency_weight: 0 }] } })
    const out = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <PanelProvider initial={{ kind: 'post', id: 5, seq: 1 }}><PostPanel /></PanelProvider>
        </ContentContext.Provider>
      </QueryClientProvider>,
    )
    expect(out).toContain('>Hair care</option>')
    expect(out).not.toContain('>Old pillar</option>')
    expect(out).toMatch(/<option value="42" selected="">Another audience<\/option>/)
  })
})
