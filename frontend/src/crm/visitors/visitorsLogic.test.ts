import { describe, expect, it } from 'vitest'
import { feedVisitor, hasContact, hostOf, isFeedTab, pageLabel, pathOf, placeOf, presence, readPanelTab, readTab, readVisitorId, tabCounts, visitorName, visitorsPath, visitorsSource, webHref } from './visitorsLogic'
import type { FeedRow } from '../inbox/feedLogic'

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

describe('round 5: the full admin\'s Engagement filters on Visitors', () => {
  it('keeps a feed tab from the URL only on a plan with the hub', () => {
    expect(readTab('hot_lead')).toBe('hot_lead')
    expect(readTab('missed')).toBe('missed')
    expect(readTab('has_contact', false)).toBe('online')
    expect(isFeedTab('hot_lead')).toBe(true)
    expect(isFeedTab('leads')).toBe(false)
  })

  it('asks the feed for hot leads, a contact or a missed chat, in the server\'s priority order and the window', () => {
    expect(visitorsSource('hot_lead', '', 1, 'all')).toEqual({ kind: 'feed', path: 'engagement/feed?filter=hot_lead&sort=priority&range=all' })
    expect(visitorsSource('missed', 'ada', 2, 'week')).toEqual({ kind: 'feed', path: 'engagement/feed?filter=missed&sort=priority&range=week&search=ada&page=2' })
    expect(visitorsSource('leads', '', 1, 'week')).toEqual({ kind: 'visitors', path: 'visitors?status=all&lead_only=1' })
  })

  it('counts the feed\'s tabs from its own counts', () => {
    expect(tabCounts({ online: 1, offline: 2, leads: 3, total: 3 }, { hot_lead: 4, has_contact: 5, missed: 0, priority: 9 }))
      .toEqual({ online: 1, all: 3, offline: 2, leads: 3, hot_lead: 4, has_contact: 5, missed: 0 })
    expect(tabCounts(undefined, { hot_lead: 2 })).toEqual({ hot_lead: 2 })
  })

  it('shows a feed row as a visitor, with the hot-lead flag and what their chat is about', () => {
    const row: FeedRow = {
      id: 5, display_name: null, email: 'ada@example.com', phone: null, is_lead: true, is_online: false, country: 'LV', city: 'Rīga',
      visitor_ip: '10.0.0.1', current_page: null, current_page_title: null, visit_count: 2, page_views_count: 4, messages_count: 3,
      last_seen_at: '2026-11-07T12:00:00Z', guest_id: 8, guest: { id: 8, name: 'Ada Lovelace' }, is_hot_lead: true, priority_score: 300,
      conversation: { id: 12, status: 'resolved', last_message_preview: null, last_message_sender: null, last_message_at: null, lead_captured: true, ai_enabled: true, assigned_to: null, unread_admin_count: 0, intent_tag: 'complaint' },
    }
    const v = feedVisitor(row)
    expect(v).toMatchObject({ id: 5, email: 'ada@example.com', is_lead: true, hot: true, intent: 'complaint', guest: { id: 8, full_name: 'Ada Lovelace' } })
    expect(visitorName(v)).toBe('Ada Lovelace')
    expect(feedVisitor({ ...row, conversation: null }).intent).toBeNull()
  })

  it('reads the panel\'s tab strictly', () => {
    expect(readPanelTab('chats')).toBe('chats')
    expect(readPanelTab('pages')).toBe('pages')
    expect(readPanelTab('nope')).toBe('overview')
    expect(readPanelTab(null)).toBe('overview')
  })
})
