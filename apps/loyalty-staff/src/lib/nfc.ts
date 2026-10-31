import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import NfcManager, { NfcEvents, NfcTech, type TagEvent } from 'react-native-nfc-manager'

export type NfcState = 'checking' | 'ready' | 'off' | 'none'

/**
 * The phone's NFC reader, as the Hotel Staff app proved it in production: on Android a continuous reader while the
 * screen is open (reader mode first, plain foreground dispatch on devices without it), on iPhone one system sheet per
 * card (`read()`). The card's ID goes to the server as read; `CodeReader` accepts every way of writing it.
 */
export function useNfc(options: { listen: boolean; onCard: (uid: string) => void; prompt: string }) {
  const [state, setState] = useState<NfcState>('checking')
  const onCard = useRef(options.onCard)
  onCard.current = options.onCard

  const check = useCallback(async () => {
    try {
      const supported = await NfcManager.isSupported()
      if (!supported) return setState('none')
      await NfcManager.start()
      const enabled = Platform.OS === 'android' ? await NfcManager.isEnabled() : true
      setState(enabled ? 'ready' : 'off')
    } catch {
      setState('none')
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  const stop = useCallback(async () => {
    try { NfcManager.setEventListener(NfcEvents.DiscoverTag, null) } catch { /* not listening */ }
    try { await NfcManager.unregisterTagEvent() } catch { /* not registered */ }
    try { await NfcManager.cancelTechnologyRequest() } catch { /* no session */ }
  }, [])

  // Android: listen while the screen asks for it; always tear the previous session down first.
  useEffect(() => {
    if (Platform.OS !== 'android' || state !== 'ready' || !options.listen) return
    let live = true
    void (async () => {
      await stop()
      if (!live) return
      NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag: TagEvent) => {
        if (tag?.id) onCard.current(tag.id)
      })
      try {
        await NfcManager.registerTagEvent({ isReaderModeEnabled: true, readerModeFlags: 0x1 | 0x2 | 0x4 | 0x8, invalidateAfterFirstRead: false })
      } catch {
        try { await NfcManager.unregisterTagEvent() } catch { /* nothing */ }
        try { await NfcManager.registerTagEvent() } catch { /* reader unavailable */ }
      }
    })()
    return () => {
      live = false
      void stop()
    }
  }, [state, options.listen, stop])

  /** iPhone: one read, in the system sheet. Android reads continuously and needs no call. */
  const read = useCallback(async () => {
    if (state !== 'ready') return
    try {
      // NfcA: the technology the Hotel Staff app reads loyalty cards with on iPhone in production.
      await NfcManager.requestTechnology(NfcTech.NfcA, { alertMessage: options.prompt })
      const tag = await NfcManager.getTag()
      if (tag?.id) onCard.current(tag.id)
    } catch {
      // Cancelled by the staff member, or the card moved away.
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {})
    }
  }, [state, options.prompt])

  const openSettings = useCallback(() => {
    NfcManager.goToNfcSetting().catch(() => {})
  }, [])

  useEffect(() => () => { void stop() }, [stop])

  return { state, read, openSettings, recheck: check, continuous: Platform.OS === 'android' }
}
