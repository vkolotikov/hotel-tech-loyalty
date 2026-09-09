import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChatGptConnectionsPanel, type ChatGptConnectionsResponse } from './ChatGptConnectionsPanel'

vi.mock('../stores/authStore', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 7 } }) }))
vi.mock('../lib/api', () => ({ api: { get: vi.fn(), delete: vi.fn() } }))

const clients: QueryClient[] = []
function render(data?: ChatGptConnectionsResponse, failed = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } })
  clients.push(client)
  const queryKey = ['chatgpt-connections', 7]
  if (data) client.setQueryData(queryKey, data)
  if (failed) client.getQueryCache().build(client, { queryKey }).setState({ status: 'error', error: new Error('Network unavailable'), fetchStatus: 'idle' })
  return renderToStaticMarkup(<QueryClientProvider client={client}><ChatGptConnectionsPanel /></QueryClientProvider>)
}
afterEach(() => clients.splice(0).forEach(client => client.clear()))

const connection = { id: 'internal-token-id', name: 'Hexa-Tech account', scopes: ['mcp:use'], created_at: '2026-09-09T09:00:00Z', expires_at: '2026-09-09T10:00:00Z' }

describe('personal ChatGPT access', () => {
  it('still offers disconnect when new pilot connections are disabled', () => {
    const html = render({ enabled: false, configured: true, connections: [connection] })
    expect(html).toContain('Disconnect ChatGPT and Codex')
    expect(html).toContain('New connections are unavailable')
    expect(html).not.toContain('internal-token-id')
  })

  it('does not claim failed or pending requests mean the user has no connections', () => {
    expect(render()).toContain('Loading connections')
    const html = render(undefined, true)
    expect(html).toContain('Connections could not be loaded')
    expect(html).toContain('Try again')
    expect(html).not.toContain('No connected access')
  })

  it('does not invite linking before the deployment has an OAuth client', () => {
    const html = render({ enabled: true, configured: false, connections: [] })
    expect(html).toContain('New connections are unavailable')
    expect(html).not.toContain('To connect, start account linking')
  })

  it('uses account linking for an empty configured account and escapes client names', () => {
    expect(render({ enabled: true, configured: true, connections: [] })).toContain('approve access in Hexa-Tech')
    const html = render({ enabled: true, connections: [{ ...connection, name: '<script>untrusted()</script>' }] })
    expect(html).toContain('&lt;script&gt;untrusted()&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })
})
