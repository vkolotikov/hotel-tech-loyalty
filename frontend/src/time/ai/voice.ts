/**
 * A voice note (pure; the recorder itself is useRecorder.ts): which recording format the browser can make, the file's
 * name, what a failed recording or transcription means, and how a dictation adds to what is written. The same rules as
 * the CRM's voice notes (crm/leads/voice.ts), kept here because workspaces share src/workspace only.
 */
export function recorderMime(isSupported: (mime: string) => boolean): string {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(m => isSupported(m)) ?? ''
}

export function audioFileName(mime: string): string {
  return `voice-note.${mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm'}`
}

export type VoiceFailure = 'denied' | 'unsupported' | 'no_speech' | 'off' | 'failed'

/** What a failed recording means, in the person's words. */
export function voiceFailureText(t: (key: string, fallback: string) => string, why: VoiceFailure): string {
  switch (why) {
    case 'denied': return t('time.voice.denied', 'The microphone is not allowed. Allow it in the browser, then try again.')
    case 'unsupported': return t('time.voice.unsupported', 'This browser cannot record. Type instead, or use another browser.')
    case 'no_speech': return t('time.voice.no_speech', 'Nothing was heard. Hold the phone closer and try again.')
    case 'off': return t('time.voice.off', 'Voice input is not set up for this workspace yet.')
    default: return t('time.voice.failed', 'The recording could not be turned into text. Please try again.')
  }
}

/** Why `time/transcribe` did not answer with words: not set up on the server (503), or it failed. */
export function voiceFailure(status: number | undefined, code: string): VoiceFailure {
  return status === 503 || code === 'transcription_unavailable' ? 'off' : 'failed'
}

/** The words appended to what is already written (a dictation in several goes keeps the earlier ones). */
export function appendWords(before: string, words: string): string {
  const add = words.trim()
  if (!add) return before
  return before.trim() ? `${before.replace(/\s+$/, '')}\n${add}` : add
}

/** The recording's length as m:ss. */
export function elapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The longest recording the planner takes, in seconds (the server takes 25 MB; two minutes of speech is plenty). */
export const MAX_SECONDS = 120
