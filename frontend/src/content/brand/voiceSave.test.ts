import { describe, expect, it, vi } from 'vitest'
import type { BrandPayload } from '../lib/types'
import { saveVoiceAndTone } from './voiceSave'

const answer = { profile: null, audiences: [], channels: [], voice: null, readiness: null } as unknown as BrandPayload

describe('saveVoiceAndTone', () => {
  it('saves the voice, then the default tone from it', async () => {
    const api = { saveVoice: vi.fn(async () => answer) }
    const adopt = vi.fn()
    const saveProfile = vi.fn(async () => {})
    await expect(saveVoiceAndTone(api, adopt, saveProfile, { tone: 'warm' })).resolves.toBeNull()
    expect(adopt).toHaveBeenCalledWith(answer)
    expect(saveProfile).toHaveBeenCalledWith({ default_tone: 'warm' })
  })

  // Plan C deferred: a tone that did not follow showed "could not be saved" with the form open, though the voice was saved.
  it('reports a tone that did not follow instead of failing the saved voice', async () => {
    const api = { saveVoice: vi.fn(async () => answer) }
    const adopt = vi.fn()
    const saveProfile = vi.fn(async () => { throw new Error('down') })
    await expect(saveVoiceAndTone(api, adopt, saveProfile, { tone: 'warm' })).resolves.toBe('tone_sync_failed')
    expect(adopt).toHaveBeenCalledWith(answer)
  })

  it('sends nothing when nothing changed, and leaves the tone alone when it was not changed', async () => {
    const api = { saveVoice: vi.fn(async () => answer) }
    const saveProfile = vi.fn(async () => {})
    await saveVoiceAndTone(api, vi.fn(), saveProfile, {})
    expect(api.saveVoice).not.toHaveBeenCalled()
    await saveVoiceAndTone(api, vi.fn(), saveProfile, { style: 'Calm' })
    expect(saveProfile).not.toHaveBeenCalled()
  })
})
