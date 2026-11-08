import { useCallback, useEffect, useRef, useState } from 'react'
import { failureOf, send } from '../lib/api'
import { audioFileName, recorderMime, voiceFailure, type VoiceFailure } from './voice'

export type MicState = 'idle' | 'recording' | 'transcribing'

/** Whether this browser can record at all (the microphone button shows only then). */
export function canRecord(): boolean {
  return typeof window !== 'undefined' && 'MediaRecorder' in window && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

/**
 * Speak a note: the microphone records until stopped, `chat-inbox/transcribe` writes it down, and the words go into the
 * timeline box for the person to read and add — never saved by themselves.
 */
export function useVoiceNote({ onText, onFail }: { onText: (text: string) => void; onFail: (why: VoiceFailure) => void }) {
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
    if (state !== 'idle' || !canRecord()) return
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
          .catch((error: unknown) => {
            const failure = failureOf(error)
            handlers.current.onFail(voiceFailure(failure.status, failure.code))
          })
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

  const toggle = useCallback(() => {
    if (state === 'recording') {
      const rec = recorder.current
      if (rec && rec.state !== 'inactive') { try { rec.stop() } catch { /* already stopped */ } }
    } else if (state === 'idle') void start()
  }, [state, start])

  return { state, toggle }
}
