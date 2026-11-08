import { describe, expect, it } from 'vitest'
import { appendWords, audioFileName, recorderMime, voiceFailure } from './voice'

describe('a voice note for the timeline', () => {
  it('records in the first format the browser makes, and names the file after it', () => {
    expect(recorderMime(m => m === 'audio/mp4')).toBe('audio/mp4')
    expect(recorderMime(() => false)).toBe('')
    expect(audioFileName('audio/ogg;codecs=opus')).toBe('voice-note.ogg')
    expect(audioFileName('')).toBe('voice-note.webm')
  })

  it('tells "not set up" from a failure, and keeps what was written before', () => {
    expect(voiceFailure(503, 'unknown')).toBe('off')
    expect(voiceFailure(500, 'transcription_unavailable')).toBe('off')
    expect(voiceFailure(502, 'ai_failed')).toBe('failed')
    expect(appendWords('Called her.  ', ' She wants May. ')).toBe('Called her.\nShe wants May.')
    expect(appendWords('', 'Hello')).toBe('Hello')
    expect(appendWords('Kept', '  ')).toBe('Kept')
  })
})
