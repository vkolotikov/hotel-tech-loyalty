import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import { Login } from './Login'

vi.mock('../stores/authStore', () => {
  const state = { token: null, user: null, staff: null, setAuth: vi.fn(), logout: vi.fn() }
  const useAuthStore = (selector?: (s: typeof state) => unknown) => selector ? selector(state) : state
  useAuthStore.getState = () => state
  return { useAuthStore }
})
vi.mock('../lib/api', () => ({ api: { get: vi.fn(() => new Promise(() => {})), post: vi.fn(), defaults: { baseURL: '' } } }))

const render = (path: string, product?: 'loyalty' | 'content') => renderToStaticMarkup(
  <MemoryRouter initialEntries={[path]}><Login product={product} /></MemoryRouter>,
)

describe('HexaTech Loyalty\'s and Content\'s own sign-in pages (owner 2026-11-02)', () => {
  it('signs in to HexaTech Loyalty in its own words', () => {
    const html = render('/loyalty/login', 'loyalty')
    expect(html).toContain('Sign in to HexaTech Loyalty')
    expect(html).toContain('Turn first visits into regulars.')
    expect(html).toContain('Loyalty programme for service businesses')
    expect(html).not.toContain('One platform. More bookings. Stronger loyalty.')
  })

  it('starts a HexaTech Content trial in its own words', () => {
    const html = render('/content/register', 'content')
    expect(html).toContain('Start your HexaTech Content trial')
    expect(html).toContain('Plan a month of social posts in an afternoon.')
    expect(html).toContain('A content calendar built around your goals and key dates')
  })

  it('leaves the full suite\'s sign-in as it was', () => {
    const html = render('/login')
    expect(html).toContain('One platform. More bookings. Stronger loyalty.')
    expect(html).toContain('Sign in to your HexaTech workspace')
    expect(html).not.toContain('HexaTech Loyalty')
  })
})
