import { ScrollView, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useT } from '../../lib/i18n'
import { C, TAB_BAR_ROOM, fonts } from '../../lib/theme'
import { Backdrop } from '../../components/ui'

/** Rewards: the member's benefits, the catalogue, offers and codes (phase 2). */
export default function Rewards() {
  const insets = useSafeAreaInsets()
  const { tp } = useT()
  return (
    <Backdrop>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: TAB_BAR_ROOM, paddingHorizontal: 20, gap: 16 }}>
        <Text style={[fonts.display, { color: C.text }]}>{tp('portal.rewards.title')}</Text>
      </ScrollView>
    </Backdrop>
  )
}
