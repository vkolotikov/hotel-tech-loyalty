import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { C, RADIUS, fonts, withAlpha } from '../lib/theme'
import { verdictKey } from '../lib/desk'
import { useT } from '../lib/i18n'
import type { ScanAnswer } from '../lib/types'

/**
 * At a place or an event, the answer before anything else, large enough to read from across the desk: green with a
 * tick when the member may enter, red with a cross and the reason when not; then what the door adds (the tiers it lets
 * in, a membership ending soon, the check-in).
 */
export function VerdictBanner({ answer }: { answer: ScanAnswer }) {
  const { t } = useT()
  const verdict = answer.verdict
  if (!verdict) return null
  const color = verdict.granted ? C.success : C.danger
  const lines: string[] = []
  if (!verdict.granted && verdict.reason === 'tier_not_allowed' && verdict.allowed_tiers.length > 0) {
    lines.push(t('verdict.letsIn', { tiers: verdict.allowed_tiers.join(' · ') }))
  }
  if (verdict.expires_in_days !== null) lines.push(t('verdict.endsIn', { n: verdict.expires_in_days }))
  if (answer.checked_in) lines.push(t('verdict.checkedIn'))
  if (answer.already_in) lines.push(t('verdict.alreadyIn', { time: answer.already_in }))
  const where = verdict.place?.name ?? verdict.event?.title

  return (
    <LinearGradient colors={[withAlpha(color, 0.32), withAlpha(color, 0.08)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.banner, { borderColor: withAlpha(color, 0.5) }]}>
      <View style={[styles.mark, { backgroundColor: color }]}>
        <Ionicons name={verdict.granted ? 'checkmark' : 'close'} size={34} color="#0b0e15" />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        {where ? <Text style={[fonts.label, { color: C.text2 }]} numberOfLines={1}>{where}</Text> : null}
        <Text style={[fonts.title, { color: C.text }]}>{t(verdictKey(verdict))}</Text>
        {lines.map(line => <Text key={line} style={[fonts.small, { color: C.text }]}>{line}</Text>)}
      </View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, borderRadius: RADIUS.lg, borderWidth: 1 },
  mark: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
})
