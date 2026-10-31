import { useState } from 'react'
import { FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../../lib/api'
import { KEYS, queryClient } from '../../lib/queries'
import { failureOf } from '../../lib/failure'
import { errorKey } from '../../lib/desk'
import { ago } from '../../lib/format'
import { feel } from '../../lib/haptics'
import { useT } from '../../lib/i18n'
import type { Key } from '../../lib/i18n/en'
import { C, RADIUS, TAB_BAR_ROOM, fonts } from '../../lib/theme'
import type { BenefitRequest, Redemption, RequestTab } from '../../lib/types'
import { Backdrop, Empty, Field, GhostButton, GoldButton, IconBadge, Notice, Pill, SectionTitle, Segments, Shimmer, Surface } from '../../components/ui'

const STATE_COLOR: Record<string, string> = { pending: C.warning, eligible: C.warning, approved: C.info, fulfilled: C.success, declined: C.danger, cancelled: C.text3 }

/**
 * Requests: what members asked for, waiting for staff — approve or decline (with a reason the member reads), then mark
 * as given; and rewards members claimed in their app, to hand over at the desk. The server decides who may.
 */
export default function Requests() {
  const insets = useSafeAreaInsets()
  const { t } = useT()
  const [tab, setTab] = useState<RequestTab>('waiting')
  const [declining, setDeclining] = useState<BenefitRequest | null>(null)
  const [failure, setFailure] = useState<Key | null>(null)
  const list = useQuery({ queryKey: KEYS.requests(tab), queryFn: () => api.requests(tab, 1) })
  const rewards = useQuery({ queryKey: KEYS.redemptions, queryFn: () => api.redemptions('pending', 1), enabled: tab === 'waiting' })

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['requests'] })
    void queryClient.invalidateQueries({ queryKey: KEYS.redemptions })
    void queryClient.invalidateQueries({ queryKey: KEYS.boot })
    void queryClient.invalidateQueries({ queryKey: KEYS.activity })
  }
  const act = useMutation({
    mutationFn: async ({ kind, id, reason }: { kind: 'approve' | 'decline' | 'done' | 'fulfil'; id: number; reason?: string }) => {
      if (kind === 'approve') return api.approve(id)
      if (kind === 'decline') return api.decline(id, reason ?? '')
      if (kind === 'done') return api.done(id)
      return api.fulfil(id)
    },
    onMutate: () => setFailure(null),
    onSuccess: () => { feel.success(); setDeclining(null); refreshAll() },
    onError: error => { feel.warning(); setFailure(errorKey(failureOf(error).code)); refreshAll() },
  })

  const counts = list.data?.counts
  const pendingRewards = tab === 'waiting' ? rewards.data?.redemptions ?? [] : []

  return (
    <Backdrop>
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, gap: 14 }}>
        <Text style={[fonts.display, { color: C.text }]}>{t('requests.title')}</Text>
        <Segments<RequestTab>
          value={tab}
          onChange={setTab}
          items={(['waiting', 'approved', 'done'] as RequestTab[]).map(id => ({ id, label: t(`requests.tab.${id}` as Key), count: id === 'done' ? undefined : counts?.[id] }))}
        />
        {failure && <Notice text={t(failure)} />}
      </View>

      <FlatList
        data={list.data?.requests ?? []}
        keyExtractor={r => String(r.id)}
        contentContainerStyle={{ padding: 20, paddingBottom: TAB_BAR_ROOM, gap: 12 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={refreshAll} tintColor={C.gold} />}
        ListHeaderComponent={pendingRewards.length > 0 ? (
          <View style={{ gap: 10, marginBottom: 8 }}>
            <SectionTitle title={t('requests.rewards')} />
            {pendingRewards.map(r => <RewardCard key={r.id} redemption={r} busy={act.isPending} onHandOver={() => act.mutate({ kind: 'fulfil', id: r.id })} />)}
            <SectionTitle title={t(`requests.tab.${tab}` as Key)} />
          </View>
        ) : undefined}
        ListEmptyComponent={list.isLoading ? <View style={{ gap: 10 }}><Shimmer height={110} /><Shimmer height={110} /></View> : (
          list.isError ? <Notice text={t(errorKey(failureOf(list.error).code))} action={t('common.retry')} onAction={() => { void list.refetch() }} /> : <Empty icon="checkmark-done-circle-outline" text={t(`requests.empty.${tab}` as Key)} />
        )}
        renderItem={({ item }) => (
          <RequestCard
            request={item}
            busy={act.isPending}
            onApprove={() => act.mutate({ kind: 'approve', id: item.id })}
            onDecline={() => setDeclining(item)}
            onDone={() => act.mutate({ kind: 'done', id: item.id })}
          />
        )}
      />

      <DeclineSheet request={declining} busy={act.isPending} onClose={() => setDeclining(null)} onSend={reason => { if (declining) act.mutate({ kind: 'decline', id: declining.id, reason }) }} />
    </Backdrop>
  )
}

