import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { C, fonts } from '../lib/theme'
import { number } from '../lib/format'
import { useT } from '../lib/i18n'
import { formatDateTime } from '../shared/portal'
import type { Activity } from '../lib/types'
import type { IconName } from './ui'

const ICON: Record<string, IconName> = {
  earn: 'add-circle', bonus: 'sparkles', redeem: 'gift', adjust: 'construct', expire: 'hourglass', reverse: 'arrow-undo', referral: 'people',
}

/** One line of the points history: what it was (the portal's words for its type), when, and the points in or out. */
export function ActivityRow({ item, timezone, last }: { item: Activity; timezone: string; last?: boolean }) {
  const { tp, language } = useT()
  const plus = item.points > 0
  const tone = item.is_reversed ? C.text3 : plus ? C.success : C.danger
  return (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={[styles.icon, { backgroundColor: plus ? C.successWash : C.dangerWash }]}>
        <Ionicons name={ICON[item.type] ?? 'ellipse'} size={16} color={plus ? C.success : C.danger} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[fonts.bodyStrong, { color: C.text }]} numberOfLines={1}>{item.description || tp(`portal.activity.type.${item.type}`, item.type)}</Text>
        <Text style={[fonts.small, { color: C.text2 }]} numberOfLines={1}>
          {[tp(`portal.activity.type.${item.type}`, item.type), formatDateTime(item.created_at, language, timezone), item.is_reversed ? tp('portal.activity.reversed') : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={[fonts.bodyStrong, { color: tone, textDecorationLine: item.is_reversed ? 'line-through' : 'none' }]}>
        {plus ? '+' : ''}{number(item.points, language)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.hairline },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
})
