import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { C, fonts, memberCardMaterial } from '../lib/theme'
import { day, money, number } from '../lib/format'
import { membershipState } from '../lib/desk'
import { useT } from '../lib/i18n'
import type { MemberRow, TierRef } from '../lib/types'
import { Glyph } from './Glyph'
import { IconBadge, Pill, Row } from './ui'
import { useDeviceAppearance } from '../lib/useEclipseAppearance'

/** Flexible height preserves full identity and larger text. */
export function MemberCard({ member, tier, venue, currency }: { member: MemberRow; tier: TierRef | null; venue: string; currency: string }) {
  const { t, language } = useT()
  const appearance = useDeviceAppearance()
  const state = membershipState(member)
  const tone = state === 'active' ? C.success : state === 'expiring' ? C.warning : C.danger
  const material = memberCardMaterial(tier?.color, !!tier)
  return <LinearGradient colors={material.rim} locations={[0, 0.38, 0.7, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 28, padding: 1.2, overflow: 'hidden' }}>
    <LinearGradient colors={appearance.solid ? [material.solid, material.solid] : material.face} locations={appearance.solid ? undefined : [0, 0.35, 0.73, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 27, padding: 22, gap: 18, overflow: 'hidden' }}>
    {!appearance.solid && <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={material.sheen} start={{ x: 0, y: 0 }} end={{ x: 0.85, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', width: 340, height: 340, right: -175, top: -130, borderRadius: 170, borderWidth: 1, borderColor: material.engraving }} />
      <View style={{ position: 'absolute', width: 304, height: 304, right: -157, top: -112, borderRadius: 152, borderWidth: 1, borderColor: material.engraving }} />
      <View style={{ position: 'absolute', width: 268, height: 268, right: -139, top: -94, borderRadius: 134, borderWidth: 1, borderColor: material.engraving }} />
      <View style={{ position: 'absolute', inset: 7, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, borderColor: material.hairline }} />
    </View>}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Glyph name="shield-checkmark-outline" color={material.highlight} size={22} />
      <Text style={[fonts.smallStrong, { color: material.highlight, flexShrink: 1 }]}>{tier?.name ?? t('card.noTier')}</Text>
    </View>
    <View style={{ gap: 5 }}>
      <Text style={[fonts.heading, { color: C.text }]}>{member.name}</Text>
      <Text selectable style={[fonts.cardNumber, { color: C.text2 }]}>{member.member_number ?? venue}</Text>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: material.hairline }}>
      <View><Text style={[fonts.figure, { color: material.highlight }]}>{number(member.points, language)}</Text><Text style={[fonts.small, { color: C.text2 }]}>{t('card.points')}</Text></View>
      <Pill text={t(`card.state.${state}`)} color={tone} />
    </View>
    {member.valid_until && <Text style={[fonts.small, { color: C.text2 }]}>{t('card.validUntil', { date: day(member.valid_until, language) })}</Text>}
    {Number(member.credit_balance ?? 0) > 0 && <Text style={[fonts.smallStrong, { color: C.success }]}>{t('card.credit')} {money(Number(member.credit_balance), currency, language)}</Text>}
    </LinearGradient>
  </LinearGradient>
}

export function MemberSummary({ member, onPress }: { member: Pick<MemberRow, 'name' | 'member_number'> & { points?: number }; onPress?: () => void }) {
  const { language } = useT()
  return <Row card left={<IconBadge name="person-outline" color={C.text} />} title={member.name} line={member.member_number} onPress={onPress}
    right={member.points !== undefined ? <Text style={[fonts.smallStrong, { color: C.gold }]}>{number(member.points, language)}</Text> : undefined} />
}
