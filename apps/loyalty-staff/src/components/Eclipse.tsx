import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ActivityIndicator, Animated, Easing, Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ECLIPSE as E } from '../lib/theme'
import { feel } from '../lib/haptics'

/** Exact Figma vectors, rasterised at 3× without changing their paths or filters for Android. */
export const ECLIPSE_ASSETS = {
  scan: require('../../assets/eclipse/scan.png'),
  scanFrame: require('../../assets/eclipse/scan-frame.png'),
  members: require('../../assets/eclipse/members.png'),
  requests: require('../../assets/eclipse/requests.png'),
  activity: require('../../assets/eclipse/activity.png'),
  more: require('../../assets/eclipse/more.png'),
  atmosphere: require('../../assets/eclipse/atmosphere.png'),
  wallpaper: require('../../assets/eclipse/wallpaper-blue-gold.png'),
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

/** One native clock carries a small light around the borders; tile faces stay still. */
export function useEclipseBorderLight(enabled: boolean) {
  const [phase] = useState(() => new Animated.Value(0))
  useEffect(() => {
    if (!enabled) { phase.setValue(0); return }
    const loop = Animated.loop(Animated.timing(phase, {
      toValue: 1, duration: E.motion.borderCycle, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    }))
    loop.start()
    return () => { loop.stop(); phase.setValue(0) }
  }, [enabled, phase])
  return phase
}

/** A small press response, without tilting or lighting the face of the tile. */
function EclipsePress({ children, label, onPress, reduceMotion, fill = false }: {
  children: ReactNode; label: string; onPress: () => void; reduceMotion: boolean; fill?: boolean
}) {
  const [press] = useState(() => new Animated.Value(0))
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
      { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.99] }) },
    ] }}>{children}</Animated.View>
  </Pressable>
}

export function EclipseBorderLight({ width, height, radius, phase, order }: {
  width: number; height: number; radius: number; phase: Animated.Value; order: number
}) {
  // Sample the rounded perimeter by distance, then let the native driver interpolate it.
  // The opaque inner surface masks these lights down to the one-point border.
  const travel = useMemo(() => {
    const r = Math.min(radius, width / 2, height / 2)
    const horizontal = width - 2 * r
    const vertical = height - 2 * r
    const corner = Math.PI * r / 2
    const perimeter = 2 * horizontal + 2 * vertical + 4 * corner
    const segments = [horizontal, corner, vertical, corner, horizontal, corner, vertical, corner]
    const at = (progress: number) => {
      let distance = progress * perimeter
      let segment = 0
      while (segment < 7 && distance > segments[segment]) distance -= segments[segment++]
      if (segment === 0) return [r + distance, 0]
      if (segment === 2) return [width, r + distance]
      if (segment === 4) return [width - r - distance, height]
      if (segment === 6) return [0, height - r - distance]
      const index = (segment - 1) / 2
      const angle = -Math.PI / 2 + index * Math.PI / 2 + distance / r
      const cx = index < 2 ? width - r : r
      const cy = index === 0 || index === 3 ? r : height - r
      return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]
    }
    const inputRange = Array.from({ length: 97 }, (_, i) => i / 96)
    const points = inputRange.map(at)
    const position = Animated.modulo(Animated.add(phase, order * 0.19), 1)
    return [
      { translateX: position.interpolate({ inputRange, outputRange: points.map(p => p[0]) }) },
      { translateY: position.interpolate({ inputRange, outputRange: points.map(p => p[1]) }) },
    ]
  }, [width, height, radius, order, phase])
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, transform: travel }}>
      <Image source={ECLIPSE_ASSETS.dockBloom} resizeMode="stretch" style={{ position: 'absolute', left: -48, top: -48, width: 96, height: 96, tintColor: E.borderLight.halo }} />
      <Image source={ECLIPSE_ASSETS.dockBloom} resizeMode="stretch" style={{ position: 'absolute', left: -17, top: -17, width: 34, height: 34, tintColor: E.borderLight.core }} />
    </Animated.View>
  </View>
}

/** The owner's wallpaper is bundled once and stays still; only the control rims move. */
export function EclipseAtmosphere({ solid }: { solid: boolean }) {
  if (solid) return null
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <Image source={ECLIPSE_ASSETS.wallpaper} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} />
    <LinearGradient colors={E.wallpaper.scrim} locations={[0, 0.42, 1]} style={StyleSheet.absoluteFill} />
  </View>
}

