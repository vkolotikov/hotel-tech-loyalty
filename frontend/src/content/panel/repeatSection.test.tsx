import fs from 'node:fs'
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
import type { Bootstrap, PostDetail, Series } from '../lib/types'
import { RepeatSection } from './RepeatSection'

const boot = { brand: { id: 3, name: 'Lumière Salon' }, venue: { today: '2026-10-07' }, ai: { status: 'under', percent: 10 } } as unknown as Bootstrap
const post = { id: 5, platform: 'instagram', scheduled_date: '2026-10-07', status: 'draft', series_id: null, series: null } as unknown as PostDetail
const draw = (p: PostDetail, series: Series | null = null, ai = 'under') => renderToStaticMarkup(
  <ContentContext.Provider value={{ data: { ...boot, ai: { status: ai, percent: 10 } } as Bootstrap, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
    <RepeatSection post={p} series={series} dirty={false} onPost={() => {}} onGone={() => {}} />
  </ContentContext.Provider>,
)

// Spec 2026-10-15 §8.
describe('RepeatSection', () => {
  it('offers every week, two weeks or month until a date four weeks on, says how many copies, and the AI rewrite', () => {
    const out = draw(post)
    expect(out).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Every week<\/button>/)
    expect(out).toContain('Every 2 weeks')
    expect(out).toContain('Every month')
    expect(out).toContain('value="2026-11-04"')
    expect(out).toContain('Copies: 4')
    expect(out).toContain('Let the AI rewrite each copy')
  })

  it('asks a post without a day for one first, and keeps the AI rewrite off while the budget is used up', () => {
    expect(draw({ ...post, scheduled_date: null })).toContain('Give the post a day to repeat it.')
    expect(draw(post, null, 'over')).toMatch(/<input type="checkbox"[^>]*disabled=""/)
  })

  it('says how a series runs, while the AI rewords it, and offers Stop repeating', () => {
    const series: Series = { id: 5, every: 'week', until: '2026-10-28', more: 3, removable: 3, rewriting: true }
    const out = draw({ ...post, series_id: 5, series }, series)
    expect(out).toContain('Repeats every week until 28 October 2026 · 3 more')
    expect(out).toContain('The AI is rewording the copies…')
    expect(out).toContain('Stop repeating')
  })

  // Final review: the button vanished while the question was asked, and the keyboard focus with it.
  it('keeps Stop repeating on screen while it asks, saying whether the question is open', () => {
    const series: Series = { id: 5, every: 'week', until: '2026-10-28', more: 3, removable: 3, rewriting: false }
    expect(draw({ ...post, series_id: 5, series }, series)).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Stop repeating<\/button>/)
    const source = fs.readFileSync(new URL('./RepeatSection.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain('{!asking &&')
  })

  it('reads the end date and the AI choice through untilFor and asksAi, the box unticked while the budget is used up', () => {
    const source = fs.readFileSync(new URL('./RepeatSection.tsx', import.meta.url), 'utf8')
    expect(source).toContain('untilFor(picked, from, today)')
    expect(source.match(/rewrite\b/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    expect(source).toContain('const rewrite = asksAi(ai, boot.ai.status)')
    expect(draw(post, null, 'over')).not.toMatch(/<input type="checkbox"[^>]*checked=""/)
  })
})
