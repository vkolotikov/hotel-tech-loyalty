import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../lib/api'
import { KEYS, queryClient, useBoot } from '../lib/queries'
import { useT } from '../lib/i18n'
import { C, fonts } from '../lib/theme'
import { afterReadAll, afterReadOne, canMarkAllRead, formatDateTime, isUnread, openNotification } from '../shared/portal'
import type { InboxNotification, LaravelPage, PortalBootstrap } from '../lib/types'
import { Empty, GhostButton, Notice, Press, Shimmer, Surface } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { offerNotification } from '../lib/loyalty'
import { VoucherDownload } from '../components/VoucherDownload'
import { useSession } from '../lib/session'

/**
 * The inbox: what the venue sent — points, offers, the member's level, bookings, its own messages — newest first.
 * Opening one shows it whole and marks it read; the badge follows without a reload (the portal's own inbox rules).
 */
export default function Inbox() {
  const { tp, language } = useT()
  const boot = useBoot()
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const key = ['inbox', page] as const
  const list = useQuery({ queryKey: key, queryFn: () => api.notifications(page) })

  const update = (next: { page: LaravelPage<InboxNotification> | undefined; boot: PortalBootstrap | undefined }) => {
    if (next.page) queryClient.setQueryData(key, next.page)
    if (next.boot) queryClient.setQueryData(KEYS.boot, next.boot)
  }

  const readOne = useMutation({
    mutationFn: (id: number) => api.markRead(id),
    onMutate: () => ({ owner: useSession.getState().token }),
    onSuccess: (_answer, id, context) => {
      if (!context?.owner || context.owner !== useSession.getState().token) return
      const at = new Date().toISOString()
      const pages = queryClient.getQueriesData<LaravelPage<InboxNotification>>({ queryKey: ['inbox'] })
      const before = pages.find(([, data]) => data?.data.some(n => n.id === id && isUnread(n)))?.[1]
      for (const [pageKey, data] of pages) if (data) queryClient.setQueryData(pageKey, afterReadOne(data, undefined, id, at).page)
      const next = afterReadOne(before, queryClient.getQueryData<PortalBootstrap>(KEYS.boot), id, at)
      if (next.boot) queryClient.setQueryData(KEYS.boot, next.boot)
    },
    onError: () => setFailed(true),
  })
  const readAll = useMutation({
    mutationFn: () => api.markAllRead(),
    onMutate: () => { setFailed(false); return { owner: useSession.getState().token } },
    onSuccess: (_answer, _variables, context) => {
      if (!context?.owner || context.owner !== useSession.getState().token) return
      const at = new Date().toISOString()
      for (const [pageKey, data] of queryClient.getQueriesData<LaravelPage<InboxNotification>>({ queryKey: ['inbox'] })) if (data) queryClient.setQueryData(pageKey, afterReadAll(data, undefined, at).page)
      update(afterReadAll(undefined, queryClient.getQueryData<PortalBootstrap>(KEYS.boot), at))
    },
    onError: () => setFailed(true),
  })

  const tap = (n: InboxNotification) => {
    const next = openNotification(n, openId)
    setOpenId(next.openId)
    if (next.markRead) readOne.mutate(n.id)
  }

  const items = list.data?.data ?? []
  const timezone = boot.data?.venue.timezone
  return (
    <Sheet title={tp('portal.inbox.title')}>
      {canMarkAllRead(boot.data?.counts.unread_notifications ?? 0, list.data) && (
        <GhostButton title={tp('portal.inbox.mark_all')} icon="checkmark-done" disabled={readAll.isPending} onPress={() => readAll.mutate()} />
      )}
      {failed && <Notice text={tp('portal.inbox.mark_failed')} />}
      {list.isLoading && <View style={{ gap: 10 }}><Shimmer height={72} /><Shimmer height={72} /><Shimmer height={72} /></View>}
      {list.isError && <Notice text={tp('portal.common.error')} action={tp('portal.common.retry')} onAction={() => { void list.refetch() }} />}
      {!list.isLoading && !list.isError && items.length === 0 && (
        <View style={{ gap: 8 }}>
          <Empty icon="mail-open-outline" text={tp('portal.inbox.empty_title')} />
          <Text style={[fonts.small, { color: C.text2, textAlign: 'center' }]}>{tp('portal.inbox.empty_body', { venue: boot.data?.venue.name ?? '' })}</Text>
        </View>
      )}
      {items.map(n => {
        const unread = isUnread(n)
        const open = openId === n.id
        const offer = offerNotification(n)
        return (
          <View key={n.id} style={{ gap: 8 }}><Press onPress={() => tap(n)} label={n.title}>
            <Surface tint={unread ? C.info : undefined} style={{ gap: 6 }}>
              <View style={styles.head}>
                {unread && <View style={[styles.dot, { backgroundColor: C.info }]} accessibilityLabel={tp('portal.inbox.unread')} />}
                <Text style={[fonts.bodyStrong, { color: C.text, flex: 1 }]} numberOfLines={open ? undefined : 1}>{n.title}</Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={C.text3} />
              </View>
              {n.body ? <Text style={[fonts.small, { color: C.text2 }]} numberOfLines={open ? undefined : 2}>{n.body}</Text> : null}
              <Text style={[fonts.small, { color: C.text3 }]}>{formatDateTime(n.sent_at ?? n.created_at, language, timezone)}</Text>
            </Surface>
          </Press>
          {open && offer && <View style={{ gap: 8 }}>
            <GhostButton title={tp('portal.rewards.view_offer')} icon="pricetag-outline" onPress={() => router.navigate('/rewards?tab=offers')} />
            {offer.name && <VoucherDownload id={offer.id} name={offer.name} />}
          </View>}</View>
        )
      })}
      {list.data && list.data.last_page > 1 && (
        <View style={styles.pager}>
          <GhostButton title={tp('portal.common.previous')} disabled={page <= 1 || list.isFetching} onPress={() => { setOpenId(null); setPage(p => p - 1) }} style={{ flex: 1 }} />
          <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.common.page_of', { page, total: list.data.last_page })}</Text>
          <GhostButton title={tp('portal.common.next')} disabled={page >= list.data.last_page || list.isFetching} onPress={() => { setOpenId(null); setPage(p => p + 1) }} style={{ flex: 1 }} />
        </View>
      )}
      <Press onPress={() => router.push('/profile')} style={{ alignSelf: 'center', padding: 8 }}>
        <Text style={[fonts.smallStrong, { color: C.gold }]}>{tp('portal.inbox.preferences')}</Text>
      </Press>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 10 },
})
