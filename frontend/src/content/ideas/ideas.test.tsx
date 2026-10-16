import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
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
import type { IdeasPayload, PostCard } from '../lib/types'
import { PanelProvider } from '../panel/PanelProvider'
import { IdeaColumn } from './IdeaColumn'
import { IdeasPage } from './IdeasPage'

const noop = () => {}
const card = (id: number, more: Partial<PostCard> = {}): PostCard => ({
  id, platform: 'instagram', scheduled_date: null, scheduled_time: null, status: 'idea', title: null, hook: null,
  topic: `Idea ${id}`, pillar_id: null, image_url: null, updated_at: '2026-10-16T09:00:00.000000Z', ...more,
})
const handlers = { onOpen: noop, onMove: noop, onSchedule: noop, onDragStart: noop, onDragEnd: noop, onDrop: noop }
const now = Date.parse('2026-10-16T12:00:00Z')

describe('IdeaColumn (spec 2026-10-16 §4.1, §4.2)', () => {
  it('draws a stage with its total, each card with its words, pillar, age, status, Schedule and Move to…, and See all past 50', () => {
    const out = renderToStaticMarkup(
      <MemoryRouter>
        <IdeaColumn column="review" posts={[card(1, { status: 'needs_visual', pillar_id: 4 })]} total={63} seeAll="/content/posts?unscheduled=1"
          locale="en-GB" now={now} pillarName={(id) => (id === 4 ? 'Education' : null)} draggable dropping={false} {...handlers} />
      </MemoryRouter>,
    )
    expect(out).toContain('aria-label="In review"')
    expect(out).toContain('>63<')
    expect(out).toContain('data-post="1"')
    expect(out).toContain('Idea 1')
    expect(out).toContain('Education · 3 hours ago')
    expect(out).toContain('data-status="needs_visual"')
    expect(out).toContain('Schedule')
    expect(out).toMatch(/<button[^>]*aria-haspopup="true"[^>]*>Move to…<\/button>/)
    expect(out).toContain('draggable="true"')
    expect(out).toContain('href="/content/posts?unscheduled=1"')
    expect(out).toContain('See all: 63')
  })

  it('says when a stage is empty, and drags nothing where dragging is off (a phone)', () => {
    const out = renderToStaticMarkup(
      <MemoryRouter>
        <IdeaColumn column="idea" posts={[]} total={0} seeAll="/x" locale="en-GB" now={now} pillarName={() => null} draggable={false} dropping={false} {...handlers} />
      </MemoryRouter>,
    )
    expect(out).toContain('Nothing here yet.')
    expect(out).not.toContain('See all')
    const phone = renderToStaticMarkup(
      <MemoryRouter>
        <IdeaColumn column="idea" posts={[card(2)]} total={1} seeAll="/x" locale="en-GB" now={now} pillarName={() => null} draggable={false} dropping={false} {...handlers} />
      </MemoryRouter>,
    )
    expect(phone).not.toContain('draggable="true"')
  })
})

const board: IdeasPayload = {
  columns: {
    idea: { posts: [card(1), card(2)], total: 2 },
    draft: { posts: [card(3, { status: 'draft', topic: 'A draft' })], total: 1 },
    review: { posts: [], total: 0 },
    ready: { posts: [], total: 0 },
  },
}

function page(read = true) {
  const client = new QueryClient()
  if (read) client.setQueryData(['content', 3, 'ideas', null, null], board)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/content/ideas']}>
        <ContentContext.Provider value={{ data: bootFor(false), isLoading: false, isError: false, error: null, refetch: noop, switchBrand: noop }}>
          <PanelProvider><IdeasPage /></PanelProvider>
        </ContentContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('IdeasPage', () => {
  // The test has no screen width: the page draws its phone view, one stage at a time.
  it('shows one stage at a time on a phone, with a switch that names each stage and its total', () => {
    const out = page()
    expect(out).toContain('>Ideas<')
    expect(out).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Idea <span[^>]*>2<\/span><\/button>/)
    expect(out).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Draft <span[^>]*>1<\/span><\/button>/)
    expect(out).toContain('Idea 1')
    expect(out).not.toContain('A draft')
    expect(out).toContain('id="content-ideas-hint"')
    expect(out).toContain('All platforms')
  })

  // Release check (Plan 4A-2 Task 12, eyes): before its first read the board said every stage was empty, with totals of 0.
  it('says it is loading before the board is read, never that the stages are empty', () => {
    const out = page(false)
    expect(out).toContain('Loading…')
    expect(out).not.toContain('Nothing here yet.')
    expect(out).not.toContain('data-column=')
    expect(out).not.toMatch(/<button[^>]*aria-pressed="true"[^>]*>Idea <span[^>]*>0<\/span>/)
  })

  it('starts the Idea stage with the capture line (spec §4.3)', () => {
    expect(page()).toMatch(/<form[^>]*>.*<input[^>]*aria-label="Add an idea…"[^>]*placeholder="Add an idea…"/)
  })

  it('is a page of its own between Plan and Posts', () => {
    const app = fs.readFileSync(new URL('../ContentApp.tsx', import.meta.url), 'utf8')
    expect(app).toContain('<Route path="ideas" element={<IdeasPage />} />')
    const shell = fs.readFileSync(new URL('../ContentShell.tsx', import.meta.url), 'utf8')
    expect(shell).toMatch(/to: '\/content', end: true[^\n]*\n\s*\{ to: '\/content\/ideas', end: false, icon: Lightbulb, label: t\('content\.nav\.ideas', 'Ideas'\) \},\n\s*\{ to: '\/content\/posts'/)
  })
})
