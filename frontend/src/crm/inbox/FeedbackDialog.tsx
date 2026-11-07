import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { GraduationCap, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { TextArea, Toggle } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import { feedbackForm, feedbackPayload } from './inboxLogic'
import type { Message } from './types'

/**
 * Rate an AI answer, good or wrong, with a comment; for a wrong one, the answer it should have given — which, with
 * "Teach the assistant", the server saves as an answer it uses from then on (ChatInboxController::submitFeedback).
 */
export function FeedbackDialog({ message, rating, onClose, onSaved }: { message: Message; rating: 'good' | 'bad'; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [form, setForm] = useState(() => feedbackForm(rating, message.feedback))
  const save = useMutation({
    mutationFn: () => send('post', `chat-inbox/messages/${message.id}/feedback`, feedbackPayload(form)),
    onSuccess: () => {
      const body = feedbackPayload(form)
      toast(body.apply_to_training ? t('crm.inbox.feedback_taught', 'Saved. The assistant uses your answer from now on.') : t('crm.inbox.feedback_saved', 'Thank you, your rating is saved.'))
      onSaved()
      onClose()
    },
  })
  const pick = (next: 'good' | 'bad') => setForm(f => ({ ...f, rating: next, apply_to_training: next === 'bad' }))
  const option = (on: boolean) => `inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${on ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`

  return (
    <Dialog title={t('crm.inbox.feedback_title', 'Rate this answer')} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); save.mutate() }}>
        {message.content && <blockquote className="crm-bubble-ai rounded-xl px-3 py-2 text-sm whitespace-pre-wrap">{message.content}</blockquote>}
        <div role="group" aria-label={t('crm.inbox.feedback_title', 'Rate this answer')} className="flex gap-2">
          <button type="button" aria-pressed={form.rating === 'good'} onClick={() => pick('good')} className={option(form.rating === 'good')}><ThumbsUp size={15} aria-hidden />{t('crm.inbox.good', 'Good')}</button>
          <button type="button" aria-pressed={form.rating === 'bad'} onClick={() => pick('bad')} className={option(form.rating === 'bad')}><ThumbsDown size={15} aria-hidden />{t('crm.inbox.wrong', 'Wrong')}</button>
        </div>
        <Field label={t('crm.inbox.feedback_comment', 'Comment (optional)')}>
          <TextArea rows={2} maxLength={5000} value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} />
        </Field>
        {form.rating === 'bad' && (
          <div className="space-y-3 rounded-xl border crm-ai-border p-3">
            <Field label={t('crm.inbox.feedback_correct', 'What should the assistant have said?')} hint={t('crm.inbox.feedback_correct_hint', 'Write the answer as you would give it to a visitor.')}>
              <TextArea rows={4} maxLength={10000} value={form.corrected_answer} onChange={e => setForm(f => ({ ...f, corrected_answer: e.target.value }))} />
            </Field>
            <div className="flex items-start gap-2">
              <GraduationCap size={16} aria-hidden className="mt-0.5 shrink-0 crm-ai-text" />
              <Toggle label={t('crm.inbox.feedback_teach', 'Teach the assistant this answer')} checked={form.apply_to_training} disabled={!form.corrected_answer.trim()}
                hint={t('crm.inbox.feedback_teach_hint', 'Saved with the visitor\'s question in the assistant\'s answers.')}
                onChange={on => setForm(f => ({ ...f, apply_to_training: on }))} />
            </div>
          </div>
        )}
        {save.isError && <Notice tone="danger">{errorText(t, save.error)}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" loading={save.isPending}>{t('crm.common.save', 'Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
