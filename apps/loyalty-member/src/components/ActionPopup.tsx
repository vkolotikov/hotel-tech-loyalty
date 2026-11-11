import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { Animated, BackHandler, Easing, Keyboard, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { C, SHADOW, fonts } from '../lib/theme'
import { peekOrigin, popupPlacement, takeOrigin, type PopupKind } from '../lib/motion'
import { useReducedMotion } from '../lib/useReducedMotion'
import { useT } from '../lib/i18n'
import { MemberIcon } from './MemberIcon'

interface Props {
  visible: boolean
  onClose: () => void
  title: string
  children: ReactNode
  busy?: boolean
  kind?: PopupKind
  embedded?: boolean
}

/** One presentation engine: short actions grow from their trigger, longer documents rise in a sheet. */
export function ActionPopup(props: Props) {
  return props.visible ? <PopupBody {...props} /> : null
}

function PopupBody({ onClose, title, children, busy = false, kind = 'popup', embedded = false }: Props) {
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const reduce = useReducedMotion()
  const { tp } = useT()
  const [origin] = useState(peekOrigin)
  const [progress] = useState(() => new Animated.Value(0))
  const [drag] = useState(() => new Animated.Value(0))
  const [bodyHeight, setBodyHeight] = useState<number | null>(null)
  const [headHeight, setHeadHeight] = useState(74)
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null)
  const [area, setArea] = useState({ width: window.width, height: window.height, x: 0, y: 0 })
  const root = useRef<ComponentRef<typeof View>>(null)
  const live = useRef(true)
  const started = useRef(false)
  const closing = useRef(false)
  const busyNow = useRef(busy)
  useEffect(() => { busyNow.current = busy }, [busy])
  useEffect(() => { live.current = true; takeOrigin(); return () => { live.current = false; progress.stopAnimation() } }, [progress])
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKeyboardTop(e.endCoordinates.screenY))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardTop(null))
    return () => { show.remove(); hide.remove() }
  }, [])

  const height = Math.max(120, Math.min(area.height, keyboardTop === null ? window.height : keyboardTop - area.y))
  const anchor = origin ? { ...origin, x: origin.x - area.x, y: origin.y - area.y } : undefined
  const place = popupPlacement({ width: area.width, height }, insets, headHeight + (bodyHeight ?? 240), kind, anchor)
  useEffect(() => {
    if (bodyHeight === null || started.current) return
    started.current = true
    Animated.timing(progress, { toValue: 1, duration: reduce ? 0 : 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [bodyHeight, progress, reduce])

  const close = useCallback(() => {
    if (busyNow.current || closing.current) return
    closing.current = true
    Keyboard.dismiss()
    Animated.timing(progress, { toValue: 0, duration: reduce ? 0 : 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished && live.current) {
        if (!busyNow.current) onClose()
        else { closing.current = false; progress.setValue(1) }
      }
    })
  }, [onClose, progress, reduce])

  useEffect(() => {
    if (!embedded) return
    if (Platform.OS === 'web') {
      const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close() } }
      globalThis.addEventListener('keydown', key)
      return () => globalThis.removeEventListener('keydown', key)
    }
    const back = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true })
    return () => back.remove()
  }, [embedded, close])

  // PanResponder stores these handlers; refs are read only later, in native gesture callbacks.
  // eslint-disable-next-line react-hooks/refs
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => !busy && g.dy > 12 && Math.abs(g.dx) < g.dy / 2,
    onPanResponderMove: (_e, g) => { if (!busy) drag.setValue(Math.max(0, g.dy)) },
    onPanResponderRelease: (_e, g) => {
      if (!busy && (g.dy > 90 || g.vy > .7)) close()
      else Animated.spring(drag, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 280 }).start()
    },
  }), [busy, close, drag])

  const fromX = anchor ? anchor.x + anchor.width / 2 - (place.x + place.width / 2) : 0
  const fromY = kind === 'sheet' ? Math.min(place.height, 220) : anchor ? anchor.y + anchor.height / 2 - (place.y + place.height / 2) : 10
  const scale = kind === 'sheet' || !anchor ? .97 : Math.max(.15, Math.min(.85, anchor.width / place.width))
  const body = <View ref={root} style={StyleSheet.absoluteFill} onLayout={() => root.current?.measureInWindow((x, y, width, measuredHeight) => setArea(old => old.x === x && old.y === y && old.width === width && old.height === measuredHeight ? old : { x, y, width, height: measuredHeight }))}>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(7,13,21,0.48)', opacity: progress }]}>
      <Pressable testID="popup-backdrop" onPress={close} disabled={busy} style={StyleSheet.absoluteFill} accessibilityLabel={tp('portal.common.close')} accessibilityRole="button" />
    </Animated.View>
    <Animated.View accessibilityViewIsModal importantForAccessibility="yes" testID="action-popup" style={[styles.panel, SHADOW.card, { left: place.x, top: place.y, width: place.width, height: place.height, borderRadius: kind === 'sheet' ? 28 : 24, opacity: progress, transform: reduce ? [] : [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [fromX, 0] }) },
      { translateY: Animated.add(drag, progress.interpolate({ inputRange: [0, 1], outputRange: [fromY, 0] })) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [scale, 1] }) },
    ] }]}>
      <View onLayout={e => setHeadHeight(e.nativeEvent.layout.height)} {...(kind === 'sheet' ? pan.panHandlers : {})}>
        {kind === 'sheet' && <View style={styles.handleRow}><View style={styles.handle} /></View>}
        <View style={[styles.header, kind === 'sheet' && { paddingTop: 0 }]}>
          <Text accessibilityRole="header" style={[fonts.heading, { color: C.text, flex: 1 }]}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={tp('portal.common.close')} disabled={busy} onPress={close} style={[styles.close, busy && { opacity: .4 }]}><MemberIcon name="close" size={22} /></Pressable>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} onContentSizeChange={(_w, h) => setBodyHeight(old => old === h ? old : h)} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </Animated.View>
  </View>
  return embedded ? body : <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={close}>{body}</Modal>
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', backgroundColor: '#192330', borderWidth: 1, borderColor: C.hairline, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
  handleRow: { height: 32, alignItems: 'center', justifyContent: 'center' },
  handle: { height: 4, width: 36, borderRadius: 2, backgroundColor: C.text3 },
})
