import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { C, ECLIPSE as E, fonts } from '../lib/theme'
import { useDeviceAppearance } from '../lib/useEclipseAppearance'
import { Backdrop, PageHeading } from './ui'

/** Forms scroll above a reachable action, including with the keyboard open. */
export function Sheet({ title, line, children, footer, onClose, busy = false, profile = false }: {
  title: string; line?: string; children: ReactNode; footer?: ReactNode; onClose?: () => void; busy?: boolean; profile?: boolean
}) {
  const insets = useSafeAreaInsets()
  return <Backdrop>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: E.inset, paddingBottom: 24, gap: 16, flexGrow: 1 }}>
        <PageHeading title={title} profile={profile} onBack={onClose} disabled={busy} />
        {line ? <Text style={[fonts.small, { color: C.text2 }]}>{line}</Text> : null}
        {children}
      </ScrollView>
      {footer && <View style={{ paddingHorizontal: E.inset, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16), gap: 10 }}>{footer}</View>}
    </KeyboardAvoidingView>
  </Backdrop>
}

export function DetailModal({ visible, onClose, title, children, footer, busy = false }: {
  visible: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; busy?: boolean
}) {
  const appearance = useDeviceAppearance()
  return <Modal visible={visible} animationType={appearance.reduceMotion ? 'none' : 'slide'} onRequestClose={() => { if (!busy) onClose() }} statusBarTranslucent>
    <Sheet title={title} onClose={onClose} busy={busy} footer={footer}>{children}</Sheet>
  </Modal>
}
