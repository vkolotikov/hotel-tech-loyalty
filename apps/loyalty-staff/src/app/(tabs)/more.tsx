import { ScrollView } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WEB_BASE } from '../../lib/api'
import { useBoot } from '../../lib/queries'
import { useT, type Key } from '../../lib/i18n'
import type { Can } from '../../lib/types'
import { C, TAB_BAR_ROOM } from '../../lib/theme'
import { Backdrop, IconBadge, PageHeading, Row, type IconName } from '../../components/ui'
import { Glyph } from '../../components/Glyph'

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
  return <Backdrop><ScrollView contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 24, paddingBottom: TAB_BAR_ROOM, gap: 12 }}>
    <PageHeading title={t('more.title')} />
    {PAGES.filter(p => !p.permission || boot.data?.staff.can[p.permission]).map(p => <Row card key={p.path} title={t(p.label)}
      left={<IconBadge name={p.icon} color={C.text} />}
      right={<Glyph name="open-outline" size={17} color={C.text2} />}
      onPress={() => { void WebBrowser.openBrowserAsync(`${WEB_BASE}/loyalty/${p.path}`) }} />)}
  </ScrollView></Backdrop>
}
