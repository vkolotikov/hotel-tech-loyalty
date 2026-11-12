import { useEffect, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import { CormorantGaramond_500Medium_Italic, CormorantGaramond_600SemiBold } from '@expo-google-fonts/cormorant-garamond'
import { PlayfairDisplay_500Medium_Italic, PlayfairDisplay_600SemiBold } from '@expo-google-fonts/playfair-display'
import { Fraunces_500Medium_Italic, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces'
import { Newsreader_500Medium_Italic, Newsreader_600SemiBold } from '@expo-google-fonts/newsreader'
import { SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk'
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope'
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter'
import { QueryClientProvider } from '@tanstack/react-query'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { queryClient, restoreLook } from '../lib/queries'
import { useSession } from '../lib/session'
import { usePrefs } from '../lib/prefs'
import { C, CONTENT_MAX_WIDTH, useLook } from '../lib/theme'
import { UpdateGate } from '../components/UpdateGate'
import { FeedbackHost } from '../components/Feedback'
import { AppLock } from '../components/AppLock'
import { MemberConnections } from '../components/MemberConnections'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  // Every venue's heading face is bundled (the portal's six), so a venue's look never waits for a download.
  const [fontsLoaded] = useFonts({
    CormorantGaramond_500Medium_Italic, CormorantGaramond_600SemiBold,
    PlayfairDisplay_500Medium_Italic, PlayfairDisplay_600SemiBold,
    Fraunces_500Medium_Italic, Fraunces_600SemiBold,
    Newsreader_500Medium_Italic, Newsreader_600SemiBold,
    SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold,
    Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  })
  const ready = useSession(s => s.ready)
  const token = useSession(s => s.token)
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
          <AppLock>
          {token && <MemberConnections authToken={token} />}
          <View key={`look-${lookVersion}`} style={styles.column}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: C.bg },
                animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default',
              }}
            >
              <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
              <Stack.Screen name="join" />
              <Stack.Protected guard={!!token} redirectTo="/sign-in">
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="inbox" />
              <Stack.Screen name="help" />
              <Stack.Screen name="profile" />
              <Stack.Screen name="preferences" />
              <Stack.Screen name="activity" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' }, gestureEnabled: false }} />
              <Stack.Screen name="programme" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' }, gestureEnabled: false }} />
              <Stack.Screen name="bookings" />
              <Stack.Screen name="booking/[kind]/[id]" />
              <Stack.Screen name="book/index" />
              <Stack.Screen name="book/appointment" />
              <Stack.Screen name="book/stay" />
              </Stack.Protected>
            </Stack>
          </View>
          <FeedbackHost />
          </AppLock>
          <UpdateGate />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  column: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
})
