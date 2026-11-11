import { Image, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { C, RADIUS, SHADOW, fonts } from '../lib/theme'
import { useT } from '../lib/i18n'
import { counted, membershipPhrase, toGoPhrase, type CardProgress } from '../shared/portal'
import type { PortalMember } from '../lib/types'
import { Picture, Press } from './ui'
import { MemberIcon } from './MemberIcon'
import { AnimatedBalance, PointsArrival } from './Feedback'

/** Identity, server validity and two separate actions; the whole card is never a nested button. */
export function MemberCard({ member, venue, logo, currency, points = true, onCard, onBalance }: {
  member: PortalMember; venue: string; logo?: string | null; currency: string; points?: boolean; onCard?: () => void; onBalance?: () => void
}) {
  const { t, tp, language } = useT()
  const membership = membershipPhrase(member.membership, language)
  const progress = member.progress as CardProgress
  const remaining = toGoPhrase(progress, currency, language)
  const next = remaining ? tp(remaining.key, remaining.fallback, remaining.options) : progress.next_tier ? counted(tp, 'home.points_to_go', progress.points_needed, language) : null
  const percent = Math.max(0, Math.min(100, progress.percentage ?? 0))
  return <View style={[styles.wrap, SHADOW.card, { borderColor: C.goldEdge }]}>
    <LinearGradient colors={['#344359', '#131d2a', C.goldDeep]} locations={[0, .4, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.top}>
        <Picture url={logo} style={styles.mark} fallback={<Image source={require('../../assets/icon.png')} style={styles.mark} accessible={false} />} />
        <Text style={[fonts.bodyStrong, { color: C.text, flex: 1 }]}>{venue}</Text>
        {member.tier && <Text style={[fonts.small, { color: C.gold }]}>{member.tier.name}</Text>}
      </View>
      <Text style={[fonts.heading, { color: C.text }]}>{member.name}</Text>
      {membership && <Text style={[fonts.small, { color: membership.tone === 'danger' ? C.danger : membership.tone === 'warning' ? C.warning : C.text2 }]}>{tp(membership.key, membership.fallback, membership.options)}</Text>}
      {member.membership?.state === 'off' && <Text style={[fonts.small, { color: C.danger }]}>{tp('portal.design.membership_off')}</Text>}
      {points && <Press label={t('balance.title')} onPress={onBalance} haptic={false}>
        <View style={styles.balance}>
          <AnimatedBalance value={member.current_points} language={language} />
          <Text style={[fonts.small, { color: C.text2, flex: 1 }]}>{tp('portal.common.points')}</Text>
          <PointsArrival />
        </View>
      </Press>}
      {points && member.membership_mode !== 'assigned' && progress.next_tier && <View style={{ gap: 6 }}>
        <View style={styles.track}><View style={{ width: (percent + '%') as `${number}%`, height: 3, borderRadius: 2, backgroundColor: C.gold }} /></View>
        <Text style={[fonts.small, { color: C.text2 }]}>{[tp('portal.home.progress_to', { tier: progress.next_tier.name }), next].filter(Boolean).join(' · ')}</Text>
      </View>}
      <Press onPress={onCard} label={t('home.showCard')} haptic={false}>
        <View style={styles.show}><Text style={[fonts.bodyStrong, { color: C.gold, flex: 1 }]}>{t('home.showCard')}</Text><MemberIcon name="card" color={C.gold} /></View>
      </Press>
    </LinearGradient>
  </View>
}

const styles = StyleSheet.create({
  wrap: { borderRadius: RADIUS.lg, borderWidth: 1, overflow: 'hidden' },
  card: { paddingHorizontal: 20, paddingVertical: 18, gap: 11 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 30, height: 30, borderRadius: 8 },
  balance: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, position: 'relative' },
  show: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.15)', overflow: 'hidden' },
})
