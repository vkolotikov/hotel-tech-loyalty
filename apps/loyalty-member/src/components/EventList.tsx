import { useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useIsMutating, useMutation, useQuery } from '@tanstack/react-query'
import { usePreventRemove } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../lib/api'
import { failureOf } from '../lib/failure'
import { LIVE_MS, queryClient, useBoot, useRefreshOnFocus } from '../lib/queries'
import { useSession } from '../lib/session'
import { singleFlight } from '../lib/loyalty'
import { useT } from '../lib/i18n'
import { C, TAB_BAR_ROOM, fonts } from '../lib/theme'
import { actionOf, dateBlock, errorPhrase, eventCounted, noteOf, pastEvents, whenPhrase, whyPhrase } from '../shared/portal'
import type { PortalEvent, PortalEvents } from '../lib/types'
import { Backdrop, Empty, GhostButton, GoldButton, Notice, Press, Segments, Shimmer, Surface } from './ui'
import { ScreenHeader } from './ScreenHeader'
import { ActionPopup } from './ActionPopup'
import { MemberIcon } from './MemberIcon'
import { notify } from './Feedback'

/** The Home action and Events tab share one server-driven event card. */
export function MemberEvent({ event, compact = false }: { event: PortalEvent; compact?: boolean }) {
  const { t, tp, language } = useT()
  const [details, setDetails] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [run] = useState(singleFlight)
  const busy = useIsMutating({ mutationKey: ['member-event'] }) > 0
  usePreventRemove(busy, () => {})
  const finish = (answer: { event: PortalEvent }, owner: string | null | undefined) => {
    if (owner !== useSession.getState().token) return
    queryClient.setQueryData<PortalEvents>(['events'], before => before ? { ...before, upcoming: before.upcoming.map(e => e.id === answer.event.id ? answer.event : e) } : before)
    void queryClient.invalidateQueries({ queryKey: ['events'] })
    void queryClient.invalidateQueries({ queryKey: ['boot'] })
  }
  const report = (error: unknown) => { const p = errorPhrase(failureOf(error).code); setProblem(tp(p.key, p.fallback, p.options)) }
  const signUp = useMutation({
    mutationKey: ['member-event'], mutationFn: api.eventSignUp,
    onMutate: () => { setProblem(null); return { owner: useSession.getState().token } },
    onSuccess: (answer, _id, context) => { if (context?.owner !== useSession.getState().token) return; finish(answer, context.owner); notify(tp('portal.events.signed_up')) },
    onError: report,
  })
  const cancel = useMutation({
    mutationKey: ['member-event'], mutationFn: api.eventCancel,
    onMutate: () => { setProblem(null); return { owner: useSession.getState().token } },
    onSuccess: (answer, _id, context) => { if (context?.owner !== useSession.getState().token) return; finish(answer, context.owner); setCancelling(false); setDetails(false); notify(t('events.cancelled')) },
    onError: report,
  })
  const write = (which: 'signup' | 'cancel') => {
    if (queryClient.isMutating({ mutationKey: ['member-event'] })) return
    void run(() => which === 'signup' ? signUp.mutateAsync(event.id) : cancel.mutateAsync(event.id)).catch(() => {})
  }
  const action = actionOf(event)
  const when = whenPhrase(event, language)
  const date = dateBlock(event.starts_at, language)
  const note = noteOf(event, language)
  const points = event.points > 0 ? eventCounted('points', event.points, language) : null
  const controls = <>
    {action.kind === 'sign_up' && <GoldButton title={tp('portal.events.sign_up')} busy={signUp.isPending} disabled={busy} onPress={() => write('signup')} />}
    {action.kind === 'signed_up' && <View style={{ gap: 10 }}>
      <View style={styles.state}><MemberIcon name="check" color={C.success} size={20} /><Text style={[fonts.smallStrong, { color: C.success, flex: 1 }]}>{tp('portal.events.signed_up')}</Text></View>
      {action.canCancel && <GhostButton title={tp('portal.events.cancel_sign_up')} disabled={busy} onPress={() => setCancelling(true)} />}
    </View>}
    {action.kind === 'checked_in' && <Text style={[fonts.smallStrong, { color: C.success }]}>{tp('portal.events.checked_in')}</Text>}
    {action.kind === 'come_along' && <Text style={[fonts.smallStrong, { color: C.text2 }]}>{tp('portal.events.come_along')}</Text>}
    {action.kind === 'full' && <Text style={[fonts.smallStrong, { color: C.text2 }]}>{tp('portal.events.full')}</Text>}
    {action.kind === 'why_not' && (() => { const p = whyPhrase(action.code); return <Text style={[fonts.smallStrong, { color: C.warning }]}>{tp(p.key, p.fallback, p.options)}</Text> })()}
  </>
  return <>
    <Surface style={{ gap: 12 }}>
      <Press label={t('events.details') + ': ' + event.title} onPress={() => setDetails(true)} haptic={false}>
        <View style={styles.head}>
          {compact ? <MemberIcon name="calendar" color={C.gold} size={26} /> : <View style={[styles.date, { borderColor: C.goldEdge }]}><Text style={[fonts.number, { color: C.gold }]}>{date.day}</Text><Text style={[fonts.small, { color: C.text2 }]}>{date.month}</Text></View>}
          <View style={{ flex: 1, gap: 3 }}><Text style={[compact ? fonts.bodyStrong : fonts.heading, { color: C.text }]}>{event.title}</Text>{!compact && <Text style={[fonts.small, { color: C.text2 }]}>{tp(when.key, when.fallback, when.options)}</Text>}</View>
        </View>
      </Press>
      {compact && <Text style={[fonts.small, { color: C.text2 }]}>{tp(when.key, when.fallback, when.options)}</Text>}
      {event.where && <View style={styles.state}><MemberIcon name="location" size={20} color={C.gold} /><Text style={[fonts.small, { color: C.text2, flex: 1 }]}>{event.where}</Text></View>}
      {problem && !details && !cancelling && <Notice text={problem} />}
      {controls}
      {!compact && <Press label={t('events.details')} onPress={() => setDetails(true)}><View style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={[fonts.bodyStrong, { color: C.text }]}>{t('events.details')}</Text></View></Press>}
    </Surface>
    <ActionPopup visible={details || cancelling} title={cancelling ? t('events.cancelTitle') : event.title} busy={busy} onClose={() => { setDetails(false); setCancelling(false); setProblem(null) }}>
      {cancelling ? <>
        <Text style={[fonts.bodyStrong, { color: C.text }]}>{event.title}</Text>
        <Text style={[fonts.body, { color: C.text2 }]}>{t('events.cancelBody')}</Text>
        {problem && <Notice text={problem} />}
        <GhostButton title={tp('portal.events.cancel_sign_up')} tone={C.danger} busy={cancel.isPending} onPress={() => write('cancel')} />
        <GhostButton title={t('events.keepPlace')} disabled={busy} onPress={() => setCancelling(false)} />
      </> : <>
      <Text style={[fonts.bodyStrong, { color: C.text }]}>{tp(when.key, when.fallback, when.options)}</Text>
      {event.where && <Text style={[fonts.small, { color: C.text2 }]}>{event.where}</Text>}
      {event.description && <Text style={[fonts.body, { color: C.text2 }]}>{event.description}</Text>}
      {points && <Text style={[fonts.smallStrong, { color: C.gold }]}>{tp(points.key, points.fallback, points.options)}</Text>}
      {note && <Text style={[fonts.small, { color: C.text2 }]}>{tp(note.key, note.fallback, note.options)}</Text>}
      {problem && <Notice text={problem} />}{controls}
      </>}
    </ActionPopup>
  </>
}

