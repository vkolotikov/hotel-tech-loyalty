import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { C, GOLD_GRADIENT, SHADOW, fonts } from '../lib/theme'
import { feel } from '../lib/haptics'
import { useT } from '../lib/i18n'
import type { Key } from '../lib/i18n/en'
import type { IconName } from './ui'

const TABS: Record<string, { icon: IconName; on: IconName; label: Key }> = {
  index: { icon: 'home-outline', on: 'home', label: 'tab.home' },
  members: { icon: 'people-outline', on: 'people', label: 'tab.members' },
  scan: { icon: 'scan-outline', on: 'scan', label: 'tab.scan' },
  requests: { icon: 'file-tray-outline', on: 'file-tray-full', label: 'tab.requests' },
  more: { icon: 'ellipsis-horizontal-circle-outline', on: 'ellipsis-horizontal-circle', label: 'tab.more' },
}

/**
 * The tab bar: frosted navy with four quiet tabs and, in the middle, the raised gold Scan button — the desk's one
 * constant action, reachable with the thumb from anywhere. Requests carries the waiting count.
 */
export function TabBar({ state, navigateToTab, insets, waiting }: BottomTabBarProps & { waiting: number }) {
  const { t } = useT()
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.fill} />
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const tab = TABS[route.name]
          if (!tab) return null
          const focused = state.index === index
          const go = () => { feel.tap(); if (!focused) navigateToTab(route.key) }

          if (route.name === 'scan') {
            return (
              <Pressable key={route.key} onPress={go} style={styles.scanSlot} accessibilityRole="button" accessibilityLabel={t(tab.label)} accessibilityState={{ selected: focused }}>
                <LinearGradient colors={GOLD_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.scan, SHADOW.glow]}>
                  <Ionicons name="scan" size={28} color={C.onGold} />
                </LinearGradient>
                <Text style={[fonts.tab, { color: focused ? C.gold : C.text2 }]}>{t(tab.label)}</Text>
              </Pressable>
            )
          }

          const badge = route.name === 'requests' && waiting > 0 ? waiting : 0
          return (
            <Pressable key={route.key} onPress={go} style={styles.tab} accessibilityRole="button" accessibilityLabel={t(tab.label)} accessibilityState={{ selected: focused }}>
              <View>
                <Ionicons name={focused ? tab.on : tab.icon} size={23} color={focused ? C.gold : C.text2} />
                {badge > 0 && (
                  <View style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text></View>
                )}
              </View>
              <Text style={[fonts.tab, { color: focused ? C.gold : C.text2 }]}>{t(tab.label)}</Text>
              {focused && <View style={styles.dot} />}
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
  scanSlot: { flex: 1, alignItems: 'center', gap: 4, marginTop: -30 },
  scan: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.bg },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.gold, marginTop: 1 },
  badge: { position: 'absolute', top: -5, right: -12, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.bg },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: '#fff' },
})
