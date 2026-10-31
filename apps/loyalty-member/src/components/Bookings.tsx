import { StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { C, fonts } from '../lib/theme'
import { bookDestination, formatDateTime, formatDay, formatMoney, nextHeading, nightsAndGuests, statusLabel, statusTone, type ChipTone } from '../shared/portal'
import type { PortalBooking, PortalCapabilities, PortalVenue } from '../lib/types'
import { GhostButton, GoldButton, Pill, Press, SectionTitle, Shimmer, Surface } from './ui'

/** A status chip's colour, by the portal's own tone. */
export function toneColor(tone: ChipTone): string {
  switch (tone) {
    case 'success': return C.success
    case 'warning': return C.warning
    case 'danger': return C.danger
    case 'accent': return C.gold
    default: return C.text2
  }
}

/** When a booking is, as the portal's `DateTime` writes it: a stay by its day, an appointment by day and time. */
export function bookingWhen(b: Pick<PortalBooking, 'kind' | 'starts_at'>, language: string, timezone: string | undefined): string {
  if (!b.starts_at) return ''
  return b.kind === 'stay' ? formatDay(b.starts_at, language) : formatDateTime(b.starts_at, language, timezone)
}

/** A booking in a list, as the portal's row: what, when, with whom or for how long, the total and the status. */
export function BookingCard({ booking: b, timezone, onPress }: { booking: PortalBooking; timezone: string | undefined; onPress: () => void }) {
  const { tp, language } = useT()
  const when = bookingWhen(b, language, timezone)
  const extra = b.kind === 'stay' && b.nights != null && b.guests != null ? nightsAndGuests(tp, b.nights, b.guests) : b.kind === 'service' ? b.subtitle : null
  return (
    <Press onPress={onPress} label={b.title}>
      <Surface style={styles.card}>
        <View style={[styles.mark, { backgroundColor: C.goldWash }]}>
          <Ionicons name={b.kind === 'stay' ? 'bed-outline' : 'calendar-outline'} size={20} color={C.gold} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[fonts.bodyStrong, { color: C.text }]} numberOfLines={1}>{b.title}</Text>
          <Text style={[fonts.small, { color: C.text2 }]} numberOfLines={2}>{[when, extra].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Text style={[fonts.smallStrong, { color: C.text }]}>{formatMoney(b.total, b.currency, language)}</Text>
          <Pill text={tp(`portal.bookings.status.${b.status}`, statusLabel(b.status))} color={toneColor(statusTone(b.status))} />
        </View>
      </Surface>
    </Press>
  )
}

/** Opens a booking's own page. */
export function openBooking(b: Pick<PortalBooking, 'kind' | 'id'>) {
  router.push({ pathname: '/booking/[kind]/[id]', params: { kind: b.kind, id: String(b.id) } })
}

/**
 * Home's next booking, as the portal's: the first upcoming one under the venue's own heading (`nextHeading`), or
 * "Nothing booked yet" with the way to book. Only at a venue that takes bookings.
 */
export function NextBooking({ venue, capabilities }: { venue: PortalVenue; capabilities: PortalCapabilities }) {
  const { tp } = useT()
  const upcoming = useQuery({ queryKey: ['bookings', 'next'], queryFn: () => api.bookings('upcoming', 1), staleTime: 60_000 })
  if (upcoming.isError) return null
  const next = upcoming.data?.data[0]
  const heading = nextHeading(next?.kind, capabilities, venue.industry)
  const canBook = bookDestination(capabilities, false) !== 'none'
  return (
    <View>
      <SectionTitle title={tp(heading.key, heading.fallback)} action={next ? tp('portal.common.see_all') : undefined} onAction={() => router.push('/bookings')} />
      {upcoming.isLoading && <Shimmer height={84} />}
      {next && <BookingCard booking={next} timezone={venue.timezone} onPress={() => openBooking(next)} />}
      {next && canBook && <GhostButton title={tp('portal.nav.book')} icon="add" onPress={() => router.push('/book')} style={{ marginTop: 10 }} />}
      {upcoming.data && !next && (
        <Surface style={{ gap: 12, alignItems: 'center' }}>
          <Ionicons name="calendar-clear-outline" size={24} color={C.text3} />
          <Text style={[fonts.body, { color: C.text2, textAlign: 'center' }]}>{tp('portal.home.no_upcoming')}</Text>
          {canBook && <GoldButton title={tp('portal.nav.book')} icon="add" onPress={() => router.push('/book')} style={{ alignSelf: 'stretch' }} />}
        </Surface>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
})
