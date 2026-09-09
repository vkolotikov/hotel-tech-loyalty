import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountConnections } from './AccountConnections'

const auth = vi.hoisted(() => ({
  token: 'test-session' as string | null,
  user: { id: 7, email: 'staff@example.test', user_type: 'staff' },
  staff: { role: 'receptionist' },
}))
vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector?: (state: typeof auth) => unknown) => selector ? selector(auth) : auth,
}))
vi.mock('../lib/api', () => ({ api: { get: vi.fn(), delete: vi.fn() } }))

afterEach(() => { auth.token = 'test-session'; auth.user.user_type = 'staff' })

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  client.setQueryData(['chatgpt-connections', 7], { enabled: false, configured: true, connections: [] })
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={['/account/connections']}>
      <QueryClientProvider client={client}><AccountConnections /></QueryClientProvider>
    </MemoryRouter>,
  )
  client.clear()
  return html
}

describe('connected-app account page', () => {
  it('renders for ordinary staff without subscription or admin data', () => {
    const html = render()
    expect(html).toContain('Your connected apps')
    expect(html).toContain('staff@example.test')
    expect(html).toContain('No connected access')
  })

  it('does not render staff account controls without a login', () => {
    auth.token = null
    expect(render()).toBe('')
  })

  it('does not render staff account controls to loyalty members', () => {
    auth.user.user_type = 'member'
    expect(render()).toBe('')
  })
})
