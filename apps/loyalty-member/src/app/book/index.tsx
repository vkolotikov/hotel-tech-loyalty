import { Text, View } from 'react-native'
import { Redirect, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useBoot } from '../../lib/queries'
import { useT } from '../../lib/i18n'
import { C, fonts } from '../../lib/theme'
import { bookDestination } from '../../shared/portal'
import { Empty, IconBadge, Press, Shimmer, Surface } from '../../components/ui'
import { Sheet } from '../../components/Sheet'

/** Where "Book" leads, as the portal decides (`bookDestination`): the one flow a venue has, or a choice of both. */
export default function BookEntry() {
  const { tp } = useT()
  const boot = useBoot()
  if (!boot.data) return <Sheet title={tp('portal.book.title')}><Shimmer height={90} /></Sheet>
  const destination = bookDestination(boot.data.capabilities, false)
  if (destination === 'appointment') return <Redirect href="/book/appointment" />
  if (destination === 'stay') return <Redirect href="/book/stay" />
  return (
    <Sheet title={destination === 'choose' ? tp('portal.stay.chooser_title') : tp('portal.book.title')}>
      {destination === 'none' && <Empty icon="calendar-clear-outline" text={tp('portal.book.not_bookable')} />}
      {destination === 'choose' && (
        <View style={{ gap: 12 }}>
          <Choice icon="calendar-outline" title={tp('portal.stay.chooser_appointment')} hint={tp('portal.stay.chooser_appointment_hint')} onPress={() => router.replace('/book/appointment')} />
          <Choice icon="bed-outline" title={tp('portal.stay.chooser_stay')} hint={tp('portal.stay.chooser_stay_hint')} onPress={() => router.replace('/book/stay')} />
        </View>
      )}
    </Sheet>
  )
}

function Choice({ icon, title, hint, onPress }: { icon: 'calendar-outline' | 'bed-outline'; title: string; hint: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} label={title}>
      <Surface style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconBadge name={icon} color={C.gold} size={46} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[fonts.title, { color: C.text, fontSize: 22 }]}>{title}</Text>
          <Text style={[fonts.small, { color: C.text2 }]}>{hint}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.text3} />
      </Surface>
    </Press>
  )
}
