import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { INPUT, TextField } from '../brand/inputs'
import { useApi, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { DateKey, OwnKeyDate, OwnKind } from '../lib/types'
import { Dialog } from '../ui/Dialog'
import { keyDateBody, keyDateForm, keyDateProblem, type KeyDateForm } from './keyDateMath'

/**
 * A new or existing event or note (spec 2026-10-16 §3.1): a title, details, a first day and — for an event — a last day
 * (31 days at most). Anyone on the team saves or deletes it; the Plan is read again after.
 */
export function KeyDateEditor({ kind, keyDate, day, onClose }: { kind: OwnKind; keyDate: OwnKeyDate | null; day: DateKey; onClose: () => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<KeyDateForm>(() => keyDateForm(keyDate, day))
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string) => t(`content.keydates.${key}`, english)
  const fail = (code: string) => {
    const [key, text] = errorKey('keydate', code)
    setError(t(key, text))
  }
  const finish = async () => {
    await queryClient.invalidateQueries({ queryKey: ['content', brand, 'plan'] })
    onClose()
  }

  const save = async () => {
    const problem = keyDateProblem(kind, form)
    if (problem) {
      fail(problem)
      return
    }
    const body = keyDateBody(kind, form, keyDate)
    setBusy('save')
    setError(null)
    try {
      if (keyDate === null) await api.createKeyDate({ ...body, kind, title: form.title.trim(), start_date: form.start })
      else if (Object.keys(body).length > 0) await api.updateKeyDate(keyDate.id, body)
      await finish()
    } catch (e) {
      fail(failureOf(e).code)
      setBusy(null)
    }
  }
  const remove = async () => {
    if (keyDate === null) return
    setBusy('delete')
    setError(null)
    try {
      await api.deleteKeyDate(keyDate.id)
      await finish()
    } catch (e) {
      fail(failureOf(e).code)
      setBusy(null)
    }
  }

  const title = keyDate
    ? (kind === 'event' ? w('edit_event', 'Event') : w('edit_note', 'Note'))
    : (kind === 'event' ? w('new_event', 'New event') : w('new_note', 'New note'))
  return (
    <Dialog title={title} onClose={onClose} busy={busy !== null}>
      <div className="space-y-3">
        <TextField label={w('title_field', 'Title')} value={form.title} maxLength={120} required onChange={(value) => setForm({ ...form, title: value })} />
        <TextField label={w('details', 'Details (optional)')} value={form.details} maxLength={1000} rows={3} onChange={(value) => setForm({ ...form, details: value })} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{kind === 'event' ? w('first_day', 'First day') : w('on_day', 'Day')}</span>
            <input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={`${INPUT} border-a-border`} />
          </label>
          {kind === 'event' && (
            <label className="block min-w-0">
              <span className="mb-1 block text-xs font-medium text-a-text-2">{w('last_day', 'Last day (optional)')}</span>
              <input type="date" value={form.end} min={form.start} onChange={(e) => setForm({ ...form, end: e.target.value })} className={`${INPUT} border-a-border`} />
            </label>
          )}
        </div>
        {kind === 'note' && <p className="text-xs text-a-text-2">{w('note_hint', 'Notes are for the team: the AI never sees them.')}</p>}
        {error && <Notice tone="danger">{error}</Notice>}
        {asking ? (
          <div role="alert" className="space-y-2 rounded-lg border border-a-danger/30 bg-a-danger/10 p-3">
            <p className="text-sm text-a-text">{w('delete_confirm', 'Delete this for everyone on the team?')}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="danger" loading={busy === 'delete'} onClick={() => { void remove() }}>{w('delete_yes', 'Delete')}</Button>
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setAsking(false)}>{t('content.common.cancel', 'Cancel')}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { void save() }} loading={busy === 'save'}>{t('content.brand.save', 'Save')}</Button>
            <Button variant="secondary" disabled={busy !== null} onClick={onClose}>{t('content.common.cancel', 'Cancel')}</Button>
            {keyDate && <Button variant="ghost" disabled={busy !== null} onClick={() => setAsking(true)}>{w('delete', 'Delete')}</Button>}
          </div>
        )}
      </div>
    </Dialog>
  )
}
