import { useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../../lib/api'
import { KEYS, queryClient, tierOf, useBoot } from '../../lib/queries'
import { failureOf } from '../../lib/failure'
import { errorKey } from '../../lib/desk'
import { ago, day, moment, number } from '../../lib/format'
import { useT } from '../../lib/i18n'
import { C, GOLD_GRADIENT, RADIUS, fonts } from '../../lib/theme'
import { Backdrop, GhostButton, Notice, Press, Row, SectionTitle, Shimmer, Surface } from '../../components/ui'
import { MemberCard } from '../../components/MemberCard'
import { MemberActions } from '../../components/MemberActions'
import { BenefitList } from '../../components/BenefitList'

/** A member's page: their card, how far to the next tier, what staff can do, their benefits, cards and history. */
export default function MemberPage() {
  const insets = useSafeAreaInsets()
  const { t, language } = useT()
  const params = useLocalSearchParams<{ id: string }>()
  const id = Number(params.id)
  const boot = useBoot()
  const detail = useQuery({ queryKey: KEYS.member(id), queryFn: () => api.member(id), enabled: id > 0 })
  const cards = useQuery({ queryKey: KEYS.cards(id), queryFn: () => api.cards(id), enabled: id > 0 })
  const history = useInfiniteQuery({
    queryKey: KEYS.history(id),
    queryFn: ({ pageParam }) => api.history(id, pageParam),
    initialPageParam: 1,
    getNextPageParam: last => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: id > 0,
  })
  const [refreshing, setRefreshing] = useState(false)
  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: KEYS.member(id) }),
      queryClient.invalidateQueries({ queryKey: KEYS.history(id) }),
      queryClient.invalidateQueries({ queryKey: KEYS.cards(id) }),
    ])
    setRefreshing(false)
  }

  const data = detail.data
  const timeZone = boot.data?.venue.timezone ?? 'UTC'
  const tier = tierOf(boot.data, data?.member.tier_id)
  const lines = history.data?.pages.flatMap(page => page.lines) ?? []

  return (
    <Backdrop>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 20, gap: 18 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={C.gold} />}
      >
        <View style={styles.bar}>
          <Press onPress={() => router.back()} label={t('common.close')}>
            <View style={styles.round}><Ionicons name="chevron-back" size={22} color={C.text} /></View>
          </Press>
          <Text style={[fonts.label, { color: C.text2 }]}>{t('member.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        {detail.isLoading && <><Shimmer height={210} /><Shimmer height={96} /></>}
        {detail.isError && <Notice text={t(errorKey(failureOf(detail.error).code))} action={t('common.retry')} onAction={() => { void detail.refetch() }} />}

        {data && boot.data && (
          <>
            {data.member.is_erased && <Notice tone="warning" text={t('member.erased')} />}
            <MemberCard member={data.member} tier={tier} venue={boot.data.organization.name} currency={boot.data.venue.currency} />

            <Surface>
              {data.progress.next_tier ? (
                <>
                  <Text style={[fonts.bodyStrong, { color: C.text }]}>{t('member.progress', { needed: number(data.progress.needed, language), tier: data.progress.next_tier.name })}</Text>
                  <View style={styles.track}>
                    <LinearGradient colors={GOLD_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${Math.max(4, Math.min(100, data.progress.percent))}%` }]} />
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="trophy" size={20} color={C.gold} />
                  <Text style={[fonts.bodyStrong, { color: C.text }]}>{t('member.top')}</Text>
                </View>
              )}
            </Surface>

            <MemberActions member={data.member} boot={boot.data} />

            <Surface>
              <SectionTitle title={t('result.benefits')} />
              <BenefitList benefits={data.benefits} />
            </Surface>

            <Surface padding={0} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <SectionTitle title={t('member.cards')} />
              {(cards.data?.cards ?? []).filter(card => card.is_active).map(card => (
                <Row key={card.id} left={<Ionicons name="card" size={22} color={C.gold} />} title={card.uid} line={card.linked_at ? day(card.linked_at, language) : null} />
              ))}
              {cards.data && cards.data.cards.filter(card => card.is_active).length === 0 && (
                <Text style={[fonts.body, { color: C.text2, paddingBottom: 8 }]}>{t('member.noCards')}</Text>
              )}
              {!data.member.is_erased && (
                <View style={{ paddingVertical: 12 }}>
                  <GhostButton title={t('member.linkCard')} icon="add" tone={C.gold} onPress={() => router.push({ pathname: '/link-card', params: { id: String(id) } })} />
                </View>
              )}
            </Surface>

            <Surface padding={0} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <SectionTitle title={t('member.history')} />
              {lines.length === 0 && history.isFetched && <Text style={[fonts.body, { color: C.text2, paddingBottom: 12 }]}>{t('member.noHistory')}</Text>}
              {lines.map((line, i) => (
                <View key={line.id} style={[styles.line, i < lines.length - 1 && styles.lineRule]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[fonts.bodyStrong, { color: line.is_reversed ? C.text3 : C.text }]} numberOfLines={1}>{line.description}</Text>
                    <Text style={[fonts.small, { color: C.text2 }]} numberOfLines={1}>
                      {[line.at ? moment(line.at, language, timeZone) : null, line.by, line.is_reversed ? t('member.reversed') : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={[fonts.bodyStrong, { color: line.points < 0 ? C.danger : C.goldLight, textDecorationLine: line.is_reversed ? 'line-through' : 'none' }]}>
                    {line.points > 0 ? '+' : ''}{number(line.points, language)}
                  </Text>
                </View>
              ))}
              {history.hasNextPage && (
                <View style={{ paddingVertical: 12 }}>
                  <GhostButton title={t('members.more')} onPress={() => { void history.fetchNextPage() }} />
                </View>
              )}
              <View style={{ height: 8 }} />
            </Surface>

            <Surface padding={0} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <SectionTitle title={t('member.details')} />
              <Row title={t('member.lifetime')} line={number(data.member.lifetime_points, language)} />
              {data.member.email ? <Row title={t('member.email')} line={data.member.email} /> : null}
              {data.member.phone ? <Row title={t('member.phone')} line={data.member.phone} /> : null}
              {data.member.joined_at ? <Row title={t('member.joined')} line={day(data.member.joined_at, language)} /> : null}
              {data.member.last_activity_at ? (
                <Row title={t('member.lastActive')} line={(() => { const when = ago(data.member.last_activity_at, Date.now()); return when ? t(when.key, { n: when.n }) : null })()} last />
              ) : null}
            </Surface>
          </>
        )}
      </ScrollView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.hairline },
  track: { height: 8, borderRadius: RADIUS.pill, backgroundColor: C.surface3, marginTop: 12, overflow: 'hidden' },
  fill: { height: 8, borderRadius: RADIUS.pill },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  lineRule: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hairlineStrong },
})
