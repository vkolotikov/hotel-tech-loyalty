import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../lib/api'
import { KEYS, queryClient, useBoot } from '../lib/queries'
import { ago, number } from '../lib/format'
import { useT } from '../lib/i18n'
import type { Key } from '../lib/i18n/en'
import { failureOf } from '../lib/failure'
import { errorKey } from '../lib/desk'
import { C, fonts } from '../lib/theme'
import type { ActivityItem, MetricKey } from '../lib/types'
import { Backdrop, IconBadge, Notice, Press, SectionTitle, Shimmer, Surface, type IconName } from '../components/ui'

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

/** Existing figures and activity, moved out of Home without changing their server permissions. */
export default function Activity() {
  const insets = useSafeAreaInsets()
  const { t, language } = useT()
  const boot = useBoot()
  const canViewInsights = !!boot.data?.staff.can.view_insights
  const metrics = useQuery({ queryKey: KEYS.metrics, queryFn: api.metrics, enabled: canViewInsights })
  const activity = useQuery({ queryKey: KEYS.activity, queryFn: api.activity, enabled: canViewInsights })
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: KEYS.boot }),
        queryClient.invalidateQueries({ queryKey: KEYS.metrics }),
        queryClient.invalidateQueries({ queryKey: KEYS.activity }),
      ])
    } finally { setRefreshing(false) }
  }, [])

  const data = boot.data
  const known = (metrics.data?.data.items ?? []).filter(item => item.value !== null)
  // Figures sit two to a row, so an odd one out is left off rather than stretched across.
  const figures = known.slice(0, known.length >= 4 ? 4 : 2)

  return (
    <Backdrop>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, gap: 22 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={C.gold} />}
      >
        <View style={styles.header}>
          <Text style={[fonts.display, { color: C.text, flex: 1 }]}>{t('home.activityLink')}</Text>
          <Press label={t('common.close')} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
            <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={24} color={C.text} />
            </View>
          </Press>
        </View>
        {boot.isError && <Notice text={t(errorKey(failureOf(boot.error).code))} action={t('common.retry')} onAction={() => { void boot.refetch() }} />}
        {boot.isPending && <Shimmer height={96} />}
        {data && !canViewInsights && <Notice text={t('error.not_allowed')} />}
        {canViewInsights && <View>
          <SectionTitle title={t('home.figures')} />
          {metrics.isError && <Notice text={t('error.unknown')} action={t('common.retry')} onAction={() => { void metrics.refetch() }} />}
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
        </View>}

        {canViewInsights && <View>
          <SectionTitle title={t('home.activity')} />
          {activity.isError && <Notice text={t('error.unknown')} action={t('common.retry')} onAction={() => { void activity.refetch() }} />}
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
        </View>}
      </ScrollView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  figures: { flexDirection: 'row', gap: 12 },
  figureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  figure: { gap: 6, flexBasis: '47%', flexGrow: 1 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  activityLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hairlineStrong },
})
