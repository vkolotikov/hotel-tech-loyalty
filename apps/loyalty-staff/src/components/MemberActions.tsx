import { View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useT } from '../lib/i18n'
import type { Bootstrap, MemberRow } from '../lib/types'
import { ActionTile } from './ui'

/** Server rights and enabled earning methods determine available actions. */
export function MemberActions({ member, boot }: { member: MemberRow; boot: Bootstrap }) {
  const router = useRouter()
  const { t } = useT()
  const { width, fontScale } = useWindowDimensions()
  const stacked = fontScale >= 1.4 || (fontScale > 1.1 && width < 360)
  const actionStyle = stacked ? undefined : { flex: 1 }
  const can = boot.staff.can
  const ways = boot.programme.ways
  const usable = member.is_active && member.membership_state !== 'expired' && !(member as MemberRow & { is_erased?: boolean }).is_erased
  if (!usable) return null
  return <View style={{ gap: 12 }}>
    {(can.award || (can.redeem && member.points > 0)) && <View style={{ flexDirection: stacked ? 'column' : 'row', gap: 12 }}>
      {can.award && <ActionTile primary style={actionStyle} title={t('result.award')} icon="add-circle" onPress={() => router.push({ pathname: '/points', params: { id: String(member.id), mode: 'award' } })} />}
      {can.redeem && member.points > 0 && <ActionTile style={actionStyle} title={t('result.redeem')} icon="remove-circle" onPress={() => router.push({ pathname: '/points', params: { id: String(member.id), mode: 'redeem' } })} />}
    </View>}
    {can.award && (ways?.checkin || ways?.desk_earn) && <View style={{ flexDirection: stacked ? 'column' : 'row', gap: 12 }}>
      {ways.desk_earn && <ActionTile style={actionStyle} title={t('purchase.short')} icon="receipt-outline" onPress={() => router.push({ pathname: '/check-in', params: { id: String(member.id), mode: 'purchase' } })} />}
      {ways.checkin && <ActionTile style={actionStyle} title={t('result.checkIn')} icon="checkmark" onPress={() => router.push({ pathname: '/check-in', params: { id: String(member.id), mode: 'visit' } })} />}
    </View>}
  </View>
}
