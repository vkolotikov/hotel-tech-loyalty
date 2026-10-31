import { useEffect, useRef, useState } from 'react'
import { AppState, Platform, StyleSheet, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import * as LocalAuthentication from 'expo-local-authentication'
import { useFonts } from 'expo-font'
import { CormorantGaramond_500Medium_Italic, CormorantGaramond_600SemiBold, CormorantGaramond_700Bold } from '@expo-google-fonts/cormorant-garamond'
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter'
import { QueryClientProvider } from '@tanstack/react-query'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { queryClient } from '../lib/queries'
import { useSession } from '../lib/session'
import { usePrefs } from '../lib/prefs'
import { useT } from '../lib/i18n'
import { C, fonts } from '../lib/theme'
import { Backdrop, GoldButton } from '../components/ui'
import { UpdateGate } from '../components/UpdateGate'

SplashScreen.preventAutoHideAsync().catch(() => {})

/** How long the app may be away before the lock (when switched on) asks again. */
const LOCK_AFTER_MS = 2 * 60_000

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_500Medium_Italic, CormorantGaramond_600SemiBold, CormorantGaramond_700Bold,
    Inter_400Regular, Inter_600SemiBold, Inter_700Bold,
  })
  const ready = useSession(s => s.ready)
  const prefsLoaded = usePrefs(s => s.loaded)

  useEffect(() => {
    void useSession.getState().restore()
    void usePrefs.getState().load()
  }, [])

  const loaded = fontsLoaded && ready && prefsLoaded
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {})
  }, [loaded])

  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.bg }} />

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: C.bg },
              animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
            <Stack.Screen name="member/[id]" />
            <Stack.Screen name="scanned" options={{ presentation: 'modal' }} />
            <Stack.Screen name="points" options={{ presentation: 'modal' }} />
            <Stack.Screen name="check-in" options={{ presentation: 'modal' }} />
            <Stack.Screen name="link-card" options={{ presentation: 'modal' }} />
          </Stack>
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
  const [locked, setLocked] = useState(false)
  const awaySince = useRef<number | null>(null)
  const { t } = useT()

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'background' || next === 'inactive') {
        awaySince.current ??= Date.now()
      } else if (next === 'active') {
        const since = awaySince.current
        awaySince.current = null
        if (lockOn && signedIn && since !== null && Date.now() - since >= LOCK_AFTER_MS) setLocked(true)
      }
    })
    return () => subscription.remove()
  }, [lockOn, signedIn])

  const unlock = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: t('lock.prompt') })
      if (result.success) setLocked(false)
    } catch {
      // The phone refused; the lock stays.
    }
  }

  useEffect(() => {
    if (locked) void unlock()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked])

  if (!locked) return null
  return (
    <View style={StyleSheet.absoluteFill}>
      <Backdrop style={styles.lock}>
        <View style={styles.lockMark}>
          <Ionicons name="lock-closed" size={30} color={C.gold} />
        </View>
        <Text style={[fonts.title, { color: C.text, textAlign: 'center' }]}>{t('lock.title')}</Text>
        <GoldButton title={t('lock.unlock')} icon="finger-print" onPress={() => { void unlock() }} style={{ alignSelf: 'stretch' }} />
      </Backdrop>
    </View>
  )
}

const styles = StyleSheet.create({
  lock: { alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32 },
  lockMark: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: C.goldWash, borderWidth: 1, borderColor: C.goldEdge },
})
