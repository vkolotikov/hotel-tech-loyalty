import { StyleSheet, Text, View } from 'react-native'
import { C, fonts, withAlpha } from '../lib/theme'
import { Surface } from './ui'
import { Glyph } from './Glyph'
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
    <Surface style={styles.banner}>
      <View style={[styles.mark, { backgroundColor: withAlpha(color, 0.15) }]}>
        <Glyph name={verdict.granted ? 'checkmark' : 'close'} size={34} color={color} />
      </View>
      <View style={{ gap: 8, alignItems: 'center' }}>
        {where ? <Text style={[fonts.label, { color: C.text2 }]} numberOfLines={1}>{where}</Text> : null}
        <Text style={[fonts.heading, { color, textAlign: 'center' }]}>{t(verdictKey(verdict))}</Text>
        {lines.map(line => <Text key={line} style={[fonts.small, { color: C.text }]}>{line}</Text>)}
      </View>
    </Surface>
  )
}

const styles = StyleSheet.create({
  banner: { alignItems: 'center', gap: 16, padding: 24, minHeight: 200 },
  mark: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
})
