import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Bell } from 'lucide-react'
import { usePortal } from '../PortalProvider'
import { portalApi } from '../lib/portalApi'
import type { InboxNotification, LaravelPage, PortalBootstrap } from '../lib/types'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { DateTime } from '../ui/DateTime'
import { EmptyState } from '../ui/EmptyState'
import { Notice } from '../ui/Notice'
import { PageSkeleton } from '../ui/Skeleton'
import { afterReadAll, afterReadOne, canMarkAllRead, isUnread, openNotification } from './inbox/inboxState'

const BOOTSTRAP = ['portal-bootstrap'] as const
const inboxKey = (page: number) => ['portal-inbox', page] as const

/**
 * The member's inbox: every notification the venue kept for them (NotificationService::keep()), newest first —
 * the same list the member app shows, through the app's own endpoints. Opening one marks it read; the badge in the
 * menu follows.
 */
export function Inbox() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: boot } = usePortal()
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<number | null>(null)
  const hasMember = !!boot?.member

  const query = useQuery({
    queryKey: inboxKey(page), queryFn: () => portalApi.notifications(page), placeholderData: keepPreviousData, enabled: hasMember,
  })

  const markOne = useMutation({
    mutationFn: (id: number) => portalApi.markNotificationRead(id),
    onSuccess: (_reply, id) => {
      const next = afterReadOne(qc.getQueryData<LaravelPage<InboxNotification>>(inboxKey(page)), qc.getQueryData<PortalBootstrap>(BOOTSTRAP), id, new Date().toISOString())
      qc.setQueryData(inboxKey(page), next.page)
      qc.setQueryData(BOOTSTRAP, next.boot)
    },
  })
  const markAll = useMutation({
    mutationFn: portalApi.markAllNotificationsRead,
    onSuccess: () => {
      const next = afterReadAll(qc.getQueryData<LaravelPage<InboxNotification>>(inboxKey(page)), qc.getQueryData<PortalBootstrap>(BOOTSTRAP), new Date().toISOString())
      qc.setQueryData(inboxKey(page), next.page)
      qc.setQueryData(BOOTSTRAP, next.boot)
      // Other pages of the list read the server again when they are next shown.
      void qc.invalidateQueries({ queryKey: ['portal-inbox'], predicate: q => q.queryKey[1] !== page })
    },
    onError: () => toast.error(t('portal.inbox.mark_failed', 'Could not mark your messages as read. Please try again.')),
  })

  const open = (n: InboxNotification) => {
    const next = openNotification(n, openId)
    setOpenId(next.openId)
    if (next.markRead) markOne.mutate(n.id)
  }

  if (hasMember && query.isLoading) return <PageSkeleton />
  if (query.isError) {
    return (
      <div className="space-y-3">
        <Notice tone="danger">{t('portal.common.error', 'Something went wrong. Please try again.')}</Notice>
        <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('portal.common.retry', 'Try again')}</Button>
      </div>
    )
  }

  const data = query.data
  const rows = data?.data ?? []
  const venue = boot?.venue.name ?? ''

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-p-display text-2xl">{t('portal.inbox.title', 'Inbox')}</h1>
        {canMarkAllRead(boot?.counts.unread_notifications ?? 0, data) && (
          <Button variant="ghost" size="sm" loading={markAll.isPending} onClick={() => markAll.mutate()}>{t('portal.inbox.mark_all', 'Mark all as read')}</Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Bell size={20} aria-hidden />}
          title={t('portal.inbox.empty_title', 'Nothing here yet')}
          body={t('portal.inbox.empty_body', 'When {{venue}} sends you news about your points, offers, your level or your bookings, you will find it here.', { venue })}
        />
      ) : (
        <Card className="overflow-hidden divide-y divide-p-border">
          {rows.map(n => <InboxRow key={n.id} n={n} isOpen={openId === n.id} onOpen={() => open(n)} />)}
        </Card>
      )}

      {(data?.last_page ?? 1) > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" disabled={page <= 1 || query.isFetching} onClick={() => { setOpenId(null); setPage(p => Math.max(1, p - 1)) }}>{t('portal.common.previous', 'Previous')}</Button>
          <span className="text-xs text-p-text-2 tabular-nums">{t('portal.common.page_of', 'Page {{page}} of {{total}}', { page: data?.current_page, total: data?.last_page })}</span>
          <Button variant="secondary" size="sm" disabled={page >= (data?.last_page ?? 1) || query.isFetching} onClick={() => { setOpenId(null); setPage(p => p + 1) }}>{t('portal.common.next', 'Next')}</Button>
        </div>
      )}

      <p className="text-xs text-p-text-2 text-center">
        <Link to="/portal/profile#messages" className="underline underline-offset-2 hover:text-p-text">{t('portal.inbox.preferences', 'Choose which messages you get')}</Link>
      </p>
    </div>
  )
}

/** One notification: its title, its text (two lines until it is opened) and when it came; unread ones are marked. */
export function InboxRow({ n, isOpen, onOpen }: { n: InboxNotification; isOpen: boolean; onOpen: () => void }) {
  const { t } = useTranslation()
  const unread = isUnread(n)
  return (
    <button type="button" onClick={onOpen} aria-expanded={isOpen}
      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-p-surface-2 transition-colors">
      <span aria-hidden className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${unread ? 'bg-p-accent' : 'bg-p-border'}`} />
      <span className="min-w-0 flex-1 block">
        <span className={`block text-sm text-p-text ${unread ? 'font-semibold' : ''} ${isOpen ? '' : 'truncate'}`}>
          {n.title}
          {unread && <span className="sr-only"> · {t('portal.inbox.unread', 'Unread')}</span>}
        </span>
        {n.body && <span className={`block text-sm text-p-text-2 mt-0.5 ${isOpen ? 'whitespace-pre-line' : 'line-clamp-2'}`}>{n.body}</span>}
        <span className="block text-[11px] text-p-text-2 mt-1"><DateTime iso={n.created_at} mode="datetime" /></span>
      </span>
    </button>
  )
}
