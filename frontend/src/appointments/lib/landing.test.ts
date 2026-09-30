import { describe, expect, it } from 'vitest'
import { landingPath } from './landing'

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
