import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../lib/api'
import { KEYS, useBoot } from '../lib/queries'
import { loyaltyFeatures } from '../lib/loyalty'
import { useT } from '../lib/i18n'
import { C, fonts } from '../lib/theme'
import { number } from '../lib/format'
import { ActivityRow } from './ActivityRow'
import { ScreenHeader } from './ScreenHeader'
import { Backdrop, Empty, Notice, Shimmer, Surface } from './ui'

/** Optional full history keeps pagination and virtualization outside the compact balance popup. */
export function PointsHistory() {
  const insets = useSafeAreaInsets()
  const { tp, language } = useT()
  const boot = useBoot()
  const q = useInfiniteQuery({ queryKey: KEYS.history, queryFn: ({ pageParam }) => api.pointsHistory(pageParam), initialPageParam: 1,
    getNextPageParam: last => last.current_page < last.last_page ? last.current_page + 1 : undefined, enabled: loyaltyFeatures(boot.data).points })
  const items = q.data?.pages.flatMap(p => p.data) ?? []
  return <Backdrop><FlatList data={items} keyExtractor={a => String(a.id)} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}
    refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => { void q.refetch(); void boot.refetch() }} tintColor={C.gold} />}
    onEndReached={() => { if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage() }} onEndReachedThreshold={.4}
    ListHeaderComponent={<View style={{ gap: 16, marginBottom: 16 }}><ScreenHeader title={tp('portal.activity.title')} back inbox={false} /><Surface><Text style={[fonts.figure, { color: C.text }]}>{number(boot.data?.member?.current_points ?? 0, language)}</Text></Surface>{q.isError && <Notice text={tp('portal.common.error')} action={tp('portal.common.retry')} onAction={() => { void q.refetch() }} />}</View>}
    ListEmptyComponent={q.isLoading ? <Shimmer height={150} /> : <Empty icon="pulse-outline" text={tp('portal.activity.empty')} />}
    renderItem={({ item, index }) => <ActivityRow item={item} timezone={boot.data?.venue.timezone ?? 'UTC'} last={index === items.length - 1} />}
    ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={C.gold} /> : undefined} /></Backdrop>
}
