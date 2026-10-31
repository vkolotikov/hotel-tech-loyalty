import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../../lib/api'
import { failureOf } from '../../lib/failure'
import { errorKey } from '../../lib/errors'
import { KEYS, useBoot } from '../../lib/queries'
import { number } from '../../lib/format'
import { useT } from '../../lib/i18n'
import { C, TAB_BAR_ROOM, fonts } from '../../lib/theme'
import { counted } from '../../shared/portal'
import { ActivityRow } from '../../components/ActivityRow'
import { Backdrop, Empty, Notice, Shimmer, Surface } from '../../components/ui'

/** Every point in and out, newest first (`GET /v1/member/points/history`), with the balance above it. */
export default function ActivityTab() {
  const insets = useSafeAreaInsets()
  const { t, tp, language } = useT()
  const boot = useBoot()
  const history = useInfiniteQuery({
    queryKey: KEYS.history,
    queryFn: ({ pageParam }) => api.pointsHistory(pageParam),
    initialPageParam: 1,
    getNextPageParam: last => (last.current_page < last.last_page ? last.current_page + 1 : undefined),
  })
  const items = history.data?.pages.flatMap(page => page.data) ?? []
  const total = history.data?.pages[0]?.total ?? 0
  const timezone = boot.data?.venue.timezone ?? 'UTC'
  const balance = boot.data?.member?.current_points

  return (
    <Backdrop>
      <FlatList
        data={items}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: TAB_BAR_ROOM, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={history.isRefetching && !history.isFetchingNextPage} onRefresh={() => { void history.refetch(); void boot.refetch() }} tintColor={C.gold} />}
        onEndReached={() => { if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage() }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 14 }}>
            <Text style={[fonts.display, { color: C.text }]}>{tp('portal.activity.title')}</Text>
            <Surface style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <View>
                <Text style={[fonts.label, { color: C.text2 }]}>{tp('portal.home.balance')}</Text>
                <Text style={[fonts.figure, { color: C.goldLight }]}>{balance === undefined ? '—' : number(balance, language)}</Text>
              </View>
              {history.data && <Text style={[fonts.small, { color: C.text2 }]}>{counted(tp, 'activity.entries', total, language)}</Text>}
            </Surface>
            {history.isError && <Notice text={t(errorKey(failureOf(history.error)))} action={tp('portal.common.retry')} onAction={() => { void history.refetch() }} />}
          </View>
        }
        ListEmptyComponent={history.isLoading
          ? <View style={{ gap: 10 }}><Shimmer height={58} /><Shimmer height={58} /><Shimmer height={58} /></View>
          : history.isError ? undefined : <Empty icon="pulse-outline" text={tp('portal.activity.empty')} />}
        renderItem={({ item, index }) => <ActivityRow item={item} timezone={timezone} last={index === items.length - 1} />}
        ListFooterComponent={history.isFetchingNextPage ? <ActivityIndicator color={C.gold} style={{ marginVertical: 16 }} /> : undefined}
      />
    </Backdrop>
  )
}
