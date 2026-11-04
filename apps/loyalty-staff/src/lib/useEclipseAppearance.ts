import { useEffect, useState } from 'react'
import { AccessibilityInfo, AppState, Platform } from 'react-native'
import { useIsFocused } from 'expo-router'
import * as Battery from 'expo-battery'

/** Decorative motion stops when Home is hidden, the app is away, or the user reduces motion. */
export function useEclipseAppearance() {
  const focused = useIsFocused()
  const [active, setActive] = useState(AppState.currentState === 'active')
  const [reduceMotion, setReduceMotion] = useState(true)
  const [solid, setSolid] = useState(false)
  const [lowPower, setLowPower] = useState(true)
  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setReduceMotion(v) }).catch(() => {})
    void Battery.isLowPowerModeEnabledAsync().then(v => { if (mounted) setLowPower(v) }).catch(() => {})
    const power = Platform.OS === 'web' ? null : Battery.addLowPowerModeListener(v => setLowPower(v.lowPowerMode))
    if (Platform.OS === 'ios') void AccessibilityInfo.isReduceTransparencyEnabled().then(v => { if (mounted) setSolid(v) }).catch(() => {})
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    const transparency = Platform.OS === 'ios' ? AccessibilityInfo.addEventListener('reduceTransparencyChanged', setSolid) : null
    const appState = AppState.addEventListener('change', next => setActive(next === 'active'))
    return () => { mounted = false; motion.remove(); transparency?.remove(); appState.remove(); power?.remove() }
  }, [])
  return { animate: focused && active && !reduceMotion && !lowPower, reduceMotion: reduceMotion || lowPower, solid }
}
