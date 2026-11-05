import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { C, CONTENT_MAX_WIDTH, ECLIPSE as E, RADIUS, fonts, readableOn, tierColor, withAlpha } from '../lib/theme'
import { initials } from '../lib/format'
import { feel } from '../lib/haptics'
import { useDeviceAppearance } from '../lib/useEclipseAppearance'
import { EclipseAtmosphere, EclipseSurface } from './Eclipse'
import { Glyph } from './Glyph'
import { useRouter } from 'expo-router'
import { useT } from '../lib/i18n'

const Appearance = createContext({ solid: false, reduceMotion: true, animate: false })

export type IconName = keyof typeof Ionicons.glyphMap

/** Use our focus border and let browser inputs shrink beside their controls on narrow previews. */
export const NO_OUTLINE: TextStyle = Platform.OS === 'web' ? { outlineWidth: 0, minWidth: 0 } : {}

/** The page's backdrop: deep navy with a faint warm light at the top. */
export function Backdrop({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const appearance = useDeviceAppearance()
  return (
    <Appearance.Provider value={appearance}>
    <View style={[{ flex: 1, backgroundColor: E.bg }, style]}>
      <EclipseAtmosphere solid={appearance.solid} />
      {children}
    </View>
    </Appearance.Provider>
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
  const { solid } = useContext(Appearance)
  const { flex, flexBasis, flexGrow, flexShrink, width, alignSelf, margin, marginTop, marginBottom, marginHorizontal, ...content } = StyleSheet.flatten(style) ?? {}
  return (
    <View style={{ flex, flexBasis, flexGrow, flexShrink, width, alignSelf, margin, marginTop, marginBottom, marginHorizontal }}>
    <EclipseSurface solid={solid} tone={tint || glow ? 'attention' : 'quiet'} radius={E.tileRadius} style={[{ padding }, content]}>
      {children}
    </EclipseSurface>
    </View>
  )
}

/** A pressable that answers the finger: it settles a little and taps back. */
export function Press({ children, onPress, style, disabled, label, haptic = true, reduceMotion, pressedScale = 0.99 }: {
  children: ReactNode
  onPress?: () => void
  style?: StyleProp<ViewStyle>
  disabled?: boolean
  label?: string
  haptic?: boolean
  reduceMotion?: boolean
  pressedScale?: number
}) {
  const appearance = useContext(Appearance)
  const reduced = reduceMotion ?? appearance.reduceMotion
  const [scale] = useState(() => new Animated.Value(1))
  const to = (value: number) => {
    if (reduced) { scale.setValue(1); return }
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 6 }).start()
  }
  useEffect(() => { if (reduced) { scale.stopAnimation(); scale.setValue(1) } }, [reduced, scale])
  // The Pressable is what sits in the parent's row, so it takes the sizing; the inner view fills it.
  const flat = StyleSheet.flatten(style) ?? {}
  const outer: ViewStyle = { flex: flat.flex, flexGrow: flat.flexGrow, flexShrink: flat.flexShrink, flexBasis: flat.flexBasis, alignSelf: flat.alignSelf, width: flat.width }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={() => to(pressedScale)}
      onPressOut={() => to(1)}
      onPress={() => { if (haptic) feel.tap(); onPress?.() }}
      style={outer}
    >
      <Animated.View style={[{ transform: [{ scale }] }, disabled && { opacity: 0.45 }, style, flat.flex ? { flex: 1 } : null, flat.width !== undefined ? { width: '100%' } : null]}>{children}</Animated.View>
    </Pressable>
  )
}

