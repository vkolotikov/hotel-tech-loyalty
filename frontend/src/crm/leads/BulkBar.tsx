import { useState, type ChangeEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, Trash2, Trophy, X, XCircle } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Confirm } from '../ui/Confirm'
import { TextArea } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import { useTeam } from '../tasks/taskData'
import { InlineSelect } from './InlineSelect'
import { useLeadChanged, useLeadSettings, useLostReasons } from './leadData'
import { bulkBody, lostBody, ownerOptions, wonBody, type BulkAction } from './leadLogic'
import { CLOSE_LIMIT, closeEach } from './listLogic'
import type { Stage } from './leadTypes'

/**
 * One change for every lead chosen: the stage, the owner, the priority and a follow-up for tomorrow through the bulk
 * path (`POST inquiries/bulk`); won and lost through each lead's own flow, one after another, so each records its close
 * (and a lost one its reason); delete (asked first). Escape clears the choice.
 */
export function BulkBar({ selected, stages, onDone }: { selected: ReadonlySet<number>; stages: Stage[]; onDone: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const changed = useLeadChanged()
  const settings = useLeadSettings()
  const team = useTeam()
  const [deleting, setDeleting] = useState(false)
  const [closing, setClosing] = useState<'won' | 'lost' | null>(null)
  const run = useMutation({
    mutationFn: ({ action, value }: { action: BulkAction; value?: string }) => {
      const body = bulkBody(selected, action, value)
      if (!body) throw new Error('nothing chosen')
      return send<{ updated?: number; deleted?: number }>('post', 'inquiries/bulk', body)
    },
    onSuccess: (result, vars) => {
      changed()
      setDeleting(false)
      onDone()
      toast(vars.action === 'delete'
        ? t('crm.leads.bulk_deleted', '{{count}} leads deleted', { count: result.deleted ?? 0 })
        : vars.action === 'mark_for_reengagement'
          ? t('crm.leads.bulk_followed', 'A follow-up task for tomorrow at 9:00 was added to {{count}} leads', { count: result.updated ?? 0 })
          : t('crm.leads.bulk_updated', '{{count}} leads changed', { count: result.updated ?? 0 }))
    },
    onError: e => toast(errorText(t, e), 'danger'),
  })
  const owners = ownerOptions(boot.staff.name, settings.owners, team.data ?? [])
  const pick = (action: BulkAction) => (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    e.target.value = ''
    if (value === '') return
    run.mutate({ action, value: value === '__none__' ? '' : value })
  }

  return (
    <div role="region" aria-label={t('crm.leads.bulk_region', 'Change the chosen leads')}
      className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-a-accent/40 bg-a-surface p-3 shadow-a animate-a-pop">
      <span className="text-sm font-semibold text-a-text">{t('crm.leads.bulk_selected', '{{count}} chosen', { count: selected.size })}</span>
      <InlineSelect defaultValue="" onChange={pick('set_status')} disabled={run.isPending} aria-label={t('crm.leads.bulk_stage', 'Move to a stage')}>
        <option value="" disabled>{t('crm.leads.bulk_stage', 'Move to a stage')}</option>
        {stages.filter(s => s.kind === 'open').map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
      </InlineSelect>
      <InlineSelect defaultValue="" onChange={pick('set_assigned_to')} disabled={run.isPending} aria-label={t('crm.leads.bulk_owner', 'Give to')}>
        <option value="" disabled>{t('crm.leads.bulk_owner', 'Give to')}</option>
        <option value="__none__">{t('crm.leads.owner_none', 'Nobody yet')}</option>
        {owners.map(o => <option key={o} value={o}>{o}</option>)}
      </InlineSelect>
      <InlineSelect defaultValue="" onChange={pick('set_priority')} disabled={run.isPending} aria-label={t('crm.leads.bulk_priority', 'Set priority')}>
        <option value="" disabled>{t('crm.leads.bulk_priority', 'Set priority')}</option>
        {settings.priorities.map(p => <option key={p} value={p}>{p}</option>)}
      </InlineSelect>
      <Button variant="secondary" size="sm" onClick={() => run.mutate({ action: 'mark_for_reengagement' })} disabled={run.isPending}><CalendarPlus size={14} aria-hidden />{t('crm.leads.bulk_follow', 'Follow up tomorrow')}</Button>
      <Button variant="secondary" size="sm" onClick={() => setClosing('won')} disabled={run.isPending}><Trophy size={14} aria-hidden />{t('crm.leads.won', 'Won')}</Button>
      <Button variant="secondary" size="sm" onClick={() => setClosing('lost')} disabled={run.isPending}><XCircle size={14} aria-hidden />{t('crm.leads.lost', 'Lost')}</Button>
      {boot.staff.can.delete_records && (
        <Button variant="secondary" size="sm" onClick={() => setDeleting(true)} disabled={run.isPending}><Trash2 size={14} aria-hidden />{t('crm.common.delete', 'Delete')}</Button>
      )}
      <button type="button" onClick={onDone} className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-sm text-a-text-2 hover:text-a-text">
        <X size={14} aria-hidden />{t('crm.leads.bulk_clear', 'Clear the choice')}<kbd className="hidden rounded border border-a-border px-1 text-xs text-a-text-2 md:inline">Esc</kbd>
      </button>
      {deleting && (
        <Confirm title={t('crm.leads.bulk_delete_title', 'Delete {{count}} leads?', { count: selected.size })} confirm={t('crm.common.delete', 'Delete')}
          busy={run.isPending} onConfirm={() => run.mutate({ action: 'delete' })} onClose={() => setDeleting(false)}>
          <p>{t('crm.leads.bulk_delete_line', 'Their timelines, tasks and files go with them. The contacts stay.')}</p>
          {run.isError && <div className="mt-3"><Notice tone="danger">{errorText(t, run.error)}</Notice></div>}
        </Confirm>
      )}
      {closing && <CloseMany kind={closing} ids={[...selected]} onClose={() => setClosing(null)} onDone={() => { setClosing(null); onDone() }} />}
    </div>
  )
}

/** Close the chosen leads as won or lost, each through its own flow; lost needs one reason for all of them. */
function CloseMany({ kind, ids, onClose, onDone }: { kind: 'won' | 'lost'; ids: number[]; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const changed = useLeadChanged()
  const reasons = useLostReasons(kind === 'lost')
  const [reason, setReason] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const count = Math.min(ids.length, CLOSE_LIMIT)
  const close = useMutation({
    mutationFn: () => closeEach(ids, id => {
      if (kind === 'won') return send('post', `inquiries/${id}/won`, wonBody(note))
      const body = lostBody(reason, note)
      if (!body) return Promise.reject(new Error('no reason'))
      return send('post', `inquiries/${id}/lost`, body)
    }),
    onSuccess: result => {
      changed()
      if (result.failed.length) toast(t('crm.leads.close_some', '{{done}} closed, {{failed}} could not be. They are still chosen.', { done: result.done, failed: result.failed.length }), 'danger')
      else toast(kind === 'won' ? t('crm.leads.bulk_won', '{{count}} leads marked won', { count: result.done }) : t('crm.leads.bulk_lost', '{{count}} leads marked lost', { count: result.done }))
      if (result.failed.length === 0) onDone()
      else onClose()
    },
  })
  const submit = () => {
    setTried(true)
    if (kind === 'lost' && !reason) return
    close.mutate()
  }
  const list = reasons.data ?? []
  return (
    <Dialog title={kind === 'won' ? t('crm.leads.bulk_won_title', 'Mark {{count}} leads as won', { count }) : t('crm.leads.bulk_lost_title', 'Mark {{count}} leads as lost', { count })} onClose={onClose} busy={close.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit() }}>
        <p className="text-sm text-a-text-2">{kind === 'won'
          ? t('crm.leads.bulk_won_line', 'Each one moves to its won stage, becomes a deal and gets a timeline entry.')
          : t('crm.leads.bulk_lost_line', 'Each one moves to its lost stage with the reason and gets a timeline entry. The contacts stay.')}</p>
        {ids.length > CLOSE_LIMIT && <Notice tone="warning">{t('crm.leads.close_limit', 'The first {{count}} are closed now; choose the rest again afterwards.', { count: CLOSE_LIMIT })}</Notice>}
        {close.isError && <Notice tone="danger">{errorText(t, close.error)}</Notice>}
        {kind === 'lost' && (
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-a-text-2">{t('crm.leads.lost_reason', 'Why was it lost?')}</legend>
            {reasons.isError && <Notice tone="danger">{errorText(t, reasons.error)}</Notice>}
            {!reasons.isLoading && list.length === 0 && !reasons.isError && (
              <Notice tone="warning">{t('crm.leads.lost_no_reasons', 'There are no lost reasons yet. A manager adds them under Settings → Pipelines.')}</Notice>
            )}
            <div className="grid gap-1.5 sm:grid-cols-2">
              {list.map(r => (
                <label key={r.id} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${reason === r.id ? 'border-a-accent bg-a-accent/12 text-a-text' : 'border-a-border text-a-text hover:bg-a-surface-2'}`}>
                  <input type="radio" name="bulk-lost-reason" className="accent-a-accent" checked={reason === r.id} onChange={() => setReason(r.id)} />
                  {r.label}
                </label>
              ))}
            </div>
            {tried && !reason && <p className="mt-1 text-xs text-a-danger">{t('crm.leads.lost_pick', 'Choose a reason.')}</p>}
          </fieldset>
        )}
        <Field label={t('crm.leads.close_note', 'Note (optional)')}>
          <TextArea rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={close.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button variant={kind === 'lost' ? 'danger' : 'primary'} type="submit" loading={close.isPending} disabled={kind === 'lost' && list.length === 0}>
            {kind === 'won' ? t('crm.leads.won_confirm', 'Mark won') : t('crm.leads.lost_confirm', 'Mark lost')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
