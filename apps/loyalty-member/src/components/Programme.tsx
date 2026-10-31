import { StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { C, fonts } from '../lib/theme'
import { formatMoney, nextEvent, stampFace, stampReward, stampToGo, whenPhrase } from '../shared/portal'
import { Press, SectionTitle, Surface } from './ui'

/**
 * The stamp card, as the portal's: a dot per stamp of the current card, how many visits to the reward and what it is.
 * Nothing at a venue without a stamp card (the server says `enabled: false`).
 */
export function StampCard() {
  const { tp, language } = useT()
  const stamps = useQuery({ queryKey: ['stamps'], queryFn: api.stamps, staleTime: 60_000 })
  const face = stampFace(stamps.data)
  if (!face) return null
  const toGo = stampToGo(face)
  const reward = stampReward(face, language)
  return (
    <View>
      <SectionTitle title={tp('portal.stamps.title')} />
      <Surface style={{ gap: 14 }}>
        <Text style={[fonts.bodyStrong, { color: C.text }]}>{tp('portal.stamps.label', { have: face.count, needed: face.needed })}</Text>
        <View style={styles.dots}>
          {face.filled.map((on, i) => (
            <View key={i} style={[styles.dot, on ? { backgroundColor: C.gold, borderColor: C.gold } : { borderColor: C.goldEdge }]}>
              {on && <Ionicons name="checkmark" size={16} color={C.onGold} />}
            </View>
          ))}
        </View>
        <Text style={[fonts.small, { color: face.left > 0 ? C.text2 : C.success }]}>{tp(toGo.key, toGo.fallback, toGo.options)}</Text>
        <Text style={[fonts.smallStrong, { color: C.goldLight }]}>{tp(reward.key, reward.fallback, reward.options)}</Text>
        {face.completed > 0 && <Text style={[fonts.small, { color: C.text3 }]}>{tp('portal.stamps.completed', { cards: face.completed })}</Text>}
      </Surface>
    </View>
  )
}

/**
 * The cashback credit, as the portal's: the balance in the venue's currency, spent at the desk. Shown while the venue
 * gives credit or the member still holds some (the portal's `showsCredit`).
 */
export function CreditTile() {
  const { tp, language } = useT()
  const credit = useQuery({ queryKey: ['credit'], queryFn: api.credit, staleTime: 60_000 })
  const data = credit.data
  if (!data || !(data.enabled || data.balance > 0)) return null
  const line = data.balance > 0 ? (data.enabled ? tp('portal.credit.at_desk') : tp('portal.credit.off')) : tp('portal.credit.none')
  return (
    <Surface tint={C.success} style={styles.credit}>
      <View style={[styles.creditMark, { backgroundColor: C.successWash }]}><Ionicons name="cash-outline" size={20} color={C.success} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[fonts.bodyStrong, { color: C.text }]}>{tp('portal.credit.balance', { amount: formatMoney(data.balance, data.currency, language) })}</Text>
        <Text style={[fonts.small, { color: C.text2 }]}>{line}</Text>
      </View>
    </Surface>
  )
}

/** Home's event, as the portal's: the next one the member signed up for, else the next one open to them. */
export function NextEventCard() {
  const { tp, language } = useT()
  const events = useQuery({ queryKey: ['events'], queryFn: api.events, staleTime: 60_000 })
  const next = nextEvent(events.data)
  if (!next) return null
  const when = whenPhrase(next.event, language)
  return (
    <View>
      <SectionTitle title={next.mine ? tp('portal.events.your_next') : tp('portal.events.next_up')} action={tp('portal.events.see_all')} onAction={() => router.push('/events')} />
      <Press onPress={() => router.push('/events')} label={next.event.title}>
        <Surface tint={C.info} style={styles.credit}>
          <View style={[styles.creditMark, { backgroundColor: C.infoWash }]}><Ionicons name="ticket-outline" size={20} color={C.info} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[fonts.bodyStrong, { color: C.text }]} numberOfLines={1}>{next.event.title}</Text>
            <Text style={[fonts.small, { color: C.text2 }]}>{tp(when.key, when.fallback, when.options)}</Text>
            {next.mine && <Text style={[fonts.smallStrong, { color: C.success }]}>{tp('portal.events.signed_up')}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.text3} />
        </Surface>
      </Press>
    </View>
  )
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  credit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  creditMark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
})