/** The gold button: the one thing to do next on a screen. */
export function GoldButton({ title, onPress, icon, busy, disabled, style, borderLight }: {
  title: string
  onPress: () => void
  icon?: IconName
  busy?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  borderLight?: { phase: Animated.Value; order: number }
}) {
  const { solid } = useContext(Appearance)
  return (
    <Press onPress={onPress} disabled={disabled || busy} label={title} style={style}>
      <EclipseSurface fill={!!StyleSheet.flatten(style)?.flex} solid={solid} tone="attention" radius={22} style={styles.button} borderLight={borderLight}>
        {busy ? <ActivityIndicator color={C.gold} accessibilityLabel={title} /> : (
          <>
            {icon && <Glyph name={icon} size={24} />}
            <Text style={[fonts.button, { color: C.text, flexShrink: 1, textAlign: 'center' }]}>{title}</Text>
          </>
        )}
      </EclipseSurface>
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
  const { solid } = useContext(Appearance)
  return (
    <Press onPress={onPress} disabled={disabled} label={title} style={style}>
      <EclipseSurface fill={!!StyleSheet.flatten(style)?.flex} solid={solid} radius={22} style={styles.button}>
        {icon && <Glyph name={icon} size={24} color={tone} />}
        <Text style={[fonts.button, { color: tone, flexShrink: 1, textAlign: 'center' }]}>{title}</Text>
      </EclipseSurface>
    </Press>
  )
}

/** A labelled text field. */
export function Field({ label, hint, problem, style, ...input }: TextInputProps & { label: string; hint?: string; problem?: string | null; style?: StyleProp<TextStyle> }) {
  const [focused, setFocused] = useState(false)
  return (
    <View style={{ gap: 8 }}>
      <Text style={[fonts.label, { color: C.text2 }]}>{label}</Text>
      <TextInput
        placeholderTextColor={C.text3}
        selectionColor={C.gold}
        accessibilityLabel={label}
        {...input}
        onFocus={e => { setFocused(true); input.onFocus?.(e) }}
        onBlur={e => { setFocused(false); input.onBlur?.(e) }}
        style={[styles.input, NO_OUTLINE, focused ? { borderColor: C.gold } : null, problem ? { borderColor: C.danger } : null, style]}
      />
      {problem ? <Text style={[fonts.small, { color: C.danger }]}>{problem}</Text> : hint ? <Text style={[fonts.small, { color: C.text3 }]}>{hint}</Text> : null}
    </View>
  )
}

/** A search field with its magnifier. */
export function SearchField(props: TextInputProps) {
  return (
    <View style={styles.search}>
      <Glyph name="search" size={24} color={C.text3} />
      <TextInput
        placeholderTextColor={C.text3}
        selectionColor={C.gold}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={props.placeholder}
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
      <Text style={[fonts.bodyStrong, { fontSize: size * 0.36, color: tone }]}>{initials(name)}</Text>
    </View>
  )
}

/** A round icon on its colour's wash. */
export function IconBadge({ name, color = C.gold, size = 40 }: { name: IconName; color?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(color, 0.14) }}>
      <Glyph name={name} size={size * 0.6} color={color} />
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
  const [opacity] = useState(() => new Animated.Value(0.55))
  const { animate } = useContext(Appearance)
  useEffect(() => {
    if (!animate) { opacity.setValue(0.55); return }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [opacity, animate])
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

/** Equal-height tabs, with centred Android type and optional pictograms. */
export function Segments<T extends string>({ value, items, onChange, iconOnly = false, disabled = false }: { value: T; items: { id: T; label: string; count?: number; icon?: IconName; symbol?: string }[]; onChange: (id: T) => void; iconOnly?: boolean; disabled?: boolean }) {
  const { solid } = useContext(Appearance)
  const { width, fontScale } = useWindowDimensions()
  const stacked = !iconOnly && (fontScale >= 1.4 || (width < 360 && items.some(item => item.label.length > 9)))
  const tileHeight = Math.min(112, (Math.min(width, CONTENT_MAX_WIDTH) - 2 * E.inset - (items.length - 1) * E.gap) / items.length)
  return (
    <View style={[styles.segments, stacked && { flexDirection: 'column' }]} accessibilityRole="tablist">
      {items.map(item => {
        const on = item.id === value
        return (
          <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.count ? `${item.label}, ${item.count}` : item.label} accessibilityState={{ selected: on, disabled }} disabled={disabled} onPress={() => { feel.tap(); onChange(item.id) }} style={{ flex: stacked ? undefined : 1, minWidth: 0, opacity: disabled ? 0.45 : 1 }}>
          <EclipseSurface fill={!stacked} solid={solid} tone={on ? 'attention' : 'quiet'} radius={E.tileRadius} style={[styles.segment, !iconOnly && (item.icon || item.symbol) ? { minHeight: tileHeight - 2 * E.borderLight.width } : null, stacked && { flexDirection: 'row', minHeight: 54, gap: 10, paddingHorizontal: 14 }]}>
            {item.icon && <Glyph name={item.icon} size={28} color={on ? C.goldLight : C.text} />}
            {item.symbol && <Text accessible={false} style={[fonts.segmentSymbol, { color: on ? C.goldLight : C.text2 }]}>{item.symbol}</Text>}
            {(!iconOnly || (!item.icon && !item.symbol)) && <Text style={[fonts.segment, { color: on ? C.text : C.text2, alignSelf: stacked ? undefined : 'stretch', flexShrink: 1 }]}>{item.label}</Text>}
            {item.count !== undefined && item.count > 0 && (
              <View style={[styles.segmentCount, stacked && { position: 'relative', top: 0, right: 0 }]}>
                <Text maxFontSizeMultiplier={1.2} style={[fonts.segmentCount, { color: C.gold }]}>{item.count > 99 ? '99+' : item.count}</Text>
              </View>
            )}
          </EclipseSurface></Pressable>
        )
      })}
    </View>
  )
}

/** A list row: an icon or avatar, a title and its line, and what is at the end. */
export function Row({ left, title, line, right, onPress, last, card = false }: { left?: ReactNode; title: string; line?: string | null; right?: ReactNode; onPress?: () => void; last?: boolean; card?: boolean }) {
  const body = (
    <View style={[styles.row, !last && !card && styles.rowLine]}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[fonts.bodyStrong, { color: C.text }]}>{title}</Text>
        {line ? <Text style={[fonts.small, { color: C.text2 }]}>{line}</Text> : null}
      </View>
      {right}
      {onPress && !right && <Glyph name="chevron-forward" size={18} color={C.text3} />}
    </View>
  )
  const content = card ? <Surface padding={0} style={{ paddingHorizontal: 16 }}>{body}</Surface> : body
  return onPress ? <Press onPress={onPress} label={[title, line].filter(Boolean).join('. ')} haptic={false}>{content}</Press> : content
}

