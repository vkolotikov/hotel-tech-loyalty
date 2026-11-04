import { Text, View } from 'react-native'
import { C, fonts, tierColor } from '../lib/theme'
import { day, money, number } from '../lib/format'
import { membershipState } from '../lib/desk'
import { useT } from '../lib/i18n'
import type { MemberRow, TierRef } from '../lib/types'
import { EclipseSurface } from './Eclipse'
import { IconBadge, Pill, Row } from './ui'
import { useDeviceAppearance } from '../lib/useEclipseAppearance'

/** Flexible height preserves full identity and larger text. */
export function MemberCard({ member, tier, venue, currency }: { member: MemberRow; tier: TierRef | null; venue: string; currency: string }) {
  const { t, language } = useT()
  const appearance = useDeviceAppearance()
  const state = membershipState(member)
  const tone = state === 'active' ? C.success : state === 'expiring' ? C.warning : C.danger
  return <EclipseSurface tone="scan" solid={appearance.solid} style={{ padding: 20, gap: 12 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
      <Text style={[fonts.heading, { color: C.text, flexGrow: 1, flexShrink: 1 }]}>{member.name}</Text>
      <Pill text={tier?.name ?? t('card.noTier')} color={tierColor(tier?.color)} />
    </View>
    <Text selectable style={[fonts.small, { color: C.text2 }]}>{member.member_number ?? venue}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
      <View><Text style={[fonts.figure, { color: C.text }]}>{number(member.points, language)}</Text><Text style={[fonts.small, { color: C.text2 }]}>{t('card.points')}</Text></View>
      <Pill text={t(`card.state.${state}`)} color={tone} />
    </View>
    {member.valid_until && <Text style={[fonts.small, { color: C.text2 }]}>{t('card.validUntil', { date: day(member.valid_until, language) })}</Text>}
    {Number(member.credit_balance ?? 0) > 0 && <Text style={[fonts.smallStrong, { color: C.success }]}>{t('card.credit')} {money(Number(member.credit_balance), currency, language)}</Text>}
  </EclipseSurface>
}

export function MemberSummary({ member, onPress }: { member: Pick<MemberRow, 'name' | 'member_number'> & { points?: number }; onPress?: () => void }) {
  const { language } = useT()
  return <Row card left={<IconBadge name="person-outline" color={C.text} />} title={member.name} line={member.member_number} onPress={onPress}
    right={member.points !== undefined ? <Text style={[fonts.smallStrong, { color: C.gold }]}>{number(member.points, language)}</Text> : undefined} />
}
