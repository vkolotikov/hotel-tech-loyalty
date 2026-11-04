import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { BottomTabBarProps } from 'expo-router/js-tabs'
import { ECLIPSE as E } from '../lib/theme'
import { feel } from '../lib/haptics'
import { useT } from '../lib/i18n'
import { number } from '../lib/format'
import { ECLIPSE_ASSETS, EclipseIcon } from './Eclipse'

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
  const requestsHint = queueState === 'error' ? t('requests.refreshError') : queueState === 'loading' ? t('requests.loading')
    : waiting > 0 ? t('home.waiting', { n: number(waiting, language) }) : t('home.noneWaiting')
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) + 14 }]}>
      <LinearGradient colors={E.rim} locations={[0, 0.35, 0.72, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rim}>
        <LinearGradient colors={E.dock} locations={[0, 0.37, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.row}>
          {DESTINATIONS.map(tab => {
            const route = state.routes.find(r => r.name === tab.route)
            if (!route) return null
            const focused = state.routes[state.index]?.key === route.key
            const requests = tab.route === 'requests'
            return (
              <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={requests ? t(tab.label) + '. ' + requestsHint : t(tab.label)} accessibilityState={{ selected: focused }}
                onPress={() => { feel.tap(); if (!focused) navigateToTab(route.key) }} style={styles.tab}>
                {focused && <View pointerEvents="none" style={styles.light} accessible={false}>
                  <Image source={ECLIPSE_ASSETS.dockPool} style={styles.pool} />
                  <Image source={ECLIPSE_ASSETS.dockBloom} style={styles.bloom} />
                  <Image source={ECLIPSE_ASSETS.dockEdge} style={styles.edge} />
                </View>}
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
  rim: { padding: 0.8, borderRadius: E.dockRadius },
  row: { minHeight: E.dockHeight - 1.6, flexDirection: 'row', paddingHorizontal: 7.2, borderRadius: E.dockRadius - 0.8, overflow: 'hidden' },
  tab: { flex: 1, minWidth: 48, minHeight: E.dockHeight - 1.6, alignItems: 'center', justifyContent: 'center' },
  light: { position: 'absolute', width: 82.25, height: 64 },
  pool: { position: 'absolute', width: 114, height: 96, left: -16.8, top: -0.8 },
  bloom: { position: 'absolute', width: 64, height: 30, left: 9.2, top: 46.2 },
  edge: { position: 'absolute', width: 36, height: 6, left: 25.2, top: 59.2 },
  badge: { position: 'absolute', top: 6, right: 6, minWidth: 18, minHeight: 18, paddingHorizontal: 4, borderRadius: 12, backgroundColor: E.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { ...E.type.badge, fontSize: 10, lineHeight: 14, color: E.ink },
})
