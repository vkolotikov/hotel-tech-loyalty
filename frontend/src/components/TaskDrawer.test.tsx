import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// t(key, fallback) and t(key, { defaultValue, …vars }) both answer the English default with its variables filled in.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, a?: string | Record<string, unknown>) => {
      const text = typeof a === 'string' ? a : String(a?.defaultValue ?? _key)
      const vars = typeof a === 'object' && a ? a : {}
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars as Record<string, unknown>)[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../lib/api', () => ({ api: { get: () => new Promise(() => {}) } }))
vi.mock('react-hot-toast', () => ({ default: { success: () => {}, error: () => {} } }))
vi.mock('./CustomFields', () => ({ CustomFieldsForm: () => null }))

const { TaskDrawer } = await import('./TaskDrawer')

function render(task: Parameters<typeof TaskDrawer>[0]['task'], defaultInquiryId?: number) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['task-drawer', 'team'], [{ id: 3, name: 'Anna' }, { id: 4, name: 'Ben' }])
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TaskDrawer task={task} defaultInquiryId={defaultInquiryId} onClose={() => {}} onSaved={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the full admin\'s task drawer (redesigned 2026-11-09, the same steps as HexaTech CRM\'s form)', () => {
  it('is in four steps with the type grid in its groups, and asks for a day before a time, a length or a repeat', () => {
    const html = render(null, 12)
    for (const text of ['New task', 'What', 'When', 'Who and for which lead', 'Notes', 'Get in touch', 'Meet', 'Close the sale', 'WhatsApp', 'Send proposal', 'Discovery', 'Today', 'In 2 days', 'Next Monday', 'No date', 'Any time', 'Morning', 'Who does it', 'Ben', 'Open inquiry #12 →']) {
      expect(html).toContain(text)
    }
    expect(html).toContain('Pick a day to choose a time.')
    expect(html).toContain('Pick a start time to choose how long.')
    expect(html).toContain('Pick a day to repeat it.')
    expect(html.match(/<fieldset disabled=""/g)?.length).toBe(3)
    // The title follows the type until the person writes one; a new task is a follow-up.
    expect(html).toContain('placeholder="Follow-up"')
    expect(html).toContain('Leave it empty to use “Follow-up”.')
  })

  it('opens a stored task with its own priority, length and repeat (no longer read from custom_data)', () => {
    const local = new Date(2026, 10, 5, 9, 30) // Thursday 5 November, 09:30 on the person's clock.
    const html = render({
      id: 9, type: 'call', title: 'Call Ada', description: null, due_at: local.toISOString(), inquiry_id: null,
      priority: 'high', duration_minutes: 45, recurring_rule: { freq: 'weekly' }, custom_data: { priority: 'low' },
    })
    expect(html).toContain('Edit task')
    expect(html).toContain('aria-pressed="true" class="px-1.5 py-1.5 rounded text-xs font-medium tabular-nums transition bg-primary-600 text-on-primary">09:30')
    expect(html).toContain('Ends at 10:15')
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>Every week/)
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>High/)
    expect(html.match(/<fieldset disabled=""/g)).toBeNull()
    expect(html).toContain('Not linked to an inquiry.')
  })
})
