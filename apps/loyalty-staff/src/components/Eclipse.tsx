import { useEffect, useRef, type ReactNode } from 'react'
import { ActivityIndicator, Animated, Easing, Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ECLIPSE as E } from '../lib/theme'
import { Press } from './ui'

/** Exact Figma vectors, rasterised at 3× without changing their paths or filters for Android. */
export const ECLIPSE_ASSETS = {
  scan: require('../../assets/eclipse/scan.png'),
  members: require('../../assets/eclipse/members.png'),
  requests: require('../../assets/eclipse/requests.png'),
  activity: require('../../assets/eclipse/activity.png'),
  more: require('../../assets/eclipse/more.png'),
  atmosphere: require('../../assets/eclipse/atmosphere.png'),
  coolRim: require('../../assets/eclipse/cool-rim.png'),
  goldRim: require('../../assets/eclipse/gold-rim.png'),
  dockPool: require('../../assets/eclipse/dock-pool.png'),
  dockBloom: require('../../assets/eclipse/dock-bloom.png'),
  dockEdge: require('../../assets/eclipse/dock-edge.png'),
  dockHome: require('../../assets/eclipse/dock-home.png'),
  dockScan: require('../../assets/eclipse/dock-scan.png'),
  dockMembers: require('../../assets/eclipse/dock-members.png'),
  dockRequests: require('../../assets/eclipse/dock-requests.png'),
}

export function EclipseIcon({ name, size = 30 }: { name: keyof typeof ECLIPSE_ASSETS; size?: number }) {
  return <Image source={ECLIPSE_ASSETS[name]} style={{ width: size, height: size }} resizeMode="contain" accessible={false} />
}

export function EclipseAtmosphere({ width, animate, solid }: { width: number; animate: boolean; solid: boolean }) {
  const drift = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!animate || solid) { drift.setValue(0); return }
    const motion = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 6, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(drift, { toValue: -6, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]))
    motion.start()
    return () => { motion.stop(); drift.setValue(0) }
  }, [animate, solid, drift])
  if (solid) return null
  return <Animated.Image pointerEvents="none" accessible={false} source={ECLIPSE_ASSETS.atmosphere} resizeMode="contain" style={{ position: 'absolute', top: 0, left: 0, width, height: width * 852 / 393, transform: [{ translateY: drift }] }} />
}

export function EclipseSurface({ children, tone = 'quiet', radius = E.tileRadius, style, solid = false }: {
  children: ReactNode; tone?: 'quiet' | 'attention' | 'scan'; radius?: number; style?: StyleProp<ViewStyle>; solid?: boolean
}) {
  const colors = tone === 'scan' ? E.scan : tone === 'attention' ? E.attention : E.tile
  return (
    <LinearGradient colors={E.rim} locations={[0, 0.35, 0.72, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius, padding: 0.8 }}>
      <LinearGradient colors={solid ? [E.surface, E.surface] : colors} locations={solid ? undefined : tone === 'scan' ? E.scanStops : E.tileStops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: radius - 0.8, overflow: 'hidden' }, style]}>
        {children}
      </LinearGradient>
    </LinearGradient>
  )
}

export function EclipseScan({ label, onPress, reduceMotion, animate, solid }: {
  label: string; onPress: () => void; reduceMotion: boolean; animate: boolean; solid: boolean
}) {
  const light = useRef(new Animated.Value(0)).current
  const entered = useRef(false)
  useEffect(() => {
    if (!animate || solid || entered.current) return
    entered.current = true
    const motion = Animated.timing(light, { toValue: 1, duration: 1800, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false })
    motion.start()
    return () => { motion.stop(); light.setValue(1) }
  }, [animate, solid, light])
  return (
    <Press label={label} onPress={onPress} reduceMotion={reduceMotion} pressedScale={0.98}>
      <EclipseSurface tone="scan" radius={E.scanRadius} solid={solid} style={styles.scan}>
        {!solid && <>
          <Image source={ECLIPSE_ASSETS.coolRim} pointerEvents="none" accessible={false} style={styles.coolRim} />
          <Animated.Image source={ECLIPSE_ASSETS.goldRim} pointerEvents="none" accessible={false} style={[styles.goldRim, { transform: [{ translateX: light.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : -24, 0] }) }] }]} />
        </>}
        <EclipseIcon name="scan" size={60} />
        <Text style={styles.scanLabel}>{label}</Text>
      </EclipseSurface>
    </Press>
  )
}

export function EclipseTile({ label, icon, onPress, badge, busy, problem, accessibilityLabel, reduceMotion, solid }: {
  label: string; icon: 'members' | 'requests' | 'activity' | 'more'; onPress: () => void; badge?: string;
  busy?: boolean; problem?: boolean; accessibilityLabel?: string; reduceMotion: boolean; solid: boolean
}) {
  return (
    <Press style={{ flex: 1 }} label={accessibilityLabel ?? label} onPress={onPress} reduceMotion={reduceMotion} pressedScale={0.98}>
      <EclipseSurface solid={solid} tone={badge ? 'attention' : 'quiet'} style={styles.tile}>
        <EclipseIcon name={icon} />
        <Text style={styles.tileLabel}>{label}</Text>
        {(badge || busy || problem) && <View style={[styles.badge, !badge && styles.badgeQuiet]} accessible={false}>
          {busy ? <ActivityIndicator size={12} color={E.accent} /> : <Text style={[styles.badgeLabel, !badge && { color: E.accent }]}>{problem ? '!' : badge}</Text>}
        </View>}
      </EclipseSurface>
    </Press>
  )
}

const styles = StyleSheet.create({
  scan: { minHeight: 184.4, paddingVertical: 30, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', gap: 16 },
  scanLabel: { ...E.type.action, color: E.text, textAlign: 'center' },
  tile: { minHeight: 104.4, paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
  tileLabel: { ...E.type.tile, color: E.text, textAlign: 'center' },
  badge: { position: 'absolute', right: 15, top: 9, minWidth: 25, minHeight: 25, borderRadius: 20, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: E.accent },
  badgeQuiet: { backgroundColor: E.surface },
  badgeLabel: { ...E.type.badge, color: E.ink },
  coolRim: { position: 'absolute', width: 181, height: 62, left: -53, top: -30 },
  goldRim: { position: 'absolute', width: 234, height: 78, right: -62, bottom: -36 },
})