function RequestCard({ request, busy, onApprove, onDecline, onDone }: { request: BenefitRequest; busy: boolean; onApprove: () => void; onDecline: () => void; onDone: () => void }) {
  const { t } = useT()
  const when = ago(request.asked_at, Date.now())
  const waiting = request.state === 'pending' || request.state === 'eligible'
  return (
    <Surface style={{ gap: 14 }}>
      <View style={styles.cardHead}>
        <IconBadge name="ribbon" color={STATE_COLOR[request.state] ?? C.gold} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[fonts.bodyStrong, { color: C.text }]} numberOfLines={1}>{request.benefit?.name ?? '—'}</Text>
          <Text style={[fonts.small, { color: C.text2 }]} numberOfLines={1}>
            {[request.member?.name, when ? t('requests.asked', { when: t(when.key, { n: when.n }) }) : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {/* Waiting and approved are the tab's own name; only the done tab mixes states. */}
        {!waiting && request.state !== 'approved' && <Pill text={t(`requests.state.${request.state}` as Key)} color={STATE_COLOR[request.state] ?? C.gold} />}
      </View>
      {request.decline_reason ? <Text style={[fonts.small, { color: C.text2 }]}>“{request.decline_reason}”</Text> : null}
      {waiting && (
        <View style={styles.buttons}>
          <GhostButton title={t('requests.decline')} tone={C.danger} onPress={onDecline} disabled={busy} style={{ flex: 1 }} />
          <GoldButton title={t('requests.approve')} icon="checkmark" onPress={onApprove} disabled={busy} style={{ flex: 1 }} />
        </View>
      )}
      {request.state === 'approved' && <GoldButton title={t('requests.markDone')} icon="gift" onPress={onDone} disabled={busy} />}
    </Surface>
  )
}

function RewardCard({ redemption, busy, onHandOver }: { redemption: Redemption; busy: boolean; onHandOver: () => void }) {
  const { t } = useT()
  return (
    <Surface tint={C.gold} style={{ gap: 12 }}>
      <View style={styles.cardHead}>
        <IconBadge name="gift" color={C.gold} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[fonts.bodyStrong, { color: C.text }]} numberOfLines={1}>{redemption.reward?.name ?? '—'}</Text>
          <Text style={[fonts.small, { color: C.text2 }]} numberOfLines={1}>{[redemption.member?.name, t('requests.code', { code: redemption.code })].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>
      <GoldButton title={t('requests.handOver')} icon="hand-right" onPress={onHandOver} disabled={busy} />
    </Surface>
  )
}

/** Declining asks why: the member reads it with the answer. */
function DeclineSheet({ request, busy, onClose, onSend }: { request: BenefitRequest | null; busy: boolean; onClose: () => void; onSend: (reason: string) => void }) {
  const insets = useSafeAreaInsets()
  const { t } = useT()
  const [reason, setReason] = useState('')
  return (
    <Modal visible={!!request} animationType="slide" transparent onRequestClose={onClose} onShow={() => setReason('')}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={[fonts.title, { color: C.text }]}>{t('requests.decline')}</Text>
        <Text style={[fonts.body, { color: C.text2 }]}>{[request?.benefit?.name, request?.member?.name].filter(Boolean).join(' · ')}</Text>
        <Field label={t('requests.declineReason')} value={reason} onChangeText={setReason} maxLength={255} autoFocus />
        <GoldButton title={t('requests.declineSend')} icon="close-circle" busy={busy} disabled={reason.trim().length < 2} onPress={() => onSend(reason.trim())} />
        <GhostButton title={t('common.cancel')} onPress={onClose} />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buttons: { flexDirection: 'row', gap: 10 },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: 20, gap: 14, borderTopWidth: 1, borderColor: C.hairlineStrong },
})
