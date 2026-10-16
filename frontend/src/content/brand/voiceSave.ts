import type { ContentApi } from '../lib/api'
import type { BrandPayload, ProfileFields } from '../lib/types'

type VoiceFields = Parameters<ContentApi['saveVoice']>[0]

/**
 * Saves the voice, then the profile's default tone from it (the AI writes new posts in that tone). The voice is
 * saved either way: a tone that did not follow is reported to the caller, not thrown (spec 2026-10-15 §3.3).
 */
export async function saveVoiceAndTone(
  api: Pick<ContentApi, 'saveVoice'>,
  adopt: (payload: BrandPayload) => void,
  saveProfile: (fields: ProfileFields) => Promise<void>,
  fields: VoiceFields,
): Promise<'tone_sync_failed' | null> {
  if (Object.keys(fields).length === 0) return null
  adopt(await api.saveVoice(fields))
  if (!('tone' in fields)) return null
  try {
    await saveProfile({ default_tone: fields.tone ?? null })
    return null
  } catch {
    return 'tone_sync_failed'
  }
}
