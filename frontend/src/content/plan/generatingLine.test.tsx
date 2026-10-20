import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key, i18n: { language: 'en-GB' } }),
}))

import { GeneratingLine } from './GeneratingLine'

// Generate on the queue (2026-10-20): with the dialog closed, the Plan says a run is writing.
describe('the Plan’s line while a run writes', () => {
  it('shows only while a run is running, in a live region', () => {
    expect(renderToStaticMarkup(<GeneratingLine run={{ status: 'running', started_at: 'x' }} />))
      .toMatch(/role="status"[^>]*>(?:<[^>]+>)*The AI is writing posts…/)
    expect(renderToStaticMarkup(<GeneratingLine run={{ status: 'idle' }} />)).toBe('')
    expect(renderToStaticMarkup(<GeneratingLine run={undefined} />)).toBe('')
  })
})
