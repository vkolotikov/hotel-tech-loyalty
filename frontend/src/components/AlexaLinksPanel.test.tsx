import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AlexaLinksPanel, type AlexaLinksResponse } from './AlexaLinksPanel'

vi.mock('../stores/authStore', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 7 } }) }))
vi.mock('../lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))

const clients: QueryClient[] = []
function render(data?: AlexaLinksResponse, failed = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } })
  clients.push(client)
  const queryKey = ['voice-alexa-links', 7]
  if (data) client.setQueryData(queryKey, data)
  if (failed) client.getQueryCache().build(client, { queryKey }).setState({ status: 'error', error: new Error('Network unavailable'), fetchStatus: 'idle' })
  return renderToStaticMarkup(<QueryClientProvider client={client}><AlexaLinksPanel /></QueryClientProvider>)
}
afterEach(() => clients.splice(0).forEach(client => client.clear()))

const link = { id: 41, can_write: false, linked_at: '2026-09-13T09:00:00Z', last_used_at: null }

describe('Amazon Echo links', () => {
  it('does not claim there are no links while loading or after a failure', () => {
    expect(render()).toContain('Loading linked devices')
    const html = render(undefined, true)
    expect(html).toContain('Linked devices could not be loaded')
    expect(html).toContain('Try again')
    expect(html).not.toContain('No linked Echo')
  })

  it('does not offer linking when voice is unavailable for the workspace', () => {
    const html = render({ enabled: false, links: [] })
    expect(html).toContain('Echo linking is unavailable')
    expect(html).not.toContain('Link an Echo')
  })

  it('invites linking when there are no links', () => {
    const html = render({ enabled: true, links: [] })
    expect(html).toContain('No linked Echo')
    expect(html).toContain('Link an Echo')
  })

  it('shows a new link as read-only with controls to allow notes and unlink', () => {
    const html = render({ enabled: true, links: [link] })
    expect(html).toContain('Reads only')
    expect(html).toContain('Allow notes from this Echo')
    expect(html).toContain('Unlink')
  })

  it('says plainly when an Echo can add notes', () => {
    const html = render({ enabled: true, links: [{ ...link, can_write: true }] })
    expect(html).toContain('Can add notes')
    expect(html).toContain('Stop notes from this Echo')
  })

  it('still lets a person unlink when new links are unavailable', () => {
    expect(render({ enabled: false, links: [link] })).toContain('Unlink')
  })
})
