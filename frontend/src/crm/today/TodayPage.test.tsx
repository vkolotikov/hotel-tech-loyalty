import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap, SetupProgress, Today } from '../lib/types'
import { StartPage } from '../start/StartPage'
import { nextStep, progressShare } from '../start/startLogic'
import { TodayPage } from './TodayPage'
import { firstName, greetingOf, hasMore, longDay, needsNow, scheduleOf, taskTarget, venueClock } from './todayLogic'

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

const ZONE = 'Europe/Riga'

const boot = (setup: Bootstrap['setup'] = { done: 6, total: 6, complete: true }): Bootstrap => ({
  name: 'HexaTech CRM',
  organization: { id: 7, name: 'Villa Riga', industry: 'hotel' },
  accent: null,
  venue: { timezone: ZONE, today: '2026-11-07', currency: 'EUR' },
  features: { chatbot: true, engagement: true },
  ai: { status: 'under', percent: 10 },
  staff: { id: 3, name: 'Anna Berzina', role: 'staff', can: { manage_bot: false, manage_widget: false, manage_pipelines: false, manage_canned: false, manage_team: false, delete_records: true } },
  widget: null,
  counts: { chats_waiting: 2, leads_new: 1, tasks_due: 2 },
  setup,
})

const today: Today = {
  today: '2026-11-07',
  chats: {
    waiting: 3, open: 5, unassigned: 1,
    list: [
      { id: 12, name: 'Marta Ozola', email: null, channel: 'widget', intent: null, assigned_to: null, last_at: '2026-11-07T09:00:00+00:00', excerpt: 'Do you have a room on Friday?' },
      { id: 13, name: null, email: 'jan@example.test', channel: 'widget', intent: null, assigned_to: { id: 3, name: 'Anna' }, last_at: '2026-11-07T08:00:00+00:00', excerpt: null },
    ],
  },
  leads: {
    open: 9, new: 1, due_today: 1, overdue: 1,
    follow_ups: [
      { id: 41, name: 'Bo Berg', company: 'Berg AB', status: 'New', value: 1200, task_type: 'call', task_note: 'Call about the offer', due: '2026-11-03', overdue: true },
      { id: 42, name: 'Ilze', company: null, status: 'Proposal', value: null, task_type: 'email', task_note: null, due: '2026-11-07', overdue: false },
    ],
    new_list: [{ id: 50, name: 'Peter', company: null, status: 'New', source: 'Website', value: 300, created_at: '2026-11-07T07:00:00+00:00' }],
  },
  tasks: {
    due_today: 2, overdue: 1,
    list: [
      { id: 7, type: 'call', title: 'Call the florist', due_at: '2026-11-05T08:00:00+00:00', overdue: true, inquiry_id: null, guest_id: null, contact: null },
      { id: 8, type: 'meeting', title: 'Show the hall', due_at: '2026-11-07T12:30:00+00:00', overdue: false, inquiry_id: 41, guest_id: null, contact: 'Bo Berg' },
      { id: 9, type: 'todo', title: 'Send the menu', due_at: '2026-11-06T22:00:00+00:00', overdue: false, inquiry_id: null, guest_id: null, contact: null },
    ],
  },
  pipeline: { open_count: 9, open_value: 25000 },
  week: { conversations: 40, ai_resolved: 18, leads_from_chat: 6 },
}

function render(element: ReactElement, seed: (qc: QueryClient) => void, value: Bootstrap = boot()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  seed(qc)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/crm']}>
        <CrmContext.Provider value={{ data: value, isLoading: false, isError: false, error: null, refetch: () => {} }}>{element}</CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Today’s decisions', () => {
  it('greets by the venue’s hour and the first name', () => {
    expect(greetingOf(5)).toBe('morning')
    expect(greetingOf(11)).toBe('morning')
    expect(greetingOf(12)).toBe('afternoon')
    expect(greetingOf(17)).toBe('afternoon')
    expect(greetingOf(18)).toBe('evening')
    expect(greetingOf(2)).toBe('evening')
    expect(firstName('  Anna Berzina ')).toBe('Anna')
    expect(firstName(null)).toBe('')
  })

  it('reads the venue’s clock in its zone, and writes a day without turning it into an instant', () => {
    expect(venueClock(new Date('2026-11-07T22:30:00Z'), ZONE)).toEqual({ date: '2026-11-08', time: '00:30', hour: 0 })
    expect(venueClock(new Date('2026-11-07T09:05:00Z'), 'Nowhere/Else').time).toMatch(/^\d{2}:\d{2}$/)
    expect(longDay('2026-11-07', 'en-GB')).toBe('Saturday 7 November')
    expect(longDay('nonsense', 'en-GB')).toBe('')
  })

  it('puts waiting chats first (longest waiting first), then overdue follow-ups, then overdue tasks', () => {
    expect(needsNow(today).map(i => i.key)).toEqual(['chat-13', 'chat-12', 'lead-41', 'task-7'])
  })

  it('schedules today’s tasks by the venue’s clock, then what is due during the day', () => {
    const { timed, allDay } = scheduleOf(today, ZONE)
    expect(timed.map(i => [i.key, i.kind === 'task' ? i.time : null])).toEqual([['task-8', '14:30']])
    // 22:00 UTC is midnight in Riga: a task set for the day, without a time.
    expect(allDay.map(i => i.key)).toEqual(['task-9', 'lead-42'])
  })

  it('opens a task’s lead when it has one, and says when the server holds more than its list', () => {
    expect(taskTarget({ inquiry_id: 41 })).toBe('/crm/leads/41')
    expect(taskTarget({ inquiry_id: null })).toBe('/crm/tasks')
    expect(hasMore(3, 2)).toBe(true)
    expect(hasMore(2, 2)).toBe(false)
  })

})

