import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { KEYS, queryClient, useBoot, useQueueCounts } from '../../lib/queries'
import { number } from '../../lib/format'
import { useT } from '../../lib/i18n'
import { failureOf } from '../../lib/failure'
import { errorKey } from '../../lib/desk'
import { CONTENT_MAX_WIDTH, ECLIPSE as E, fonts } from '../../lib/theme'
import { useEclipseAppearance } from '../../lib/useEclipseAppearance'
import { Notice, Press } from '../../components/ui'
import { EclipseAtmosphere, EclipseScan, EclipseSurface, EclipseTile, useEclipseBorderLight } from '../../components/Eclipse'

/** Eclipse Home is a launcher. Counts are live; loyalty actions stay in their existing screens. */
export default function Home() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const tileSize = (Math.min(width, CONTENT_MAX_WIDTH) - 2 * E.inset - E.gap) / 2
  const scanSize = Math.max(168, Math.min(240, height - insets.top - insets.bottom - 112 - 66 - E.gap * 3 - 2 * tileSize))
  const { t, language } = useT()
  const boot = useBoot()
  const queue = useQueueCounts()
  const appearance = useEclipseAppearance()
  const reflection = useEclipseBorderLight(appearance.animate && !appearance.solid)
  const [refreshing, setRefreshing] = useState(false)
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: KEYS.boot }),
        queryClient.invalidateQueries({ queryKey: ['requests'] }),
      ])
    } finally { setRefreshing(false) }
  }, [])

  // An unavailable/stale-after-error count is unknown, never a confirmed zero.
  const count = queue.isError || queue.isPending ? undefined : queue.data?.open
  const badge = count && count > 0 ? count > 99 ? '99+' : number(count, language) : undefined
  const requestState = queue.isError ? t('requests.refreshError') : queue.isPending ? t('requests.loading')
    : count ? t('home.waiting', { n: number(count, language) }) : t('home.noneWaiting')

  return (
    <View style={styles.page}>
      <EclipseAtmosphere solid={appearance.solid} />
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 112 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={E.accent} colors={[E.accent]} progressBackgroundColor={E.surface} />}
      >
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.venue}>{boot.data?.organization.name ?? (boot.isPending ? t('common.loading') : t('tab.home'))}</Text>
          <Press label={t('home.account')} onPress={() => router.push('/profile')} reduceMotion={appearance.reduceMotion} pressedScale={0.98}>
            <EclipseSurface radius={24} solid={appearance.solid} style={styles.profile}>
              <Ionicons name="person-outline" size={27} color={E.text} accessible={false} />
            </EclipseSurface>
          </Press>
        </View>
        {boot.isError && <Notice text={t(errorKey(failureOf(boot.error).code))} action={t('common.retry')} onAction={() => { void boot.refetch() }} />}
        <View style={{ alignSelf: 'center' }}><EclipseScan size={scanSize} label={t('home.scan')} onPress={() => router.navigate('/scan')} phase={reflection} {...appearance} /></View>
        <View style={styles.grid}>
          <View style={styles.row}>
            <EclipseTile size={tileSize} label={t('tab.members')} icon="members" onPress={() => router.navigate('/members')} phase={reflection} order={1} {...appearance} />
            <EclipseTile size={tileSize} label={t('tab.requests')} icon="requests" onPress={() => router.navigate('/requests')} badge={badge} busy={queue.isPending} problem={queue.isError} accessibilityLabel={t('tab.requests') + '. ' + requestState} phase={reflection} order={2} {...appearance} />
          </View>
          <View style={styles.row}>
            {boot.data?.staff.can.view_insights && <EclipseTile size={tileSize} label={t('home.activityLink')} icon="activity" onPress={() => router.push('/activity')} phase={reflection} order={3} {...appearance} />}
            <EclipseTile size={tileSize} label={t('tab.more')} icon="more" onPress={() => router.navigate('/more')} phase={reflection} order={4} {...appearance} />
          </View>
        </View>
        {queue.isError && <Notice tone="warning" text={t('requests.refreshError')} action={t('common.retry')} onAction={() => { void queue.refetch() }} />}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: E.bg, overflow: 'hidden' },
  content: { paddingHorizontal: E.inset, gap: E.gap },
  header: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: E.gap },
  profile: { width: 46.4, height: 46.4, alignItems: 'center', justifyContent: 'center' },
  venue: { ...fonts.title, color: E.text, flex: 1 },
  grid: { gap: E.gap },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: E.gap },
})
