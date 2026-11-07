/**
 * A voice note for the lead's timeline (the main platform's lead page records one and has it written down): which
 * recording format the browser can make, the file's name, and what a failed transcription means. Pure: the recorder
 * itself lives in useVoiceNote.ts.
 */
export function recorderMime(isSupported: (mime: string) => boolean): string {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(m => isSupported(m)) ?? ''
}

export function audioFileName(mime: string): string {
  return `voice-note.${mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm'}`
}

export type VoiceFailure = 'denied' | 'no_speech' | 'off' | 'failed'

/** Why `chat-inbox/transcribe` did not answer with words: switched off on the server (503), or it failed. */
export function voiceFailure(status: number | undefined, code: string): VoiceFailure {
  return status === 503 || code === 'transcription_unavailable' ? 'off' : 'failed'
}

/** The words appended to what is already written (a dictation in several goes keeps the earlier ones). */
export function appendWords(before: string, words: string): string {
  const add = words.trim()
  if (!add) return before
  return before.trim() ? `${before.replace(/\s+$/, '')}\n${add}` : add
}
