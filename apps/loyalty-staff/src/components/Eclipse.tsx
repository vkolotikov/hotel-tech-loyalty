import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Animated, Easing, Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ECLIPSE as E } from '../lib/theme'
import { feel } from '../lib/haptics'

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

/** One native clock moves the same light across Scan and the grid, then rests between passes. */
export function useEclipseReflection(enabled: boolean) {
  const phase = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!enabled) { phase.setValue(0); return }
    const loop = Animated.loop(Animated.timing(phase, {
      toValue: 1, duration: E.motion.reflectionCycle, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    }))
    loop.start()
    return () => { loop.stop(); phase.setValue(0) }
  }, [enabled, phase])
  return phase
}

/** Content stays still while the glass answers the finger. No sensor or JS animation loop. */
function EclipsePress({ children, label, onPress, reduceMotion, fill = false }: {
  children: (press: Animated.Value) => ReactNode; label: string; onPress: () => void; reduceMotion: boolean; fill?: boolean
}) {
  const press = useRef(new Animated.Value(0)).current
  const change = (pressed: boolean) => {
    press.stopAnimation()
    if (reduceMotion) { press.setValue(0); return }
    Animated.timing(press, {
      toValue: pressed ? 1 : 0, duration: pressed ? E.motion.touchIn : E.motion.touchOut,
      easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false,
    }).start()
  }
  useEffect(() => {
    if (reduceMotion) { press.stopAnimation(); press.setValue(0) }
    return () => press.stopAnimation()
  }, [reduceMotion, press])
  return <Pressable accessibilityRole="button" accessibilityLabel={label} style={fill ? { flex: 1 } : undefined}
    onPressIn={() => change(true)} onPressOut={() => change(false)} onPress={() => { feel.tap(); onPress() }}>
    <Animated.View style={{ flex: fill ? 1 : undefined, transform: [
      { perspective: 900 }, { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) },
      { rotateX: press.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1.4deg'] }) },
      { rotateY: press.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-1.2deg'] }) },
    ] }}>{children(press)}</Animated.View>
  </Pressable>
}

function MirrorLayers({ width, height, phase, order, press }: {
  width: number; height: number; phase: Animated.Value; order: number; press: Animated.Value
}) {
  const start = 0.04 + order * 0.055
  const end = start + 0.38
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <LinearGradient colors={E.mirror.facet} locations={[0, 0.90, 0.975, 1]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
      style={{ position: 'absolute', width: width * 3, height: height * 2, left: -width * 0.7, top: -height * 1.3, transform: [{ rotate: '24deg' }] }} />
    <Animated.View style={{ position: 'absolute', left: 0, top: -height, width: width * 0.75, height: height * 3,
      opacity: phase.interpolate({ inputRange: [0, start, start + 0.04, end - 0.04, end, 1], outputRange: [0, 0, 1, 1, 0, 0] }),
      transform: [{ translateX: phase.interpolate({ inputRange: [start, end], outputRange: [-width * 1.5, width * 2.2], extrapolate: 'clamp' }) }, { rotate: '24deg' }],
    }}>
      <LinearGradient colors={E.mirror.beam} locations={[0, 0.28, 0.66, 0.7, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: press }]}>
      <LinearGradient colors={E.mirror.touch} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  </View>
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

export function EclipseSurface({ children, tone = 'quiet', radius = E.tileRadius, style, solid = false, reflection }: {
  children: ReactNode; tone?: 'quiet' | 'attention' | 'scan'; radius?: number; style?: StyleProp<ViewStyle>; solid?: boolean;
  reflection?: { phase: Animated.Value; press: Animated.Value; order: number }
}) {
  const [size, setSize] = useState({ width: 170, height: 106 })
  const colors = tone === 'scan' ? E.scan : tone === 'attention' ? E.attention : E.tile
  return (
    <LinearGradient colors={E.rim} locations={[0, 0.35, 0.72, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius, padding: 0.8 }}>
      <LinearGradient colors={solid ? [E.surface, E.surface] : colors} locations={solid ? undefined : tone === 'scan' ? E.scanStops : E.tileStops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: radius - 0.8, overflow: 'hidden' }, style]}
        onLayout={reflection ? e => { const { width, height } = e.nativeEvent.layout; setSize(previous => previous.width === width && previous.height === height ? previous : { width, height }) } : undefined}>
        {!solid && reflection && <MirrorLayers {...size} {...reflection} />}
        {!solid && reflection && <LinearGradient pointerEvents="none" accessible={false} colors={E.mirror.edge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', left: radius, right: radius, top: 0, height: 0.7 }} />}
        {children}
      </LinearGradient>
    </LinearGradient>
  )
}

export function EclipseScan({ label, onPress, reduceMotion, solid, phase }: {
  label: string; onPress: () => void; reduceMotion: boolean; solid: boolean; phase: Animated.Value
}) {
  return (
    <EclipsePress label={label} onPress={onPress} reduceMotion={reduceMotion}>
      {press => <View style={!solid ? styles.scanShadow : undefined}>
      <EclipseSurface tone="scan" radius={E.scanRadius} solid={solid} style={styles.scan} reflection={{ phase, press, order: 0 }}>
        {!solid && <>
          <Image source={ECLIPSE_ASSETS.coolRim} pointerEvents="none" accessible={false} style={styles.coolRim} />
          <Image source={ECLIPSE_ASSETS.goldRim} pointerEvents="none" accessible={false} style={styles.goldRim} />
        </>}
        <EclipseIcon name="scan" size={60} />
        <Text style={styles.scanLabel}>{label}</Text>
      </EclipseSurface>
      </View>}
    </EclipsePress>
  )
}

export function EclipseTile({ label, icon, onPress, badge, busy, problem, accessibilityLabel, reduceMotion, solid, phase, order }: {
  label: string; icon: 'members' | 'requests' | 'activity' | 'more'; onPress: () => void; badge?: string;
  busy?: boolean; problem?: boolean; accessibilityLabel?: string; reduceMotion: boolean; solid: boolean; phase: Animated.Value; order: number
}) {
  return (
    <EclipsePress fill label={accessibilityLabel ?? label} onPress={onPress} reduceMotion={reduceMotion}>
      {press => <EclipseSurface solid={solid} tone={badge ? 'attention' : 'quiet'} style={styles.tile} reflection={{ phase, press, order }}>
        <EclipseIcon name={icon} />
        <Text style={styles.tileLabel}>{label}</Text>
        {(badge || busy || problem) && <View style={[styles.badge, !badge && styles.badgeQuiet]} accessible={false}>
          {busy ? <ActivityIndicator size={12} color={E.accent} /> : <Text style={[styles.badgeLabel, !badge && { color: E.accent }]}>{problem ? '!' : badge}</Text>}
        </View>}
      </EclipseSurface>}
    </EclipsePress>
  )
}

const styles = StyleSheet.create({
  scanShadow: { borderRadius: E.scanRadius, boxShadow: E.mirror.scanShadow },
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
