import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../../lib/api'
import { KEYS, queryClient, useBoot } from '../../lib/queries'
import { ago, greeting, number } from '../../lib/format'
import { useT } from '../../lib/i18n'
import type { Key } from '../../lib/i18n/en'
import { failureOf } from '../../lib/failure'
import { errorKey } from '../../lib/desk'
import { C, RADIUS, SHADOW, TAB_BAR_ROOM, fonts } from '../../lib/theme'
import type { ActivityItem, MetricKey } from '../../lib/types'
import { Avatar, Backdrop, IconBadge, Notice, Press, SectionTitle, Shimmer, Surface, type IconName } from '../../components/ui'

const ACTIVITY_ICON: Record<ActivityItem['source'], { icon: IconName; color: string }> = {
  points: { icon: 'sparkles', color: C.gold },
  reward: { icon: 'gift', color: '#c58cff' },
  visit: { icon: 'walk', color: C.success },
  member: { icon: 'person-add', color: C.info },
  tier: { icon: 'trophy', color: C.goldLight },
  benefit: { icon: 'ribbon', color: '#ff9f6b' },
  offer: { icon: 'pricetag', color: '#ff7eb6' },
}

const METRIC_ICON: Partial<Record<MetricKey, IconName>> = {
  members: 'people', rewards_used: 'gift', points_available: 'sparkles', offers_used: 'pricetag', active_offers: 'pricetags',
  checkins: 'walk', benefits_fulfilled: 'ribbon', active_benefits: 'ribbon-outline',
}

