import { useCallback, useEffect, useRef, useState } from 'react'
import { failureOf, timeApi } from '../lib/api'
import { MAX_SECONDS, audioFileName, recorderMime, voiceFailure, type VoiceFailure } from './voice'

export type MicState = 'idle' | 'recording' | 'transcribing'

/** Whether this browser can record at all (the microphone buttons show only then). */
export function canRecord(): boolean {
  return typeof window !== 'undefined' && 'MediaRecorder' in window && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

/**
 * Speak instead of typing: the microphone records until stopped (at most MAX_SECONDS), `time/transcribe` writes it down,
 * and the words go to `onText` for the person to read — a voice note is never saved or sent on by itself.
 */
export function useRecorder({ onText, onFail, language }: { onText: (text: string) => void; onFail: (why: VoiceFailure) => void; language?: string }) {
  const [state, setState] = useState<MicState>('idle')
  const [seconds, setSeconds] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number | null>(null)
  const live = useRef(true)
  const handlers = useRef({ onText, onFail, language })
  useEffect(() => { handlers.current = { onText, onFail, language } }, [onText, onFail, language])

  const release = useCallback(() => {
    if (timer.current !== null) { window.clearInterval(timer.current); timer.current = null }
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

  const stop = useCallback(() => {
    const rec = recorder.current
    if (rec && rec.state !== 'inactive') { try { rec.stop() } catch { /* already stopped */ } }
  }, [])

  const start = useCallback(async () => {
    if (state !== 'idle') return
    if (!canRecord()) { handlers.current.onFail('unsupported'); return }
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
        if (blob.size < 800) { setState('idle'); handlers.current.onFail('no_speech'); return }
        setState('transcribing')
        timeApi.transcribe(blob, audioFileName(blob.type || 'audio/webm'), handlers.current.language)
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
      setSeconds(0)
      const began = Date.now()
      timer.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - began) / 1000)
        setSeconds(s)
        if (s >= MAX_SECONDS) stop()
      }, 250)
      setState('recording')
      rec.start()
    } catch {
      release()
      setState('idle')
      handlers.current.onFail('denied')
    }
  }, [state, release, stop])

  const toggle = useCallback(() => {
    if (state === 'recording') stop()
    else if (state === 'idle') void start()
  }, [state, start, stop])

  return { state, seconds, toggle, stop }
}
