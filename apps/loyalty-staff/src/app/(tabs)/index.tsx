import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { KEYS, queryClient, useBoot, useQueueCounts } from '../../lib/queries'
import { number } from '../../lib/format'
import { useT } from '../../lib/i18n'
import { failureOf } from '../../lib/failure'
import { errorKey } from '../../lib/desk'
import { ECLIPSE as E } from '../../lib/theme'
import { useEclipseAppearance } from '../../lib/useEclipseAppearance'
import { Notice, Press } from '../../components/ui'
import { EclipseAtmosphere, EclipseScan, EclipseSurface, EclipseTile, useEclipseReflection } from '../../components/Eclipse'

/** Eclipse Home is a launcher. Counts are live; loyalty actions stay in their existing screens. */
export default function Home() {
  const insets = useSafeAreaInsets()
  const { t, language } = useT()
  const boot = useBoot()
  const queue = useQueueCounts()
  const appearance = useEclipseAppearance()
  const reflection = useEclipseReflection(appearance.animate && !appearance.solid)
  const [width, setWidth] = useState(393)
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
    <View style={styles.page} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      <EclipseAtmosphere width={width} animate={appearance.animate} solid={appearance.solid} />
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 112 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={E.accent} colors={[E.accent]} progressBackgroundColor={E.surface} />}
      >
        <View style={styles.header}>
          <View style={styles.brand}>
            <Text style={styles.brandName}>{t('home.brand')}</Text>
            <Text style={styles.wordmark}>{t('home.staff')}</Text>
          </View>
          <Press label={t('home.account')} onPress={() => router.navigate('/more')} reduceMotion={appearance.reduceMotion} pressedScale={0.98}>
            <EclipseSurface radius={24} solid={appearance.solid} style={styles.profile}>
              <Ionicons name="person-outline" size={27} color={E.text} accessible={false} />
            </EclipseSurface>
          </Press>
        </View>
        <View style={styles.greeting}>
          <Text style={styles.welcome}>{t('home.welcome')}</Text>
          <Text style={styles.venue}>{boot.data?.organization.name ?? (boot.isPending ? t('common.loading') : '')}</Text>
        </View>
        {boot.isError && <Notice text={t(errorKey(failureOf(boot.error).code))} action={t('common.retry')} onAction={() => { void boot.refetch() }} />}
        <EclipseScan label={t('home.scan')} onPress={() => router.navigate('/scan')} phase={reflection} {...appearance} />
        <View style={styles.grid}>
          <View style={styles.row}>
            <EclipseTile label={t('tab.members')} icon="members" onPress={() => router.navigate('/members')} phase={reflection} order={1} {...appearance} />
            <EclipseTile label={t('tab.requests')} icon="requests" onPress={() => router.navigate('/requests')} badge={badge} busy={queue.isPending} problem={queue.isError} accessibilityLabel={t('tab.requests') + '. ' + requestState} phase={reflection} order={2} {...appearance} />
          </View>
          <View style={styles.row}>
            {boot.data?.staff.can.view_insights && <EclipseTile label={t('home.activityLink')} icon="activity" onPress={() => router.push('/activity')} phase={reflection} order={3} {...appearance} />}
            <EclipseTile label={t('tab.more')} icon="more" onPress={() => router.navigate('/more')} phase={reflection} order={4} {...appearance} />
          </View>
        </View>
        {queue.isError && <Notice tone="warning" text={t('requests.refreshError')} action={t('common.retry')} onAction={() => { void queue.refetch() }} />}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: E.bg, overflow: 'hidden' },
  content: { paddingHorizontal: E.inset, gap: 24 },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  brand: { gap: 5, flex: 1 },
  brandName: { ...E.type.brand, color: E.accent },
  wordmark: { ...E.type.wordmark, color: E.text },
  profile: { width: 46.4, height: 46.4, alignItems: 'center', justifyContent: 'center' },
  greeting: { minHeight: 70, gap: 2 },
  welcome: { ...E.type.welcome, color: E.text },
  venue: { ...E.type.secondary, color: E.muted },
  grid: { gap: E.gap },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: E.gap },
})
