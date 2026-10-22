import { describe, expect, it } from 'vitest'
import type { InboxNotification, LaravelPage, PortalBootstrap } from '../../lib/types'
import { afterReadAll, afterReadOne, badgeText, canMarkAllRead, isUnread, openNotification } from './inboxState'

const row = (id: number, read_at: string | null = null): InboxNotification => ({
  id, member_id: 1, type: 'points_earned', title: `Title ${id}`, body: 'Body', data: null, channel: 'push', campaign_id: null,
  is_sent: true, sent_at: '2026-10-01T09:00:00.000000Z', read_at, created_at: '2026-10-01T09:00:00.000000Z', updated_at: '2026-10-01T09:00:00.000000Z',
})
const page = (rows: InboxNotification[]): LaravelPage<InboxNotification> => ({ data: rows, current_page: 1, last_page: 1, total: rows.length })
const boot = (unread: number) => ({ counts: { unread_notifications: unread, upcoming_bookings: 3 } }) as unknown as PortalBootstrap
const AT = '2026-10-22T10:00:00.000Z'

describe('opening a notification', () => {
  it('opens an unread one and marks it read', () => {
    expect(openNotification(row(1), null)).toEqual({ openId: 1, markRead: true })
  })

  it('opens a read one without asking the server anything', () => {
    expect(openNotification(row(1, AT), null)).toEqual({ openId: 1, markRead: false })
  })

  it('closes the open one, and opening another moves the open row there', () => {
    expect(openNotification(row(1), 1)).toEqual({ openId: null, markRead: false })
    expect(openNotification(row(2), 1)).toEqual({ openId: 2, markRead: true })
  })
})

describe('after the server marked something read', () => {
  it('one: that row is read, the rest untouched, the badge one lower', () => {
    const next = afterReadOne(page([row(1), row(2), row(3, AT)]), boot(2), 1, AT)
    expect(next.page?.data.map(n => n.read_at)).toEqual([AT, null, AT])
    expect(next.boot?.counts.unread_notifications).toBe(2 - 1)
    expect(next.boot?.counts.upcoming_bookings).toBe(3)
  })

  it('one, answered twice (a double tap): counted once', () => {
    const first = afterReadOne(page([row(1)]), boot(1), 1, AT)
    const second = afterReadOne(first.page, first.boot, 1, AT)
    expect(second.boot?.counts.unread_notifications).toBe(0)
    expect(second.page).toBe(first.page)
  })

  it('one, for a row not on the cached page: nothing is guessed', () => {
    const p = page([row(1)])
    const b = boot(4)
    expect(afterReadOne(p, b, 99, AT)).toEqual({ page: p, boot: b })
  })

  it('never counts below none, and leaves a missing cache missing', () => {
    expect(afterReadOne(page([row(1)]), boot(0), 1, AT).boot?.counts.unread_notifications).toBe(0)
    expect(afterReadOne(undefined, undefined, 1, AT)).toEqual({ page: undefined, boot: undefined })
  })

  it('all: every unread row is read (a read row keeps its own time) and the badge is gone', () => {
    const earlier = '2026-09-01T08:00:00.000Z'
    const next = afterReadAll(page([row(1), row(2, earlier)]), boot(7), AT)
    expect(next.page?.data.map(n => n.read_at)).toEqual([AT, earlier])
    expect(next.boot?.counts.unread_notifications).toBe(0)
    expect(next.page?.data.every(n => !isUnread(n))).toBe(true)
  })
})

describe('mark all as read is offered', () => {
  it('while the server counts something unread, or the page shows an unread row', () => {
    expect(canMarkAllRead(3, page([row(1, AT)]))).toBe(true)
    expect(canMarkAllRead(0, page([row(1)]))).toBe(true)
    expect(canMarkAllRead(0, page([row(1, AT)]))).toBe(false)
    expect(canMarkAllRead(0, undefined)).toBe(false)
  })
})

describe('the badge', () => {
  it('shows nothing at none, the number up to 99, then 99+', () => {
    expect(badgeText(0)).toBeNull()
    expect(badgeText(-1)).toBeNull()
    expect(badgeText(Number.NaN)).toBeNull()
    expect(badgeText(1)).toBe('1')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(100)).toBe('99+')
  })
})
