import { useEffect } from 'react'
import { AppState } from 'react-native'
import { router } from 'expo-router'
import { usePrefs } from '../lib/prefs'
import { useT } from '../lib/i18n'
import { connectPush, usePushTaps } from '../lib/push'
import { refreshMemberFacts } from '../lib/queries'

/** Stay connected from every member screen, including a cold deep link to Preferences or Inbox. */
export function MemberConnections({ authToken }: { authToken: string }) {
  const alerts = usePrefs(s => s.alerts)
  const { t } = useT()
  const channelName = t('push.channel')
  useEffect(() => {
    let current = true
    let request = 0
    const reconcile = () => {
      const mine = ++request
      void connectPush({ on: alerts, channelName, authToken }).then(state => {
        if (current && mine === request) usePrefs.getState().setAlertsState(state)
      })
    }
    reconcile()
    // Returning from system notification settings or an offline interval tries the member's choice again.
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') reconcile() })
    return () => { current = false; subscription.remove() }
  }, [authToken, alerts, channelName])

  usePushTaps(path => router.navigate(path), () => { void refreshMemberFacts() })
  return null
}
