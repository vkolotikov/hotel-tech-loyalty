/** The web build (a preview of the app's screens) keeps the session in the browser's own storage. */
export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return globalThis.localStorage?.getItem(key) ?? null
    } catch {
      return null
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      globalThis.localStorage?.setItem(key, value)
    } catch {
      // Private browsing: the session lasts this tab.
    }
  },
  async remove(key: string): Promise<void> {
    try {
      globalThis.localStorage?.removeItem(key)
    } catch {
      // Nothing to remove.
    }
  },
}
