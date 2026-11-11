import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, usePreventRemove } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { C, fonts } from '../lib/theme'
import { useT } from '../lib/i18n'
import { Backdrop, Press } from './ui'
import { ActionPopup } from './ActionPopup'
import { ScreenHeader } from './ScreenHeader'

/**
 * A modal screen's frame: its title, a close button, and the form scrolling above the keyboard. While `busy` (a
 * cancellation or a payment in flight) the sheet cannot be closed, by its button, a swipe or the phone's Back: the
 * member stays to see what happened to their money.
 */
export function Sheet({ title, line, children, busy = false, kind = 'page' }: { title: string; line?: string; children: ReactNode; busy?: boolean; kind?: 'page' | 'popup' | 'sheet' }) {
  const insets = useSafeAreaInsets()
  const { tp } = useT()
  usePreventRemove(busy, () => {})
  if (kind !== 'page') return <ActionPopup visible embedded title={title} kind={kind} busy={busy} onClose={() => router.back()}>{line ? <Text style={[fonts.small, { color: C.text2 }]}>{line}</Text> : null}{children}</ActionPopup>
  return (
    <Backdrop>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
          {busy ? <View style={styles.head}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[fonts.title, { color: C.text }]}>{title}</Text>
              {line ? <Text style={[fonts.small, { color: C.text2 }]}>{line}</Text> : null}
            </View>
            <Press onPress={() => router.back()} label={tp('portal.common.close')} disabled={busy}>
              <View style={[styles.close, busy && { opacity: 0.4 }]}><Ionicons name="close" size={22} color={C.text} /></View>
            </Press>
          </View> : <><ScreenHeader title={title} back inbox={false} />{line ? <Text style={[fonts.small, { color: C.text2 }]}>{line}</Text> : null}</>}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.hairline },
})
