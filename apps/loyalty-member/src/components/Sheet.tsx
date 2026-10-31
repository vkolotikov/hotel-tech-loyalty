import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { C, fonts } from '../lib/theme'
import { useT } from '../lib/i18n'
import { Backdrop, Press } from './ui'

/** A modal screen's frame: its title, a close button, and the form scrolling above the keyboard. */
export function Sheet({ title, line, children }: { title: string; line?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const { tp } = useT()
  return (
    <Backdrop>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[fonts.title, { color: C.text }]}>{title}</Text>
              {line ? <Text style={[fonts.small, { color: C.text2 }]}>{line}</Text> : null}
            </View>
            <Press onPress={() => router.back()} label={tp('portal.common.close')}>
              <View style={styles.close}><Ionicons name="close" size={22} color={C.text} /></View>
            </Press>
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.hairline },
})