describe('Today, rendered', () => {
  it('greets, shows the figures, what needs you now, the schedule, the new leads and the week', () => {
    const html = render(<TodayPage />, qc => qc.setQueryData(['crm', 'today'], today))
    expect(html).toMatch(/Good (morning|afternoon|evening), Anna/)
    expect(html).toContain('Saturday 7 November')
    expect(html).toContain('Waiting for a reply')
    expect(html).toContain('5 open chats · 1 with nobody')
    expect(html).toContain('Needs you now')
    expect(html.indexOf('jan@example.test')).toBeLessThan(html.indexOf('Marta Ozola'))
    expect(html.indexOf('Marta Ozola')).toBeLessThan(html.indexOf('Call about the offer'))
    expect(html).toContain('href="/crm/inbox?c=12"')
    expect(html).toContain('All 3 waiting chats')
    expect(html).toContain('Today’s schedule')
    expect(html).toContain('14:30')
    expect(html).toContain('During the day')
    expect(html).toContain('href="/crm/leads/50"')
    expect(html).toContain('45 %')
    expect(html).toContain('Mark “Bo Berg · Berg AB” done')
    expect(html).toContain('Mark “Call the florist” done')
    expect(html).toContain('Mark “Show the hall” done')
    expect(html).not.toContain('Finish setting up')
  })

  it('shows the setup banner only while setup is incomplete', () => {
    const html = render(<TodayPage />, qc => qc.setQueryData(['crm', 'today'], today), boot({ done: 2, total: 6, complete: false }))
    expect(html).toContain('Finish setting up HexaTech CRM')
    expect(html).toContain('href="/crm/start"')
  })

  it('says all is clear when nothing waits', () => {
    const quiet: Today = { ...today, chats: { ...today.chats, waiting: 0, list: [] }, leads: { ...today.leads, overdue: 0, follow_ups: [] }, tasks: { due_today: 0, overdue: 0, list: [] } }
    const html = render(<TodayPage />, qc => qc.setQueryData(['crm', 'today'], quiet))
    expect(html).toContain('All clear')
    expect(html).toContain('Nothing scheduled for today')
  })
})

describe('Get started', () => {
  const progress: SetupProgress = {
    steps: [
      { key: 'widget', done: true }, { key: 'assistant', done: true }, { key: 'knowledge', done: false },
      { key: 'reply', done: false }, { key: 'pipeline', done: true }, { key: 'team', done: false },
    ],
    done: 3, total: 6, complete: false,
  }

  it('finds the next step and the share done', () => {
    expect(nextStep(progress.steps)?.key).toBe('knowledge')
    expect(nextStep(progress.steps.map(s => ({ ...s, done: true })))).toBeNull()
    expect(progressShare(3, 6)).toBe(50)
    expect(progressShare(0, 0)).toBe(0)
    expect(progressShare(7, 6)).toBe(100)
  })

  it('shows the checklist with its progress and each step’s action as a button', () => {
    const html = render(<StartPage />, qc => qc.setQueryData(['crm', 'start'], progress))
    expect(html).toContain('50 %')
    expect(html).toContain('3 of 6 done')
    expect(html).toContain('aria-valuenow="3"')
    expect(html).toContain('Next: Teach it your answers')
    expect(html).toContain('Up next')
    expect(html).toContain('href="/crm/assistant?tab=knowledge"')
    expect(html).toContain('Add answers')
    expect(html).toContain('Invite someone')
    expect(html).toContain('href="/account/team"')
    expect((html.match(/>Done</g) ?? []).length).toBe(3)
  })

  it('says when everything is set up', () => {
    const html = render(<StartPage />, qc => qc.setQueryData(['crm', 'start'], { ...progress, steps: progress.steps.map(s => ({ ...s, done: true })), done: 6, complete: true }))
    expect(html).toContain('Everything is set up')
    expect(html).toContain('Go to Today')
  })
})
