import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, AppState, Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { api } from '../lib/api'
import { KEYS, LIVE_MS, queryClient, useBoot } from '../lib/queries'
import { useSession } from '../lib/session'
import { useReducedMotion } from '../lib/useReducedMotion'
import { useT, type Language } from '../lib/i18n'
import { number } from '../lib/format'
import { C, SHADOW, fonts } from '../lib/theme'
import { feel } from '../lib/haptics'
import { advanceFeedback, type FeedbackLedger, type LoyaltyFeedback } from '../lib/loyaltyFeedback'
import { MemberIcon } from './MemberIcon'

type Tone = 'success' | 'info'
interface Notice { owner: string | null; text: string; tone: Tone; id: number }
interface Award { owner: string; event: LoyaltyFeedback; id: number; at: number }
export const useFeedback = create<{ notice: Notice | null; award: Award | null }>(() => ({ notice: null, award: null }))
let sequence = 0
let ledger: FeedbackLedger | null = null
let lastAwardAt = 0

/** Called after successful writes only; the host itself is nonblocking. */
export function notify(text: string, tone: Tone = 'success'): void {
  useFeedback.setState({ notice: { owner: useSession.getState().token, text, tone, id: ++sequence } })
}

useSession.subscribe((next, before) => {
  if (next.token !== before.token) { ledger = null; lastAwardAt = 0; useFeedback.setState({ notice: null, award: null }) }
})

/** Observe canonical member facts; this component contains no award/check-in mutation. */
export function LoyaltyFeedbackBridge() {
  const token = useSession(s => s.token)
  const boot = useBoot()
  const { t, language } = useT()
  const member = boot.data?.member
  const events = useQuery({ queryKey: ['events'], queryFn: api.events, enabled: !!token && !!member, staleTime: LIVE_MS, refetchInterval: 30_000 })
  const stamps = useQuery({ queryKey: ['stamps'], queryFn: api.stamps, enabled: !!token && !!member && !!boot.data?.capabilities.loyalty, staleTime: LIVE_MS, refetchInterval: 30_000 })
  useEffect(() => {
    if (!token || !member || token !== useSession.getState().token || member.user.id !== useSession.getState().user?.id) return
    const s = stamps.data
    const update = advanceFeedback(ledger, {
      owner: token,
      balance: boot.data?.capabilities.loyalty ? member.current_points : null,
      activity: member.recent_activity,
      checkins: events.data ? [...events.data.upcoming.filter(e => e.checked_in).map(e => e.id), ...events.data.attended.map(e => e.id)] : undefined,
      stamps: s ? s.enabled ? { cardId: s.card?.id ?? 0, count: s.card?.stamps_count ?? 0, completed: s.completed_cards ?? 0 } : null : undefined,
    })
    ledger = update.ledger
    const event = update.feedback
    if (!event || AppState.currentState !== 'active') return
    if (event.kind !== 'points' && Date.now() - lastAwardAt < 1800) return
    lastAwardAt = Date.now()
    useFeedback.setState({ award: { owner: token, event, id: ++sequence, at: Date.now() } })
    void queryClient.invalidateQueries({ queryKey: KEYS.history })
    const text = event.kind === 'points' ? t('feedback.points', { n: number(event.points ?? 0, language) }) : event.kind === 'checkin' ? t('feedback.checkin') : t(event.completed ? 'feedback.stampComplete' : 'feedback.stamp')
    feel.success()
    notify(text)
  }, [token, member, boot.data?.capabilities.loyalty, events.data, stamps.data, t, language])
  return null
}

export function FeedbackHost() {
  const notice = useFeedback(s => s.notice)
  const token = useSession(s => s.token)
  return notice && notice.owner === token ? <Toast key={notice.id} notice={notice} /> : null
}

function Toast({ notice }: { notice: Notice }) {
  const insets = useSafeAreaInsets()
  const reduce = useReducedMotion()
  const [progress] = useState(() => new Animated.Value(0))
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    if (notice.owner !== useSession.getState().token) return
    AccessibilityInfo.announceForAccessibility(notice.text)
    Animated.timing(progress, { toValue: 1, duration: reduce ? 0 : 180, useNativeDriver: true }).start()
    const timeout = Platform.OS === 'android' ? AccessibilityInfo.getRecommendedTimeoutMillis(2200).catch(() => 2200) : Promise.resolve(2200)
    void timeout.then(ms => {
      if (!live) return
      timer = setTimeout(() => Animated.timing(progress, { toValue: 0, duration: reduce ? 0 : 160, useNativeDriver: true }).start(({ finished }) => {
        if (live && finished && useFeedback.getState().notice?.id === notice.id) useFeedback.setState({ notice: null })
      }), ms)
    })
    return () => { live = false; if (timer) clearTimeout(timer); progress.stopAnimation() }
  }, [notice, progress, reduce])
  return <View pointerEvents="none" style={[styles.toastPosition, { top: insets.top + 12 }]}>
    <Animated.View testID="member-feedback" style={[styles.toast, SHADOW.card, { opacity: progress, transform: reduce ? [] : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }]}>
      <MemberIcon name="check" color={C.success} size={24} />
      <Text style={[fonts.bodyStrong, { color: C.text, flex: 1 }]}>{notice.text}</Text>
    </Animated.View>
  </View>
}

