import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Universal WebHID NFC reader hook.
 *
 * Works with ANY USB HID NFC reader — no hardcoded vendor/product filters.
 * The browser's device picker lets the user select their reader manually.
 *
 * Communication strategy:
 * 1. Try CCID-over-HID protocol (works with ACR122U, SCL3711, Identiv, etc.)
 * 2. If CCID fails, fall back to raw HID report parsing (some readers send
 *    the UID directly in input reports without needing CCID framing)
 */

// CCID message types
const PC_TO_RDR_ICC_POWER_ON = 0x62
const PC_TO_RDR_XFR_BLOCK = 0x6f
const RDR_TO_PC_DATA_BLOCK = 0x80

// GET DATA APDU — returns the card UID
const GET_UID_APDU = [0xff, 0xca, 0x00, 0x00, 0x00]

export type ReaderStatus = 'disconnected' | 'connecting' | 'waiting' | 'reading' | 'error'

interface NfcReaderState {
  status: ReaderStatus
  error: string | null
  deviceName: string | null
  lastUid: string | null
}

function buildCcid(msgType: number, data: number[], seq: number): Uint8Array {
  const buf = new Uint8Array(64)
  buf[0] = msgType
  buf[1] = data.length & 0xff
  buf[2] = (data.length >> 8) & 0xff
  buf[3] = 0
  buf[4] = 0
  buf[5] = 0   // slot
  buf[6] = seq & 0xff
  buf[7] = 0   // BWI
  buf[8] = 0   // level param
  buf[9] = 0
  data.forEach((b, i) => { buf[10 + i] = b })
  return buf
}

function uidToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Check if an input report looks like a raw UID (non-CCID readers that
 * just dump the card UID bytes directly into an HID report).
 * Returns the hex UID string if valid, null otherwise.
 */
function tryParseRawUid(data: DataView): string | null {
  // Raw UID reports are typically 4, 7, or 10 bytes (MIFARE, etc.)
  // Some readers pad with zeros. Find meaningful bytes.
  const len = data.byteLength
  if (len < 4) return null

  // Find the last non-zero byte to determine real length
  let realLen = len
  while (realLen > 0 && data.getUint8(realLen - 1) === 0) realLen--
  if (realLen < 4 || realLen > 10) return null

  // All bytes should be in a reasonable range (not ASCII text, not all 0xFF)
  let allFF = true
  for (let i = 0; i < realLen; i++) {
    if (data.getUint8(i) !== 0xff) allFF = false
  }
  if (allFF) return null

  const bytes = new Uint8Array(realLen)
  for (let i = 0; i < realLen; i++) bytes[i] = data.getUint8(i)
  return uidToHex(bytes)
}

