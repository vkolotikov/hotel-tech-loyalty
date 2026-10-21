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
// Release 7a (spec 2026-10-21 §7.1): where the panel sits is read from the width; a test chooses it.
const place = vi.hoisted(() => ({ mode: 'over' as 'docked' | 'over' | 'full' }))
vi.mock('./usePanelMode', () => ({ usePanelMode: () => place.mode }))
// The tab last used on this device; a test chooses it.
const remembered = vi.hoisted(() => ({ tab: 'content' as 'content' | 'ai' | 'activity' }))
vi.mock('./panelPrefs', () => ({ loadPanelTab: () => remembered.tab, savePanelTab: () => {}, loadFold: () => false, saveFold: () => {} }))

const boot = {
  name: 'HexaTech Content', organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: { id: 3, name: 'Lumière Salon', logo_url: null }, brands: [], accent: null,
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

// Final review: with AI tools or Activity remembered, the panel was blank while the post loaded (and when it failed), a
// new post opened on a tab that said only "Create the post first", and a conflict on Save showed nowhere.
describe('PostPanel on another tab than Content', () => {
  const firstPane = (html: string) => html.indexOf('role="tabpanel"')

  it('says it is loading, or could not load, above the tabs whichever tab is open', () => {
    remembered.tab = 'ai'
    const loading = render({ kind: 'post', id: 5, seq: 1 }, null)
    remembered.tab = 'content'
    expect(loading).toMatch(/data-panel-notices=""/)
    expect(loading.indexOf('Loading…')).toBeGreaterThan(-1)
    expect(loading.indexOf('Loading…')).toBeLessThan(firstPane(loading))
  })

  it('opens a new post on Content even when AI tools was the tab last used', () => {
    remembered.tab = 'ai'
    const fresh = render({ kind: 'new', draft: { date: '2026-10-09', platform: 'linkedin' }, seq: 1 }, null)
    const saved = render({ kind: 'post', id: 5, seq: 1 })
    remembered.tab = 'content'
    expect(fresh).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Content</)
    expect(saved).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>AI tools</)
  })
})

