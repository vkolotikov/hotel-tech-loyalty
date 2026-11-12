import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import { TaskForm } from './TaskForm'
import type { Task } from './taskLogic'

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
  venue: { timezone: 'Europe/Riga', today: '2026-11-04', currency: 'EUR' },
  features: { chatbot: true, engagement: true, ai_capture: true },
  ai: { status: 'under', percent: 10 },
  staff: { id: 3, name: 'Anna', role: 'staff', can: { manage_bot: false, manage_widget: false, manage_pipelines: false, manage_canned: false, manage_team: false, delete_records: true } },
  widget: null,
  counts: { chats_waiting: 0, leads_new: 0, tasks_due: 0 },
  setup: { done: 6, total: 6, complete: true },
}

function render(task: Task | null, extra: { leadName?: string; inquiryId?: number } = {}, fields: unknown[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  qc.setQueryData(['crm', 'tasks', 'team'], [{ id: 3, name: 'Anna' }, { id: 4, name: 'Ben' }])
  qc.setQueryData(['crm', 'tasks', 'custom-fields'], fields)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CrmContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <TaskForm task={task} onClose={() => {}} {...extra} />
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the task form (owner 2026-11-09: in steps, with the type grid)', () => {
  it('shows the four steps, the type grid in its groups and the day choices', () => {
    const html = render(null)
    for (const text of ['What', 'When', 'Who and for which lead', 'Notes', 'Get in touch', 'Meet', 'Close the sale', 'Other', 'Call', 'WhatsApp', 'Send a proposal', 'Today', 'Tomorrow', 'In 2 days', 'Next Monday', 'Any time', 'Morning', 'Afternoon', 'Evening']) {
      expect(html).toContain(text)
    }
    // A new task is a follow-up, normal priority, no day yet: the time, the length and the repeat wait for a day.
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>(?:(?!<\/button>).)*Follow up/)
    expect(html).toContain('Follow up</span><span aria-hidden="true">·</span><span>No day yet')
    expect(html).toContain('Pick a day to choose a time.')
    expect(html).toContain('Pick a start time to choose how long.')
    expect(html.match(/<fieldset disabled=""/g)?.length).toBe(3)
  })

  it('suggests the title from the type and the lead, until the person writes one', () => {
    const html = render(null, { leadName: 'Ada Lovelace', inquiryId: 12 })
    expect(html).toContain('placeholder="Follow up · Ada Lovelace"')
    expect(html).toContain('Leave it empty to use “Follow up · Ada Lovelace”.')
    expect(html).toContain('href="/crm/leads/12"')
  })

  it('opens a stored task with its plan, on the venue\'s clock', () => {
    const task: Task = {
      id: 9, type: 'call', title: 'Call Ada', description: null, due_at: '2026-11-05T07:30:00.000000Z', completed_at: null, outcome: null,
      inquiry_id: null, guest_id: null, assigned_to: 4, priority: 'high', duration_minutes: 45, recurring_rule: { freq: 'weekly' },
    }
    const html = render(task)
    expect(html).toContain('Change the task')
    // Thursday 5 November, 09:30 in Riga (07:30 UTC), until 10:15, every week, high.
    expect(html).toContain('aria-pressed="true" class="min-h-9 rounded-lg border text-sm font-medium tabular-nums border-transparent bg-a-accent text-a-accent-ink">09:30')
    expect(html).toContain('Ends at 10:15')
    expect(html).toMatch(/Every week<\/span>/)
    expect(html).toContain('font-medium text-a-danger">High')
    expect(html.match(/<fieldset disabled=""/g)).toBeNull()
  })

  it('shows the organisation\'s own task fields with a stored task\'s values, and none when it has none (round 5)', () => {
    const fields = [
      { id: 1, entity: 'task', key: 'room', label: 'Room', type: 'text', config: null, help_text: null, required: true, is_active: true, sort_order: 1 },
      { id: 2, entity: 'task', key: 'channel', label: 'Channel', type: 'select', config: { options: ['Phone', 'Visit'] }, help_text: null, required: false, is_active: true, sort_order: 2 },
      { id: 3, entity: 'task', key: 'old', label: 'Old field', type: 'text', config: null, help_text: null, required: false, is_active: false, sort_order: 3 },
    ]
    const task: Task = {
      id: 9, type: 'call', title: 'Call Ada', description: null, due_at: null, completed_at: null, outcome: null,
      inquiry_id: null, guest_id: null, assigned_to: 3, custom_data: { room: 'Suite 4', priority: 'high' },
    }
    const html = render(task, {}, fields)
    expect(html).toContain('More')
    expect(html).toContain('Room (needed)')
    expect(html).toContain('value="Suite 4"')
    expect(html).toContain('<option value="Visit">Visit</option>')
    expect(html).not.toContain('Old field')
    expect(render(task)).not.toContain('Room (needed)')
  })
})