export function PageHeading({ title, back = true, profile = true, onBack, disabled }: { title: string; back?: boolean; profile?: boolean; onBack?: () => void; disabled?: boolean }) {
  const router = useRouter()
  const { t } = useT()
  return <View style={{ minHeight: 52, flexDirection: 'row', gap: E.gap, alignItems: 'center' }}>
      {back && <Press disabled={disabled} label={t('common.close')} onPress={onBack ?? (() => router.canGoBack() ? router.back() : router.replace('/'))}><Surface padding={0}><View style={styles.control}><Glyph name="chevron-back" size={22} /></View></Surface></Press>}
      <Text accessibilityRole="header" style={[fonts.title, { color: C.text, flex: 1 }]}>{title}</Text>
      {profile && <Press disabled={disabled} label={t('home.account')} onPress={() => router.push('/profile')}><Surface padding={0}><View style={styles.control}><Glyph name="person-outline" /></View></Surface></Press>}
  </View>
}

/** Compact icon-first actions share the same grid and corner treatment as Scan. */
export function ActionTile({ title, icon, onPress, primary = false, external = false, style }: { title: string; icon: IconName; onPress: () => void; primary?: boolean; external?: boolean; style?: StyleProp<ViewStyle> }) {
  const { solid } = useContext(Appearance)
  return <Press label={title} onPress={onPress} style={style}>
    <EclipseSurface fill solid={solid} tone={primary ? 'attention' : 'quiet'} style={{ minHeight: 104, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      {external && <View accessible={false} style={{ position: 'absolute', right: 12, top: 12 }}><Glyph name="open-outline" size={14} color={C.text2} /></View>}
      <Glyph name={icon} size={28} color={primary ? C.goldLight : C.text} />
      <Text style={[fonts.button, { color: C.text, textAlign: 'center', alignSelf: 'stretch' }]}>{title}</Text>
    </EclipseSurface>
  </Press>
}

/** A single labelled switch target spans its whole row, including the copy and icon. */
export function ToggleRow({ title, line, icon, value, disabled, onChange }: { title: string; line?: string; icon: IconName; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={title} accessibilityHint={line} accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={() => onChange(!value)}>
    <Surface padding={16}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
      <IconBadge name={icon} color={C.text} />
      <View style={{ flex: 1, gap: 3 }}><Text style={[fonts.bodyStrong, { color: C.text }]}>{title}</Text>{line && <Text style={[fonts.small, { color: C.text2 }]}>{line}</Text>}</View>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants"><Switch accessible={false} value={value} disabled={disabled} trackColor={{ true: C.gold, false: C.surface3 }} thumbColor={C.white} /></View>
    </View></Surface>
  </Pressable>
}

const styles = StyleSheet.create({
  control: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 54, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  input: { ...fonts.body, color: C.text, minHeight: 56, borderRadius: 18, borderWidth: 1, borderColor: C.hairlineStrong, backgroundColor: C.surface, paddingHorizontal: 16, paddingVertical: 14 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderRadius: 18, borderWidth: 1, borderColor: C.hairlineStrong, backgroundColor: C.surface, paddingHorizontal: 16, paddingVertical: 12 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill, maxWidth: 200 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 6 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: RADIUS.md, borderWidth: 1 },
  segments: { flexDirection: 'row', alignItems: 'stretch', gap: E.gap },
  segment: { gap: 6, alignItems: 'center', justifyContent: 'center', minHeight: 52, paddingHorizontal: 6, paddingVertical: 11 },
  segmentCount: { position: 'absolute', top: 5, right: 7, minWidth: 18, paddingHorizontal: 4, minHeight: 18, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.goldWash },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, minHeight: 78 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hairlineStrong },
})
