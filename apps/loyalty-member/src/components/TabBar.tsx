import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { C, SHADOW, accentGradient, fonts } from '../lib/theme'
import { feel } from '../lib/haptics'
import { useT } from '../lib/i18n'
import type { IconName } from './ui'

/** Each tab's icon and its words: the portal's own navigation words, and the app's for the card. */
const TABS: Record<string, { icon: IconName; on: IconName; portal?: string; member?: 'tab.card' | 'more.title' }> = {
  index: { icon: 'home-outline', on: 'home', portal: 'portal.nav.home' },
  rewards: { icon: 'gift-outline', on: 'gift', portal: 'portal.nav.rewards' },
  card: { icon: 'qr-code-outline', on: 'qr-code', member: 'tab.card' },
  activity: { icon: 'pulse-outline', on: 'pulse', portal: 'portal.nav.activity' },
  more: { icon: 'ellipsis-horizontal-circle-outline', on: 'ellipsis-horizontal-circle', member: 'more.title' },
}

/**
 * The tab bar: frosted navy with four quiet tabs and, in the middle, the raised Card button in the venue's accent —
 * the member's one constant need at the desk, reachable with the thumb from anywhere. More carries the unread count.
 */
export function TabBar({ state, navigateToTab, insets, unread }: BottomTabBarProps & { unread: number }) {
  const { t, tp } = useT()
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.fill} />
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const tab = TABS[route.name]
          if (!tab) return null
          const label = tab.member ? t(tab.member) : tp(tab.portal ?? '')
          const focused = state.index === index
          const go = () => { feel.tap(); if (!focused) navigateToTab(route.key) }

          if (route.name === 'card') {
            return (
              <Pressable key={route.key} onPress={go} style={styles.cardSlot} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: focused }}>
                <LinearGradient colors={accentGradient()} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, SHADOW.glow]}>
                  <Ionicons name="qr-code" size={26} color={C.onGold} />
                </LinearGradient>
                <Text style={[fonts.tab, { color: focused ? C.gold : C.text2 }]}>{label}</Text>
              </Pressable>
            )
          }

          const badge = route.name === 'more' && unread > 0 ? unread : 0
          return (
            <Pressable key={route.key} onPress={go} style={styles.tab} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: focused }}>
              <View>
                <Ionicons name={focused ? tab.on : tab.icon} size={23} color={focused ? C.gold : C.text2} />
                {badge > 0 && (
                  <View style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text></View>
                )}
              </View>
              <Text style={[fonts.tab, { color: focused ? C.gold : C.text2 }]} numberOfLines={1}>{label}</Text>
              {focused && <View style={[styles.dot, { backgroundColor: C.gold }]} />}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, borderTopColor: C.hairline, overflow: 'visible' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(9,11,18,0.82)' },
  row: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  cardSlot: { flex: 1, alignItems: 'center', gap: 4, marginTop: -30 },
  card: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.bg },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 1 },
  badge: { position: 'absolute', top: -5, right: -12, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.bg },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#fff' },
})
