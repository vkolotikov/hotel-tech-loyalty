import { Pressable, StyleSheet, View } from 'react-native'
import { BlurView } from 'expo-blur'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { C, SHADOW } from '../lib/theme'
import { feel } from '../lib/haptics'
import { useT } from '../lib/i18n'
import { MemberIcon, type MemberIconName } from './MemberIcon'

const TABS: Record<string, { icon: MemberIconName; portal?: string; member?: 'tab.card' | 'more.title' }> = {
  index: { icon: 'home', portal: 'portal.nav.home' },
  rewards: { icon: 'gift', portal: 'portal.nav.rewards' },
  card: { icon: 'card', member: 'tab.card' },
  events: { icon: 'calendar', portal: 'portal.events.title' },
  more: { icon: 'more', member: 'more.title' },
}
const ORDER = ['index', 'rewards', 'card', 'events', 'more']
/** Owner's icon-only dock. Labels and selection remain available to screen readers. */
export function TabBar({ state, navigateToTab, insets }: BottomTabBarProps & { unread: number }) {
  const { t, tp } = useT()
  return <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) }]}>
    <View style={[styles.dock, SHADOW.card]}>
      <BlurView intensity={32} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(25,35,48,.92)' }]} />
      {ORDER.map(name => {
        const route = state.routes.find(r => r.name === name)
        if (!route) return <View key={name} style={styles.slot} />
        const tab = TABS[name]
        const focused = state.routes[state.index]?.key === route.key
        const label = tab.member ? t(tab.member) : tp(tab.portal ?? '')
        return <Pressable key={name} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: focused }} aria-selected={focused} onPress={() => { if (!focused) { feel.tap(); navigateToTab(route.key) } }} style={styles.slot}>
          <View style={[styles.puck, name === 'card' && { backgroundColor: focused ? C.gold : C.surface3 }]}>
            <MemberIcon name={tab.icon} size={26} color={name === 'card' && focused ? C.onGold : focused ? C.gold : C.text} />
          </View>
        </Pressable>
      })}
    </View>
  </View>
}
const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 16, alignItems: 'center' },
  dock: { width: '100%', maxWidth: 480, minHeight: 76, padding: 8, borderRadius: 34, borderWidth: 1, borderColor: C.hairline, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  slot: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  puck: { width: '100%', maxWidth: 69, minHeight: 60, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
})
