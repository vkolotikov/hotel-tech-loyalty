import { useTranslation } from 'react-i18next'
import type { BrandPayload, Positioning, ProfileFields } from '../../lib/types'
import { asList, asPositioning, changedFields } from '../brandForms'
import { ReadRow, ReadTags, TagInput, TextField } from '../inputs'
import { SectionCard } from '../SectionCard'
import { useBrand } from '../useBrand'

interface PositioningForm {
  /** Parts of the stored positioning this section does not show; they go back as they came. */
  rest: Record<string, unknown>
  old_way: string; new_way: string; transformation: string; beliefs: string[]; key_messages: string[]
}

// eslint-disable-next-line react-refresh/only-export-components
export const positioningForm = (brand: BrandPayload): PositioningForm => {
  const { old_way = '', new_way = '', transformation = '', beliefs = [], ...rest } = asPositioning(brand.profile?.positioning)
  return { rest, old_way, new_way, transformation, beliefs, key_messages: asList(brand.profile?.key_messages) }
}

// eslint-disable-next-line react-refresh/only-export-components
export const positioningFields = (f: PositioningForm): ProfileFields => ({
  positioning: { ...f.rest, old_way: f.old_way, new_way: f.new_way, transformation: f.transformation, beliefs: f.beliefs } as Positioning,
  key_messages: f.key_messages,
})

/** Positioning (spec §4.6): what the brand moves people away from and towards, what it believes, what it keeps saying. */
export function PositioningSection({ brand, canEdit, startOpen, onSaved }: { brand: BrandPayload; canEdit: boolean; startOpen?: boolean; onSaved?: () => void }) {
  const { t } = useTranslation()
  const { saveProfile } = useBrand()
  const w = (key: string, english: string) => t(`content.brand.positioning.${key}`, english)
  const shown = positioningForm(brand)

  return (
    <SectionCard<PositioningForm> id="content-positioning" title={w('title', 'Positioning')}
      description={w('intro', 'Where the brand stands: what it moves people away from, and towards.')}
      canEdit={canEdit} startOpen={startOpen} onSaved={onSaved} makeDraft={() => positioningForm(brand)}
      save={(draft, base) => saveProfile(changedFields(positioningFields(base), positioningFields(draft)))}
      readView={(
        <dl className="grid gap-4 md:grid-cols-2">
          <ReadRow label={w('old_way', 'The old way')} value={shown.old_way} />
          <ReadRow label={w('new_way', 'The new way')} value={shown.new_way} />
          <ReadRow className="md:col-span-2" label={w('transformation', 'What changes for the client')} value={shown.transformation} />
          <ReadTags label={w('beliefs', 'Beliefs')} values={shown.beliefs} />
          <ReadTags label={w('key_messages', 'Key messages')} values={shown.key_messages} />
        </dl>
      )}
      editView={(draft, change) => (
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label={w('old_way', 'The old way')} value={draft.old_way} rows={3} onChange={(old_way) => change({ ...draft, old_way })} />
          <TextField label={w('new_way', 'The new way')} value={draft.new_way} rows={3} onChange={(new_way) => change({ ...draft, new_way })} />
          <div className="md:col-span-2"><TextField label={w('transformation', 'What changes for the client')} value={draft.transformation} rows={3} onChange={(transformation) => change({ ...draft, transformation })} /></div>
          <TagInput label={w('beliefs', 'Beliefs')} values={draft.beliefs} onChange={(beliefs) => change({ ...draft, beliefs })} />
          <TagInput label={w('key_messages', 'Key messages')} values={draft.key_messages} onChange={(key_messages) => change({ ...draft, key_messages })} />
        </div>
      )} />
  )
}
