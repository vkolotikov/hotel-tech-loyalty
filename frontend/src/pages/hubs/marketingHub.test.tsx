import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { MarketingHub } from './MarketingHub'

// A static render reads a zustand store's initial state, so the signed-in user is handed in through a stand-in.
const auth = vi.hoisted(() => ({ user: null as unknown }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: (select: (s: { user: unknown }) => unknown) => select({ user: auth.user }) }))

const render = (url: string) => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><MarketingHub /></MemoryRouter>)
const signIn = (workspaces: Record<string, unknown>) => { auth.user = { id: 1, user_type: 'staff', workspaces } }

afterEach(() => { auth.user = null })

describe('MarketingHub', () => {
  it('offers HexaTech Content as a way into its workspace, not the old planner tab', () => {
    signIn({ content: { landing: false } })
    const html = render('/marketing')
    expect(html).toContain('HexaTech Content')
    expect(html).not.toContain('AI Content Planner')
  })

  // An old bookmark of the planner tab lands in the workspace.
  it('sends the old planner tab to /content', () => {
    signIn({ content: { landing: false } })
    expect(render('/marketing?tab=content-planner')).not.toContain('Marketing')
  })

  // Final review: an organisation with Content switched off still saw the tile, and the tile and the old bookmark
  // bounced to the dashboard through /content's refusal.
  it('offers no HexaTech Content to an organisation that does not have it, and keeps an old bookmark on the hub', () => {
    signIn({})
    expect(render('/marketing')).not.toContain('HexaTech Content')
    const bookmark = render('/marketing?tab=content-planner')
    expect(bookmark).toContain('Marketing')
    expect(bookmark).not.toContain('HexaTech Content')
  })
})
