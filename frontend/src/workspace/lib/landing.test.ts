import { describe, expect, it } from 'vitest'
import { landingPath, loginPathAfterExpiry, moduleHome, planModules, showsWorkspaceLink } from './landing'

const staff = (workspaces: Record<string, unknown> = {}) => ({ user_type: 'staff', workspaces })

describe('showsWorkspaceLink', () => {
  it('shows the way into a workspace to staff of an organisation that has it', () => {
    expect(showsWorkspaceLink(staff({ content: { landing: false } }), 'content')).toBe(true)
    expect(showsWorkspaceLink(staff({ appointments: { landing: false } }), 'appointments')).toBe(true)
    expect(showsWorkspaceLink(staff({ loyalty: { landing: false } }), 'loyalty')).toBe(true)
    expect(showsWorkspaceLink(staff({ content: { landing: false } }), 'loyalty')).toBe(false)
  })

  it('shows nothing to an organisation without it (the Appointments plan has no Content), to a member, or before sign-in', () => {
    expect(showsWorkspaceLink(staff({ appointments: { only: true } }), 'content')).toBe(false)
    expect(showsWorkspaceLink({ user_type: 'member', workspaces: { content: {} } }, 'content')).toBe(false)
    expect(showsWorkspaceLink(null, 'content')).toBe(false)
  })
})

describe('loginPathAfterExpiry', () => {
  it('brings a sign-in that ran out back to the same workspace page, on Loyalty\'s and Content\'s own sign-in pages', () => {
    expect(loginPathAfterExpiry('/content/posts', '?status=draft')).toBe('/content/login?redirect=%2Fcontent%2Fposts%3Fstatus%3Ddraft')
    expect(loginPathAfterExpiry('/content', '')).toBe('/content/login?redirect=%2Fcontent')
    expect(loginPathAfterExpiry('/appointments/clients', '')).toBe('/appointments/login?redirect=%2Fappointments%2Fclients')
    expect(loginPathAfterExpiry('/loyalty/members/7', '')).toBe('/loyalty/login?redirect=%2Floyalty%2Fmembers%2F7')
  })

  it('keeps the plain sign-in everywhere else, including addresses that only start alike', () => {
    expect(loginPathAfterExpiry('/leads', '?tab=customers')).toBe('/login')
    expect(loginPathAfterExpiry('/contentious', '')).toBe('/login')
    expect(loginPathAfterExpiry('/loyalty-presets', '')).toBe('/login')
  })
})

describe('landingPath', () => {
  it('lands on Content after sign-in when the organisation chose it and nothing else was asked for', () => {
    expect(landingPath(staff({ content: { landing: true } }), '/')).toBe('/content')
    expect(landingPath(staff({ content: { landing: true } }), '/leads')).toBe('/leads')
    expect(landingPath(staff({ content: { landing: false } }), '/')).toBe('/')
  })

  it('lands on Loyalty after sign-in when the organisation chose it (one landing per organisation, the server keeps it so)', () => {
    expect(landingPath(staff({ loyalty: { landing: true } }), '/')).toBe('/loyalty')
    expect(landingPath(staff({ loyalty: { landing: true } }), '/members')).toBe('/members')
    expect(landingPath(staff({ appointments: { only: true }, loyalty: { landing: true } }), '/')).toBe('/appointments')
  })

  it('keeps the Appointments rules: its landing, its plan, and members to their portal', () => {
    expect(landingPath(staff({ appointments: { landing: true } }), '/')).toBe('/appointments')
    expect(landingPath(staff({ appointments: { only: true } }), '/content')).toBe('/appointments')
    expect(landingPath({ user_type: 'member' }, '/content')).toBe('/portal')
  })
})

describe('modules bought on their own (owner 2026-11-02)', () => {
  const loyaltyOnly = staff({ loyalty: { landing: true, only: true } })
  const both = staff({ content: { landing: false, only: true }, loyalty: { landing: true, only: true } })

  it('names the workspaces the server marks only, in its order, and nothing for a full customer or a member', () => {
    expect(planModules(loyaltyOnly)).toEqual(['loyalty'])
    expect(planModules(both)).toEqual(['loyalty', 'content'])
    expect(planModules(staff({ appointments: { only: true }, content: { only: true } }))).toEqual(['appointments', 'content'])
    expect(planModules(staff({ appointments: { only: false }, loyalty: { landing: true } }))).toBeNull()
    expect(planModules({ user_type: 'member', workspaces: { loyalty: { only: true } } })).toBeNull()
    expect(planModules(null)).toBeNull()
  })

  it('lands on the workspace the server lands them on, else the first', () => {
    expect(moduleHome(loyaltyOnly)).toBe('/loyalty')
    expect(moduleHome(staff({ content: { landing: true, only: true }, loyalty: { landing: false, only: true } }))).toBe('/content')
    expect(moduleHome(staff({ content: { only: true } }))).toBe('/content')
    expect(moduleHome(staff({ loyalty: { landing: true } }))).toBeNull()
  })

  it('follows a link into a bought workspace or the account pages and sends anything else home', () => {
    expect(landingPath(loyaltyOnly, '/')).toBe('/loyalty')
    expect(landingPath(loyaltyOnly, '/members')).toBe('/loyalty')
    expect(landingPath(loyaltyOnly, '/content/posts')).toBe('/loyalty')
    expect(landingPath(loyaltyOnly, '/loyalty/members/7')).toBe('/loyalty/members/7')
    expect(landingPath(loyaltyOnly, '/loyaltyx')).toBe('/loyalty')
    expect(landingPath(loyaltyOnly, '/account/products?success=1')).toBe('/account/products?success=1')
    expect(landingPath(both, '/content/posts')).toBe('/content/posts')
  })
})
