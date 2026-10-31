import { useEffect, useRef, useState } from 'react'
import { AppState, Platform, StyleSheet, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import * as LocalAuthentication from 'expo-local-authentication'
import { useFonts } from 'expo-font'
import { CormorantGaramond_500Medium_Italic, CormorantGaramond_600SemiBold } from '@expo-google-fonts/cormorant-garamond'
import { PlayfairDisplay_500Medium_Italic, PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display'
import { Fraunces_500Medium_Italic, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces'
import { Newsreader_500Medium_Italic, Newsreader_600SemiBold } from '@expo-google-fonts/newsreader'
import { SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk'
import { Manrope_500Medium, Manrope_700Bold } from '@expo-google-fonts/manrope'
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter'
import { QueryClientProvider } from '@tanstack/react-query'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { queryClient, restoreLook } from '../lib/queries'
import { useSession } from '../lib/session'
import { usePrefs } from '../lib/prefs'
import { useT } from '../lib/i18n'
import { C, fonts, useLook } from '../lib/theme'
import { Backdrop, GoldButton } from '../components/ui'
import { UpdateGate } from '../components/UpdateGate'

SplashScreen.preventAutoHideAsync().catch(() => {})

/** How long the app may be away before the lock (when switched on) asks again. */
const LOCK_AFTER_MS = 2 * 60_000

export default function RootLayout() {
  // Every venue's heading face is bundled (the portal's six), so a venue's look never waits for a download.
  const [fontsLoaded] = useFonts({
    CormorantGaramond_500Medium_Italic, CormorantGaramond_600SemiBold,
    PlayfairDisplay_500Medium_Italic, PlayfairDisplay_600SemiBold,
    Fraunces_500Medium_Italic, Fraunces_600SemiBold,
    Newsreader_500Medium_Italic, Newsreader_600SemiBold,
    SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold,
    Manrope_500Medium, Manrope_700Bold,
    Inter_400Regular, Inter_600SemiBold, Inter_700Bold,
  })
  const ready = useSession(s => s.ready)
  const prefsLoaded = usePrefs(s => s.loaded)
  const [lookReady, setLookReady] = useState(false)
  // A new venue look redraws every screen, so every inline accent and face is read again.
  const lookVersion = useLook(s => s.version)

  useEffect(() => {
    void useSession.getState().restore()
    void usePrefs.getState().load()
    void restoreLook().finally(() => setLookReady(true))
  }, [])

  const loaded = fontsLoaded && ready && prefsLoaded && lookReady
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {})
  }, [loaded])

  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.bg }} />

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <View key={`look-${lookVersion}`} style={{ flex: 1 }}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: C.bg },
                animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default',
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
              <Stack.Screen name="join" />
              <Stack.Screen name="inbox" />
              <Stack.Screen name="help" />
              <Stack.Screen name="profile" />
              <Stack.Screen name="events" />
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
 * The lock, when the member switched it on: after two minutes away, Face ID, a fingerprint or the phone's passcode
 * before the app shows anything again.
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
  }, [locked])

  if (!locked) return null
  return (
    <View style={StyleSheet.absoluteFill}>
      <Backdrop style={styles.lock}>
        <View style={[styles.lockMark, { backgroundColor: C.goldWash, borderColor: C.goldEdge }]}>
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
  lockMark: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
})
