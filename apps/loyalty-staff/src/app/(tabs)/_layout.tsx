import { useEffect } from 'react'
import { Redirect, router } from 'expo-router'
import { Tabs } from 'expo-router/js-tabs'
import { useSession } from '../../lib/session'
import { usePrefs } from '../../lib/prefs'
import { useT } from '../../lib/i18n'
import { KEYS, queryClient, useBoot } from '../../lib/queries'
import { connectAlerts, useAlertTaps } from '../../lib/push'
import { C } from '../../lib/theme'
import { TabBar } from '../../components/TabBar'

/** The five places of the app; signed out, the sign-in instead. Signed in, this phone hears request alerts. */
export default function TabsLayout() {
  const token = useSession(s => s.token)
  const boot = useBoot()
  const { t, language } = useT()
  const loaded = usePrefs(s => s.loaded)
  const alerts = usePrefs(s => s.alerts)

  useEffect(() => {
    if (!token || !loaded) return
    let current = true
    void connectAlerts({ language, alerts, channelName: t('push.channel') }).then(state => {
      if (current) usePrefs.getState().setAlertsState(state)
    })
    return () => { current = false }
  }, [token, loaded, alerts, language])

  useAlertTaps(
    () => router.navigate('/requests'),
    () => {
      void queryClient.invalidateQueries({ queryKey: ['requests'] })
      void queryClient.invalidateQueries({ queryKey: KEYS.redemptions })
      void queryClient.invalidateQueries({ queryKey: KEYS.boot })
    },
  )

  if (!token) return <Redirect href="/sign-in" />

  const waiting = boot.data?.counts.requests_waiting ?? 0
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }}
      tabBar={props => <TabBar {...props} waiting={waiting} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="members" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="requests" />
      <Tabs.Screen name="more" />
    </Tabs>
  )
}
