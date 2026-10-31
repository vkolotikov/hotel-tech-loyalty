import { StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useT } from '../lib/i18n'
import type { Key } from '../lib/i18n/en'
import { C, RADIUS, fonts, withAlpha } from '../lib/theme'
import type { Bootstrap, MemberRow } from '../lib/types'
import { Press, type IconName } from './ui'

/**
 * What staff do with a member at the desk, each only where the server's rights and the venue's ways allow it: give
 * points, use points, check in (when check-in or earning at the desk is on). The server checks each again.
 */
export function MemberActions({ member, boot }: { member: MemberRow; boot: Bootstrap }) {
  const { t } = useT()
  const can = boot.staff.can
  const ways = boot.programme.ways
  const usable = member.is_active && member.membership_state !== 'expired'
  const actions: { key: string; icon: IconName; label: Key; color: string; go: () => void }[] = []
  if (can.award && usable) actions.push({ key: 'award', icon: 'add-circle', label: 'result.award', color: C.gold, go: () => router.push({ pathname: '/points', params: { id: String(member.id), mode: 'award' } }) })
  if (can.redeem && usable && member.points > 0) actions.push({ key: 'redeem', icon: 'remove-circle', label: 'result.redeem', color: '#c58cff', go: () => router.push({ pathname: '/points', params: { id: String(member.id), mode: 'redeem' } }) })
  if (usable && (ways?.checkin || ways?.desk_earn)) actions.push({ key: 'checkin', icon: 'walk', label: 'result.checkIn', color: C.success, go: () => router.push({ pathname: '/check-in', params: { id: String(member.id) } }) })
  if (actions.length === 0) return null

  return (
    <View style={styles.row}>
      {actions.map(action => (
        <Press key={action.key} onPress={action.go} style={{ flex: 1 }} label={t(action.label)}>
          <View style={[styles.action, { borderColor: withAlpha(action.color, 0.35), backgroundColor: withAlpha(action.color, 0.1) }]}>
            <Ionicons name={action.icon} size={26} color={action.color} />
            <Text style={[fonts.smallStrong, { color: C.text, textAlign: 'center' }]} numberOfLines={2}>{t(action.label)}</Text>
          </View>
        </Press>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  action: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, paddingHorizontal: 8, borderRadius: RADIUS.lg, borderWidth: 1, minHeight: 96 },
})
