import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key, i18n: { language: 'en-GB' } }),
}))

import { PromotesLine } from './PromotesLine'

describe('the panel’s Promotes line (spec 2026-10-20 §4.7)', () => {
  it('names the page and opens it in a new tab', () => {
    const html = renderToStaticMarkup(<PromotesLine page={{ id: 4, title: 'Autumn colours', url: 'https://lumiere.example/blog/autumn' }} />)
    expect(html).toContain('Promotes:')
    expect(html).toMatch(/<a href="https:\/\/lumiere.example\/blog\/autumn" target="_blank" rel="noopener noreferrer"[^>]*>Autumn colours<\/a>/)
  })
})
