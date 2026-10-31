import { Redirect } from 'expo-router'
import { Tabs } from 'expo-router/js-tabs'
import { useSession } from '../../lib/session'
import { useBoot } from '../../lib/queries'
import { C } from '../../lib/theme'
import { TabBar } from '../../components/TabBar'

/** The five places of the app; signed out, the sign-in instead. */
export default function TabsLayout() {
  const token = useSession(s => s.token)
  const boot = useBoot()
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
