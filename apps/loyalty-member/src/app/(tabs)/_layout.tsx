import { Redirect } from 'expo-router'
import { Tabs } from 'expo-router/js-tabs'
import { useSession } from '../../lib/session'
import { useBoot } from '../../lib/queries'
import { C } from '../../lib/theme'
import { TabBar } from '../../components/TabBar'
import { LoyaltyFeedbackBridge } from '../../components/Feedback'

/** The five places of the app; signed out, the sign-in instead. Signed in, this phone receives the venue's messages. */
export default function TabsLayout() {
  const token = useSession(s => s.token)
  const boot = useBoot()
  if (!token) return <Redirect href="/sign-in" />

  const unread = boot.data?.counts.unread_notifications ?? 0
  return (
    <><LoyaltyFeedbackBridge /><Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }}
      tabBar={props => <TabBar {...props} unread={unread} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="rewards" />
      <Tabs.Screen name="card" />
      {/* capabilities.events means an eligible event is coming up, so an empty calendar must not remove its tab. */}
      <Tabs.Screen name="events" />
      <Tabs.Screen name="more" />
    </Tabs></>
  )
}
