import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { ECLIPSE as E } from '../lib/theme'
import { feel } from '../lib/haptics'
import { useT } from '../lib/i18n'
import { number } from '../lib/format'
import { ECLIPSE_ASSETS, EclipseIcon } from './Eclipse'
import { useEclipseAppearance } from '../lib/useEclipseAppearance'

const DESTINATIONS = [
  { route: 'index', icon: 'dockHome', label: 'tab.home' },
  { route: 'scan', icon: 'dockScan', label: 'tab.scan' },
  { route: 'members', icon: 'dockMembers', label: 'tab.members' },
  { route: 'requests', icon: 'dockRequests', label: 'tab.requests' },
] as const

/** Four icons, generous targets and selected state spoken by TalkBack. More stays on Home. */
export function TabBar({ state, navigateToTab, insets, waiting, queueState = 'ready' }: BottomTabBarProps & {
  waiting: number; queueState?: 'ready' | 'loading' | 'error'
}) {
  const { t, language } = useT()
  const appearance = useEclipseAppearance()
  const [rowWidth, setRowWidth] = useState(343.4)
  const tabWidth = (rowWidth - 14.4) / 4
  const selected = DESTINATIONS.findIndex(tab => tab.route === state.routes[state.index]?.name)
  const position = useRef(new Animated.Value(Math.max(0, selected) * tabWidth)).current
  const visibility = useRef(new Animated.Value(selected < 0 ? 0 : 1)).current
  useEffect(() => {
    position.stopAnimation(); visibility.stopAnimation()
    const target = Math.max(0, selected) * tabWidth
    if (!appearance.animate) {
      if (selected >= 0) position.setValue(target)
      visibility.setValue(selected < 0 ? 0 : 1)
      return
    }
    const transition = Animated.parallel([
      ...(selected < 0 ? [] : [Animated.timing(position, { toValue: target, duration: E.motion.dockTravel, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false })]),
      Animated.timing(visibility, { toValue: selected < 0 ? 0 : 1, duration: 180, useNativeDriver: true, isInteraction: false }),
    ])
    transition.start()
    return () => transition.stop()
  }, [selected, tabWidth, appearance.animate, position, visibility])
  const requestsHint = queueState === 'error' ? t('requests.refreshError') : queueState === 'loading' ? t('requests.loading')
    : waiting > 0 ? t('home.waiting', { n: number(waiting, language) }) : t('home.noneWaiting')
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) + 14 }]}>
      <LinearGradient colors={E.rim} locations={[0, 0.35, 0.72, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rim}>
        <LinearGradient colors={appearance.solid ? [E.surface, E.surface] : E.dock} locations={appearance.solid ? undefined : [0, 0.37, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.row} onLayout={e => setRowWidth(e.nativeEvent.layout.width)}>
          <LinearGradient pointerEvents="none" accessible={false} colors={E.mirror.edge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.topReflection} />
          <Animated.View pointerEvents="none" style={[styles.light, { left: 7.2 + (tabWidth - 82.25) / 2, opacity: visibility, transform: [{ translateX: position }] }]} accessible={false} importantForAccessibility="no-hide-descendants">
            <Image source={ECLIPSE_ASSETS.dockPool} style={styles.pool} />
            <Image source={ECLIPSE_ASSETS.dockBloom} style={styles.bloom} />
            <Image source={ECLIPSE_ASSETS.dockEdge} style={styles.edge} />
          </Animated.View>
          {DESTINATIONS.map(tab => {
            const route = state.routes.find(r => r.name === tab.route)
            if (!route) return null
            const focused = state.routes[state.index]?.key === route.key
            const requests = tab.route === 'requests'
            return (
              <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={requests ? t(tab.label) + '. ' + requestsHint : t(tab.label)} accessibilityState={{ selected: focused }}
                onPress={() => { feel.tap(); if (!focused) navigateToTab(route.key) }} style={styles.tab}>
                <EclipseIcon name={tab.icon} size={28} />
                {requests && (waiting > 0 || queueState === 'error') && <View accessible={false} style={styles.badge}><Text style={styles.badgeText}>{queueState === 'error' ? '!' : waiting > 99 ? '99+' : number(waiting, language)}</Text></View>}
              </Pressable>
            )
          })}
        </LinearGradient>
      </LinearGradient>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: E.inset, right: E.inset },
  rim: { padding: 0.8, borderRadius: E.dockRadius, boxShadow: E.mirror.dockShadow },
  row: { minHeight: E.dockHeight - 1.6, flexDirection: 'row', paddingHorizontal: 7.2, borderRadius: E.dockRadius - 0.8, overflow: 'hidden' },
  tab: { flex: 1, minWidth: 48, minHeight: E.dockHeight - 1.6, alignItems: 'center', justifyContent: 'center' },
  light: { position: 'absolute', top: 0, width: 82.25, height: 64 },
  topReflection: { position: 'absolute', top: 0, left: 30, right: 30, height: 0.7, opacity: 0.5 },
  pool: { position: 'absolute', width: 114, height: 96, left: -16.8, top: -0.8 },
  bloom: { position: 'absolute', width: 64, height: 30, left: 9.2, top: 46.2 },
  edge: { position: 'absolute', width: 36, height: 6, left: 25.2, top: 59.2 },
  badge: { position: 'absolute', top: 6, right: 6, minWidth: 18, minHeight: 18, paddingHorizontal: 4, borderRadius: 12, backgroundColor: E.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { ...E.type.badge, fontSize: 10, lineHeight: 14, color: E.ink },
})
