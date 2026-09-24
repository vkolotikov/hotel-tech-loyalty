import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Claim } from './Claim'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = typeof fallback === 'object' ? fallback : opts
      let text = typeof fallback === 'string' ? fallback : k
      for (const [key, v] of Object.entries(vars ?? {})) text = text.replace(`{{${key}}}`, String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../stores/authStore', () => ({ useAuthStore: (sel: (s: { setAuth: () => void }) => unknown) => sel({ setAuth: () => {} }) }))
vi.mock('../../lib/api', () => ({ api: { get: () => new Promise(() => {}), post: () => new Promise(() => {}) } }))
vi.mock('../i18n', () => ({ registerPortalLocales: () => {} }))

function render() {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/portal/claim']}><Claim /></MemoryRouter></QueryClientProvider>,
  )
}

describe('Claim', () => {
  it('offers "I already have a code" alongside sending one, on the email step', () => {
    const html = render()
    expect(html).toContain('Send me a code')
    expect(html).toContain('I already have a code')
  })

  it('does not show the code step yet, so the code-step wording is absent', () => {
    const html = render()
    expect(html).not.toContain('Enter the code from your email')
    expect(html).not.toContain("We've sent a 6-digit code")
  })
})
