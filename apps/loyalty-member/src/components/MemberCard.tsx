import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { C, RADIUS, SHADOW, fonts, tierColor, withAlpha } from '../lib/theme'
import { number, spacedNumber } from '../lib/format'
import { useT } from '../lib/i18n'
import { counted, membershipPhrase, tierTone, toGoPhrase, type CardProgress } from '../shared/portal'
import type { PortalMember } from '../lib/types'
import { Pill } from './ui'

/** `rgb(r g b)` from the portal's `tierTone()` as `#rrggbb`, so the card's washes can take an alpha. */
function hexOf(rgb: string | null): string | null {
  const m = /^rgb\((\d+) (\d+) (\d+)\)$/.exec(rgb ?? '')
  return m ? `#${[m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('')}` : null
}

/**
 * The membership as a card in the hand: the venue, the tier in its own colour (lightened where it would vanish on the
 * dark card, as the portal does), the member's name and number, the points large, and the way to the next tier in the
 * programme's own measure (points, visits or spend). Shaped like a real card and lit by the tier, so a glance tells it.
 */
export function MemberCard({ member, venue, currency }: { member: PortalMember; venue: string; currency: string }) {
  const { tp, language } = useT()
  const tone = hexOf(tierTone(member.tier?.color_hex)) ?? tierColor(member.tier?.color_hex)
  const progress = member.progress as CardProgress
  const toGo = toGoPhrase(progress, currency, language)
  const toGoText = toGo ? tp(toGo.key, toGo.fallback, toGo.options) : progress.next_tier ? counted(tp, 'home.points_to_go', progress.points_needed, language) : null
  const membership = membershipPhrase(member.membership, language)
  const percent = Math.max(0, Math.min(100, progress.percentage ?? 0))

  return (
    <View style={[styles.wrap, SHADOW.card, { borderColor: withAlpha(tone, 0.45) }]}>
      <LinearGradient colors={[withAlpha(tone, 0.5), '#1a1f2c', '#0c0f17']} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.2 }}
          end={{ x: 1, y: 0.8 }}
          style={styles.sheen}
          pointerEvents="none"
        />
        <View style={styles.top}>
          <Text style={[fonts.label, { color: C.text, opacity: 0.85, flex: 1 }]} numberOfLines={1}>{venue}</Text>
          {member.tier && <Pill text={member.tier.name} color={tone} solid />}
        </View>

        <View style={{ gap: 4 }}>
          <Text style={[fonts.title, { color: C.text }]} numberOfLines={1}>{member.name}</Text>
          <View style={styles.numberRow}>
            <Ionicons name="card-outline" size={14} color={C.text2} />
            <Text style={[fonts.smallStrong, { color: C.text2, letterSpacing: 1.2 }]}>{spacedNumber(member.member_number)}</Text>
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <View style={styles.bottom}>
            <View>
              <Text style={[fonts.label, { color: C.text2, fontSize: 10 }]}>{tp('portal.home.balance')}</Text>
              <Text style={[fonts.figure, { color: C.goldLight }]}>{number(member.current_points, language)}</Text>
            </View>
            {membership && (
              <Text style={[fonts.small, { color: membership.tone === 'danger' ? C.danger : membership.tone === 'warning' ? C.warning : C.text2, textAlign: 'right', flexShrink: 1 }]}>
                {tp(membership.key, membership.fallback, membership.options)}
              </Text>
            )}
          </View>

          {progress.next_tier && (
            <View style={{ gap: 6 }}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${percent}%`, backgroundColor: tone }]} />
              </View>
              <View style={styles.progressRow}>
                <Text style={[fonts.small, { color: C.text2 }]} numberOfLines={1}>{tp('portal.home.progress_to', { tier: progress.next_tier.name })}</Text>
                {toGoText && <Text style={[fonts.smallStrong, { color: C.text }]} numberOfLines={1}>{toGoText}</Text>}
              </View>
            </View>
          )}
        </View>
      </LinearGradient>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden' },
  card: { padding: 22, gap: 18, minHeight: 210, justifyContent: 'space-between' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
})
