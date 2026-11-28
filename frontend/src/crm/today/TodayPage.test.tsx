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
import {
  activityTarget, chatRows, figuresOf, firstName, followUpRows, greetingOf, hasMore, needCounts, needTabOf, nextActivityPage, taskRows, venueClock,
} from './todayLogic'
import { activityIcon, activityLabel } from './todayWords'

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
  features: { chatbot: true, engagement: true, ai_capture: true },
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

function render(element: ReactElement, seed: (qc: QueryClient) => void, value: Bootstrap = boot(), at = '/crm') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  seed(qc)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
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

  it('reads the venue’s clock in its zone', () => {
    expect(venueClock(new Date('2026-11-07T22:30:00Z'), ZONE)).toEqual({ date: '2026-11-08', time: '00:30', hour: 0 })
    expect(venueClock(new Date('2026-11-07T09:05:00Z'), 'Nowhere/Else').time).toMatch(/^\d{2}:\d{2}$/)
  })

  it('shows only the figures that are not nought, never a row of zeros', () => {
    expect(figuresOf(today)).toEqual(['open_chats', 'new_leads', 'pipeline'])
    const quiet = { ...today, chats: { ...today.chats, open: 0 }, leads: { ...today.leads, new: 0 }, pipeline: { open_count: 0, open_value: 0 } }
    expect(figuresOf(quiet)).toEqual([])
    expect(figuresOf({ ...quiet, pipeline: { open_count: 2, open_value: 0 } })).toEqual(['pipeline'])
  })

  it('counts each tab as the server did and opens the first with work, unless the address names one', () => {
    const counts = needCounts(today)
    expect(counts).toEqual({ chats: 3, follow_ups: 2, tasks: 3 })
    expect(needTabOf(null, counts)).toBe('chats')
    expect(needTabOf(null, { ...counts, chats: 0 })).toBe('follow_ups')
    expect(needTabOf(null, { chats: 0, follow_ups: 0, tasks: 1 })).toBe('tasks')
    expect(needTabOf(null, { chats: 0, follow_ups: 0, tasks: 0 })).toBe('chats')
    expect(needTabOf('tasks', counts)).toBe('tasks')
    expect(needTabOf('nonsense', { ...counts, chats: 0 })).toBe('follow_ups')
  })

  it('orders each tab: the chat waiting longest, overdue follow-ups oldest first, then today’s', () => {
    expect(chatRows(today).map(c => c.id)).toEqual([13, 12])
    expect(followUpRows(today).map(f => f.id)).toEqual([41, 42])
    const later = { ...today, leads: { ...today.leads, follow_ups: [today.leads.follow_ups[1], { ...today.leads.follow_ups[0], id: 40, due: '2026-11-05' }, today.leads.follow_ups[0]] } }
    expect(followUpRows(later).map(f => f.id)).toEqual([41, 40, 42])
  })

  it('orders your tasks: overdue first, then today’s by the venue’s clock, then those without a time', () => {
    // 22:00 UTC is midnight in Riga: a task set for the day, without a time.
    expect(taskRows(today, ZONE).map(r => [r.task.id, r.time])).toEqual([[7, '10:00'], [8, '14:30'], [9, null]])
  })

  it('opens a line of the team’s activity on its lead, else its contact, else its chat', () => {
    expect(activityTarget({ lead: { id: 4, name: 'Bo', company: null, status: 'New' }, contact: { id: 9, name: 'Bo' }, conversation_id: 3 })).toEqual({ kind: 'lead', id: 4 })
    expect(activityTarget({ lead: null, contact: { id: 9, name: 'Bo' }, conversation_id: 3 })).toEqual({ kind: 'contact', id: 9 })
    expect(activityTarget({ lead: null, contact: null, conversation_id: 3 })).toEqual({ kind: 'chat', id: 3 })
    expect(activityTarget({ lead: null, contact: null, conversation_id: null })).toBeNull()
    expect(nextActivityPage({ meta: { current_page: 1, last_page: 3, total: 20 } })).toBe(2)
    expect(nextActivityPage({ meta: { current_page: 3, last_page: 3, total: 20 } })).toBeUndefined()
    expect(nextActivityPage(undefined)).toBeUndefined()
    const t = ((_: string, fallback: string) => fallback) as never
    expect(activityLabel(t, 'task_completed')).toBe('Task done')
    expect(activityLabel(t, 'whatever')).toBe('Update')
    expect(activityIcon('call')).not.toBe(activityIcon('system'))
  })

  it('says when the server holds more than the rows shown', () => {
    expect(hasMore(3, 2)).toBe(true)
    expect(hasMore(2, 2)).toBe(false)
  })
})

