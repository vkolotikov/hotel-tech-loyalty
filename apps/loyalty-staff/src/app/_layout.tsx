import { useEffect, useRef, useState } from 'react'
import { AppState, Platform, StyleSheet, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import * as LocalAuthentication from 'expo-local-authentication'
import { focusManager, QueryClientProvider } from '@tanstack/react-query'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { queryClient } from '../lib/queries'
import { useSession } from '../lib/session'
import { usePrefs } from '../lib/prefs'
import { useT } from '../lib/i18n'
import { C, CONTENT_MAX_WIDTH, fonts } from '../lib/theme'
import { Backdrop, GhostButton, GoldButton } from '../components/ui'
import { UpdateGate } from '../components/UpdateGate'
import { lockAtLaunch, lockOnReturn } from '../lib/lock'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const ready = useSession(s => s.ready)
  const token = useSession(s => s.token)
  const prefsLoaded = usePrefs(s => s.loaded)

  useEffect(() => {
    void useSession.getState().restore()
    void usePrefs.getState().load()
  }, [])

  useEffect(() => {
    const listener = AppState.addEventListener('change', next => focusManager.setFocused(next === 'active'))
    return () => listener.remove()
  }, [])

  const loaded = ready && prefsLoaded
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {})
  }, [loaded])

  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.bg }} />

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <View style={styles.column}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: C.bg },
              animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default',
            }}
          >
            <Stack.Protected guard={!token}>
            <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
            </Stack.Protected>
            <Stack.Protected guard={!!token}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="member/[id]" />
            <Stack.Screen name="activity" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="cards" />
            <Stack.Screen name="scanned" options={{ presentation: 'modal' }} />
            <Stack.Screen name="points" options={{ presentation: 'modal' }} />
            <Stack.Screen name="check-in" options={{ presentation: 'modal' }} />
            <Stack.Screen name="link-card" options={{ presentation: 'modal' }} />
            </Stack.Protected>
          </Stack>
          </View>
          <LockGate />
          <UpdateGate />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

/**
 * The lock, when the staff member switched it on: after two minutes away, Face ID, a fingerprint or the phone's
 * passcode before the app shows anything again. A shared desk phone left alone shows nobody's members.
 */
function LockGate() {
  const lockOn = usePrefs(s => s.lock)
  const signedIn = useSession(s => !!s.token)
  const [locked, setLocked] = useState(() => lockAtLaunch(lockOn, signedIn))
  const [covered, setCovered] = useState(AppState.currentState !== 'active')
  const [unlocking, setUnlocking] = useState(false)
  const authenticating = useRef(false)
  const awaySince = useRef<number | null>(null)
  const { t } = useT()

  useEffect(() => {
    // This session boundary deliberately clears the prior account's lock state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!signedIn || !lockOn) { setLocked(false); awaySince.current = null }
  }, [signedIn, lockOn])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'background' || next === 'inactive') {
        setCovered(true)
        awaySince.current ??= Date.now()
      } else if (next === 'active') {
        const since = awaySince.current
        awaySince.current = null
        if (lockOnReturn(lockOn, signedIn, since, Date.now())) setLocked(true)
        setCovered(false)
      }
    })
    return () => subscription.remove()
  }, [lockOn, signedIn])

  const unlock = async () => {
    if (authenticating.current || !signedIn || !lockOn) return
    authenticating.current = true
    setUnlocking(true)
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: t('lock.prompt') })
      if (result.success) setLocked(false)
    } catch {
      // The phone refused; the lock stays.
    } finally { authenticating.current = false; setUnlocking(false) }
  }

  useEffect(() => {
    // Synchronises the native biometric prompt with the lock; its single-flight ref prevents duplicate prompts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (locked) void unlock()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked])

  if (!signedIn || !lockOn || (!locked && !covered)) return null
  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Backdrop style={styles.lock}>
        <View style={styles.lockMark}>
          <Ionicons name="lock-closed" size={30} color={C.gold} />
        </View>
        <Text style={[fonts.title, { color: C.text, textAlign: 'center' }]}>{t('lock.title')}</Text>
        {locked && !covered && <GoldButton title={t('lock.unlock')} busy={unlocking} icon="finger-print" onPress={() => { void unlock() }} style={{ alignSelf: 'stretch' }} />}
        {locked && !covered && <GhostButton title={t('more.signOut')} onPress={() => { void useSession.getState().signOut() }} />}
      </Backdrop>
    </View>
  )
}

const styles = StyleSheet.create({
  column: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  lock: { alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32 },
  lockMark: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: C.goldWash, borderWidth: 1, borderColor: C.goldEdge },
})
