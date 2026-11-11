import { useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { KEYS, refreshMemberFacts, useBoot, useLiveWhileShown, useRefreshOnFocus } from '../../lib/queries'
import { failureOf } from '../../lib/failure'
import { errorKey } from '../../lib/errors'
import { useT } from '../../lib/i18n'
import { C, TAB_BAR_ROOM } from '../../lib/theme'
import { MemberCard } from '../../components/MemberCard'
import { NextEventCard } from '../../components/Programme'
import { loyaltyFeatures } from '../../lib/loyalty'
import { Backdrop, GhostButton, Notice, Shimmer } from '../../components/ui'
import { ScreenHeader } from '../../components/ScreenHeader'

export default function Home() {
  const insets = useSafeAreaInsets()
  const { t, tp } = useT()
  const boot = useBoot()
  useRefreshOnFocus(HOME_FACTS)
  useLiveWhileShown(30_000)
  const [refreshing, setRefreshing] = useState(false)
  const refresh = async () => { setRefreshing(true); try { await refreshMemberFacts() } finally { setRefreshing(false) } }
  const data = boot.data
  const features = loyaltyFeatures(data)
  const member = data?.member
  const venue = data?.venue
  return <Backdrop>
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: TAB_BAR_ROOM, paddingHorizontal: 24, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={C.gold} />}>
      <ScreenHeader title={venue?.name ?? t('brand')} />
      {boot.isError && <Notice text={t(errorKey(failureOf(boot.error)))} action={tp('portal.common.retry')} onAction={() => { void boot.refetch() }} />}
      {boot.isLoading && <View style={{ gap: 16 }}><Shimmer height={247} /><Shimmer height={100} /></View>}
      {member && venue && <MemberCard member={member} venue={venue.name} logo={venue.logo_url} currency={venue.currency} points={features.points}
        onCard={() => router.navigate('/card')} onBalance={() => router.push('/activity')} />}
      {member && <View style={{ flexDirection: 'row', gap: 12 }}>
        {features.benefits && <GhostButton title={tp('portal.rewards.tab_benefits')} style={{ flex: 1 }} onPress={() => router.navigate({ pathname: '/rewards', params: { tab: 'benefits' } })} />}
        {features.points && <GhostButton title={tp('portal.rewards.tab_offers')} style={{ flex: 1 }} onPress={() => router.navigate({ pathname: '/rewards', params: { tab: 'offers' } })} />}
      </View>}
      {member && features.events && <NextEventCard />}
    </ScrollView>
  </Backdrop>
}
const HOME_FACTS = [KEYS.boot, KEYS.card, KEYS.programme, ['stamps'], ['credit'], ['events']] as const
