import { useEffect } from 'react'
import { Redirect, router } from 'expo-router'
import { Tabs } from 'expo-router/js-tabs'
import { useSession } from '../../lib/session'
import { usePrefs } from '../../lib/prefs'
import { useT } from '../../lib/i18n'
import { KEYS, queryClient, useBoot } from '../../lib/queries'
import { connectPush, usePushTaps } from '../../lib/push'
import { C } from '../../lib/theme'
import { TabBar } from '../../components/TabBar'

/** The five places of the app; signed out, the sign-in instead. Signed in, this phone receives the venue's messages. */
export default function TabsLayout() {
  const token = useSession(s => s.token)
  const boot = useBoot()
  const { t } = useT()
  const loaded = usePrefs(s => s.loaded)
  const alerts = usePrefs(s => s.alerts)

  useEffect(() => {
    if (!token || !loaded) return
    let current = true
    void connectPush({ on: alerts, channelName: t('push.channel'), authToken: token }).then(state => {
      if (current) usePrefs.getState().setAlertsState(state)
    })
    return () => { current = false }
  }, [token, loaded, alerts])

  usePushTaps(
    path => router.navigate(path),
    () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.boot })
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    },
  )

  if (!token) return <Redirect href="/sign-in" />

  const unread = boot.data?.counts.unread_notifications ?? 0
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }}
      tabBar={props => <TabBar {...props} unread={unread} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="rewards" />
      <Tabs.Screen name="card" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="more" />
    </Tabs>
  )
}
