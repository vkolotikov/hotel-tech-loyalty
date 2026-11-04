import { View } from 'react-native'
import { router } from 'expo-router'
import { useT } from '../lib/i18n'
import type { Bootstrap, MemberRow } from '../lib/types'
import { GhostButton, GoldButton } from './ui'

/** Server rights and enabled earning methods determine available actions. */
export function MemberActions({ member, boot }: { member: MemberRow; boot: Bootstrap }) {
  const { t } = useT()
  const can = boot.staff.can
  const ways = boot.programme.ways
  const usable = member.is_active && member.membership_state !== 'expired' && !(member as MemberRow & { is_erased?: boolean }).is_erased
  if (!usable) return null
  return <View style={{ gap: 12 }}>
    {(can.award || (can.redeem && member.points > 0)) && <View style={{ flexDirection: 'row', gap: 12 }}>
      {can.award && <GoldButton style={{ flex: 1 }} title={t('result.award')} icon="add-circle" onPress={() => router.push({ pathname: '/points', params: { id: String(member.id), mode: 'award' } })} />}
      {can.redeem && member.points > 0 && <GhostButton style={{ flex: 1 }} title={t('result.redeem')} icon="remove-circle" onPress={() => router.push({ pathname: '/points', params: { id: String(member.id), mode: 'redeem' } })} />}
    </View>}
    {can.award && (ways?.checkin || ways?.desk_earn) && <View style={{ flexDirection: 'row', gap: 12 }}>
      {ways.desk_earn && <GhostButton style={{ flex: 1 }} title={t('purchase.short')} icon="receipt-outline" onPress={() => router.push({ pathname: '/check-in', params: { id: String(member.id), mode: 'purchase' } })} />}
      {ways.checkin && <GhostButton style={{ flex: 1 }} title={t('result.checkIn')} icon="checkmark" onPress={() => router.push({ pathname: '/check-in', params: { id: String(member.id), mode: 'visit' } })} />}
    </View>}
  </View>
}
