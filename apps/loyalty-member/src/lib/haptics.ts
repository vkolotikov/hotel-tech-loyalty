import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

/** A light tap for a choice, a firm one for a scan read, and the success or warning pattern for an answer. */
export const feel = {
  tap: () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}) },
  read: () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}) },
  success: () => { if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}) },
  warning: () => { if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}) },
}
