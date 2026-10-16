import { useTranslation } from 'react-i18next'
import { useApi } from '../../ContentProvider'
import { EMOJI_POLICIES, FORMALITY, HASHTAG_POLICIES, optionText, POINTS_OF_VIEW, SENTENCE_STYLES, TONES, type OptionGroup } from '../../lib/options'
import type { BrandPayload, VoiceFields } from '../../lib/types'
import { asList, asText, changedFields, orNull } from '../brandForms'
import { ReadRow, ReadTags, Segmented, TagInput, TextField } from '../inputs'
import { SectionCard } from '../SectionCard'
import { useBrand } from '../useBrand'
import { saveVoiceAndTone } from '../voiceSave'

interface VoiceForm {
  tone: string; style: string; formality_level: string; sentence_style: string; point_of_view: string
  emoji_policy: string; hashtag_policy: string; preferred_words: string[]; forbidden_words: string[]; claims_to_avoid: string[]
}

// eslint-disable-next-line react-refresh/only-export-components
export const voiceForm = (brand: BrandPayload): VoiceForm => {
  const v = brand.voice
  return {
    tone: asText(v?.tone), style: asText(v?.style), formality_level: asText(v?.formality_level), sentence_style: asText(v?.sentence_style),
    point_of_view: asText(v?.point_of_view), emoji_policy: asText(v?.emoji_policy), hashtag_policy: asText(v?.hashtag_policy),
    preferred_words: asList(v?.preferred_words), forbidden_words: asList(v?.forbidden_words), claims_to_avoid: asList(v?.claims_to_avoid),
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export const voiceFields = (f: VoiceForm): VoiceFields => ({
  tone: orNull(f.tone), style: orNull(f.style), formality_level: orNull(f.formality_level), sentence_style: orNull(f.sentence_style),
  point_of_view: orNull(f.point_of_view), emoji_policy: orNull(f.emoji_policy), hashtag_policy: orNull(f.hashtag_policy),
  preferred_words: f.preferred_words, forbidden_words: f.forbidden_words, claims_to_avoid: f.claims_to_avoid,
})

/**
 * Voice (spec §4.6): how the brand sounds. Saved with `PUT brand/voice`;
 * the tone is also the profile's default tone (as the old wizard kept them
 * equal), so a changed tone is saved there too.
 */
export function VoiceSection({ brand, canEdit, startOpen, onSaved }: { brand: BrandPayload; canEdit: boolean; startOpen?: boolean; onSaved?: () => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const { adopt, saveProfile } = useBrand()
  const w = (key: string, english: string) => t(`content.brand.voice.${key}`, english)
  const choices = (group: OptionGroup, map: Record<string, string>) => Object.keys(map).map(v => [v, optionText(t, group, v)] as [string, string])
  const named = (group: OptionGroup, value: string) => (value === '' ? '' : optionText(t, group, value))
  const shown = voiceForm(brand)

  const save = async (draft: VoiceForm, base: VoiceForm) => {
    const outcome = await saveVoiceAndTone(api, adopt, saveProfile, changedFields(voiceFields(base), voiceFields(draft)))
    return outcome === 'tone_sync_failed'
      ? t('content.brand.voice.tone_sync_failed', 'The voice is saved, but the default tone for new posts could not be updated. Save the voice again to try once more.')
      : undefined
  }

  return (
    <SectionCard<VoiceForm> id="content-voice" title={w('title', 'Voice')} description={w('intro', 'How the brand sounds when it writes.')}
      canEdit={canEdit} startOpen={startOpen} onSaved={onSaved} makeDraft={() => voiceForm(brand)} save={save}
      readView={(
        <dl className="grid gap-4 md:grid-cols-2">
          <ReadRow label={w('tone', 'Tone')} value={named('tone', shown.tone)} />
          <ReadRow label={w('style', 'Style in a few words')} value={shown.style} />
          <ReadRow label={w('formality', 'Formality')} value={named('formality', shown.formality_level)} />
          <ReadRow label={w('sentences', 'Sentences')} value={named('sentence_style', shown.sentence_style)} />
          <ReadRow label={w('pov', 'Written as')} value={named('point_of_view', shown.point_of_view)} />
          <ReadRow label={w('emoji', 'Emoji')} value={named('emoji', shown.emoji_policy)} />
          <ReadRow label={w('hashtags', 'Hashtags')} value={named('hashtag', shown.hashtag_policy)} />
          <ReadTags label={w('preferred', 'Words to use')} values={shown.preferred_words} />
          <ReadTags label={w('forbidden', 'Words to avoid')} values={shown.forbidden_words} />
          <ReadTags label={w('claims', 'Claims to avoid')} values={shown.claims_to_avoid} />
        </dl>
      )}
      editView={(draft, change, invalid) => (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Segmented label={w('tone', 'Tone')} options={choices('tone', TONES)} value={draft.tone} onChange={(tone) => change({ ...draft, tone })} /></div>
          <TextField label={w('style', 'Style in a few words')} value={draft.style} maxLength={100} invalid={invalid.includes('style')} onChange={(style) => change({ ...draft, style })} />
          <Segmented label={w('formality', 'Formality')} options={choices('formality', FORMALITY)} value={draft.formality_level} onChange={(formality_level) => change({ ...draft, formality_level })} />
          <Segmented label={w('sentences', 'Sentences')} options={choices('sentence_style', SENTENCE_STYLES)} value={draft.sentence_style} onChange={(sentence_style) => change({ ...draft, sentence_style })} />
          <Segmented label={w('pov', 'Written as')} options={choices('point_of_view', POINTS_OF_VIEW)} value={draft.point_of_view} onChange={(point_of_view) => change({ ...draft, point_of_view })} />
          <Segmented label={w('emoji', 'Emoji')} options={choices('emoji', EMOJI_POLICIES)} value={draft.emoji_policy} onChange={(emoji_policy) => change({ ...draft, emoji_policy })} />
          <Segmented label={w('hashtags', 'Hashtags')} options={choices('hashtag', HASHTAG_POLICIES)} value={draft.hashtag_policy} onChange={(hashtag_policy) => change({ ...draft, hashtag_policy })} />
          <TagInput label={w('preferred', 'Words to use')} values={draft.preferred_words} onChange={(preferred_words) => change({ ...draft, preferred_words })} />
          <TagInput label={w('forbidden', 'Words to avoid')} values={draft.forbidden_words} onChange={(forbidden_words) => change({ ...draft, forbidden_words })} />
          <div className="md:col-span-2"><TagInput label={w('claims', 'Claims to avoid')} values={draft.claims_to_avoid} onChange={(claims_to_avoid) => change({ ...draft, claims_to_avoid })} /></div>
        </div>
      )} />
  )
}
