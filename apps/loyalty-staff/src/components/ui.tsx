import { useEffect, useRef, type ReactNode } from 'react'
import {
  ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { BACKDROP, C, GOLD_GRADIENT, RADIUS, SHADOW, fonts, readableOn, tierColor, withAlpha } from '../lib/theme'
import { initials } from '../lib/format'
import { feel } from '../lib/haptics'

export type IconName = keyof typeof Ionicons.glyphMap

/** A browser draws its own focus ring around a text field; the field's border already shows focus. */
export const NO_OUTLINE: TextStyle = Platform.OS === 'web' ? { outlineWidth: 0 } : {}

/** The page's backdrop: deep navy with a faint warm light at the top. */
export function Backdrop({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={BACKDROP} locations={[0, 0.35, 1]} style={[{ flex: 1 }, style]}>
      {children}
    </LinearGradient>
  )
}

/** The one card: a quiet surface with a hairline, optionally lit by a colour's wash. */
export function Surface({ children, style, tint, padding = 16, glow }: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  tint?: string
  padding?: number
  glow?: boolean
}) {
  return (
    <View style={[styles.surface, { padding }, tint ? { backgroundColor: withAlpha(tint, 0.1), borderColor: withAlpha(tint, 0.28) } : null, glow && SHADOW.card, style]}>
      {children}
    </View>
  )
}

/** A pressable that answers the finger: it settles a little and taps back. */
export function Press({ children, onPress, style, disabled, label, haptic = true }: {
  children: ReactNode
  onPress?: () => void
  style?: StyleProp<ViewStyle>
  disabled?: boolean
  label?: string
  haptic?: boolean
}) {
  const scale = useRef(new Animated.Value(1)).current
  const to = (value: number) => Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 6 }).start()
  // The Pressable is what sits in the parent's row, so it takes the sizing; the inner view fills it.
  const flat = StyleSheet.flatten(style) ?? {}
  const outer: ViewStyle = { flex: flat.flex, flexGrow: flat.flexGrow, flexShrink: flat.flexShrink, flexBasis: flat.flexBasis, alignSelf: flat.alignSelf, width: flat.width }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={() => to(0.97)}
      onPressOut={() => to(1)}
      onPress={() => { if (haptic) feel.tap(); onPress?.() }}
      style={outer}
    >
      <Animated.View style={[{ transform: [{ scale }] }, disabled && { opacity: 0.45 }, style, flat.flex ? { flex: 1 } : null, flat.width !== undefined ? { width: '100%' } : null]}>{children}</Animated.View>
    </Pressable>
  )
}

/** The gold button: the one thing to do next on a screen. */
export function GoldButton({ title, onPress, icon, busy, disabled, style }: {
  title: string
  onPress: () => void
  icon?: IconName
  busy?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Press onPress={onPress} disabled={disabled || busy} label={title} style={style}>
      <LinearGradient colors={GOLD_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.button, SHADOW.glow]}>
        {busy ? <ActivityIndicator color={C.onGold} /> : (
          <>
            {icon && <Ionicons name={icon} size={19} color={C.onGold} />}
            <Text style={[fonts.button, { color: C.onGold }]}>{title}</Text>
          </>
        )}
      </LinearGradient>
    </Press>
  )
}

/** A quieter button: outlined, for the second choice. */
export function GhostButton({ title, onPress, icon, tone = C.text, disabled, style }: {
  title: string
  onPress: () => void
  icon?: IconName
  tone?: string
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Press onPress={onPress} disabled={disabled} label={title} style={style}>
      <View style={[styles.button, styles.ghost]}>
        {icon && <Ionicons name={icon} size={18} color={tone} />}
        <Text style={[fonts.button, { color: tone }]}>{title}</Text>
      </View>
    </Press>
  )
}

/** A labelled text field. */
export function Field({ label, hint, problem, style, ...input }: TextInputProps & { label: string; hint?: string; problem?: string | null; style?: StyleProp<TextStyle> }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[fonts.label, { color: C.text2 }]}>{label}</Text>
      <TextInput
        placeholderTextColor={C.text3}
        selectionColor={C.gold}
        {...input}
        style={[styles.input, NO_OUTLINE, problem ? { borderColor: C.danger } : null, style]}
      />
      {problem ? <Text style={[fonts.small, { color: C.danger }]}>{problem}</Text> : hint ? <Text style={[fonts.small, { color: C.text3 }]}>{hint}</Text> : null}
    </View>
  )
}

/** A search field with its magnifier. */
export function SearchField(props: TextInputProps) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={C.text3} />
      <TextInput
        placeholderTextColor={C.text3}
        selectionColor={C.gold}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        {...props}
        style={[fonts.body, NO_OUTLINE, { color: C.text, flex: 1, paddingVertical: 0 }]}
      />
    </View>
  )
}

/** A small pill in a colour: a tier, a state. */
export function Pill({ text, color = C.gold, solid }: { text: string; color?: string; solid?: boolean }) {
  const tone = tierColor(color)
  return (
    <View style={[styles.pill, solid ? { backgroundColor: tone } : { backgroundColor: withAlpha(tone, 0.14), borderColor: withAlpha(tone, 0.4), borderWidth: 1 }]}>
      <Text style={[fonts.smallStrong, { color: solid ? readableOn(tone) : tone, fontSize: 12 }]} numberOfLines={1}>{text}</Text>
    </View>
  )
}

