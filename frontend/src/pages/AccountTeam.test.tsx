import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import { AccountTeam } from './AccountTeam'
import { inviteRoles, memberState, type TeamList } from './accountTeam'

const auth = vi.hoisted(() => ({
  token: 'test-session' as string | null,
  user: { id: 7, email: 'owner@example.test', user_type: 'staff', workspaces: { loyalty: { landing: true, only: true } } },
  staff: { role: 'super_admin' } as { role: string },
}))
vi.mock('../stores/authStore', () => ({ useAuthStore: (selector?: (s: typeof auth) => unknown) => selector ? selector(auth) : auth }))
vi.mock('../lib/api', () => ({ api: { get: vi.fn(() => new Promise(() => {})), post: vi.fn(), put: vi.fn(), patch: vi.fn() } }))

const team: TeamList = {
  roles: ['super_admin', 'manager', 'staff'],
  staff: [
    { id: 1, name: 'Ana Owner', email: 'owner@example.test', role: 'super_admin', is_active: true, last_login_at: '2026-11-01T10:00:00Z', invite_expires_at: null, is_me: true },
    { id: 2, name: 'Ben Desk', email: 'ben@example.test', role: 'staff', is_active: true, last_login_at: null, invite_expires_at: '2026-11-09T10:00:00Z', is_me: false },
    { id: 3, name: 'Cara Gone', email: 'cara@example.test', role: 'manager', is_active: false, last_login_at: '2026-10-01T10:00:00Z', invite_expires_at: null, is_me: false },
  ],
}

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  client.setQueryData(['account-team'], team)
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/account/team']}><QueryClientProvider client={client}><AccountTeam /></QueryClientProvider></MemoryRouter>)
  client.clear()
  return html
}

describe('Team for an organisation on modules', () => {
  it('lists the team, invites as manager or staff, and offers each member what can be done', () => {
    const html = render()
    expect(html).toContain('Invite a colleague')
    expect(html).toContain('Ben Desk')
    expect(html).toContain('invitation sent')
    expect(html).toContain('Send again')
    expect(html).toContain('Switch on')
    expect(html).toContain('(you)')
    expect(html).not.toContain('<option value="super_admin"')
  })

  it('lets staff only read it', () => {
    auth.staff.role = 'staff'
    const html = render()
    expect(html).toContain('Only an owner or a manager can change the team.')
    expect(html).not.toContain('Invite a colleague')
    expect(html).not.toContain('Switch off')
    auth.staff.role = 'super_admin'
  })

  it('reads a member\'s state and the roles an invitation offers', () => {
    expect(inviteRoles(['super_admin', 'manager', 'staff'])).toEqual(['manager', 'staff'])
    expect(memberState(team.staff[0])).toBe('active')
    expect(memberState(team.staff[1])).toBe('invited')
    expect(memberState(team.staff[2])).toBe('off')
  })
})
