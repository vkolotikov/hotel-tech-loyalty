import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useBoot } from '../lib/queries'
import { useT } from '../lib/i18n'
import { bookDestination, vocabKey } from '../shared/portal'
import { BookingCard, openBooking } from '../components/Bookings'
import { Empty, GhostButton, GoldButton, Notice, Segments, Shimmer } from '../components/ui'
import { Sheet } from '../components/Sheet'

type Scope = 'upcoming' | 'past'

/** The member's bookings, upcoming and past, appointments and stays together, as the portal lists them. */
export default function Bookings() {
  const { t, tp } = useT()
  const boot = useBoot()
  const [scope, setScope] = useState<Scope>('upcoming')
  const list = useInfiniteQuery({
    queryKey: ['bookings', scope],
    queryFn: ({ pageParam }) => api.bookings(scope, pageParam),
    initialPageParam: 1,
    getNextPageParam: last => (last.meta.page * last.meta.per_page < last.meta.total ? last.meta.page + 1 : undefined),
  })
  const venue = boot.data?.venue
  const rows = list.data?.pages.flatMap(page => page.data) ?? []
  const noun = tp(vocabKey(venue?.industry, 'booking_plural'))
  const canBook = boot.data ? bookDestination(boot.data.capabilities, false) !== 'none' : false

  return (
    <Sheet title={tp('portal.bookings.title')}>
      {canBook && <GoldButton title={tp('portal.nav.book')} icon="add" onPress={() => router.push('/book')} />}
      <Segments<Scope>
        value={scope}
        onChange={setScope}
        items={[{ id: 'upcoming', label: tp('portal.bookings.upcoming') }, { id: 'past', label: tp('portal.bookings.past') }]}
      />
      {list.isLoading && <View style={{ gap: 10 }}><Shimmer height={84} /><Shimmer height={84} /></View>}
      {list.isError && <Notice text={tp('portal.common.error')} action={tp('portal.common.retry')} onAction={() => { void list.refetch() }} />}
      {list.data && rows.length === 0 && (
        <Empty icon="calendar-outline" text={scope === 'upcoming' ? tp('portal.bookings.empty_upcoming', { noun }) : tp('portal.bookings.empty_past', { noun })} />
      )}
      {rows.map(b => (
        <BookingCard key={`${b.kind}-${b.id}`} booking={b} timezone={venue?.timezone} onPress={() => openBooking(b)} />
      ))}
      {list.hasNextPage && <GhostButton title={t('list.more')} busy={list.isFetchingNextPage} onPress={() => { void list.fetchNextPage() }} />}
    </Sheet>
  )
}
