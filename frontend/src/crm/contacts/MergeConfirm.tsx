import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Confirm } from '../ui/Confirm'
import { TextArea } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import { displayName, mergeBody, mergeRefusalKey, mergeSides } from './contactsLogic'
import { CONTACTS, refreshAfterContactChange } from './queries'
import type { DuplicatePair } from './types'

/**
 * Two contacts that look like one person, merged for good (POST guests/merge): which one stays (swap to change it),
 * an optional reason kept in the record, then the merge. From the Duplicates tab and from a contact's own record.
 */
export function MergeConfirm({ pair, onClose, onMerged }: { pair: DuplicatePair; onClose: () => void; onMerged?: (keptId: number, removedId: number) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [swapped, setSwapped] = useState(false)
  const [reason, setReason] = useState('')
  const { keep, remove } = mergeSides(pair, swapped)
  const keepName = displayName(keep) ?? t('crm.common.no_name', 'No name')
  const removeName = displayName(remove) ?? t('crm.common.no_name', 'No name')
  const merge = useMutation({
    mutationFn: () => send('post', 'guests/merge', mergeBody(pair, swapped, reason)),
    onSuccess: () => {
      qc.removeQueries({ queryKey: [...CONTACTS, 'one', remove.id] })
      refreshAfterContactChange(qc, { leadsToo: true })
      toast(t('crm.contacts.duplicates.merged', 'Contacts merged'))
      onClose()
      onMerged?.(keep.id, remove.id)
    },
  })
  // A merge the server refuses says why in its code (GuestMergeController); anything else in the usual words.
  const refusal = merge.isError ? mergeRefusalKey(failureOf(merge.error).code) : null
  const refusedText = refusal === 'refused' ? t('crm.contacts.duplicates.refused', 'These two cannot be merged: each is linked to a different member account.')
    : refusal === 'same' ? t('crm.contacts.duplicates.refused_same', 'A contact cannot be merged into itself.')
    : refusal === 'failed' ? t('crm.contacts.duplicates.refused_failed', 'The merge failed and nothing was changed. Please try again.')
    : refusal === 'not_merged' ? t('crm.contacts.duplicates.refused_other', 'These two contacts cannot be merged.')
    : null

  return (
    <Confirm title={t('crm.contacts.duplicates.confirm_title', 'Merge these two contacts?')} confirm={t('crm.contacts.duplicates.confirm', 'Merge for good')}
      busy={merge.isPending} onConfirm={() => merge.mutate()} onClose={onClose}>
      <div className="space-y-3">
        <p>{t('crm.contacts.duplicates.warning', 'Merging cannot be undone. The contact you keep takes over the other’s leads, timeline, tags and tasks; its own details stay, and the other’s only fill its blanks.')}</p>
        <dl className="grid grid-cols-2 gap-2 text-a-text">
          <div className="rounded-xl border border-a-border p-2.5"><dt className="text-xs text-a-text-2">{t('crm.contacts.duplicates.keep', 'Kept')}</dt><dd className="truncate font-medium">{keepName}</dd></div>
          <div className="rounded-xl border border-a-border p-2.5"><dt className="text-xs text-a-text-2">{t('crm.contacts.duplicates.goes', 'Merged and removed')}</dt><dd className="truncate font-medium">{removeName}</dd></div>
        </dl>
        <Button variant="ghost" size="sm" onClick={() => setSwapped(s => !s)} aria-pressed={swapped}>
          <ArrowLeftRight size={14} aria-hidden />{t('crm.contacts.duplicates.swap', 'Keep the other one instead')}
        </Button>
        <Field label={t('crm.contacts.duplicates.reason', 'Why (optional, kept in the record)')}>
          <TextArea rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
        </Field>
        {merge.isError && <Notice tone="danger">{refusedText ?? errorText(t, merge.error)}</Notice>}
      </div>
    </Confirm>
  )
}
