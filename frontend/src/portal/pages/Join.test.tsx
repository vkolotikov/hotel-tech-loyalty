import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Join } from './Join'

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

function render(path: string, context?: Record<string, unknown>) {
  const client = new QueryClient()
  if (context) client.setQueryData(['join-context', 'abc'], context)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Join /></MemoryRouter></QueryClientProvider>,
  )
}

describe('Join', () => {
  it('refuses a link without a venue code, inside the portal token scope', () => {
    const html = render('/portal/join')
    expect(html).toContain('data-portal=""')
    expect(html).toContain('This link is incomplete')
    expect(html).not.toContain('hotel')
  })
  it('shows a skeleton while the venue context loads', () => {
    expect(render('/portal/join?org=abc')).toContain('aria-busy="true"')
  })
  it('asks for a referral code only while the venue uses referrals', () => {
    const open = { organization: { id: 1, name: 'Numa Skin Lab' }, accepting_joins: true, welcome_bonus: 500 }
    expect(render('/portal/join?org=abc', open)).toContain('name="referral_code"')
    expect(render('/portal/join?org=abc', { ...open, referrals: true })).toContain('name="referral_code"')
    expect(render('/portal/join?org=abc', { ...open, referrals: false })).not.toContain('name="referral_code"')
  })
})
