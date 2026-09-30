import { describe, expect, it } from 'vitest'
import { landingPath, loginPath, safeRedirect } from './landing'

describe('landingPath', () => {
  it('sends a member to the portal whatever else is set', () => {
    expect(landingPath({ user_type: 'member', workspaces: { appointments: { landing: true } } }, '/')).toBe('/portal')
  })

  it('sends staff of a landing organisation to the workspace', () => {
    expect(landingPath({ user_type: 'staff', workspaces: { appointments: { landing: true } } }, '/')).toBe('/appointments')
  })

  it('leaves every other staff user exactly where they landed before', () => {
    expect(landingPath({ user_type: 'staff' }, '/')).toBe('/')
    expect(landingPath({ user_type: 'staff', workspaces: { appointments: { landing: false } } }, '/')).toBe('/')
    expect(landingPath({ user_type: 'staff', workspaces: {} }, '/')).toBe('/')
    expect(landingPath(null, '/')).toBe('/')
  })

  it('never overrides a redirect the sign-in link asked for', () => {
    expect(landingPath({ user_type: 'staff', workspaces: { appointments: { landing: true } } }, '/bookings')).toBe('/bookings')
  })
})

describe('loginPath', () => {
  it('brings a signed-out visitor back to the page they asked for after signing in', () => {
    expect(loginPath({ pathname: '/appointments/clients/5', search: '' })).toBe('/login?redirect=%2Fappointments%2Fclients%2F5')
    expect(loginPath({ pathname: '/appointments', search: '?open=12&date=2026-10-06' })).toBe('/login?redirect=%2Fappointments%3Fopen%3D12%26date%3D2026-10-06')
  })
})

describe('safeRedirect', () => {
  it('keeps a local path, query included', () => {
    expect(safeRedirect('/appointments/clients/5')).toBe('/appointments/clients/5')
    expect(safeRedirect('/appointments?open=12')).toBe('/appointments?open=12')
  })

  it('never sends anyone off the site, and defaults to the dashboard', () => {
    expect(safeRedirect(null)).toBe('/')
    expect(safeRedirect('')).toBe('/')
    expect(safeRedirect('https://evil.example')).toBe('/')
    expect(safeRedirect('//evil.example')).toBe('/')
    expect(safeRedirect('/\\evil.example')).toBe('/') // a backslash is a slash to a browser
  })
})
