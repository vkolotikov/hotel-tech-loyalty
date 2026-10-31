import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../lib/api'
import { KEYS, tierOf, useBoot, useScan } from '../lib/queries'
import { useT } from '../lib/i18n'
import { C, fonts } from '../lib/theme'
import { Backdrop, GhostButton, GoldButton, Press, SectionTitle, Surface } from '../components/ui'
import { MemberCard } from '../components/MemberCard'
import { VerdictBanner } from '../components/VerdictBanner'
import { MemberActions } from '../components/MemberActions'
import { BenefitList } from '../components/BenefitList'

/**
 * What a scan answered: at a door the verdict first, large; then the member as their card, what staff can do now, and
 * the tier's benefits. "Scan the next member" goes straight back to the camera.
 */
export default function Scanned() {
  const insets = useSafeAreaInsets()
  const { t } = useT()
  const boot = useBoot()
  const answer = useScan(s => s.answer)
  const memberId = answer?.member.id ?? 0
  // At the desk the scan answers the member alone; their benefits come with the member's own page.
  const detail = useQuery({ queryKey: KEYS.member(memberId), queryFn: () => api.member(memberId), enabled: !!answer && !answer.benefits })

  if (!answer || !boot.data) {
    return <Backdrop><View style={{ flex: 1 }} /></Backdrop>
  }
  const member = detail.data?.member ?? answer.member
  const tier = tierOf(boot.data, member.tier_id)
  const benefits = answer.benefits ?? detail.data?.benefits ?? []

  return (
    <Backdrop>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, gap: 18 }}>
        <View style={styles.bar}>
          <Press onPress={() => router.back()} label={t('common.close')}>
            <View style={styles.close}><Ionicons name="close" size={22} color={C.text} /></View>
          </Press>
        </View>

        <VerdictBanner answer={answer} />
        <MemberCard member={member} tier={tier} venue={boot.data.organization.name} currency={boot.data.venue.currency} />
        <MemberActions member={member} boot={boot.data} />

        <Surface>
          <SectionTitle title={t('result.benefits')} />
          <BenefitList benefits={benefits} />
        </Surface>

        <GoldButton title={t('result.next')} icon="scan" onPress={() => router.back()} />
        <GhostButton title={t('result.profile')} icon="person-circle-outline" onPress={() => router.replace(`/member/${member.id}`)} />
        {detail.data?.progress.next_tier && (
          <Text style={[fonts.small, { color: C.text2, textAlign: 'center' }]}>
            {t('member.progress', { needed: detail.data.progress.needed, tier: detail.data.progress.next_tier.name })}
          </Text>
        )}
      </ScrollView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'flex-end' },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.hairline },
})
