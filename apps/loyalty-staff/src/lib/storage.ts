import * as SecureStore from 'expo-secure-store'

/**
 * The device's keychain (iOS) or keystore (Android) for the session token and the staff member's preferences. Each
 * read and write stands alone: an old Android keystore that refuses one key must not lose the others.
 */
export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key)
    } catch {
      return null
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value)
    } catch {
      // The in-memory session stays the truth for this run.
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key)
    } catch {
      // Nothing to remove.
    }
  },
}
