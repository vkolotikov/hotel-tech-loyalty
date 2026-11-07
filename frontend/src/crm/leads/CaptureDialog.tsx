import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { failureOf, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { TextArea } from '../ui/inputs'
import { FeatureLocked } from '../ui/QueryState'
import { useLeadSettings } from './leadData'
import type { LeadDraft } from './leadLogic'
import { captureText, draftFromCapture } from './listLogic'
import type { CaptureAnswer } from './leadTypes'

/**
 * A lead from a pasted message (the main platform's AI capture, `POST crm-ai/capture-lead`): the AI reads an email, a
 * WhatsApp or a phone note and fills in the lead form; nothing is saved until the person checks the form and adds it.
 */
export function CaptureDialog({ onClose, onRead }: { onClose: () => void; onRead: (draft: LeadDraft) => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const settings = useLeadSettings()
  const [raw, setRaw] = useState('')
  const [empty, setEmpty] = useState(false)
  const [failed, setFailed] = useState(false)
  const body = captureText(raw)
  const read = useMutation({
    mutationFn: () => {
      if (!body) throw new Error('nothing to read')
      return send<CaptureAnswer>('post', 'crm-ai/capture-lead', { text: body })
    },
    onSuccess: answer => {
      // A refusal or a provider failure answers 200 with `success: false` and the provider's own text in `error`: that
      // text is never shown, the sentence is ours.
      if (!answer?.success) { setFailed(true); return }
      const draft = draftFromCapture(answer, {
        owner: boot.staff.name, priorities: settings.priorities, sources: settings.sources, types: settings.types,
        hotel: boot.organization.industry === 'hotel',
      })
      if (draft) onRead(draft)
      else setEmpty(true)
    },
  })
  const locked = read.isError && failureOf(read.error).code === 'feature_locked'
  return (
    <Dialog title={t('crm.leads.capture_title', 'A lead from a message')} onClose={onClose} busy={read.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); setEmpty(false); setFailed(false); if (body) read.mutate() }}>
        <p className="text-sm text-a-text-2">{t('crm.leads.capture_line', 'Paste an email, a WhatsApp or your notes from a call. The AI fills in the lead form; you check it and add it.')}</p>
        {locked ? <FeatureLocked /> : read.isError && <Notice tone="danger">{errorText(t, read.error)}</Notice>}
        {failed && <Notice tone="danger">{t('crm.errors.ai_failed', 'The AI could not help just now. Please try again in a moment.')}</Notice>}
        {empty && <Notice tone="warning">{t('crm.leads.capture_none', 'The AI could not find a lead in this text. Add more of the message, or fill in the form yourself.')}</Notice>}
        <label className="block">
          <span className="sr-only">{t('crm.leads.capture_box', 'The message')}</span>
          <TextArea rows={9} value={raw} onChange={e => setRaw(e.target.value)} maxLength={10_000} autoFocus
            placeholder={t('crm.leads.capture_hint', 'Hello, we are a group of 12 and would like a quote for…')} />
        </label>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={read.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <button type="submit" disabled={!body || read.isPending}
            className="crm-ai-fill inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent">
            <Sparkles size={15} aria-hidden />{read.isPending ? t('crm.leads.capture_reading', 'Reading…') : t('crm.leads.capture_go', 'Fill in the form')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
