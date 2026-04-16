import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * WebHID driver for ACS ACR122U NFC reader.
 * Communicates via CCID-over-HID to poll for contactless cards and read UIDs.
 */

const ACR122U_FILTERS: HIDDeviceFilter[] = [
  { vendorId: 0x072f, productId: 0x2200 },  // ACR122U
  { vendorId: 0x072f, productId: 0x2214 },  // ACR1222L
  { vendorId: 0x072f, productId: 0x0901 },  // ACR1281U
  { vendorId: 0x04e6, productId: 0x5116 },  // SCL3711
  { vendorId: 0x04e6, productId: 0x5810 },  // Identiv uTrust 3700
]

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

  const handleReport = useCallback((e: HIDInputReportEvent) => {
    if (pendingResolve.current) {
      const resolve = pendingResolve.current
      pendingResolve.current = null
      resolve(e.data)
    }
  }, [])

  const pollCard = useCallback(async () => {
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
        onUidRead(uid)
      }
    } catch {
      // Timeout or comm error — card removed or transient, keep polling
      if (lastUidRef.current) {
        lastUidRef.current = null
        setState(s => ({ ...s, lastUid: null, status: 'waiting' }))
      }
    }
  }, [sendCommand, onUidRead])

  const connect = useCallback(async () => {
    if (!('hid' in navigator)) {
      setState(s => ({ ...s, status: 'error', error: 'WebHID not supported. Use Chrome or Edge.' }))
      return
    }
    setState(s => ({ ...s, status: 'connecting', error: null }))
    try {
      const devices = await (navigator as any).hid.requestDevice({ filters: ACR122U_FILTERS })
      const device = devices[0] as HIDDevice | undefined
      if (!device) {
        setState(s => ({ ...s, status: 'disconnected', error: 'No reader selected' }))
        return
      }
      await device.open()
      device.addEventListener('inputreport', handleReport)
      deviceRef.current = device
      seqRef.current = 0
      lastUidRef.current = null
      setState(s => ({
        ...s,
        status: 'waiting',
        error: null,
        deviceName: device.productName || 'NFC Reader',
      }))

      // Start polling
      pollRef.current = setInterval(pollCard, 500)
    } catch (e: any) {
      setState(s => ({
        ...s,
        status: 'error',
        error: e.message || 'Failed to connect',
      }))
    }
  }, [handleReport, pollCard])

  const disconnect = useCallback(async () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    const dev = deviceRef.current
    if (dev) {
      dev.removeEventListener('inputreport', handleReport)
      try { await dev.close() } catch { /* ignore */ }
      deviceRef.current = null
    }
    lastUidRef.current = null
    setState({ status: 'disconnected', error: null, deviceName: null, lastUid: null })
  }, [handleReport])

  // Auto-reconnect previously paired devices
  useEffect(() => {
    if (!('hid' in navigator)) return
    ;(navigator as any).hid.getDevices().then((devices: HIDDevice[]) => {
      const known = devices.find((d: HIDDevice) =>
        ACR122U_FILTERS.some(f => f.vendorId === d.vendorId && f.productId === d.productId)
      )
      if (known && !deviceRef.current) {
        known.open().then(() => {
          known.addEventListener('inputreport', handleReport)
          deviceRef.current = known
          seqRef.current = 0
          lastUidRef.current = null
          setState(s => ({
            ...s,
            status: 'waiting',
            error: null,
            deviceName: known.productName || 'NFC Reader',
          }))
          pollRef.current = setInterval(pollCard, 500)
        }).catch(() => { /* user will click Connect */ })
      }
    })
    return () => { disconnect() }
  }, [])

  return { ...state, connect, disconnect, supported: 'hid' in navigator }
}
