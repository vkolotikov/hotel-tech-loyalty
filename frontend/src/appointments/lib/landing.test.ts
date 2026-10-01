import { describe, expect, it } from 'vitest'
import { fullAdminPathFor, landingPath, loginPath, safeRedirect, showsAppointmentsLink } from './landing'

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

describe('showsAppointmentsLink', () => {
  it('shows the way into the workspace to staff of an organisation that has it and can book something', () => {
    expect(showsAppointmentsLink({ user_type: 'staff', workspaces: { appointments: { landing: false, has_services: true } } })).toBe(true)
  })

  it('hides it where nothing can be booked, where the workspace is switched off, and from members', () => {
    expect(showsAppointmentsLink({ user_type: 'staff', workspaces: { appointments: { landing: false, has_services: false } } })).toBe(false)
    expect(showsAppointmentsLink({ user_type: 'staff' })).toBe(false)
    expect(showsAppointmentsLink({ user_type: 'member', workspaces: { appointments: { landing: false, has_services: true } } })).toBe(false)
    expect(showsAppointmentsLink(null)).toBe(false)
  })
})

describe('fullAdminPathFor', () => {
  it('opens the same tool in the full admin', () => {
    expect(fullAdminPathFor('/appointments')).toBe('/service-bookings/calendar')
    expect(fullAdminPathFor('/appointments/')).toBe('/service-bookings/calendar')
    expect(fullAdminPathFor('/appointments/clients')).toBe('/leads?tab=customers')
    expect(fullAdminPathFor('/appointments/clients/14')).toBe('/leads?tab=customers')
  })

  it('falls back to the dashboard anywhere else', () => {
    expect(fullAdminPathFor('/appointments/something-new')).toBe('/')
    expect(fullAdminPathFor('/')).toBe('/')
  })
})
