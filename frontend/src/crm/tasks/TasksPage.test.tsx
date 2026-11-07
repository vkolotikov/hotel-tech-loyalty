import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import { tasksQuery, type Task } from './taskLogic'
import { TasksPage } from './TasksPage'

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

const boot: Bootstrap = {
  name: 'HexaTech CRM',
  organization: { id: 7, name: 'Villa Riga', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', today: '2026-11-07', currency: 'EUR' },
  features: { chatbot: true, engagement: true, admin_ai: false },
  ai: { status: 'under', percent: 10 },
  staff: { id: 3, name: 'Anna', role: 'staff', can: { manage_bot: false, manage_widget: false, manage_pipelines: false, manage_canned: false, manage_team: false, delete_records: true } },
  widget: null,
  counts: { chats_waiting: 0, leads_new: 0, tasks_due: 0 },
  setup: { done: 6, total: 6, complete: true },
}
const task = (id: number, title: string, due_at: string | null, extra: Partial<Task> = {}): Task => ({
  id, type: 'call', title, description: null, due_at, completed_at: null, outcome: null, inquiry_id: null, guest_id: null,
  assigned_to: 3, assignee: { id: 3, name: 'Anna' }, ...extra,
})

function render(at: string, tasks: Task[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  for (const who of ['mine', 'all'] as const) {
    qc.setQueryData(['crm', 'tasks', 'list', tasksQuery({ tab: 'today', who, page: 1 }, 3)], { data: tasks, meta: { current_page: 1, last_page: 1, total: tasks.length } })
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <CrmContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes><Route path="/crm/tasks" element={<TasksPage />} /></Routes>
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const TASKS = [
  task(1, 'Call Ada about May', '2026-11-07T12:00:00.000000Z', { inquiry_id: 41 }), // 14:00 in Riga, today
  task(2, 'Send the offer', '2026-11-05T08:00:00Z'), // overdue
  task(3, 'Visit on Monday', '2026-11-09T07:30:00Z'), // upcoming
]

describe('Tasks', () => {
  it('opens on today\'s tasks, shown on the venue\'s clock, with each tab\'s count', () => {
    const html = render('/crm/tasks', TASKS)
    expect(html).toContain('Call Ada about May')
    // Round 2: a due time today reads "Today, 14:00" (the venue's clock), in today's amber.
    expect(html).toContain('Today, 14:00')
    expect(html).toContain('href="/crm/leads/41"')
    expect(html).not.toContain('Send the offer')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toMatch(/Overdue<span[^>]*>1<\/span>/)
    expect(html).toContain('Mark done: Call Ada about May')
  })

  it('groups the upcoming ones by the venue\'s day', () => {
    const html = render('/crm/tasks?tab=upcoming', TASKS)
    expect(html).toContain('Visit on Monday')
    expect(html).toMatch(/Mon,? (9 Nov|Nov 9)/)
    expect(html).not.toContain('Call Ada about May')
  })

  it('shows every open task by the venue\'s day under "All open", overdue first, with clear due states', () => {
    const html = render('/crm/tasks?tab=open', TASKS)
    expect(html.indexOf('Send the offer')).toBeLessThan(html.indexOf('Call Ada about May'))
    expect(html.indexOf('Call Ada about May')).toBeLessThan(html.indexOf('Visit on Monday'))
    expect(html).toMatch(/Today, Sat,? (7 Nov|Nov 7)/)
    expect(html).toMatch(/Overdue since Thu,? (5 Nov|Nov 5), 10:00/)
    expect(html).toContain('More for: Send the offer')
    expect(html).toContain('href="/crm/tasks?tab=overdue"')
  })

  it('narrows the list to one type and keeps whose tasks in the tiles\' links', () => {
    const html = render('/crm/tasks?who=all&type=email', TASKS)
    expect(html).toContain('No task matches')
    expect(html).toContain('href="/crm/tasks?who=all&amp;type=email&amp;tab=overdue"')
  })
})
