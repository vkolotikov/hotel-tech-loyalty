import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { TextInput } from '../ui/inputs'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { IconButton } from './parts'
import { PIPELINE_LIMITS, sortedReasons, type LostReason } from './pipelines'

const KEY = ['crm', 'settings', 'lost-reasons'] as const

/**
 * Why leads are lost (inquiry-lost-reasons): the choices a person picks from when a lead moves to a lost stage, and
 * what the reports group lost leads by. A manager reads them all with how often each was used and changes them; a
 * reason already used on leads is switched off instead of deleted (the server's rule), so old leads keep their reason.
 */
export function LostReasonsCard({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const reasons = useQuery({
    queryKey: [...KEY, canManage ? 'all' : 'active'],
    queryFn: () => get<LostReason[]>(canManage ? 'inquiry-lost-reasons-admin' : 'inquiry-lost-reasons'),
  })
  const [label, setLabel] = useState('')
  const [renaming, setRenaming] = useState<LostReason | null>(null)
  const [deleting, setDeleting] = useState<LostReason | null>(null)
  const changed = () => { void qc.invalidateQueries({ queryKey: KEY }); void qc.invalidateQueries({ queryKey: ['crm', 'leads'] }) }

  const add = useMutation({
    mutationFn: () => send('post', 'inquiry-lost-reasons', { label: label.trim() }),
    onSuccess: () => { changed(); setLabel('') },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const toggle = useMutation({
    mutationFn: (reason: LostReason) => send('put', `inquiry-lost-reasons/${reason.id}`, { is_active: !(reason.is_active ?? true) }),
    onSuccess: () => changed(),
    onError: error => say(errorText(t, error), 'danger'),
  })
  const remove = useMutation({
    mutationFn: (reason: LostReason) => send<{ soft_deleted?: boolean }>('delete', `inquiry-lost-reasons/${reason.id}`),
    onSuccess: data => {
      changed()
      setDeleting(null)
      say(data?.soft_deleted
        ? t('crm.settings.reasons.switched_off', 'It is used on past leads, so it was switched off instead of deleted.')
        : t('crm.settings.deleted', 'Deleted'))
    },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const list = sortedReasons(reasons.data ?? [])

  return (
    <Card title={t('crm.settings.reasons.title', 'Why leads are lost')} icon={X}>
      <div className="space-y-3">
        <p className="text-sm text-a-text-2">{t('crm.settings.reasons.line', 'The choices offered when a lead is marked lost. Reports group lost leads by them.')}</p>
        <QueryState loading={reasons.isLoading} error={reasons.error} onRetry={() => { void reasons.refetch() }} rows={3}>
          {list.length === 0 ? (
            <p className="text-sm text-a-text-2">{t('crm.settings.reasons.empty', 'No reasons yet.')}</p>
          ) : (
            <ul className="divide-y divide-a-border rounded-xl border border-a-border">
              {list.map(reason => {
                const active = reason.is_active ?? true
                return (
                  <li key={reason.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className={`min-w-0 flex-1 truncate text-sm ${active ? 'text-a-text' : 'text-a-text-2 line-through'}`}>{reason.label}</span>
                    {!active && <Pill>{t('crm.settings.reasons.off', 'Off')}</Pill>}
                    {(reason.inquiries_count ?? 0) > 0 && <span className="text-xs text-a-text-2">{t('crm.settings.reasons.used', 'Used on {{count}} leads', { count: reason.inquiries_count })}</span>}
                    {canManage && (
                      <span className="flex shrink-0 items-center">
                        <IconButton icon={active ? EyeOff : Eye} disabled={toggle.isPending}
                          label={active ? t('crm.settings.reasons.hide', 'Switch off {{name}}', { name: reason.label }) : t('crm.settings.reasons.show', 'Switch on {{name}}', { name: reason.label })}
                          onClick={() => toggle.mutate(reason)} />
                        <IconButton icon={Pencil} label={t('crm.settings.reasons.rename', 'Rename {{name}}', { name: reason.label })} onClick={() => setRenaming(reason)} />
                        <IconButton icon={Trash2} danger label={t('crm.settings.reasons.delete', 'Delete {{name}}', { name: reason.label })} onClick={() => setDeleting(reason)} />
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </QueryState>
        {canManage && (
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (label.trim()) add.mutate() }}>
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t('crm.settings.reasons.new', 'A new reason')}</span>
              <TextInput value={label} maxLength={PIPELINE_LIMITS.reason} placeholder={t('crm.settings.reasons.new', 'A new reason')} onChange={e => setLabel(e.target.value)} />
            </label>
            <Button type="submit" variant="secondary" size="sm" disabled={!label.trim()} loading={add.isPending}><Plus size={14} aria-hidden />{t('crm.common.add', 'Add')}</Button>
          </form>
        )}
      </div>
      {renaming && <RenameReason reason={renaming} onClose={() => setRenaming(null)} onSaved={changed} />}
      {deleting && (
        <Confirm title={t('crm.settings.reasons.delete_title', 'Delete the reason {{name}}?', { name: deleting.label })} confirm={t('crm.common.delete', 'Delete')}
          busy={remove.isPending} onConfirm={() => remove.mutate(deleting)} onClose={() => setDeleting(null)}>
          {(deleting.inquiries_count ?? 0) > 0
            ? t('crm.settings.reasons.delete_used', 'It is used on {{count}} leads, so it will be switched off instead: those leads keep it.', { count: deleting.inquiries_count })
            : t('crm.settings.reasons.delete_line', 'No lead uses it. It is deleted for good.')}
        </Confirm>
      )}
    </Card>
  )
}

function RenameReason({ reason, onClose, onSaved }: { reason: LostReason; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const say = useToast()
  const [label, setLabel] = useState(reason.label)
  const save = useMutation({
    mutationFn: () => send('put', `inquiry-lost-reasons/${reason.id}`, { label: label.trim() }),
    onSuccess: () => { onSaved(); say(t('crm.common.saved', 'Saved')); onClose() },
    onError: error => say(errorText(t, error), 'danger'),
  })
  return (
    <Dialog title={t('crm.settings.reasons.rename_title', 'Rename the reason')} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (label.trim()) save.mutate() }}>
        <Field label={t('crm.settings.reasons.label', 'Reason')}>
          <TextInput value={label} maxLength={PIPELINE_LIMITS.reason} onChange={e => setLabel(e.target.value)} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" disabled={!label.trim()} loading={save.isPending}>{t('crm.common.save', 'Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