export function EclipseSurface({ children, tone = 'quiet', radius = E.tileRadius, style, solid = false, borderLight, fill = false }: {
  children: ReactNode; tone?: 'quiet' | 'attention' | 'scan' | 'login'; radius?: number; style?: StyleProp<ViewStyle>; solid?: boolean;
  borderLight?: { phase: Animated.Value; order: number }
  fill?: boolean
}) {
  const [size, setSize] = useState({ width: 170, height: 106 })
  const colors = tone === 'scan' ? E.scan : tone === 'attention' ? E.attention : tone === 'login' ? E.loginButton : E.tile
  return (
    <LinearGradient colors={tone === 'attention' || tone === 'login' ? E.activeRim : E.rim} locations={[0, 0.35, 0.72, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: fill ? 1 : undefined, borderRadius: radius, padding: E.borderLight.width, overflow: 'hidden' }}
      onLayout={borderLight ? e => {
        const { width, height } = e.nativeEvent.layout
        if (width > 0 && height > 0) setSize(previous => previous.width === width && previous.height === height ? previous : { width, height })
      } : undefined}>
      {!solid && borderLight && <EclipseBorderLight {...size} radius={radius} {...borderLight} />}
      <View style={{ flex: fill ? 1 : undefined, borderRadius: radius - E.borderLight.width, overflow: 'hidden', backgroundColor: E.bg }}>
      <LinearGradient colors={solid ? [E.surface, E.surface] : colors} locations={solid ? undefined : tone === 'scan' ? E.scanStops : tone === 'login' ? E.loginStops : E.tileStops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[fill && { flex: 1 }, style]}>
        {children}
      </LinearGradient>
      </View>
    </LinearGradient>
  )
}

export function EclipseScan({ label, onPress, reduceMotion, solid, phase, size }: {
  label: string; onPress: () => void; reduceMotion: boolean; solid: boolean; phase: Animated.Value; size?: number
}) {
  return (
    <EclipsePress label={label} onPress={onPress} reduceMotion={reduceMotion}>
      <View style={!solid ? styles.scanShadow : undefined}>
      <EclipseSurface tone="scan" radius={E.scanRadius} solid={solid} style={[styles.scan, size ? { width: size - 2 * E.borderLight.width, minHeight: size - 2 * E.borderLight.width } : null]} borderLight={{ phase, order: 0 }}>
        {!solid && <>
          <Image source={ECLIPSE_ASSETS.coolRim} pointerEvents="none" accessible={false} style={styles.coolRim} />
          <Image source={ECLIPSE_ASSETS.goldRim} pointerEvents="none" accessible={false} style={styles.goldRim} />
        </>}
        <EclipseIcon name="scan" size={60} />
        <Text style={styles.scanLabel}>{label}</Text>
      </EclipseSurface>
      </View>
    </EclipsePress>
  )
}

export function EclipseTile({ label, icon, onPress, badge, busy, problem, accessibilityLabel, reduceMotion, solid, phase, order, size }: {
  label: string; icon: 'members' | 'requests' | 'activity' | 'more'; onPress: () => void; badge?: string;
  busy?: boolean; problem?: boolean; accessibilityLabel?: string; reduceMotion: boolean; solid: boolean; phase: Animated.Value; order: number; size?: number
}) {
  return (
    <EclipsePress fill label={accessibilityLabel ?? label} onPress={onPress} reduceMotion={reduceMotion}>
      <EclipseSurface fill solid={solid} tone={badge ? 'attention' : 'quiet'} style={[styles.tile, size ? { minHeight: size - 2 * E.borderLight.width } : null]} borderLight={{ phase, order }}>
        <EclipseIcon name={icon} />
        <Text style={styles.tileLabel}>{label}</Text>
        {(badge || busy || problem) && <View style={[styles.badge, !badge && styles.badgeQuiet]} accessible={false}>
          {busy ? <ActivityIndicator size={12} color={E.accent} /> : <Text style={[styles.badgeLabel, !badge && { color: E.accent }]}>{problem ? '!' : badge}</Text>}
        </View>}
      </EclipseSurface>
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
  goldRim: { position: 'absolute', width: 234, height: 78, right: -62, bottom: -36, tintColor: E.accent },
})
