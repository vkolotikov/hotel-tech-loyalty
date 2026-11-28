import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { AssistantProposal } from '../lib/types'
import { PlanProgress, PlanSummaryBar, Unplaced } from '../plan/PlanParts'
import { CountUp, LoadBar, Ring } from '../ui/motion'
import { Answer, type Applying } from './Answer'
import type { ChatMessage } from './assistantLogic'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const give: AssistantProposal = { id: 'p1', kind: 'assign', task_id: 7, title: 'Fix lamp', person: { key: 'u2', name: 'Boris' }, date: '2026-11-29', start_time: '10:00', request: { method: 'patch', path: 'planner/tasks/7/move', body: {} } }
const add: AssistantProposal = { id: 'p2', kind: 'create', title: 'Check minibars', person: { key: 'u2', name: 'Boris' }, date: null, minutes: 30, request: { method: 'post', path: 'planner/tasks', body: {} } }
const message = (extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'a1', role: 'assistant', content: 'Here is the plan:\n- **Boris** takes the lamp.', proposals: [give, add], used: ['get_pool', 'get_people', 'propose_changes'], ...extra,
})

function render(m: ChatMessage, opts: { last?: boolean; idle?: boolean; applying?: Applying | null } = {}) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <Answer message={m} fresh={false} last={opts.last ?? true} idle={opts.idle ?? true} applying={opts.applying ?? null} onApply={() => {}} onAsk={() => {}} />
    </MemoryRouter>,
  )
}

describe('an answer of the assistant', () => {
  it('shows the whole text of an older answer, what it looked at, its changes and what to ask next', () => {
    const html = render(message())
    expect(html).toContain('Boris takes the lamp.')
    expect(html).not.toContain('**')
    expect(html).not.toContain('time-caret')
    expect(html).toContain('Looked at')
    expect(html).toContain('the pool')
    expect(html).toContain('the team')
    expect(html).toContain('Give “Fix lamp” to Boris')
    expect(html).toContain('Apply all (2)')
    expect(html).toContain('Why these?')
    expect(html).toContain('Another way')
  })

  it('marks what was applied with the way to its day, and what was refused', () => {
    const html = render(message({ outcome: { p1: 'done', p2: 'failed' } }))
    expect(html).toContain('Applied')
    expect(html).toContain('href="/time/plan?date=2026-11-29"')
    expect(html).toContain('Not applied')
    expect(html).not.toContain('Apply all')
  })

  it('says how far an apply has got, and offers nothing to press meanwhile', () => {
    const html = render(message(), { idle: false, applying: { messageId: 'a1', ids: ['p1', 'p2'], at: 'p1' } })
    expect(html).toContain('Applying 1 of 2…')
    expect(html).toContain('Applying…')
    expect(html).not.toContain('Why these?')
  })

  it('offers follow-ups only under the latest answer', () => {
    expect(render(message({ proposals: [] }), { last: true })).toContain('Make it changes I can apply')
    expect(render(message(), { last: false })).not.toContain('Why these?')
  })
})

describe('a plan’s parts', () => {
  it('shows what a plan involves while it is made', () => {
    const html = renderToStaticMarkup(<PlanProgress kind="week" ai />)
    expect(html).toContain('The AI is planning…')
    expect(html).toContain('Timing each day')
    expect(html).toContain('role="status"')
    expect(renderToStaticMarkup(<PlanProgress kind="day" ai={false} />)).toContain('Giving each task its time')
  })

  it('sums the plan up, with all and none', () => {
    const html = renderToStaticMarkup(<PlanSummaryBar summary={{ tasks: 3, people: 2, days: 4, unplaced: 2 }} ticked={3} onAll={() => {}} onNone={() => {}} />)
    expect(html).toContain('Tasks: 3')
    expect(html).toContain('People: 2')
    expect(html).toContain('Days: 4')
    expect(html).toContain('Not planned: 2')
    // Everything is ticked: "All" has nothing to do.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>All<\/button>/)
  })

  it('folds a long list of what could not be placed', () => {
    const items = [1, 2, 3, 4, 5, 6].map(n => ({ task_id: n, title: `Task ${n}`, reason: 'no_room' }))
    const html = renderToStaticMarkup(<Unplaced items={items} week />)
    expect(html).toContain('Task 4')
    expect(html).not.toContain('Task 5')
    expect(html).toContain('Show all 6')
    expect(html).toContain('No free time left on those days.')
    expect(renderToStaticMarkup(<Unplaced items={[]} />)).toBe('')
  })
})

describe('the pieces that move', () => {
  it('draws a gauge by the part still empty, and says its value', () => {
    const html = renderToStaticMarkup(<Ring value={58} label="58 % ready">58%</Ring>)
    expect(html).toContain('aria-label="58 % ready"')
    expect(html).toContain('stroke-dashoffset="42"')
  })

  it('always has the final figure as its text', () => {
    expect(renderToStaticMarkup(<CountUp value={146} />)).toBe('<span>146</span>')
    expect(renderToStaticMarkup(<CountUp value={88} format={n => `${n} %`} />)).toBe('<span>88 %</span>')
  })

  it('colours a load by its state and never leaves its track', () => {
    const over = renderToStaticMarkup(<LoadBar pct={140} />)
    expect(over).toContain('time-load-over')
    expect(over).toContain('width:100%')
    expect(renderToStaticMarkup(<LoadBar pct={40} />)).toContain('time-load-ok')
  })
})
