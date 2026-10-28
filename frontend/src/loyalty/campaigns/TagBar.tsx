import type { SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { tagPlace, type CampaignForm, type TagTarget } from './campaignsMath'
import type { TagOption } from './types'
import { BLOCK_WORDS, TAG_WORDS } from './words'

type TextField = HTMLInputElement | HTMLTextAreaElement

/** What a field a tag can go into carries: its element, for the cursor afterwards, and where its cursor is. */
export interface TagFieldProps {
  ref: (el: TextField | null) => void
  onSelect: (e: SyntheticEvent<TextField>) => void
  onFocus: (e: SyntheticEvent<TextField>) => void
}

/**
 * The tags the server fills (spec 2026-10-22 release 3 §4), offered as buttons: one puts its tag where the cursor was
 * last, in the subject, a heading, a text or a button label (campaignsMath.ts `withTag`). The press does not take the
 * focus from the field, so the cursor stays where it was. The tags and their descriptions are the server's.
 */
export function TagBar({ tags, form, target, noRoom, onInsert, compact = false }: {
  tags: TagOption[]
  form: CampaignForm
  target: TagTarget | null
  noRoom: boolean
  onInsert: (tag: string) => void
  compact?: boolean
}) {
  const { t } = useTranslation()
  const place = target ? tagPlace(form, target.field) : null
  const where = place === null
    ? t('loyalty.campaigns.tags.where_none', 'Click into the subject, a heading, a text or a button label, then choose a tag to put there.')
    : place.kind === 'subject'
      ? t('loyalty.campaigns.tags.where_subject', 'A tag goes where the cursor is in the subject.')
      : t('loyalty.campaigns.tags.where_block', 'A tag goes where the cursor is in {{what}} {{n}}.', {
        what: place.kind in BLOCK_WORDS ? t(`loyalty.campaigns.block.${place.kind}`, BLOCK_WORDS[place.kind]) : place.kind, n: place.n,
      })

  const content = (
    <div className="space-y-1.5" data-tags="">
      <p className="text-xs font-medium text-a-text-2">{t('loyalty.campaigns.tags.title', 'Tags')}</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(tag => (
          <Button key={tag.tag} type="button" size="sm" variant="secondary" disabled={place === null} title={tag.tag}
            onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(tag.tag)}>
            {tag.name in TAG_WORDS ? t(`loyalty.campaigns.tag.${tag.name}`, TAG_WORDS[tag.name]) : tag.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-a-text-2">{where} {t('loyalty.campaigns.tags.each', 'Each member’s copy shows their own.')}</p>
      {noRoom && <p className="text-xs font-medium text-a-danger">{t('loyalty.campaigns.tags.no_room', 'There is no room for that tag in this field.')}</p>}
    </div>
  )
  return compact ? <details className="l-cm-tag-menu"><summary className="l-ov-button">{t('loyalty.campaigns.tags.title', 'Tags')} ▾</summary>{content}</details> : content
}
