import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, StrategyDetail, StrategySummary } from '../lib/types'
import { NewStrategyDialog } from './StrategyActions'
import { StrategyScreen } from './StrategyScreen'

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

const bootFor = (canManage: boolean, ai = 'under', withProfile = true) => ({
  name: 'HexaTech Content', organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: { id: 3, name: 'Lumière Salon' }, brands: [], accent: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' },
  staff: { name: 'Sam', role: canManage ? 'manager' : 'staff', can_manage: canManage }, profile: withProfile ? { id: 1, setup_completed: true, readiness: 80 } : null,
  ai: { status: ai, percent: 10 }, platforms: ['instagram', 'linkedin'], statuses: ['draft'], rewrites: [],
}) as unknown as Bootstrap

const summary = (id: number, status: StrategySummary['status'], title: string): StrategySummary => ({ id, title, summary: 'For busy clients', status, created_at: '2026-10-01T09:00:00.000000Z' })
const detail = (base: StrategySummary, more: Partial<StrategyDetail> = {}): StrategyDetail => ({
  ...base, ai_output: null, pillars: [], balance: null, ...more,
})

function render(url: string, list: StrategySummary[], details: StrategyDetail[], canManage = false, ai = 'under', withProfile = true) {
  const client = new QueryClient()
  client.setQueryData(['content', 3, 'strategies'], { strategies: list })
  for (const d of details) client.setQueryData(['content', 3, 'strategy', d.id], { strategy: d })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <ContentContext.Provider value={{ data: bootFor(canManage, ai, withProfile), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <StrategyScreen />
        </ContentContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const active = summary(2, 'active', 'Autumn plan')
const older = summary(1, 'superseded', 'Summer plan')
const output = {
  title: 'Autumn plan',
  positioning_narrative: { old_way: 'Quick cuts', new_way: 'Hair health first', beliefs: ['Healthy hair lasts'], key_messages: ['Care, not speed'] },
  content_pillars: [{ name: 'Hair care', purpose: 'Build trust', frequency_weight: 40, example_topics: ['Scalp health'] }],
  content_mix: { education: 40, social_proof: 60 },
  weekly_rhythm: { monday: { role: 'proof', description: 'A before and after' } },
  platform_strategy: { instagram: { role: 'Show the work', formats: ['Reels'] } },
  risks: ['Too few photos'],
  next_actions: ['Book a photo shoot'],
}

describe('StrategyPage', () => {
  it('opens on the active strategy and reads it as a document: positioning, pillars, mix, rhythm, playbooks, risks, next actions', () => {
    const html = render('/content/strategy', [active, older], [detail(active, { ai_output: output })])
    expect(html).toContain('>Strategy<')
    expect(html).toContain('Autumn plan')
    expect(html).toContain('>Active<')
    expect(html).toContain('Hair health first')
    expect(html).toContain('Hair care')
    expect(html).toContain('Scalp health')
    expect(html).toContain('Education')
    expect(html).toContain('Proof, a case')
    expect(html).toContain('Show the work')
    expect(html).toContain('Too few photos')
    expect(html).toContain('Book a photo shoot')
  })

  it('shows a past strategy the address names', () => {
    const html = render('/content/strategy?id=1', [active, older], [detail(older, { ai_output: { title: 'Summer plan' } })])
    expect(html).toContain('Summer plan')
    expect(html).toContain('>Replaced<')
  })

  it('sets this month\'s posts per pillar against the target', () => {
    const balance = { from: '2026-10-01', to: '2026-10-31', pillars: [
      { id: 7, name: 'Hair care', target_weight: 60, posts: 1 }, { id: 8, name: 'Colour', target_weight: 40, posts: 3 },
    ] } as const
    const html = render('/content/strategy', [active], [detail(active, { balance: { ...balance, pillars: [...balance.pillars] } })])
    expect(html).toContain('Pillar balance this month')
    expect(html).toContain('3 posts · 75 % of posts · target 40 %')
  })

  it('says there is no strategy yet: to staff that the manager makes it, to managers what it gives', () => {
    expect(render('/content/strategy', [], [], false)).toContain('Your manager has not made a strategy yet.')
    expect(render('/content/strategy', [], [], true)).toContain('A strategy gives the AI its pillars, its content mix and its weekly rhythm.')
  })
})

/** The opening tag of the button whose text holds `label` (its icon may come first). */
const buttonTag = (html: string, label: string): string =>
  html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${label}`, 's'))?.[0].match(/^<button[^>]*>/)?.[0] ?? ''

describe('StrategyScreen for managers', () => {
  it('offers a new strategy, the past ones, and, on a replaced one, Make active and Archive', () => {
    const html = render('/content/strategy?id=1', [active, older], [detail(older, { ai_output: { title: 'Summer plan' } })], true)
    expect(html).toContain('New strategy')
    expect(html).toContain('aria-label="Past strategies"')
    expect(html).toMatch(/<option value="2">Autumn plan/)
    expect(html).toContain('>Make active<')
    expect(html).toContain('>Archive<')
  })

  it('offers Archive but not Make active on the active strategy', () => {
    const html = render('/content/strategy', [active], [detail(active)], true)
    expect(html).toContain('>Archive<')
    expect(html).not.toContain('>Make active<')
  })

  it('shows staff none of it', () => {
    const html = render('/content/strategy?id=1', [active, older], [detail(older)], false)
    for (const word of ['New strategy', 'Past strategies', '>Make active<', '>Archive<']) expect(html).not.toContain(word)
  })

  it('tells everyone a new strategy is being made, and lets no one start another meanwhile', () => {
    const making = { ...summary(3, 'generating', 'Generating strategy…'), created_at: new Date().toISOString() }
    const manager = render('/content/strategy', [making, active], [detail(active)], true)
    expect(manager).toContain('A new strategy is being made. It usually takes one to three minutes.')
    expect(buttonTag(manager, 'New strategy')).toMatch(/\bdisabled=""/)
    expect(render('/content/strategy', [making, active], [detail(active)], false)).toContain('A new strategy is being made.')
  })

  it('keeps New strategy closed when this month\'s AI budget is used up', () => {
    const html = render('/content/strategy', [active], [detail(active)], true, 'over')
    expect(buttonTag(html, 'New strategy')).toMatch(/\bdisabled=""/)
    expect(buttonTag(render('/content/strategy', [active], [detail(active)], true), 'New strategy')).not.toMatch(/\bdisabled=""/)
  })
})

describe('when making a strategy goes wrong', () => {
  it('says a new strategy could not be made, even while the old one stays active and on screen', () => {
    const failed = summary(3, 'failed', 'Generating strategy…')
    const html = render('/content/strategy', [failed, active], [detail(active, { ai_output: output })], true)
    expect(html).toContain('The new strategy could not be made. The current strategy is unchanged; you can try again.')
    expect(html).toContain('Autumn plan')
    expect(html).not.toContain('Generating strategy…')
    expect(html).toContain('A strategy that could not be made')
  })

  it('names the first strategy being made in the portal\'s words, not the server\'s placeholder', () => {
    const making = { ...summary(3, 'generating', 'Generating strategy…'), created_at: new Date().toISOString() }
    const html = render('/content/strategy', [making], [], true)
    expect(html).toContain('A new strategy, being made')
    expect(html).not.toContain('Generating strategy…')
  })

  // Review: the AI's text is stored as it came; an object where a list was expected crashed the page for everyone.
  it('reads an AI output in shapes it did not expect, without breaking', () => {
    const odd = {
      title: 'Odd plan', content_pillars: { a: 1 }, audience_map: [null, { name: 'Night owls' }], campaign_ideas: 'one idea',
      example_posts: [null, { hook: 'A real hook' }], engagement_strategy: { mechanics: { x: 1 } }, platform_strategy: 'text', weekly_rhythm: 'text',
    } as never
    const html = render('/content/strategy', [active], [detail(active, { ai_output: odd })])
    expect(html).toContain('Odd plan')
    expect(html).toContain('Night owls')
    expect(html).toContain('A real hook')
  })
})

describe('NewStrategyDialog', () => {
  it('says what will happen, takes optional instructions, and starts it', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ContentContext.Provider value={{ data: bootFor(true), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <NewStrategyDialog onClose={() => {}} onStarted={() => {}} />
        </ContentContext.Provider>
      </QueryClientProvider>,
    )
    expect(html).toContain('Make a new strategy')
    expect(html).toContain('the current one stays among the past strategies')
    expect(html).toContain('<textarea')
    expect(html).toMatch(/<button[^>]*>Make strategy</)
  })
})

describe('when the strategy cannot be read', () => {
  it('says so, with a way to try again', async () => {
    // A failed read is retried on mount, which a static render shows as loading: here it is the failure as it ends.
    const client = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } })
    await client.prefetchQuery({ queryKey: ['content', 3, 'strategies'], queryFn: () => Promise.reject(new Error('down')), retry: false })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/content/strategy']}>
          <ContentContext.Provider value={{ data: bootFor(false), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
            <StrategyScreen />
          </ContentContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(html).toContain('The strategy could not be loaded.')
    expect(html).toContain('>Try again<')
  })

  it('keeps New strategy closed on a brand with no profile, and says why', () => {
    const html = render('/content/strategy', [], [], true, 'under', false)
    expect(buttonTag(html, 'New strategy')).toMatch(/\bdisabled=""/)
    expect(html).toContain('Set up the brand first: the strategy is made from it.')
  })
})
