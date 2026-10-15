import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContentShortcuts } from './ContentShortcuts'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key, i18n: { language: 'en' } }),
}))

describe('ContentShortcuts', () => {
  it('lists the keys for every page, then the Plan\'s own', () => {
    const html = renderToStaticMarkup(<ContentShortcuts open onClose={() => {}} modKey="Ctrl" />)
    for (const words of ['Find', 'Ctrl K', 'New post', 'This list', 'On the plan', 'This week', 'Week, month, list', 'Shift ←', 'Close the panel']) {
      expect(html).toContain(words)
    }
    expect(renderToStaticMarkup(<ContentShortcuts open={false} onClose={() => {}} modKey="Ctrl" />)).toBe('')
  })
})
