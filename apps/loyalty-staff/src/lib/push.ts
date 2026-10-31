import { useEffect } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { api } from './api'
import { storage } from './storage'
import { isRequestAlert, type AlertsState } from './alerts'

const KEY = 'hexatech_staff_push_token'

// An alert that arrives while the app is open still shows its banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
})

/** The EAS project the push token belongs to; set in app.json by the first `eas init` or build. */
function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * Tells the server this phone hears request alerts (`PUT devices`), in this language, switched on or off. Asks the
 * phone's permission when it may still ask; on every start it refreshes the server's "last seen". Never throws: a
 * phone that cannot be reached answers `unavailable` and the app works on without alerts.
 */
export async function connectAlerts(options: { language: string; alerts: boolean; channelName: string }): Promise<AlertsState> {
  const project = projectId()
  if (!Device.isDevice || !project) return 'unavailable'
  try {
    if (Platform.OS === 'android') {
      // The channel Expo uses when a push names none; its name is what the phone's settings show.
      await Notifications.setNotificationChannelAsync('default', {
        name: options.channelName,
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 180, 120, 180],
        lightColor: '#c9a84c',
      })
    }
    let permission = await Notifications.getPermissionsAsync()
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync()
    if (!permission.granted) return 'blocked'

    const token = (await Notifications.getExpoPushTokenAsync({ projectId: project })).data
    await api.saveDevice({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android', language: options.language, alerts: options.alerts })
    await storage.set(KEY, token)
    return options.alerts ? 'on' : 'off'
  } catch {
    return 'unavailable'
  }
}

/** Before signing out, with the token still valid: this phone stops hearing this person's alerts. */
export async function forgetAlerts(authToken: string): Promise<void> {
  const token = await storage.get(KEY)
  if (!token) return
  try {
    await api.removeDevice(token, authToken)
  } catch {
    // Offline: the server stops alerting a phone it has not seen for sixty days, and whoever signs in next takes it over.
  }
  await storage.remove(KEY)
}

/** A tapped request alert (also the one that started the app) opens Requests; one that arrives refreshes the counts. */
export function useAlertTaps(open: () => void, refresh: () => void): void {
  const last = Notifications.useLastNotificationResponse()
  useEffect(() => {
    if (!last || !isRequestAlert(last.notification.request.content.data)) return
    refresh()
    open()
    Notifications.clearLastNotificationResponse()
  }, [last])

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener(notification => {
      if (isRequestAlert(notification.request.content.data)) refresh()
    })
    return () => received.remove()
  }, [])
}
