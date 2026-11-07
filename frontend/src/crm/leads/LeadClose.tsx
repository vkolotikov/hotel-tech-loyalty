import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { TextArea } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import { useLeadChanged, useLostReasons } from './leadData'
import { lostBody, wonBody } from './leadLogic'
import type { LostGuess } from './leadTypes'
import { confidenceLabel } from './leadWords'

/** Close a lead as won (`POST inquiries/{id}/won`): the won stage, a timeline entry with the note. */
export function WonDialog({ leadId, name, onClose, onDone }: { leadId: number; name: string; onClose: () => void; onDone?: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const changed = useLeadChanged()
  const [note, setNote] = useState('')
  const won = useMutation({
    mutationFn: () => send<{ reservation?: unknown }>('post', `inquiries/${leadId}/won`, wonBody(note)),
    onSuccess: result => {
      changed()
      toast(result.reservation ? t('crm.leads.won_booked', 'Marked won. A booking was made from it.') : t('crm.leads.won_done', 'Marked won'))
      onDone?.()
      onClose()
    },
  })
  return (
    <Dialog title={t('crm.leads.won_title', 'Mark {{name}} as won', { name })} onClose={onClose} busy={won.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); won.mutate() }}>
        <p className="text-sm text-a-text-2">{t('crm.leads.won_line', 'The lead moves to the won stage and becomes a deal.')}</p>
        {won.isError && <Notice tone="danger">{errorText(t, won.error)}</Notice>}
        <Field label={t('crm.leads.close_note', 'Note (optional)')}>
          <TextArea rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder={t('crm.leads.won_placeholder', 'What sealed it')} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={won.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" loading={won.isPending}>{t('crm.leads.won_confirm', 'Mark won')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

/**
 * Close a lead as lost (`POST inquiries/{id}/lost`): a reason from the organisation's list is required; the AI can
 * suggest one from the timeline (`guess-lost-reason`), which a person still confirms.
 */
export function LostDialog({ leadId, name, onClose, onDone }: { leadId: number; name: string; onClose: () => void; onDone?: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const changed = useLeadChanged()
  const reasons = useLostReasons()
  const [reason, setReason] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const [guessed, setGuessed] = useState<LostGuess | null>(null)

  const guess = useMutation({
    mutationFn: () => send<LostGuess>('post', `inquiries/${leadId}/guess-lost-reason`),
    onSuccess: result => {
      setGuessed(result)
      if (result.lost_reason_id) setReason(result.lost_reason_id)
    },
  })
  const lost = useMutation({
    mutationFn: () => {
      const body = lostBody(reason, note)
      if (!body) throw new Error('no reason')
      return send('post', `inquiries/${leadId}/lost`, body)
    },
    onSuccess: () => {
      changed()
      toast(t('crm.leads.lost_done', 'Marked lost. The contact stays in Contacts.'))
      onDone?.()
      onClose()
    },
  })
  const submit = () => {
    setTried(true)
    if (!reason) return
    lost.mutate()
  }
  const list = reasons.data ?? []
  const guessFailed = guess.isError || (guessed && !guessed.lost_reason_id)

  return (
    <Dialog title={t('crm.leads.lost_title', 'Mark {{name}} as lost', { name })} onClose={onClose} busy={lost.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit() }}>
        {lost.isError && <Notice tone="danger">{errorText(t, lost.error)}</Notice>}
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-a-text-2">{t('crm.leads.lost_reason', 'Why was it lost?')}</legend>
          {reasons.isLoading && <p className="text-sm text-a-text-2">{t('crm.common.loading', 'Loading…')}</p>}
          {reasons.isError && <Notice tone="danger">{errorText(t, reasons.error)}</Notice>}
          {!reasons.isLoading && list.length === 0 && !reasons.isError && (
            <Notice tone="warning">{t('crm.leads.lost_no_reasons', 'There are no lost reasons yet. A manager adds them under Settings → Pipelines.')}</Notice>
          )}
          <div className="grid gap-1.5 sm:grid-cols-2">
            {list.map(r => (
              <label key={r.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${reason === r.id ? 'border-a-accent bg-a-accent/12 text-a-text' : 'border-a-border text-a-text hover:bg-a-surface-2'}`}>
                <input type="radio" name="lost-reason" className="accent-a-accent" checked={reason === r.id} onChange={() => setReason(r.id)} />
                {r.label}
              </label>
            ))}
          </div>
          {tried && !reason && <p className="mt-1 text-xs text-a-danger">{t('crm.leads.lost_pick', 'Choose a reason.')}</p>}
        </fieldset>

        {list.length > 0 && (
          <div className="crm-ai-border rounded-xl border p-3">
            <button type="button" onClick={() => guess.mutate()} disabled={guess.isPending}
              className="crm-ai-soft inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium disabled:opacity-60">
              <Sparkles size={14} aria-hidden />{guess.isPending ? t('crm.leads.lost_guessing', 'Reading the timeline…') : t('crm.leads.lost_guess', 'Suggest a reason with AI')}
            </button>
            {guessed?.lost_reason_id && (
              <p className="mt-2 text-sm text-a-text">
                <span className="crm-ai-text font-medium">{t('crm.leads.lost_guessed', 'Suggested: {{label}} ({{confidence}})', { label: guessed.label ?? '', confidence: confidenceLabel(t, guessed.confidence) })}</span>
                {guessed.reasoning && <span className="mt-0.5 block text-a-text-2">{guessed.reasoning}</span>}
              </p>
            )}
            {guessFailed && <p className="mt-2 text-sm text-a-text-2">{guess.isError ? errorText(t, guess.error) : t('crm.leads.lost_guess_none', 'The AI could not tell. Choose a reason yourself.')}</p>}
          </div>
        )}

        <Field label={t('crm.leads.close_note', 'Note (optional)')}>
          <TextArea rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder={t('crm.leads.lost_placeholder', 'What they chose instead, what would win them next time')} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={lost.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button variant="danger" type="submit" loading={lost.isPending} disabled={list.length === 0}>{t('crm.leads.lost_confirm', 'Mark lost')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