/** The number is always the server value. Only its visual interpolation changes. */
export function AnimatedBalance({ value, language }: { value: number; language: Language }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(value)
  const previous = useRef(value)
  useEffect(() => {
    const start = previous.current
    previous.current = value
    const n = new Animated.Value(start)
    const listener = n.addListener(({ value: v }) => setShown(Math.round(v)))
    Animated.timing(n, { toValue: value, duration: reduce ? 0 : 650, useNativeDriver: false }).start()
    return () => { n.stopAnimation(); n.removeListener(listener) }
  }, [value, reduce])
  return <Text accessibilityLabel={number(value, language)} style={[fonts.figure, { color: C.text, fontVariant: ['tabular-nums'] }]}>{number(reduce ? value : shown, language)}</Text>
}

export function PointsArrival() {
  const award = useFeedback(s => s.award)
  const token = useSession(s => s.token)
  return award?.owner === token && award.event.kind === 'points' ? <Arrival key={award.id} award={award} /> : null
}

function Arrival({ award }: { award: Award }) {
  const [progress] = useState(() => new Animated.Value(0))
  const [openedAt] = useState(Date.now)
  const fresh = openedAt - award.at < 1800
  const reduce = useReducedMotion()
  const { t, language } = useT()
  useEffect(() => {
    if (!fresh) return
    const animation = Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: reduce ? 0 : 180, useNativeDriver: true }),
      Animated.delay(650),
      Animated.timing(progress, { toValue: 2, duration: reduce ? 0 : 320, useNativeDriver: true }),
    ])
    animation.start()
    return () => animation.stop()
  }, [progress, reduce, fresh])
  if (!fresh) return null
  return <Animated.View pointerEvents="none" accessible={false} testID="points-arrival" style={[styles.arrival, { borderColor: C.goldEdge, opacity: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }), transform: reduce ? [] : [
    { translateY: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [-8, 0, 30] }) },
    { scale: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [.85, 1, .9] }) },
  ] }]}><MemberIcon name="check" size={18} color={C.gold} /><Text style={[fonts.smallStrong, { color: C.gold }]}>{t('feedback.points', { n: number(award.event.points ?? 0, language) })}</Text></Animated.View>
}

export function AwardPulse() {
  const award = useFeedback(s => s.award)
  const token = useSession(s => s.token)
  return award?.owner === token ? <Pulse key={award.id} award={award} /> : null
}
function Pulse({ award }: { award: Award }) {
  const [openedAt] = useState(Date.now)
  const [progress] = useState(() => new Animated.Value(0))
  const reduce = useReducedMotion()
  const fresh = openedAt - award.at < 1800
  useEffect(() => {
    if (!fresh || reduce) return
    const animation = Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 170, useNativeDriver: true }),
      Animated.timing(progress, { toValue: 2, duration: 650, useNativeDriver: true }),
    ])
    animation.start()
    return () => { animation.stop(); progress.setValue(0) }
  }, [fresh, reduce, progress])
  if (!fresh || reduce) return null
  return <Animated.View pointerEvents="none" accessible={false} testID="award-pulse" style={[StyleSheet.absoluteFill, { borderRadius: 24, borderWidth: 1.5, borderColor: C.gold, opacity: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [0, .8, 0] }) }]} />
}

const styles = StyleSheet.create({
  toastPosition: { position: 'absolute', left: 24, right: 24, zIndex: 100, alignItems: 'center' },
  toast: { maxWidth: 480, width: '100%', padding: 18, borderRadius: 24, borderWidth: 1, borderColor: C.hairline, backgroundColor: C.surface2, flexDirection: 'row', alignItems: 'center', gap: 10 },
  arrival: { position: 'absolute', right: 0, top: -34, backgroundColor: C.surface3, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, gap: 6, flexDirection: 'row', alignItems: 'center' },
})