/** Home: the scan first, then the two places a desk goes most (a member, the requests), the month's figures and what just happened. */
export default function Home() {
  const insets = useSafeAreaInsets()
  const { t, language } = useT()
  const boot = useBoot()
  const metrics = useQuery({ queryKey: KEYS.metrics, queryFn: api.metrics })
  const activity = useQuery({ queryKey: KEYS.activity, queryFn: api.activity })
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: KEYS.boot }),
      queryClient.invalidateQueries({ queryKey: KEYS.metrics }),
      queryClient.invalidateQueries({ queryKey: KEYS.activity }),
    ])
    setRefreshing(false)
  }, [])

  const data = boot.data
  const firstName = data?.staff.name.split(' ')[0] ?? ''
  const waiting = data?.counts.requests_waiting ?? 0
  const known = (metrics.data?.data.items ?? []).filter(item => item.value !== null)
  // Figures sit two to a row, so an odd one out is left off rather than stretched across.
  const figures = known.slice(0, known.length >= 4 ? 4 : 2)

  return (
    <Backdrop>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: TAB_BAR_ROOM, paddingHorizontal: 20, gap: 22 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={C.gold} />}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[fonts.label, { color: C.gold }]} numberOfLines={1}>{data?.organization.name ?? ' '}</Text>
            <Text style={[fonts.italic, { color: C.text2 }]}>{t(greeting(new Date().getHours()))},</Text>
            <Text style={[fonts.display, { color: C.text }]} numberOfLines={1}>{firstName || ' '}</Text>
          </View>
          {data && <Avatar name={data.staff.name} size={48} />}
        </View>

        {boot.isError && !data && <Notice text={t(errorKey(failureOf(boot.error).code))} action={t('common.retry')} onAction={() => { void boot.refetch() }} />}

        <Press onPress={() => router.navigate('/scan')} label={t('home.scanTitle')}>
          <LinearGradient colors={['#2a2414', '#141720', '#0d1018']} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, SHADOW.card]}>
            <View style={styles.heroGlyph}>
              <Ionicons name="scan" size={38} color={C.gold} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[fonts.title, { color: C.text }]}>{t('home.scanTitle')}</Text>
              <Text style={[fonts.small, { color: C.text2 }]}>{t('home.scanLine')}</Text>
              <View style={styles.heroWays}>
                {(['card-outline', 'qr-code-outline', 'keypad-outline'] as IconName[]).map(icon => (
                  <View key={icon} style={styles.heroWay}><Ionicons name={icon} size={16} color={C.goldLight} /></View>
                ))}
              </View>
            </View>
            <Ionicons name="arrow-forward-circle" size={34} color={C.gold} />
          </LinearGradient>
        </Press>

        <View style={styles.tiles}>
          <Press onPress={() => router.navigate('/members')} style={{ flex: 1 }} label={t('home.find')}>
            <Surface style={styles.tile}>
              <IconBadge name="search" color={C.info} />
              <Text style={[fonts.bodyStrong, { color: C.text }]}>{t('home.find')}</Text>
              <Text style={[fonts.small, { color: C.text2 }]}>{t('home.findLine')}</Text>
            </Surface>
          </Press>
          <Press onPress={() => router.navigate('/requests')} style={{ flex: 1 }} label={t('home.requests')}>
            <Surface style={styles.tile} tint={waiting > 0 ? C.warning : undefined}>
              <IconBadge name="file-tray-full" color={waiting > 0 ? C.warning : C.text2} />
              <Text style={[fonts.bodyStrong, { color: C.text }]}>{t('home.requests')}</Text>
              <Text style={[fonts.small, { color: waiting > 0 ? C.warning : C.text2 }]}>{waiting > 0 ? t('home.waiting', { n: number(waiting, language) }) : t('home.noneWaiting')}</Text>
            </Surface>
          </Press>
        </View>

        <View>
          <SectionTitle title={t('home.figures')} />
          {metrics.isLoading ? (
            <View style={styles.figures}><Shimmer height={96} style={{ flex: 1 }} /><Shimmer height={96} style={{ flex: 1 }} /></View>
          ) : (
            <View style={styles.figureGrid}>
              {figures.map(item => (
                <Surface key={item.key} style={styles.figure} padding={14}>
                  <Ionicons name={METRIC_ICON[item.key] ?? 'stats-chart'} size={16} color={C.gold} />
                  <Text style={[fonts.number, { color: C.text }]}>{number(item.value ?? 0, language)}</Text>
                  <Text style={[fonts.small, { color: C.text2 }]} numberOfLines={1}>{t(`metric.${item.key}` as Key)}</Text>
                </Surface>
              ))}
            </View>
          )}
        </View>

        <View>
          <SectionTitle title={t('home.activity')} />
          <Surface padding={0} style={{ paddingHorizontal: 16 }}>
            {activity.isLoading && <View style={{ paddingVertical: 16, gap: 10 }}><Shimmer height={44} /><Shimmer height={44} /></View>}
            {activity.data && activity.data.data.items.length === 0 && (
              <Text style={[fonts.body, { color: C.text2, paddingVertical: 20, textAlign: 'center' }]}>{t('home.noActivity')}</Text>
            )}
            {(activity.data?.data.items ?? []).slice(0, 8).map((item, i, list) => {
              const look = ACTIVITY_ICON[item.source] ?? ACTIVITY_ICON.points
              const when = ago(item.at, Date.now())
              return (
                <View key={`${item.source}-${item.id}`} style={[styles.activity, i < list.length - 1 && styles.activityLine]}>
                  <IconBadge name={look.icon} color={look.color} size={36} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[fonts.bodyStrong, { color: C.text }]} numberOfLines={1}>{item.member ?? t(`activity.${item.source}` as Key)}</Text>
                    <Text style={[fonts.small, { color: C.text2 }]} numberOfLines={1}>
                      {[item.label ?? t(`activity.${item.source}` as Key), when ? t(when.key, { n: when.n }) : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {item.amount !== null && (
                    <Text style={[fonts.bodyStrong, { color: item.amount < 0 ? C.danger : C.goldLight }]}>{item.amount > 0 ? '+' : ''}{number(item.amount, language)}</Text>
                  )}
                </View>
              )
            })}
          </Surface>
        </View>
      </ScrollView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: C.goldEdge },
  heroGlyph: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.goldWash, borderWidth: 1, borderColor: C.goldEdge },
  heroWays: { flexDirection: 'row', gap: 8, marginTop: 4 },
  heroWay: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: C.hairline },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { gap: 8, minHeight: 132 },
  figures: { flexDirection: 'row', gap: 12 },
  figureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  figure: { gap: 6, flexBasis: '47%', flexGrow: 1 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  activityLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hairlineStrong },
})
