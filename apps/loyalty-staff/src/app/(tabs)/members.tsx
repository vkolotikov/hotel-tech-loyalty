import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../../lib/api'
import { KEYS, tierOf, useBoot } from '../../lib/queries'
import { failureOf } from '../../lib/failure'
import { errorKey } from '../../lib/desk'
import { number } from '../../lib/format'
import { useT } from '../../lib/i18n'
import { C, RADIUS, TAB_BAR_ROOM, fonts, tierColor, withAlpha } from '../../lib/theme'
import { Avatar, Backdrop, Empty, Notice, Press, Row, SearchField, Shimmer } from '../../components/ui'

/** Members: search by name, number, email or phone, narrow by tier, newest first; a member opens their page. */
export default function Members() {
  const insets = useSafeAreaInsets()
  const { t, language } = useT()
  const boot = useBoot()
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState('')
  const [tierId, setTierId] = useState<number | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setAsked(q.trim()), 300)
    return () => clearTimeout(timer)
  }, [q])

  const list = useInfiniteQuery({
    queryKey: KEYS.members(asked, tierId),
    queryFn: ({ pageParam }) => api.members(asked, pageParam, tierId),
    initialPageParam: 1,
    getNextPageParam: last => (last.page < last.pages ? last.page + 1 : undefined),
  })
  const members = list.data?.pages.flatMap(page => page.members) ?? []
  const total = list.data?.pages[0]?.total ?? 0
  const tiers = (boot.data?.programme.tiers ?? []).filter(tier => tier.is_active)

  return (
    <Backdrop>
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, gap: 14 }}>
        <View style={styles.head}>
          <Text style={[fonts.display, { color: C.text }]}>{t('members.title')}</Text>
          {list.data && <Text style={[fonts.small, { color: C.text2 }]}>{t('members.count', { n: number(total, language) })}</Text>}
        </View>
        <SearchField value={q} onChangeText={setQ} placeholder={t('members.search')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[{ id: null as number | null, name: t('members.allTiers'), color: null as string | null }, ...tiers].map(tier => {
            const on = tierId === tier.id
            const tone = tier.id === null ? C.gold : tierColor(tier.color)
            return (
              <Press key={String(tier.id)} onPress={() => setTierId(tier.id)} style={[styles.chip, on && { backgroundColor: withAlpha(tone, 0.18), borderColor: withAlpha(tone, 0.6) }]}>
                {tier.id !== null && <View style={[styles.dot, { backgroundColor: tone }]} />}
                <Text style={[fonts.smallStrong, { color: on ? C.text : C.text2 }]}>{tier.name}</Text>
              </Press>
            )
          })}
        </ScrollView>
        {list.isError && <Notice text={t(errorKey(failureOf(list.error).code))} action={t('common.retry')} onAction={() => { void list.refetch() }} />}
      </View>

      <FlatList
        data={members}
        keyExtractor={m => String(m.id)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: TAB_BAR_ROOM }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => { void list.refetch() }} tintColor={C.gold} />}
        onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage() }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={list.isLoading ? <View style={{ gap: 10 }}><Shimmer height={64} /><Shimmer height={64} /><Shimmer height={64} /></View> : <Empty icon="people-outline" text={t('members.empty')} />}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={C.gold} style={{ marginVertical: 16 }} /> : undefined}
        renderItem={({ item, index }) => {
          const tier = tierOf(boot.data, item.tier_id)
          return (
            <Row
              left={<Avatar name={item.name} color={tier?.color} />}
              title={item.name}
              line={[tier?.name, item.member_number].filter(Boolean).join(' · ')}
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[fonts.bodyStrong, { color: item.is_active ? C.goldLight : C.text3 }]}>{number(item.points, language)}</Text>
                  <Text style={[fonts.small, { color: C.text3 }]}>{t('common.pts')}</Text>
                </View>
              }
              onPress={() => router.push(`/member/${item.id}`)}
              last={index === members.length - 1}
            />
          )
        }}
      />
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.hairlineStrong, backgroundColor: C.surface },
  dot: { width: 8, height: 8, borderRadius: 4 },
})
