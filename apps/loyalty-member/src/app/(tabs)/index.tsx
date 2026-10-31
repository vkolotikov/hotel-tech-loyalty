import { useState } from 'react'
import { Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { KEYS, queryClient, useBoot } from '../../lib/queries'
import { failureOf } from '../../lib/failure'
import { errorKey } from '../../lib/errors'
import { greeting, number } from '../../lib/format'
import { useT } from '../../lib/i18n'
import { C, RADIUS, TAB_BAR_ROOM, fonts } from '../../lib/theme'
import { formatDay } from '../../shared/portal'
import { MemberCard } from '../../components/MemberCard'
import { ActivityRow } from '../../components/ActivityRow'
import { Avatar, Backdrop, IconBadge, Notice, Press, SectionTitle, Shimmer, Surface } from '../../components/ui'

/**
 * Home: the venue's greeting, the member's card with the way to the next tier, the card and messages one press away,
 * what the member's level gives, the latest points and how to reach the venue. Everything is the portal's bootstrap.
 */
export default function Home() {
  const insets = useSafeAreaInsets()
  const { t, tp, language } = useT()
  const boot = useBoot()
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    await queryClient.invalidateQueries({ queryKey: KEYS.boot })
    setRefreshing(false)
  }

  const data = boot.data
  const member = data?.member
  const venue = data?.venue
  const firstName = member?.name.split(' ')[0] ?? ''
  const unread = data?.counts.unread_notifications ?? 0

  return (
    <Backdrop>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: TAB_BAR_ROOM, paddingHorizontal: 20, gap: 22 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={C.gold} />}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.venueRow}>
              {venue?.logo_url ? <Image source={{ uri: venue.logo_url }} style={styles.logo} /> : null}
              <Text style={[fonts.label, { color: C.gold, flexShrink: 1 }]} numberOfLines={1}>{venue?.name ?? ' '}</Text>
            </View>
            <Text style={[fonts.italic, { color: C.text2 }]}>{t(greeting(new Date().getHours()))},</Text>
            <Text style={[fonts.display, { color: C.text }]} numberOfLines={1}>{firstName || ' '}</Text>
          </View>
          {member && (
            <Press onPress={() => router.navigate('/more')} label={t('more.title')}>
              <Avatar name={member.name} size={48} color={member.tier?.color_hex} />
            </Press>
          )}
        </View>

        {boot.isError && !data && <Notice text={t(errorKey(failureOf(boot.error)))} action={tp('portal.common.retry')} onAction={() => { void boot.refetch() }} />}
        {boot.isLoading && <View style={{ gap: 14 }}><Shimmer height={220} /><Shimmer height={90} /></View>}

        {member && venue && (
          <Press onPress={() => router.navigate('/card')} label={t('home.showCard')}>
            <MemberCard member={member} venue={venue.name} currency={venue.currency} />
          </Press>
        )}

        {member && (
          <View style={styles.tiles}>
            <Press onPress={() => router.navigate('/card')} style={{ flex: 1 }} label={t('home.showCard')}>
              <Surface style={styles.tile}>
                <IconBadge name="qr-code" color={C.gold} />
                <Text style={[fonts.bodyStrong, { color: C.text }]}>{t('home.showCard')}</Text>
                <Text style={[fonts.small, { color: C.text2 }]}>{t('home.showCardLine')}</Text>
              </Surface>
            </Press>
            <Press onPress={() => router.push('/inbox')} style={{ flex: 1 }} label={t('home.messages')}>
              <Surface style={styles.tile} tint={unread > 0 ? C.info : undefined}>
                <IconBadge name={unread > 0 ? 'mail-unread' : 'mail-open-outline'} color={unread > 0 ? C.info : C.text2} />
                <Text style={[fonts.bodyStrong, { color: C.text }]}>{t('home.messages')}</Text>
                <Text style={[fonts.small, { color: unread > 0 ? C.info : C.text2 }]}>{unread > 0 ? t('home.unread', { n: number(unread, language) }) : t('home.noneUnread')}</Text>
              </Surface>
            </Press>
          </View>
        )}

        {member && member.benefits.length > 0 && (
          <View>
            <SectionTitle title={tp('portal.home.benefits', { tier: member.tier?.name ?? '' })} action={tp('portal.common.see_all')} onAction={() => router.navigate('/rewards')} />
            <Surface padding={0} style={{ paddingHorizontal: 16 }}>
              {member.benefits.slice(0, 4).map((benefit, i, all) => (
                <View key={benefit.id} style={[styles.benefit, i < all.length - 1 && styles.divider]}>
                  <View style={[styles.benefitMark, { backgroundColor: C.goldWash }]}><Ionicons name="ribbon" size={16} color={C.gold} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[fonts.bodyStrong, { color: C.text }]}>{benefit.name}</Text>
                    {benefit.display ? <Text style={[fonts.small, { color: C.text2 }]}>{benefit.display}</Text> : null}
                  </View>
                </View>
              ))}
            </Surface>
          </View>
        )}

        {member && venue && (
          <View>
            <SectionTitle title={tp('portal.home.recent_activity')} action={member.recent_activity.length ? tp('portal.common.see_all') : undefined} onAction={() => router.navigate('/activity')} />
            <Surface padding={0} style={{ paddingHorizontal: 16 }}>
              {member.recent_activity.length === 0
                ? <Text style={[fonts.body, { color: C.text2, paddingVertical: 18 }]}>{tp('portal.home.no_activity')}</Text>
                : member.recent_activity.slice(0, 5).map((item, i, all) => <ActivityRow key={item.id} item={item} timezone={venue.timezone} last={i === all.length - 1} />)}
            </Surface>
          </View>
        )}

        {member && venue && (
          <View style={{ gap: 10, alignItems: 'center' }}>
            <Text style={[fonts.small, { color: C.text3 }]}>{tp('portal.home.member_since', { date: formatDay(member.member_since, language) })}</Text>
            {(venue.contact.phone || venue.contact.email) && (
              <Press onPress={() => { void Linking.openURL(venue.contact.phone ? `tel:${venue.contact.phone}` : `mailto:${venue.contact.email}`) }} style={[styles.contact, { borderColor: C.hairlineStrong }]}>
                <Ionicons name={venue.contact.phone ? 'call-outline' : 'mail-outline'} size={16} color={C.gold} />
                <Text style={[fonts.smallStrong, { color: C.text }]}>{tp('portal.home.contact', { venue: venue.name })}</Text>
              </Press>
            )}
          </View>
        )}
      </ScrollView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 22, height: 22, borderRadius: 11 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { gap: 8, minHeight: 132 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  benefitMark: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  divider: { borderBottomWidth: 1, borderBottomColor: C.hairline },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1 },
})