export function EventList() {
  const { t, tp, language } = useT()
  const insets = useSafeAreaInsets()
  const boot = useBoot()
  const q = useQuery({ queryKey: ['events'], queryFn: api.events, enabled: !!boot.data?.member, staleTime: LIVE_MS })
  const [selection, setTab] = useState<'upcoming' | 'registered' | 'attended' | null>(null)
  const tab = selection ?? (boot.data?.capabilities.events === false ? 'attended' : 'upcoming')
  useRefreshOnFocus([['events'], ['boot']])
  const upcoming = boot.data?.capabilities.events ? q.data?.upcoming ?? [] : []
  const list = tab === 'registered' ? upcoming.filter(e => e.my === 'signed_up' || e.checked_in) : upcoming
  const attended = q.data ? pastEvents(q.data) : []
  return <Backdrop><ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: TAB_BAR_ROOM, paddingHorizontal: 24, gap: 16 }} refreshControl={<RefreshControl refreshing={q.isRefetching} tintColor={C.gold} onRefresh={() => { void q.refetch() }} />}>
    <ScreenHeader title={tp('portal.events.title')} />
    <Segments value={tab} onChange={setTab} items={[{ id: 'upcoming', label: tp('portal.events.coming_up') }, { id: 'registered', label: t('events.registeredTab') }, { id: 'attended', label: tp('portal.events.attended') }]} />
    {q.isLoading && <Shimmer height={240} />}
    {q.isError && <Notice text={tp('portal.events.load_failed')} action={tp('portal.common.retry')} onAction={() => { void q.refetch() }} />}
    {tab !== 'attended' && list.map(e => <MemberEvent key={e.id} event={e} />)}
    {q.isSuccess && (tab === 'attended' ? attended.length === 0 : list.length === 0) && <Empty icon="calendar-outline" text={tp('portal.events.none')} />}
    {tab === 'attended' && attended.map(e => { const d = dateBlock(e.starts_at, language); const p = e.points > 0 ? eventCounted('points', e.points, language) : null; return <Surface key={e.id} style={{ gap: 8 }}><Text style={[fonts.bodyStrong, { color: C.text }]}>{e.title}</Text><Text style={[fonts.small, { color: C.text2 }]}>{d.day} {d.month}</Text>{p && <Text style={[fonts.smallStrong, { color: C.success }]}>{tp(p.key, p.fallback, p.options)}</Text>}</Surface> })}
  </ScrollView></Backdrop>
}
const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  date: { width: 58, minHeight: 64, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
})
