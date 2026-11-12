import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import { useStore } from 'zustand'
import { useSession } from '../lib/session'
import { usePrefs } from '../lib/prefs'
import { createAppLock } from '../lib/appLock'
import { useT } from '../lib/i18n'
import { C, fonts } from '../lib/theme'
import { Backdrop, GoldButton } from './ui'
import { MemberIcon } from './MemberIcon'

/** Member screens and their native Modal windows do not exist while authentication is required. */
export function AppLock({ children }: { children: ReactNode }) {
  const token = useSession(s => s.token)
  const lockOn = usePrefs(s => s.lock)
  const { t } = useT()
  // Enabling the preference is already authenticated in Preferences. Only a new session creates a cold-start gate.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gate = useMemo(() => createAppLock(!!token && lockOn), [token])
  const locked = useStore(gate, s => s.locked)
  const busy = useStore(gate, s => s.busy)
  const promptMessage = t('lock.prompt')
  const unlock = useCallback(() => gate.unlock(async () => (await LocalAuthentication.authenticateAsync({ promptMessage })).success), [gate, promptMessage])

  useEffect(() => { gate.configure(!!token && lockOn) }, [gate, lockOn, token])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => gate.change(next, Date.now()))
    return () => subscription.remove()
  }, [gate])
  useEffect(() => { if (locked) void unlock() }, [locked, unlock])

  if (!locked) return children
  return <Backdrop style={styles.lock}>
    <View style={[styles.mark, { backgroundColor: C.goldWash, borderColor: C.goldEdge }]}><MemberIcon name="lock" size={30} color={C.gold} /></View>
    <Text accessibilityRole="header" style={[fonts.title, { color: C.text, textAlign: 'center' }]}>{t('lock.title')}</Text>
    <GoldButton title={t('lock.unlock')} icon="finger-print" busy={busy} onPress={() => { void unlock() }} style={{ alignSelf: 'stretch' }} />
  </Backdrop>
}

const styles = StyleSheet.create({
  lock: { alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32 },
  mark: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
})
