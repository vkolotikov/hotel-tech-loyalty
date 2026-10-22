import type { InboxNotification, LaravelPage, PortalBootstrap } from '../../lib/types'

/**
 * The inbox's decisions, kept out of the component because the frontend tests render to a string and never run a
 * handler: what opening a notification does, what the cached page and the shell's unread badge read once the server
 * has marked something read, and what the badge shows.
 */

export function isUnread(n: Pick<InboxNotification, 'read_at'>): boolean {
  return n.read_at === null
}

/**
 * Tapping a notification opens it (shows its whole text) or closes it again. Opening an unread one marks it read on
 * the server; opening a read one, or closing, asks the server nothing.
 */
export function openNotification(n: Pick<InboxNotification, 'id' | 'read_at'>, openId: number | null): { openId: number | null; markRead: boolean } {
  if (openId === n.id) return { openId: null, markRead: false }
  return { openId: n.id, markRead: isUnread(n) }
}

/**
 * After the server marked one notification read: that row carries `at` (nothing else on the page moves) and the
 * shell's unread count is one lower — but only when the cached row was still unread, so a second answer for the same
 * row (a double tap) never counts it twice. Either cache may be missing; it is then left missing.
 */
export function afterReadOne(
  page: LaravelPage<InboxNotification> | undefined,
  boot: PortalBootstrap | undefined,
  id: number,
  at: string,
): { page: LaravelPage<InboxNotification> | undefined; boot: PortalBootstrap | undefined } {
  const row = page?.data.find(n => n.id === id)
  const wasUnread = row ? isUnread(row) : false
  return {
    page: page && wasUnread ? { ...page, data: page.data.map(n => (n.id === id ? { ...n, read_at: at } : n)) } : page,
    boot: boot && wasUnread ? withUnread(boot, boot.counts.unread_notifications - 1) : boot,
  }
}

/** After "mark all as read": every row on the page carries `at` where it had nothing, and the badge is gone. */
export function afterReadAll(
  page: LaravelPage<InboxNotification> | undefined,
  boot: PortalBootstrap | undefined,
  at: string,
): { page: LaravelPage<InboxNotification> | undefined; boot: PortalBootstrap | undefined } {
  return {
    page: page ? { ...page, data: page.data.map(n => (isUnread(n) ? { ...n, read_at: at } : n)) } : page,
    boot: boot ? withUnread(boot, 0) : boot,
  }
}

function withUnread(boot: PortalBootstrap, count: number): PortalBootstrap {
  return { ...boot, counts: { ...boot.counts, unread_notifications: Math.max(0, count) } }
}

/** "Mark all as read" is offered while anything is unread: by the server's count, or on the page in view. */
export function canMarkAllRead(serverUnread: number, page: LaravelPage<InboxNotification> | undefined): boolean {
  return serverUnread > 0 || !!page?.data.some(isUnread)
}

/** What the inbox badge shows: nothing at none, the number up to 99, then "99+". */
export function badgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null
  return count > 99 ? '99+' : String(Math.floor(count))
}
