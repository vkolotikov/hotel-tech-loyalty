import { useCallback, useEffect, useRef, useState } from 'react'
import { failureOf, send } from '../lib/api'
import { audioFileName, recorderMime } from './inboxLogic'

export type MicState = 'idle' | 'recording' | 'transcribing'

/** Why a transcription failed: switched off for the organisation (503 `transcription_unavailable`), or anything else. */
export function dictationFailure(error: unknown): 'off' | 'failed' {
  const { status, code } = failureOf(error)
  return code === 'transcription_unavailable' || status === 503 ? 'off' : 'failed'
}

/** Whether this browser can record a reply at all (the mic button shows only then). */
export function canDictate(): boolean {
  return typeof window !== 'undefined' && 'MediaRecorder' in window && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

/**
 * Speak a reply: the microphone records until stopped, `chat-inbox/transcribe` turns it into text, and the text goes
 * into the reply box — never sent by itself, so the person reads it first (as the full admin's dictation).
 */
export function useDictation({ onText, onFail }: { onText: (text: string) => void; onFail: (why: 'denied' | 'no_speech' | 'off' | 'failed') => void }) {
  const [state, setState] = useState<MicState>('idle')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const live = useRef(true)
  const handlers = useRef({ onText, onFail })
  useEffect(() => { handlers.current = { onText, onFail } }, [onText, onFail])

  const release = useCallback(() => {
    stream.current?.getTracks().forEach(track => { try { track.stop() } catch { /* already stopped */ } })
    stream.current = null
    recorder.current = null
    chunks.current = []
  }, [])

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
      try { if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop() } catch { /* gone */ }
      release()
    }
  }, [release])

  const start = useCallback(async () => {
    if (state !== 'idle' || !canDictate()) return
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.current = media
      chunks.current = []
      const mime = recorderMime(m => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m))
      const rec = mime ? new MediaRecorder(media, { mimeType: mime }) : new MediaRecorder(media)
      recorder.current = rec
      rec.addEventListener('dataavailable', e => { if (e.data && e.data.size > 0) chunks.current.push(e.data) })
      rec.addEventListener('stop', () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' })
        release()
        if (!live.current) return
        if (blob.size < 800) { setState('idle'); return }
        setState('transcribing')
        const body = new FormData()
        body.append('audio', blob, audioFileName(blob.type || 'audio/webm'))
        send<{ text?: string }>('post', 'chat-inbox/transcribe', body)
          .then(answer => {
            const text = String(answer?.text ?? '').trim()
            if (text) handlers.current.onText(text)
            else handlers.current.onFail('no_speech')
          })
          .catch((error: unknown) => handlers.current.onFail(dictationFailure(error)))
          .finally(() => { if (live.current) setState('idle') })
      })
      rec.addEventListener('error', () => { release(); if (live.current) setState('idle') })
      setState('recording')
      rec.start()
    } catch {
      release()
      setState('idle')
      handlers.current.onFail('denied')
    }
  }, [state, release])

  const stop = useCallback(() => {
    const rec = recorder.current
    if (rec && rec.state !== 'inactive') { try { rec.stop() } catch { /* already stopped */ } }
  }, [])

  const toggle = useCallback(() => {
    if (state === 'recording') stop()
    else if (state === 'idle') void start()
  }, [state, start, stop])

  return { state, toggle }
}