describe('PostPanel', () => {
  // Release 7a (spec 2026-10-21 §7.1): a labelled region beside the page from 1280 px; a dialog over it below.
  it('is a region beside the page when docked, a dialog over it otherwise, 400 px wide', () => {
    place.mode = 'docked'
    const docked = render({ kind: 'post', id: 5, seq: 1 })
    place.mode = 'over'
    expect(docked).toMatch(/<aside[^>]*role="complementary"[^>]*aria-labelledby="content-panel-title"/)
    expect(docked).not.toContain('aria-modal')
    const over = render({ kind: 'post', id: 5, seq: 1 })
    expect(over).toMatch(/<aside[^>]*role="dialog"/)
    expect(over).toContain("sm:w-[400px]")
  })

  // Release 7a (spec 2026-10-21 §7.3): the panel's three tabs; the comments' number on Activity.
  it('shows Content, AI tools and Activity as tabs, Content chosen, with the number of comments on Activity', () => {
    const html = render({ kind: 'post', id: 5, seq: 1 }, { ...post, comments_count: 3 })
    expect(html).toMatch(/role="tablist"[\s\S]*?role="tab"[^>]*aria-selected="true"[^>]*>Content<[\s\S]*?>AI tools<[\s\S]*?>Activity \(3\)</)
    expect(html).toMatch(/role="tabpanel"[^>]*hidden=""[\s\S]*Write the text/)
  })

  it('asks a new post to be created before AI tools and Activity', () => {
    expect(render({ kind: 'new', draft: { date: '2026-10-09', platform: 'linkedin' }, seq: 1 }, null)).toContain('Create the post first to use this.')
  })

  it('says Save draft in the footer for a draft', () => {
    expect(render({ kind: 'post', id: 5, seq: 1 })).toMatch(/<button[^>]*>Save draft</)
  })

  it('says "No day yet" for a post without a day', () => {
    expect(render({ kind: 'post', id: 6, seq: 1 }, { ...post, id: 6, scheduled_date: null })).toContain('No day yet')
  })

  it('opens a post with its fields filled, its platform and status, and Save waiting for a change', () => {
    const html = render({ kind: 'post', id: 5, seq: 1 })
    expect(html).toContain('role="dialog"')
    expect(html).toContain('>Post details<')
    expect(html).toContain('Wednesday, October 7, 2026')
    expect(html).toMatch(/aria-label="More actions"[^>]*aria-haspopup="menu"/)
    expect(html).toContain('value="Autumn"')
    expect(html).toContain('>Three colours</textarea>')
    expect(html).toContain('Warm tones.')
    expect(html).toContain('value="2026-10-07"')
    expect(html).toContain('data-status="draft"')
    // The attribute itself (disabled=""), not Tailwind's disabled: variant in the class.
    expect(html).toMatch(/<button[^>]*\bdisabled=""[^>]*>Save draft</)
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
    expect(html).toContain('>Post details</h2>')
    expect(html).not.toContain('>New post</h2>')
  })

  it('offers AI and the actions on a saved post, and asks a new post to be created first', () => {
    const saved = render({ kind: 'post', id: 5, seq: 1 })
    expect(saved).toContain('Write the text')
    expect(saved).toContain('Mark ready')
    // Copy link and the rest are in the ⋯ menu (spec 2026-10-21 §7.2).
    expect(saved).toContain('aria-label="More actions"')
    expect(render({ kind: 'new', draft: { date: '2026-10-09', platform: 'linkedin' }, seq: 1 }, null)).toContain('Create the post first to use this.')
  })

  it('starts a post from the New post button on the brand\'s own channel', () => {
    const brand = { audiences: [], channels: [{ id: 1, platform: 'linkedin', label: 'LinkedIn', active: true }] }
    const html = render({ kind: 'new', draft: { date: null, platform: null }, seq: 1 }, null, brand)
    expect(html).toMatch(/<option value="linkedin" selected="">/)
  })

  // Spec 2026-10-15 §4–§5: a post started from a day or a slot comes with that channel's usual time.
  it('starts a post from a day or a slot at the time it was given', () => {
    expect(render({ kind: 'new', draft: { date: '2026-10-09', platform: 'instagram', time: '08:30' }, seq: 1 }, null)).toMatch(/<input type="time"[^>]*value="08:30"/)
  })

  it('starts a post from the New post button on the brand\'s first channel at that channel\'s usual time', () => {
    const brand = { audiences: [], channels: [{ id: 1, platform: 'linkedin', label: 'LinkedIn', active: true, post_time: null }] }
    expect(render({ kind: 'new', draft: { date: '2026-10-09', platform: null }, seq: 1 }, null, brand)).toMatch(/<input type="time"[^>]*value="08:00"/)
  })

  it('hands back the edits kept when the person left the portal by Back, and says so', () => {
    const base = formOf(post)
    keep({ owner: ownerOf(3), target: { kind: 'post', id: 5, seq: 7 }, editing: { base, draft: { ...base, hook: 'Typed before leaving' }, post } })
    const html = render(undefined)
    expect(html).toContain('>Typed before leaving</textarea>')
    expect(html).toContain('Your unsaved changes were kept.')
    expect(html).toMatch(/<button[^>]*>Save draft</)
    expect(html).not.toMatch(/<button[^>]*\bdisabled=""[^>]*>Save draft</)
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

  // Spec 2026-10-15 §5: the time field offers the platform's suggested times as one-click chips.
  it('offers the platform\'s suggested times beside the time, the chosen one pressed', () => {
    const out = render({ kind: 'post', id: 5, seq: 1 }, { ...post, scheduled_time: '19:00' })
    expect(out).toContain('aria-label="Suggested times"')
    expect(out).toMatch(/<button[^>]*aria-pressed="false"[^>]*>11:00<\/button>/)
    expect(out).toMatch(/<button[^>]*aria-pressed="true"[^>]*>19:00<\/button>/)
  })

  // Spec 2026-10-15 §6: the brand's hashtag groups and snippets one click away beside their fields.
  // Release 7a (spec 2026-10-21 §7.5): the text's snippets and the hashtag groups are in the toolbar above the text.
  it('offers the brand\'s snippets and hashtag groups in the toolbar above the text, and its snippets beside Call to action', () => {
    const brand = { audiences: [], channels: [], snippets: [{ id: 1, kind: 'hashtags', name: 'Autumn', body: '#autumn' }, { id: 2, kind: 'text', name: 'Sign-off', body: 'See you!' }] }
    const out = render({ kind: 'post', id: 5, seq: 1 }, post, brand)
    expect(out).toMatch(/data-toolbar=""(?:(?!<textarea).)*aria-label="Insert snippet"(?:(?!<textarea).)*aria-label="Insert hashtag group"/s)
    expect(out).toMatch(/>Call to action<(?:(?!<textarea).)*Insert snippet<\/button>/s)
    expect(out).not.toContain('Insert</button>')
  })

  it('warns when an Instagram post holds more than 30 hashtags', () => {
    const many = { ...post, hashtags: Array.from({ length: 31 }, (_, i) => `#tag${i}`) }
    expect(render({ kind: 'post', id: 5, seq: 1 }, many)).toContain('instagram takes at most 30 hashtags; this post has 31.')
  })

  // Spec 2026-10-15 §8: a saved post with a day can repeat; a post in a series says how it runs.
  it('offers Repeat on a saved post, and the series line on a post in a series', () => {
    expect(render({ kind: 'post', id: 5, seq: 1 })).toContain('Let the AI rewrite each copy')
    const series = { id: 5, every: 'month' as const, until: '2027-01-07', more: 2, removable: 2, rewriting: false }
    expect(render({ kind: 'post', id: 5, seq: 1 }, { ...post, series_id: 5, series })).toContain('Repeats every month until January 7, 2027 · 2 more')
  })

  // Release check (Task 11): a post started on a platform with no time takes that channel's usual time in the panel.
  it('starts a post on a platform given no time at that channel\'s usual time', () => {
    const brand = { audiences: [], channels: [{ id: 1, platform: 'instagram', label: 'Instagram', active: true, post_time: '08:30' }] }
    expect(render({ kind: 'new', draft: { date: '2026-10-09', platform: 'instagram' }, seq: 1 }, null, brand)).toMatch(/<input type="time"[^>]*value="08:30"/)
  })
})

describe('PostPanel while approvals are on (spec 2026-10-16 §6.2)', () => {
  it('stops a staff member’s status list before Approved, Ready and Published', () => {
    const lockedBoot = {
      ...boot, statuses: ['idea', 'draft', 'needs_review', 'approved', 'ready_to_publish', 'published'],
      profile: { id: 1, setup_completed: true, readiness: 80, requires_approval: true },
    } as unknown as Bootstrap
    const client = new QueryClient()
    client.setQueryData(['content', 3, 'post', post.id], post)
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ContentContext.Provider value={{ data: lockedBoot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <PanelProvider initial={{ kind: 'post', id: 5, seq: 1 }}><PostPanel /></PanelProvider>
        </ContentContext.Provider>
      </QueryClientProvider>,
    )
    expect(html).toContain('<option value="needs_review">')
    expect(html).not.toContain('<option value="approved">')
    expect(html).not.toContain('<option value="ready_to_publish">')
    expect(html).not.toContain('<option value="published">')
  })
})

describe('PostPanel: comments and history (spec 2026-10-16 §7.1)', () => {
  it('shows the post’s timeline at its foot, after the actions', () => {
    const withTimeline = {
      ...post, timeline: [{ type: 'comment', id: 1, user: { id: 9, name: 'Maria' }, body: 'Love the hook', edited: false, mine: false, at: '2026-10-05T08:00:00.000000Z' }],
    } as PostDetail
    const html = render({ kind: 'post', id: 5, seq: 1 }, withTimeline)
    expect(html).toContain('Love the hook')
    expect(html.indexOf('Comments and history')).toBeGreaterThan(html.indexOf('content-actions-title'))
  })
})
