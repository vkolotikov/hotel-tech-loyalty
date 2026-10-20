import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key, i18n: { language: 'en-GB' } }),
}))

import type { PromotionRun } from '../lib/types'
import { PromotingLine } from './PromotingLine'

const running: PromotionRun = { status: 'running', batch: 'b', created_count: 0, wanted_count: 4, finished_at: null, pages: [] }

describe('the Plan hears a promotion (spec 2026-10-20 §5)', () => {
  it('shows a line while the AI writes promotion posts, and nothing otherwise', () => {
    expect(renderToStaticMarkup(<PromotingLine run={running} />)).toContain('The AI is writing promotion posts…')
    expect(renderToStaticMarkup(<PromotingLine run={{ status: 'idle' }} />)).toBe('')
    expect(renderToStaticMarkup(<PromotingLine run={undefined} />)).toBe('')
  })
})
