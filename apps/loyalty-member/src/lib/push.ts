import { useEffect } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { api } from './api'
import { storage } from './storage'
import { pushTarget, type AlertsState } from './alerts'

const KEY = 'hexatech_loyalty_push_token'
let generation = 0
let writes: Promise<void> = Promise.resolve()

/** Token preparation can overlap; registration, withdrawal and their stored receipt must stay in order. */
function ordered<T>(operation: () => Promise<T>): Promise<T> {
  const next = writes.then(operation)
  writes = next.then(() => {}, () => {})
  return next
}

async function withdraw(authToken: string): Promise<boolean> {
  const token = await storage.get(KEY)
  if (!token) return true
  try {
    await api.forgetPushToken(token, authToken)
  } catch {
    // Keep the receipt: an offline off/sign-out must be able to retry the withdrawal later.
    return false
  }
  await storage.remove(KEY)
  return true
}

function disconnect(authToken: string): Promise<boolean> {
  ++generation // Also cancels token preparation started before sign-out.
  return ordered(() => withdraw(authToken)).catch(() => false)
}

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
  if (!options.on) return await disconnect(options.authToken) ? 'off' : 'unavailable'
  const owner = ++generation
  const current = () => owner === generation
  const project = projectId()
  if (!Device.isDevice || !project) return 'unavailable'
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: options.channelName,
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 180, 120, 180],
      })
    }
    if (!current()) return 'off'
    let permission = await Notifications.getPermissionsAsync()
    if (!current()) return 'off'
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync()
    if (!current()) return 'off'
    if (!permission.granted) return 'blocked'

    const token = (await Notifications.getExpoPushTokenAsync({ projectId: project })).data
    return await ordered(async () => {
      if (!current()) return 'off'
      const previous = await storage.get(KEY)
      if (!current()) return 'off'
      // Retire a rotated token first; a lost registration response must never strand the previous receipt.
      if (previous && previous !== token) {
        if (!await withdraw(options.authToken)) return 'unavailable'
        if (!current()) return 'off'
      }
      // Keep a receipt before the request, including when its response is lost after server acceptance.
      await storage.set(KEY, token)
      if (!current()) {
        // A reconnect of the same token still has an existing server registration for queued Off to withdraw.
        if (previous !== token) await storage.remove(KEY)
        return 'off'
      }
      await api.savePushToken(token, options.authToken)
      if (!current()) { await withdraw(options.authToken); return 'off' }
      return 'on'
    })
  } catch {
    return 'unavailable'
  }
}

/** With the session's token still valid: the member's push token is cleared when it is this phone's. */
export async function forgetPush(authToken: string): Promise<void> {
  await disconnect(authToken)
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
