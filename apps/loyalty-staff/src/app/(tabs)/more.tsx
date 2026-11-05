import { ScrollView, View, useWindowDimensions } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WEB_BASE } from '../../lib/api'
import { useBoot } from '../../lib/queries'
import { useT, type Key } from '../../lib/i18n'
import type { Can } from '../../lib/types'
import { ECLIPSE as E, TAB_BAR_ROOM } from '../../lib/theme'
import { ActionTile, Backdrop, PageHeading, type IconName } from '../../components/ui'

const PAGES: { path: string; label: Key; icon: IconName; permission?: keyof Can }[] = [
  { path: 'program', label: 'more.program', icon: 'shield-checkmark-outline' },
  { path: 'rewards', label: 'more.rewards', icon: 'gift-outline' },
  { path: 'events', label: 'more.events', icon: 'calendar-outline' },
  { path: 'campaigns', label: 'more.campaigns', icon: 'mail-outline', permission: 'manage_campaigns' },
  { path: 'insights', label: 'more.insights', icon: 'stats-chart-outline', permission: 'view_insights' },
  { path: 'settings', label: 'more.settings', icon: 'settings-outline', permission: 'manage_program' },
  { path: 'guide', label: 'more.guide', icon: 'book-outline' },
]
export default function More() {
  const insets = useSafeAreaInsets()
  const { t } = useT()
  const boot = useBoot()
  const { fontScale } = useWindowDimensions()
  const pages = PAGES.filter(p => !p.permission || boot.data?.staff.can[p.permission])
  const columns = fontScale >= 1.4 ? 1 : 2
  return <Backdrop><ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: E.inset, paddingBottom: TAB_BAR_ROOM, gap: E.gap }}>
    <PageHeading title={t('more.title')} />
    {Array.from({ length: Math.ceil(pages.length / columns) }, (_, row) => <View key={row} style={{ flexDirection: 'row', gap: E.gap }}>
      {pages.slice(row * columns, (row + 1) * columns).map(p => <ActionTile external style={{ flex: 1 }} key={p.path} title={t(p.label)} icon={p.icon}
        onPress={() => { void WebBrowser.openBrowserAsync(`${WEB_BASE}/loyalty/${p.path}`) }} />)}
      {columns === 2 && row * columns + 1 === pages.length && <View style={{ flex: 1 }} />}
    </View>)}
  </ScrollView></Backdrop>
}
