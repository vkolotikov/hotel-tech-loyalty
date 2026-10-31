import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { C, RADIUS, SHADOW, fonts, tierColor, withAlpha } from '../lib/theme'
import { day, money, number, spacedNumber } from '../lib/format'
import { membershipState } from '../lib/desk'
import { useT } from '../lib/i18n'
import type { MemberRow, TierRef } from '../lib/types'
import { Pill } from './ui'

/**
 * The member as a card in the hand: the venue's name, the tier in its own colour, the name, the number to read out,
 * and the points large. Shaped like a real card (85.6 × 54 mm) and lit by the tier's colour, so a glance tells the tier.
 */
export function MemberCard({ member, tier, venue, currency }: { member: MemberRow; tier: TierRef | null; venue: string; currency: string }) {
  const { t, language } = useT()
  const tone = tierColor(tier?.color)
  const state = membershipState(member)
  const credit = Number(member.credit_balance ?? 0)

  return (
    <View style={[styles.wrap, SHADOW.card]}>
      <LinearGradient
        colors={[withAlpha(tone, 0.55), '#1a1f2c', '#0c0f17']}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* The sheen across the card, as light on a lacquered surface. */}
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.2 }}
          end={{ x: 1, y: 0.8 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.top}>
          <Text style={[fonts.label, { color: C.text, opacity: 0.85, flex: 1 }]} numberOfLines={1}>{venue}</Text>
          <Pill text={tier?.name ?? t('card.noTier')} color={tone} solid />
        </View>

        <View style={{ gap: 4 }}>
          <Text style={[fonts.title, { color: C.text }]} numberOfLines={1}>{member.name}</Text>
          <View style={styles.numberRow}>
            <Ionicons name="card-outline" size={14} color={C.text2} />
            <Text style={[fonts.smallStrong, { color: C.text2, letterSpacing: 1.2 }]}>{spacedNumber(member.member_number)}</Text>
          </View>
        </View>

        <View style={styles.bottom}>
          <View>
            <Text style={[fonts.label, { color: C.text2, fontSize: 10 }]}>{t('card.points')}</Text>
            <Text style={[fonts.figure, { color: C.goldLight }]}>{number(member.points, language)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            {state !== 'active' && (
              <Pill text={t(`card.state.${state}`)} color={state === 'expiring' ? C.warning : C.danger} />
            )}
            {member.valid_until ? (
              <Text style={[fonts.small, { color: C.text2 }]}>{t('card.validUntil', { date: day(member.valid_until, language) })}</Text>
            ) : null}
            {credit > 0 && (
              <Text style={[fonts.smallStrong, { color: C.success }]}>{t('card.credit')} {money(credit, currency, language)}</Text>
            )}
          </View>
        </View>
      </LinearGradient>
      <View style={[styles.edge, { borderColor: withAlpha(tone, 0.5) }]} pointerEvents="none" />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { borderRadius: RADIUS.xl, aspectRatio: 1.586, width: '100%' },
  card: { flex: 1, borderRadius: RADIUS.xl, padding: 20, justifyContent: 'space-between', overflow: 'hidden' },
  edge: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS.xl, borderWidth: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
})
