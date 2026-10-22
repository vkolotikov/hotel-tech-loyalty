import { useCallback, useEffect, useRef, useState } from 'react'
import { isRepeat, nfcAttempt, nfcFailure, type Attempt, type NdefRecordText, type NfcFailure } from './scanMath'

/**
 * Web NFC (`NDEFReader`, Chrome on Android) as Scan uses it: started only from a press (the browser asks for the
 * permission then), one abort controller that Stop, a new start and leaving the page all abort, and every tap read
 * into an attempt (scanMath's nfcAttempt: a record carrying the member wins over the card's serial number). The same
 * card held a moment longer is one tap. Nothing here runs where the browser has no `NDEFReader`.
 */

interface NdefRecordLike {
  recordType: string
  mediaType?: string
  encoding?: string
  data?: DataView
}

interface NdefReadingEventLike extends Event {
  serialNumber?: string
  message: { records: readonly NdefRecordLike[] }
}

interface NdefReaderLike extends EventTarget {
  scan(options?: { signal?: AbortSignal }): Promise<void>
  onreading: ((event: NdefReadingEventLike) => void) | null
  onreadingerror: ((event: Event) => void) | null
}

type NdefReaderClass = new () => NdefReaderLike

function ndefReader(): NdefReaderClass | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { NDEFReader?: NdefReaderClass }).NDEFReader ?? null
}

/** A record's text where it has one: a text record in its own encoding, a link, or a JSON or text payload. */
export function decodeRecord(record: NdefRecordLike): NdefRecordText {
  const readable = record.recordType === 'text' || record.recordType === 'url' || record.recordType === 'absolute-url'
    || (record.recordType === 'mime' && /json|text/i.test(record.mediaType ?? ''))
  if (!readable || !record.data) return { recordType: record.recordType, mediaType: record.mediaType, text: null }
  try {
    const encoding = record.recordType === 'text' && record.encoding ? record.encoding : 'utf-8'
    return { recordType: record.recordType, mediaType: record.mediaType, text: new TextDecoder(encoding).decode(record.data) }
  } catch {
    return { recordType: record.recordType, mediaType: record.mediaType, text: null }
  }
}

export interface WebNfc {
  listening: boolean
  trouble: NfcFailure | null
  /** Call from a press: the browser needs the gesture to ask for the permission. */
  start: () => void
  stop: () => void
}

/** `once`: stop listening after the first tap handed up (linking one card), else keep listening for the next card. */
export function useWebNfc(onRead: (attempt: Attempt) => void, once = false): WebNfc {
  const [listening, setListening] = useState(false)
  const [trouble, setTrouble] = useState<NfcFailure | null>(null)
  const controller = useRef<AbortController | null>(null)
  const last = useRef<{ code: string; at: number } | null>(null)
  const handler = useRef(onRead)
  useEffect(() => { handler.current = onRead })

  const stop = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Reader = ndefReader()
    if (!Reader) { setTrouble('unsupported'); return }
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setTrouble(null)

    let reader: NdefReaderLike
    try {
      reader = new Reader()
    } catch (error) {
      controller.current = null
      setTrouble(nfcFailure(error))
      return
    }
    reader.onreading = (event) => {
      if (abort.signal.aborted) return
      const attempt = nfcAttempt(event.serialNumber, event.message.records.map(decodeRecord))
      if (!attempt) { setTrouble('unreadable'); return }
      const now = Date.now()
      if (isRepeat(last.current, attempt.code, now)) return
      last.current = { code: attempt.code, at: now }
      setTrouble(null)
      if (once) {
        abort.abort()
        controller.current = null
        setListening(false)
      }
      handler.current(attempt)
    }
    reader.onreadingerror = () => { if (!abort.signal.aborted) setTrouble('unreadable') }
    reader.scan({ signal: abort.signal }).then(
      () => { if (!abort.signal.aborted) setListening(true) },
      (error: unknown) => {
        if (abort.signal.aborted) return
        controller.current = null
        setListening(false)
        setTrouble(nfcFailure(error))
      },
    )
  }, [once])

  // Leaving the page stops listening.
  useEffect(() => () => { controller.current?.abort(); controller.current = null }, [])

  return { listening, trouble, start, stop }
}