describe('Today, rendered', () => {
  it('greets, shows the figures, the tabs with their counts, the chats waiting first, the new leads and the week', () => {
    const html = render(<TodayPage />, qc => qc.setQueryData(['crm', 'today'], today))
    expect(html).toMatch(/Good (morning|afternoon|evening), Anna/)
    expect(html).toContain('Open chats')
    expect(html).toContain('1 with nobody')
    expect(html).toContain('Needs you now')
    expect(html).toMatch(/role="tab" id="crm-need-chats" aria-selected="true"/)
    expect(html).toContain('Chats waiting')
    expect(html).toContain('Follow-ups')
    expect(html).toContain('Your tasks')
    expect(html.indexOf('jan@example.test')).toBeLessThan(html.indexOf('Marta Ozola'))
    expect(html).toContain('href="/crm/inbox?c=12"')
    expect(html).toContain('Show all 3')
    expect(html).toContain('href="/crm?lead=50"')
    expect(html).toContain('45 %')
    expect(html).toContain('Team activity')
    expect(html).not.toContain('Finish setting up')
  })

  it('opens the tab the address names: follow-ups in their lead’s panel, Done as an icon with its name', () => {
    const html = render(<TodayPage />, qc => qc.setQueryData(['crm', 'today'], today), boot(), '/crm?need=follow_ups')
    expect(html).toMatch(/id="crm-need-follow_ups" aria-selected="true"/)
    expect(html).toContain('href="/crm?need=follow_ups&amp;lead=41"')
    expect(html).toContain('aria-label="Mark “Bo Berg · Berg AB” done"')
    expect(html).toContain('title="Mark “Bo Berg · Berg AB” done"')
    expect(html.indexOf('Bo Berg')).toBeLessThan(html.indexOf('Ilze'))
  })

  it('lists your tasks as buttons that open the task, overdue first', () => {
    const html = render(<TodayPage />, qc => qc.setQueryData(['crm', 'today'], today), boot(), '/crm?need=tasks')
    expect(html).toContain('data-task-open="7"')
    expect(html).toContain('aria-label="Open the task “Call the florist”"')
    expect(html.indexOf('Call the florist')).toBeLessThan(html.indexOf('Show the hall'))
    expect(html).toContain('14:30')
    expect(html).toContain('Mark “Show the hall” done')
  })

  it('shows the setup banner only while setup is incomplete', () => {
    const html = render(<TodayPage />, qc => qc.setQueryData(['crm', 'today'], today), boot({ done: 2, total: 6, complete: false }))
    expect(html).toContain('Finish setting up HexaTech CRM')
    expect(html).toContain('2/6')
    expect(html).toContain('href="/crm/start"')
  })

  it('says all is clear when nothing waits, with no row of zeros', () => {
    const quiet: Today = {
      ...today,
      chats: { waiting: 0, open: 0, unassigned: 0, list: [] },
      leads: { ...today.leads, new: 0, new_list: [], overdue: 0, due_today: 0, follow_ups: [] },
      tasks: { due_today: 0, overdue: 0, list: [] },
      pipeline: { open_count: 0, open_value: 0 },
    }
    const html = render(<TodayPage />, qc => qc.setQueryData(['crm', 'today'], quiet))
    expect(html).toContain('Nobody is waiting')
    expect(html).not.toContain('The day at a glance')
    expect(html).toContain('No new leads today')
  })

  it('shows the team’s activity: who, what, about which lead, opening it', () => {
    const page = {
      data: [{ id: 1, type: 'call', direction: null, subject: 'Called about the plan', excerpt: null, duration_minutes: 5, occurred_at: '2026-11-07T08:00:00+00:00',
        by: { id: 3, name: 'Anna Berzina' }, lead: { id: 41, name: 'Bo Berg', company: null, status: 'New' }, contact: { id: 9, name: 'Bo Berg' }, conversation_id: null }],
      meta: { current_page: 1, last_page: 2, total: 9 },
    }
    const html = render(<TodayPage />, qc => {
      qc.setQueryData(['crm', 'today'], today)
      qc.setQueryData(['crm', 'activity'], { pages: [page], pageParams: [1] })
    })
    expect(html).toContain('Anna Berzina')
    expect(html).toContain('Bo Berg — Called about the plan')
    expect(html).toContain('href="/crm?lead=41"')
    expect(html).toContain('Show more')
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
