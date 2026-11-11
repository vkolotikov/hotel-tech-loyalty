import { useEffect } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { api } from './api'
import { storage } from './storage'
import { pushTarget, type AlertsState } from './alerts'

const KEY = 'hexatech_loyalty_push_token'

// A notification that arrives while the app is open still shows its banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
})

/** The EAS project the push token belongs to (app.json `extra.eas.projectId`, the Hotel Loyalty project). */
function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * Gives the server this phone's push token for the member (`POST /v1/auth/push-token`), when notifications are on
 * here; asks the phone's permission while it may still ask. Switched off here, the token is withdrawn. Never throws:
 * a phone that cannot be reached answers `unavailable` and the app works on without notifications.
 */
export async function connectPush(options: { on: boolean; channelName: string; authToken: string }): Promise<AlertsState> {
  const project = projectId()
  if (!Device.isDevice || !project) return 'unavailable'
  try {
    if (!options.on) {
      await forgetPush(options.authToken)
      return 'off'
    }
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: options.channelName,
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 180, 120, 180],
      })
    }
    let permission = await Notifications.getPermissionsAsync()
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync()
    if (!permission.granted) return 'blocked'

    const token = (await Notifications.getExpoPushTokenAsync({ projectId: project })).data
    await api.savePushToken(token)
    await storage.set(KEY, token)
    return 'on'
  } catch {
    return 'unavailable'
  }
}

/** With the session's token still valid: the member's push token is cleared when it is this phone's. */
export async function forgetPush(authToken: string): Promise<void> {
  const token = await storage.get(KEY)
  if (!token) return
  try {
    await api.forgetPushToken(token, authToken)
  } catch {
    // Offline: the next phone the member signs in on replaces the token anyway.
  }
  await storage.remove(KEY)
}

/** A tapped notification (also the one that started the app) opens what it is about; one that arrives refreshes. */
export function usePushTaps(open: (path: '/inbox') => void, refresh: () => void): void {
  const last = Notifications.useLastNotificationResponse()
  useEffect(() => {
    if (!last) return
    refresh()
    open(pushTarget(last.notification.request.content.data))
    Notifications.clearLastNotificationResponse()
  }, [last])

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener(() => refresh())
    return () => received.remove()
  }, [])
}
