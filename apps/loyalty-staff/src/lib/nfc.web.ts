export type NfcState = 'checking' | 'ready' | 'off' | 'none'

/** The web preview has no NFC reader: the scan screen offers the camera and typing, as on a phone without NFC. */
export function useNfc(_options: { listen: boolean; onCard: (uid: string) => void; prompt: string }) {
  return {
    state: 'none' as NfcState,
    read: async () => {},
    openSettings: () => {},
    recheck: async () => {},
    continuous: false,
  }
}