export function useNfcReader(onUidRead: (uid: string) => void) {
  const [state, setState] = useState<NfcReaderState>({
    status: 'disconnected',
    error: null,
    deviceName: null,
    lastUid: null,
  })

  const deviceRef = useRef<HIDDevice | null>(null)
  const seqRef = useRef(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastUidRef = useRef<string | null>(null)
  const pendingResolve = useRef<((data: DataView) => void) | null>(null)
  const useCcidRef = useRef(true)
  const rawUidCooldown = useRef(false)

  const nextSeq = () => seqRef.current = (seqRef.current + 1) & 0xff

  const sendCommand = useCallback((msgType: number, data: number[]): Promise<DataView> => {
    const dev = deviceRef.current
    if (!dev?.opened) return Promise.reject(new Error('Device not open'))
    const seq = nextSeq()
    const frame = buildCcid(msgType, data, seq)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingResolve.current = null
        reject(new Error('Timeout'))
      }, 2000)
      pendingResolve.current = (report: DataView) => {
        clearTimeout(timeout)
        resolve(report)
      }
      dev.sendReport(0x00, frame.buffer as ArrayBuffer).catch(e => {
        clearTimeout(timeout)
        pendingResolve.current = null
        reject(e)
      })
    })
  }, [])

  const onUidReadRef = useRef(onUidRead)
  onUidReadRef.current = onUidRead

  const handleReport = useCallback((e: HIDInputReportEvent) => {
    // If we have a pending CCID command, route the report there
    if (pendingResolve.current) {
      const resolve = pendingResolve.current
      pendingResolve.current = null
      resolve(e.data)
      return
    }

    // Otherwise, try to parse as raw UID (non-CCID reader)
    if (!useCcidRef.current && !rawUidCooldown.current) {
      const uid = tryParseRawUid(e.data)
      if (uid && uid !== lastUidRef.current) {
        lastUidRef.current = uid
        setState(s => ({ ...s, lastUid: uid, status: 'waiting' }))
        onUidReadRef.current(uid)
        // Cooldown to avoid duplicate reads from the same card tap
        rawUidCooldown.current = true
        setTimeout(() => { rawUidCooldown.current = false }, 1500)
      }
    }
  }, [])

  const pollCard = useCallback(async () => {
    if (!useCcidRef.current) return // Non-CCID readers use input reports directly
    try {
      // Power on → activates card if present
      const atr = await sendCommand(PC_TO_RDR_ICC_POWER_ON, [])
      const msgType = atr.getUint8(0)
      const status = atr.getUint8(7)
      const iccStatus = status & 0x03

      if (msgType !== RDR_TO_PC_DATA_BLOCK || iccStatus === 2) {
        // No card present
        if (lastUidRef.current) {
          lastUidRef.current = null
          setState(s => ({ ...s, lastUid: null, status: 'waiting' }))
        }
        return
      }

      // Card is active → send GET DATA for UID
      setState(s => s.status === 'waiting' ? { ...s, status: 'reading' } : s)
      const resp = await sendCommand(PC_TO_RDR_XFR_BLOCK, GET_UID_APDU)
      const respMsg = resp.getUint8(0)
      const respStatus = resp.getUint8(7)
      const dataLen = resp.getUint8(1) | (resp.getUint8(2) << 8)

      if (respMsg !== RDR_TO_PC_DATA_BLOCK || (respStatus & 0x03) !== 0 || dataLen < 3) {
        setState(s => ({ ...s, status: 'waiting' }))
        return
      }

      // Last 2 bytes are SW1 SW2 — should be 90 00
      const sw1 = resp.getUint8(10 + dataLen - 2)
      const sw2 = resp.getUint8(10 + dataLen - 1)
      if (sw1 !== 0x90 || sw2 !== 0x00) {
        setState(s => ({ ...s, status: 'waiting' }))
        return
      }

      const uidBytes = new Uint8Array(dataLen - 2)
      for (let i = 0; i < uidBytes.length; i++) uidBytes[i] = resp.getUint8(10 + i)
      const uid = uidToHex(uidBytes)

      if (uid !== lastUidRef.current) {
        lastUidRef.current = uid
        setState(s => ({ ...s, lastUid: uid, status: 'waiting' }))
        onUidReadRef.current(uid)
      }
    } catch {
      // Timeout or comm error — card removed or transient, keep polling
      if (lastUidRef.current) {
        lastUidRef.current = null
        setState(s => ({ ...s, lastUid: null, status: 'waiting' }))
      }
    }
  }, [sendCommand])

  const startDevice = useCallback(async (device: HIDDevice) => {
    await device.open()
    device.addEventListener('inputreport', handleReport)
    deviceRef.current = device
    seqRef.current = 0
    lastUidRef.current = null
    useCcidRef.current = true

    const deviceName = device.productName || 'NFC Reader'

    setState(s => ({
      ...s,
      status: 'waiting',
      error: null,
      deviceName,
    }))

    // Probe whether this device supports CCID by sending a power-on command.
    // If it times out or errors, switch to raw HID report mode.
    try {
      const probe = await sendCommand(PC_TO_RDR_ICC_POWER_ON, [])
      const msgType = probe.getUint8(0)
      // If we get a valid CCID response (even "no card"), CCID works
      if (msgType === RDR_TO_PC_DATA_BLOCK || msgType === 0x81 /* slot status */) {
        useCcidRef.current = true
        pollRef.current = setInterval(pollCard, 500)
      } else {
        throw new Error('Not CCID')
      }
    } catch {
      // CCID probe failed — this reader doesn't speak CCID.
      // It may send raw UID reports via inputreport events,
      // or it's a keyboard-emulation reader (handled by Scan.tsx).
      useCcidRef.current = false
      setState(s => ({
        ...s,
        status: 'waiting',
        deviceName: `${deviceName} (raw mode)`,
      }))
    }
  }, [handleReport, sendCommand, pollCard])

  const connect = useCallback(async () => {
    if (!('hid' in navigator)) {
      setState(s => ({ ...s, status: 'error', error: 'WebHID not supported. Use Chrome or Edge.' }))
      return
    }
    setState(s => ({ ...s, status: 'connecting', error: null }))
    try {
      // Empty filters → browser shows ALL HID devices for the user to pick
      const devices = await (navigator as any).hid.requestDevice({ filters: [] })
      const device = devices[0] as HIDDevice | undefined
      if (!device) {
        setState(s => ({ ...s, status: 'disconnected', error: 'No reader selected' }))
        return
      }
      await startDevice(device)
    } catch (e: any) {
      setState(s => ({
        ...s,
        status: 'error',
        error: e.message || 'Failed to connect',
      }))
    }
  }, [startDevice])

  const disconnect = useCallback(async () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    const dev = deviceRef.current
    if (dev) {
      dev.removeEventListener('inputreport', handleReport)
      try { await dev.close() } catch { /* ignore */ }
      deviceRef.current = null
    }
    lastUidRef.current = null
    useCcidRef.current = true
    setState({ status: 'disconnected', error: null, deviceName: null, lastUid: null })
  }, [handleReport])

  // Auto-reconnect any previously paired HID device
  useEffect(() => {
    if (!('hid' in navigator)) return
    ;(navigator as any).hid.getDevices().then((devices: HIDDevice[]) => {
      // Try to reconnect the first available previously-paired device
      const known = devices[0]
      if (known && !deviceRef.current) {
        startDevice(known).catch(() => { /* user will click Connect */ })
      }
    })
    return () => { disconnect() }
  }, [])

  return { ...state, connect, disconnect, supported: 'hid' in navigator }
}