/** A member's initials in a ring of their tier's colour. */
export function Avatar({ name, color, size = 44 }: { name: string; color?: string | null; size?: number }) {
  const tone = tierColor(color)
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(tone, 0.14), borderWidth: 1.5, borderColor: withAlpha(tone, 0.55) }}>
      <Text style={{ fontFamily: 'CormorantGaramond_700Bold', fontSize: size * 0.42, color: tone }}>{initials(name)}</Text>
    </View>
  )
}

/** A round icon on its colour's wash. */
export function IconBadge({ name, color = C.gold, size = 40 }: { name: IconName; color?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(color, 0.14) }}>
      <Ionicons name={name} size={size * 0.5} color={color} />
    </View>
  )
}

/** A section's heading: a small spaced label, with an action at its end. */
export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={[fonts.label, { color: C.text2 }]}>{title}</Text>
      {action && onAction && (
        <Pressable onPress={onAction} hitSlop={10}><Text style={[fonts.smallStrong, { color: C.gold }]}>{action}</Text></Pressable>
      )}
    </View>
  )
}

/** A sentence in a coloured band: a refusal, a warning, good news. */
export function Notice({ text, tone = 'danger', action, onAction }: { text: string; tone?: 'danger' | 'warning' | 'success' | 'info'; action?: string; onAction?: () => void }) {
  const color = { danger: C.danger, warning: C.warning, success: C.success, info: C.info }[tone]
  const icon: IconName = { danger: 'alert-circle', warning: 'warning', success: 'checkmark-circle', info: 'information-circle' }[tone] as IconName
  return (
    <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: withAlpha(color, 0.12), borderColor: withAlpha(color, 0.35) }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[fonts.small, { color: C.text, flex: 1 }]}>{text}</Text>
      {action && onAction && <Pressable onPress={onAction} hitSlop={8}><Text style={[fonts.smallStrong, { color }]}>{action}</Text></Pressable>}
    </View>
  )
}

/** A soft placeholder while something loads. */
export function Shimmer({ height, style }: { height: number; style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.45)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [opacity])
  return <Animated.View style={[{ height, borderRadius: RADIUS.md, backgroundColor: C.surface2, opacity }, style]} />
}

/** What an empty list says, with its icon. */
export function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 36 }}>
      <IconBadge name={icon} color={C.text3} size={52} />
      <Text style={[fonts.body, { color: C.text2, textAlign: 'center' }]}>{text}</Text>
    </View>
  )
}

/** Tabs drawn as one pill with the chosen part lit. */
export function Segments<T extends string>({ value, items, onChange }: { value: T; items: { id: T; label: string; count?: number }[]; onChange: (id: T) => void }) {
  return (
    <View style={styles.segments} accessibilityRole="tablist">
      {items.map(item => {
        const on = item.id === value
        return (
          <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { feel.tap(); onChange(item.id) }} style={[styles.segment, on && styles.segmentOn]}>
            <Text style={[fonts.smallStrong, { color: on ? C.onGold : C.text2 }]} numberOfLines={1}>{item.label}</Text>
            {item.count !== undefined && item.count > 0 && (
              <View style={[styles.segmentCount, on && { backgroundColor: 'rgba(26,20,6,0.18)' }]}>
                <Text style={[fonts.smallStrong, { fontSize: 11, color: on ? C.onGold : C.gold }]}>{item.count}</Text>
              </View>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

/** A list row: an icon or avatar, a title and its line, and what is at the end. */
export function Row({ left, title, line, right, onPress, last }: { left?: ReactNode; title: string; line?: string | null; right?: ReactNode; onPress?: () => void; last?: boolean }) {
  const body = (
    <View style={[styles.row, !last && styles.rowLine]}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[fonts.bodyStrong, { color: C.text }]} numberOfLines={1}>{title}</Text>
        {line ? <Text style={[fonts.small, { color: C.text2 }]} numberOfLines={1}>{line}</Text> : null}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={16} color={C.text3} />}
    </View>
  )
  return onPress ? <Press onPress={onPress} haptic={false}>{body}</Press> : body
}

const styles = StyleSheet.create({
  surface: { backgroundColor: C.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.hairline },
  button: { minHeight: 54, borderRadius: RADIUS.md, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  ghost: { borderWidth: 1, borderColor: C.hairlineStrong, backgroundColor: 'rgba(255,255,255,0.03)' },
  input: { ...fonts.body, color: C.text, minHeight: 52, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.hairlineStrong, backgroundColor: C.bgRaised, paddingHorizontal: 16 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.hairlineStrong, backgroundColor: C.surface, paddingHorizontal: 18 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill, maxWidth: 200 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 6 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: RADIUS.md, borderWidth: 1 },
  segments: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: RADIUS.pill, padding: 4, borderWidth: 1, borderColor: C.hairline },
  segment: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', minHeight: 40, borderRadius: RADIUS.pill, paddingHorizontal: 8 },
  segmentOn: { backgroundColor: C.gold },
  segmentCount: { minWidth: 20, paddingHorizontal: 5, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.goldWash },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hairlineStrong },
})
