import { useRef, useState } from 'react'
import { FlatList, RefreshControl, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../../lib/api'
import { KEYS, queryClient, useBoot, useQueueCounts } from '../../lib/queries'
import { uniqueRows } from '../../lib/queue'
import { failureOf } from '../../lib/failure'
import { errorKey } from '../../lib/desk'
import { ago, moment } from '../../lib/format'
import { feel } from '../../lib/haptics'
import { useT, type Key } from '../../lib/i18n'
import { C, TAB_BAR_ROOM, fonts } from '../../lib/theme'
import type { BenefitRequest, Redemption, RequestTab } from '../../lib/types'
import { Backdrop, Empty, Field, GhostButton, GoldButton, IconBadge, Notice, PageHeading, Pill, Row, Segments, Shimmer, Surface } from '../../components/ui'
import { DetailModal } from '../../components/Sheet'
import { MemberSummary } from '../../components/MemberCard'
import { Done } from '../../components/Done'
import { Glyph } from '../../components/Glyph'

type QueueRow = { kind: 'benefit'; row: BenefitRequest } | { kind: 'reward'; row: Redemption }
const STATE_COLOR: Record<string, string> = { pending: C.gold, eligible: C.gold, approved: C.info, fulfilled: C.success, declined: C.danger, cancelled: C.text2 }

/** Compact queue, full identity and code in detail. Approval and provision remain separate server transitions. */
export default function Requests() {
  const insets = useSafeAreaInsets()
  const { t, language } = useT()
  const [tab, setTab] = useState<RequestTab>('waiting')
  const [selected, setSelected] = useState<QueueRow | null>(null)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [receipt, setReceipt] = useState<Key | null>(null)
  const [failure, setFailure] = useState<Key | null>(null)
  const sending = useRef(false)
  const boot = useBoot()
  const totals = useQueueCounts()
  const list = useInfiniteQuery({ queryKey: KEYS.requests(tab), queryFn: ({ pageParam }) => api.requests(tab, pageParam), initialPageParam: 1, getNextPageParam: last => last.page < last.pages ? last.page + 1 : undefined })
  const rewardState = tab === 'done' ? 'done' : 'pending'
  const showRewards = tab !== 'approved'
  const rewards = useInfiniteQuery({ queryKey: [...KEYS.redemptions, rewardState], queryFn: ({ pageParam }) => api.redemptions(rewardState, pageParam), initialPageParam: 1, getNextPageParam: last => last.page < last.pages ? last.page + 1 : undefined, enabled: showRewards })

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['requests'] })
    void queryClient.invalidateQueries({ queryKey: KEYS.redemptions })
    void queryClient.invalidateQueries({ queryKey: KEYS.boot })
    void queryClient.invalidateQueries({ queryKey: KEYS.activity })
  }
  const act = useMutation({
    mutationFn: async ({ kind, id, reason: why }: { kind: 'approve' | 'decline' | 'done' | 'fulfil'; id: number; reason?: string }) => {
      if (kind === 'approve') return api.approve(id)
      if (kind === 'decline') return api.decline(id, why ?? '')
      if (kind === 'done') return api.done(id)
      return api.fulfil(id)
    },
    onMutate: () => setFailure(null),
    onSuccess: (_, action) => {
      feel.success()
      setReceipt(action.kind === 'approve' ? 'requests.state.approved' : action.kind === 'decline' ? 'requests.state.declined' : 'requests.state.fulfilled')
      setDeclining(false)
      refreshAll()
    },
    onError: error => { feel.warning(); setFailure(errorKey(failureOf(error).code)); refreshAll() },
    onSettled: () => { sending.current = false },
  })

  const counts = totals.isError ? undefined : totals.data
  const rows: QueueRow[] = [
    ...(showRewards ? uniqueRows(rewards.data?.pages.flatMap(page => page.redemptions) ?? []).map(row => ({ kind: 'reward' as const, row })) : []),
    ...uniqueRows(list.data?.pages.flatMap(page => page.requests) ?? []).map(row => ({ kind: 'benefit' as const, row })),
  ].sort((a, b) => (b.kind === 'reward' ? b.row.at ?? '' : b.row.asked_at ?? '').localeCompare(a.kind === 'reward' ? a.row.at ?? '' : a.row.asked_at ?? ''))
  const loading = list.isPending || (showRewards && rewards.isPending)
  const failed = list.isError || (showRewards && rewards.isError)
  const more = list.hasNextPage || (showRewards && rewards.hasNextPage)
  const loadingMore = list.isFetchingNextPage || rewards.isFetchingNextPage
  // A background refresh may advance the selected item. Never keep old actionable state when the new row is known.
  const current = selected && (rows.find(r => r.kind === selected.kind && r.row.id === selected.row.id) ?? selected)
  const titleOf = (entry: QueueRow) => (entry.kind === 'reward' ? entry.row.reward?.name : entry.row.benefit?.name) ?? '—'
  const open = (entry: QueueRow) => { setSelected(entry); setDeclining(false); setReason(''); setReceipt(null); setFailure(null) }
  const close = () => { if (!act.isPending) { setSelected(null); setFailure(null) } }
  const send = (kind: 'approve' | 'decline' | 'done' | 'fulfil') => {
    if (!current || act.isPending || sending.current) return
    sending.current = true
    act.mutate({ kind, id: current.row.id, reason: kind === 'decline' ? reason.trim() : undefined })
  }
  const waiting = current?.row.state === 'pending' || current?.row.state === 'eligible'
  const footer = current && (receipt ? <GoldButton title={t('common.done')} icon="checkmark" onPress={close} /> : declining ? <>
    <GoldButton title={t('requests.declineSend')} busy={act.isPending} disabled={reason.trim().length < 2} onPress={() => send('decline')} />
    <GhostButton title={t('common.cancel')} disabled={act.isPending} onPress={() => setDeclining(false)} />
  </> : current.kind === 'reward' ? (current.row.state === 'pending' && boot.data?.staff.can.redeem ?
    <GoldButton title={t('requests.handOver')} icon="gift" busy={act.isPending} onPress={() => send('fulfil')} /> : undefined)
    : waiting ? <>
      <GoldButton title={t('requests.approve')} icon="checkmark" busy={act.isPending} onPress={() => send('approve')} />
      <GhostButton title={t('requests.decline')} icon="close" tone={C.danger} disabled={act.isPending} onPress={() => setDeclining(true)} />
    </> : current.row.state === 'approved' ? <GoldButton title={t('requests.markDone')} icon="gift" busy={act.isPending} onPress={() => send('done')} /> : undefined)

  return <Backdrop>
    <View style={{ paddingTop: insets.top + 20, paddingHorizontal: 24, gap: 14 }}>
      <PageHeading title={t('requests.title')} />
      <Segments<RequestTab> value={tab} onChange={setTab} items={[
        { id: 'waiting', label: t('requests.tab.waiting'), icon: 'time-outline', count: counts?.waiting },
        { id: 'approved', label: t('requests.tab.approved'), icon: 'shield-checkmark-outline', count: counts?.approved },
        { id: 'done', label: t('requests.tab.done'), icon: 'checkmark' },
      ]} />
    </View>
    <FlatList data={rows} keyExtractor={r => `${r.kind}:${r.row.id}`} contentContainerStyle={{ padding: 24, paddingTop: 14, paddingBottom: TAB_BAR_ROOM, gap: 12 }}
      refreshControl={<RefreshControl refreshing={list.isRefetching || (showRewards && rewards.isRefetching)} onRefresh={refreshAll} tintColor={C.gold} />}
      ListHeaderComponent={failed || loading ? <View style={{ gap: 10 }}>
        {loading && <Shimmer height={80} />}
        {list.isError && <Notice text={t('requests.refreshError')} action={t('common.retry')} onAction={() => { void list.refetch() }} />}
        {showRewards && rewards.isError && <Notice text={t('requests.refreshError')} action={t('common.retry')} onAction={() => { void rewards.refetch() }} />}
      </View> : undefined}
      ListEmptyComponent={!loading && !failed ? <Empty icon="checkmark-done-circle-outline" text={t(`requests.empty.${tab}`)} /> : undefined}
      ListFooterComponent={more ? <GhostButton title={t('members.more')} disabled={loadingMore} onPress={() => { if (list.hasNextPage) void list.fetchNextPage(); if (showRewards && rewards.hasNextPage) void rewards.fetchNextPage() }} /> : undefined}
      renderItem={({ item }) => {
        const when = ago(item.kind === 'reward' ? item.row.at : item.row.asked_at, Math.max(list.dataUpdatedAt, rewards.dataUpdatedAt))
        return <Row card title={titleOf(item)} line={[item.row.member?.name, when ? t(when.key, { n: when.n }) : null].filter(Boolean).join(' · ')}
          left={<IconBadge name={item.kind === 'reward' ? 'gift' : 'time-outline'} color={STATE_COLOR[item.row.state] ?? C.text} />}
          right={tab === 'done' ? <Pill text={t(`requests.state.${item.row.state}` as Key)} color={STATE_COLOR[item.row.state]} /> : <Glyph name="chevron-forward" size={18} />}
          onPress={() => open(item)} />
      }}
    />
    <DetailModal visible={!!current} title={t(declining ? 'requests.decline' : current?.kind === 'reward' ? 'requests.handoverTitle' : 'requests.detailTitle')} onClose={close} busy={act.isPending} footer={footer}>
      {current && (receipt ? <Done title={t(receipt)} lines={[titleOf(current), current.row.member?.name ?? '']} /> : <>
        <Surface style={{ gap: 14, padding: 20 }}>
          <Glyph name={current.kind === 'reward' ? 'gift' : 'time-outline'} size={34} color={C.gold} />
          <Text style={[fonts.heading, { color: C.text }]}>{titleOf(current)}</Text>
          <Pill text={t(`requests.state.${current.row.state}` as Key)} color={STATE_COLOR[current.row.state]} />
          {(current.kind === 'reward' ? current.row.at : current.row.asked_at) && <Text style={[fonts.small, { color: C.text2 }]}>{moment((current.kind === 'reward' ? current.row.at : current.row.asked_at)!, language, boot.data?.venue.timezone ?? 'UTC')}</Text>}
        </Surface>
        {current.row.member && <MemberSummary member={current.row.member} onPress={act.isPending ? undefined : () => { const id = current.row.member?.id; close(); if (id) router.push(`/member/${id}`) }} />}
        {current.kind === 'reward' && <>
          <Field label={t('requests.codeLabel')} value={current.row.code} editable={false} />
          <Text style={[fonts.small, { color: C.text2 }]}>{t('requests.confirmIdentity')}</Text>
        </>}
        {current.kind === 'benefit' && current.row.decline_reason && <Text style={[fonts.body, { color: C.text2 }]}>{current.row.decline_reason}</Text>}
        {declining && <Field label={t('requests.declineReason')} value={reason} onChangeText={setReason} editable={!act.isPending} maxLength={255} multiline />}
        {failure && <Notice text={t(failure)} />}
      </>)}
    </DetailModal>
  </Backdrop>
}
