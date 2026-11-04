import { ScrollView } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../lib/api'
import { KEYS, tierOf, useBoot, useScan } from '../lib/queries'
import { useT } from '../lib/i18n'
import { Backdrop, GhostButton, GoldButton, Notice, PageHeading, SectionTitle, Shimmer, Surface } from '../components/ui'
import { Sheet } from '../components/Sheet'
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
    return <Sheet title={t('scan.result')} footer={<GoldButton title={t('result.next')} icon="scan" onPress={() => router.replace('/scan')} />}>
      {answer && boot.isPending && <Shimmer height={180} />}
      {answer && boot.isError && <Notice text={t('error.unknown')} action={t('common.retry')} onAction={() => { void boot.refetch() }} />}
    </Sheet>
  }
  const member = detail.data?.member ?? answer.member
  const tier = tierOf(boot.data, member.tier_id)
  const benefits = answer.benefits ?? detail.data?.benefits ?? []

  return (
    <Backdrop>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, gap: 18 }}>
        <PageHeading title={t('scan.result')} profile={false} />

        <VerdictBanner answer={answer} />
        <MemberCard member={member} tier={tier} venue={boot.data.organization.name} currency={boot.data.venue.currency} />
        <MemberActions member={member} boot={boot.data} />

        {detail.isError && <Notice text={t('error.unknown')} action={t('common.retry')} onAction={() => { void detail.refetch() }} />}
        <Surface>
          <SectionTitle title={t('result.benefits')} />
          <BenefitList benefits={benefits} />
        </Surface>

        <GoldButton title={t('result.next')} icon="scan" onPress={() => router.back()} />
        <GhostButton title={t('result.profile')} icon="person-circle-outline" onPress={() => router.replace(`/member/${member.id}`)} />

      </ScrollView>
    </Backdrop>
  )
}
