import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BookNotice } from './BookNotice'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k, i18n: { language: 'en' } }),
}))

describe('BookNotice', () => {
  it('renders the matching sentence for a known code, as a warning', () => {
    const html = renderToStaticMarkup(<BookNotice code="slot_taken" />)
    expect(html).toContain('That time was just taken. Please pick another.')
    expect(html).toContain('role="alert"')
  })

  it('can take focus from script (Book moves focus to it after a bounce) without joining the tab order', () => {
    const html = renderToStaticMarkup(<BookNotice code="slot_taken" />)
    expect(html).toMatch(/<div[^>]*role="alert"[^>]*tabindex="-1"|<div[^>]*tabindex="-1"[^>]*role="alert"/)
  })

  it('renders the price-changed sentence for payment_mismatch', () => {
    expect(renderToStaticMarkup(<BookNotice code="payment_mismatch" />)).toContain('The price changed. Please review and pay again.')
  })

  it('falls back to the generic sentence for a code the bundle does not name', () => {
    expect(renderToStaticMarkup(<BookNotice code="something_unmapped" />)).toContain('Something went wrong. Please try again.')
  })

  it('renders nothing at all when there is no code', () => {
    expect(renderToStaticMarkup(<BookNotice code={null} />)).toBe('')
  })
})
