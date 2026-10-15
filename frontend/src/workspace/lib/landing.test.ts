import { describe, expect, it } from 'vitest'
import { landingPath, loginPathAfterExpiry, showsWorkspaceLink } from './landing'

const staff = (workspaces: Record<string, unknown> = {}) => ({ user_type: 'staff', workspaces })

describe('showsWorkspaceLink', () => {
  it('shows the way into a workspace to staff of an organisation that has it', () => {
    expect(showsWorkspaceLink(staff({ content: { landing: false } }), 'content')).toBe(true)
    expect(showsWorkspaceLink(staff({ appointments: { landing: false } }), 'appointments')).toBe(true)
  })

  it('shows nothing to an organisation without it (the Appointments plan has no Content), to a member, or before sign-in', () => {
    expect(showsWorkspaceLink(staff({ appointments: { only: true } }), 'content')).toBe(false)
    expect(showsWorkspaceLink({ user_type: 'member', workspaces: { content: {} } }, 'content')).toBe(false)
    expect(showsWorkspaceLink(null, 'content')).toBe(false)
  })
})

describe('loginPathAfterExpiry', () => {
  it('brings a sign-in that ran out back to the same workspace page, Content as Appointments', () => {
    expect(loginPathAfterExpiry('/content/posts', '?status=draft')).toBe('/login?redirect=%2Fcontent%2Fposts%3Fstatus%3Ddraft')
    expect(loginPathAfterExpiry('/content', '')).toBe('/login?redirect=%2Fcontent')
    expect(loginPathAfterExpiry('/appointments/clients', '')).toBe('/login?redirect=%2Fappointments%2Fclients')
  })

  it('keeps the plain sign-in everywhere else, including addresses that only start alike', () => {
    expect(loginPathAfterExpiry('/leads', '?tab=customers')).toBe('/login')
    expect(loginPathAfterExpiry('/contentious', '')).toBe('/login')
  })
})

describe('landingPath', () => {
  it('lands on Content after sign-in when the organisation chose it and nothing else was asked for', () => {
    expect(landingPath(staff({ content: { landing: true } }), '/')).toBe('/content')
    expect(landingPath(staff({ content: { landing: true } }), '/leads')).toBe('/leads')
    expect(landingPath(staff({ content: { landing: false } }), '/')).toBe('/')
  })

  it('keeps the Appointments rules: its landing, its plan, and members to their portal', () => {
    expect(landingPath(staff({ appointments: { landing: true } }), '/')).toBe('/appointments')
    expect(landingPath(staff({ appointments: { only: true } }), '/content')).toBe('/appointments')
    expect(landingPath({ user_type: 'member' }, '/content')).toBe('/portal')
  })
})
