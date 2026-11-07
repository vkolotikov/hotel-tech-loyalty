import { describe, expect, it } from 'vitest'
import { hasContact, hostOf, pageLabel, pathOf, placeOf, presence, readTab, readVisitorId, tabCounts, visitorName, visitorsPath, webHref } from './visitorsLogic'

describe('the Visitors list', () => {
  it('opens on who is on the site now, and keeps a tab from the URL', () => {
    expect(readTab(null)).toBe('online')
    expect(readTab('leads')).toBe('leads')
    expect(readTab('offline')).toBe('offline')
    expect(readTab('everyone')).toBe('online')
    expect(readVisitorId('42')).toBe(42)
    expect(readVisitorId('0')).toBeNull()
    expect(readVisitorId('4x')).toBeNull()
  })

  it('asks the server for the status, leads among everyone, the search and the page', () => {
    expect(visitorsPath('online', '')).toBe('visitors?status=online')
    expect(visitorsPath('all', ' ada ', 3)).toBe('visitors?status=all&search=ada&page=3')
    expect(visitorsPath('leads', '')).toBe('visitors?status=all&lead_only=1')
    expect(visitorsPath('offline', '', 1)).toBe('visitors?status=offline')
  })

  it('counts each tab from the list\'s stats', () => {
    expect(tabCounts({ online: 2, offline: 40, leads: 5, total: 42 })).toEqual({ online: 2, all: 42, offline: 40, leads: 5 })
    expect(tabCounts(undefined)).toEqual({})
  })
})

describe('a visitor', () => {
  const now = Date.parse('2026-11-07T12:00:00Z')

  it('is online for 90 s after the last sign of life, then recently for half an hour, then away', () => {
    expect(presence('2026-11-07T11:59:00Z', now)).toBe('online')
    expect(presence('2026-11-07T11:58:29Z', now)).toBe('recent')
    expect(presence('2026-11-07T11:31:00Z', now)).toBe('recent')
    expect(presence('2026-11-07T11:29:59Z', now)).toBe('away')
    expect(presence(null, now)).toBe('away')
    expect(presence('nonsense', now)).toBe('away')
  })

  const v = { display_name: null, guest: null, email: null, phone: null, city: null, country: null }

  it('is named by what is known, in that order', () => {
    expect(visitorName({ ...v, display_name: 'Ada' })).toBe('Ada')
    expect(visitorName({ ...v, guest: { id: 1, full_name: 'Ada Lovelace', email: null, phone: null } })).toBe('Ada Lovelace')
    expect(visitorName({ ...v, email: 'ada@example.com', phone: '+371' })).toBe('ada@example.com')
    expect(visitorName({ ...v, phone: '+371' })).toBe('+371')
    expect(visitorName({ ...v, display_name: '  ' })).toBeNull()
  })

  it('is placed and reached as far as known', () => {
    expect(placeOf({ city: 'Riga', country: 'Latvia' })).toBe('Riga, Latvia')
    expect(placeOf({ city: null, country: 'Latvia' })).toBe('Latvia')
    expect(placeOf({ city: ' ', country: null })).toBeNull()
    expect(hasContact({ email: null, phone: null, guest: null })).toBe(false)
    expect(hasContact({ email: null, phone: null, guest: { id: 1, full_name: null, email: 'a@b.c', phone: null } })).toBe(true)
  })

  it('shows a page by its title or its path, and links only a web address', () => {
    expect(pageLabel('Suites', 'https://hotel.example/suites')).toBe('Suites')
    expect(pageLabel(null, 'https://hotel.example/suites?lang=de')).toBe('/suites?lang=de')
    expect(pageLabel(null, null)).toBeNull()
    expect(pathOf('nope')).toBe('nope')
    expect(hostOf('https://www.google.com/x')).toBe('www.google.com')
    expect(webHref('https://hotel.example/x')).toBe('https://hotel.example/x')
    expect(webHref('javascript:alert(1)')).toBeNull()
    expect(webHref(null)).toBeNull()
  })
})
