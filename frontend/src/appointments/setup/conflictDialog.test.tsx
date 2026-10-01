import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { Impact } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const { ConflictDialog } = await import('./ConflictDialog')
const { FailureNotice } = await import('./FailureNotice')

const impact: Impact = {
  affected: [{ id: 41, start: '2026-10-06T10:00', end: '2026-10-06T10:45', client: 'Sophie Williams', service: 'Deep Tissue Massage', team_member: 'Mara Ilves' }],
  total: 3,
}

const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

describe('ConflictDialog', () => {
  it('says how many, lists each with a way to open it, and counts the rest', () => {
    const html = render(<ConflictDialog impact={impact} locale="en-GB" onConfirm={() => {}} onCancel={() => {}} />)
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('Appointments affected: 3')
    expect(html).toContain('10:00')
    expect(html).toContain('Sophie Williams · Deep Tissue Massage · Mara Ilves')
    expect(html).toContain('href="/appointments?open=41&amp;date=2026-10-06"')
    expect(html).toContain('…and 2 more.')
    expect(html).toContain('Save anyway')
    expect(html).toContain('Back')
  })
})

describe('FailureNotice', () => {
  it('lists the server\'s field messages', () => {
    const html = render(<FailureNotice failure={{ status: 422, code: 'unknown', message: '', fields: { name: ['The name field is required.'] } }} />)
    expect(html).toContain('Please check what you entered:')
    expect(html).toContain('The name field is required.')
  })

  it('says when the person is not allowed, and nothing when there is no failure', () => {
    expect(render(<FailureNotice failure={{ status: 403, code: 'not_allowed', message: 'Only an owner or a manager can change this.' }} />)).toContain('Only an owner or a manager can change this.')
    expect(render(<FailureNotice failure={null} />)).toBe('')
  })
})
