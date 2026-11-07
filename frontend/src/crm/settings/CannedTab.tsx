import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, MessageSquareReply, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { TextArea, TextInput } from '../ui/inputs'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { CANNED_LIMITS, canAddReply, cannedList, cannedPayload, cannedProblems, cannedValid, sameCanned, type CannedReply } from './canned'
import { moveItem, removeAt } from './lists'
import { IconButton, Problem, ReadOnlyNote, SaveBar } from './parts'

const KEY = ['crm', 'settings', 'canned'] as const

/**
 * Canned replies (chat-inbox-canned): short answers anyone in the inbox inserts with one tap. Edited as one list —
 * add, change, reorder, delete — and saved together. A manager's to change (`staff.can.manage_canned`).
 */
export function CannedTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const query = useQuery({ queryKey: KEY, queryFn: () => get<{ canned_responses: CannedReply[] }>('chat-inbox-canned') })
  const saved = useMemo(() => cannedList(query.data), [query.data])
  const [draft, setDraft] = useState<CannedReply[] | null>(null)
  const list = draft ?? saved
  const dirty = draft !== null && !sameCanned(draft, saved)
  const problems = cannedProblems(list)
  const problem = (index: number, field: 'label' | 'text') => problems.find(p => p.index === index && p.field === field)
  const change = (next: CannedReply[]) => setDraft(next)

  const save = useMutation({
    mutationFn: () => send<{ canned_responses: CannedReply[] }>('put', 'chat-inbox-canned', cannedPayload(list)),
    onSuccess: data => {
      qc.setQueryData(KEY, data)
      void qc.invalidateQueries({ queryKey: ['crm', 'inbox'] })
      setDraft(null)
      say(t('crm.settings.canned.saved', 'Saved. The inbox offers these replies now.'))
    },
    onError: error => say(errorText(t, error), 'danger'),
  })

  const add = () => change([...list, { label: '', text: '' }])

  return (
    <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-a-text-2">{t('crm.settings.canned.line', 'Short answers your team inserts in the inbox with one tap. Up to {{max}}.', { max: CANNED_LIMITS.count })}</p>
          {canManage && list.length > 0 && (
            <Button variant="secondary" onClick={add} disabled={!canAddReply(list)}><Plus size={15} aria-hidden />{t('crm.settings.canned.add', 'Add a reply')}</Button>
          )}
        </div>
        {!canManage && <ReadOnlyNote />}
        {list.length === 0 ? (
          <Card>
            <EmptyState icon={MessageSquareReply} title={t('crm.settings.canned.empty', 'No canned replies yet')}
              line={t('crm.settings.canned.empty_line', 'e.g. "Opening hours", "Directions", "We will call you back".')}
              action={canManage ? <Button onClick={add}><Plus size={15} aria-hidden />{t('crm.settings.canned.add', 'Add a reply')}</Button> : undefined} />
          </Card>
        ) : (
          <ol className="space-y-3">
            {list.map((reply, i) => (
              <li key={i}>
                <Card>
                  {canManage ? (
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div>
                          <Field label={t('crm.settings.canned.label', 'Name')}>
                            <TextInput value={reply.label} maxLength={CANNED_LIMITS.label} placeholder={t('crm.settings.canned.label_placeholder', 'e.g. Opening hours')}
                              onChange={e => change(list.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))} />
                          </Field>
                          {dirty && problem(i, 'label') && <Problem>{t('crm.settings.canned.label_required', 'Give the reply a short name.')}</Problem>}
                        </div>
                        <div>
                          <Field label={t('crm.settings.canned.text', 'Text')}>
                            <TextArea rows={3} value={reply.text} maxLength={CANNED_LIMITS.text}
                              onChange={e => change(list.map((r, j) => (j === i ? { ...r, text: e.target.value } : r)))} />
                          </Field>
                          {dirty && problem(i, 'text') && <Problem>{t('crm.settings.canned.text_required', 'Write the reply.')}</Problem>}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <IconButton icon={ArrowUp} label={t('crm.settings.move_up', 'Move up')} disabled={i === 0} onClick={() => change(moveItem(list, i, -1))} />
                        <IconButton icon={ArrowDown} label={t('crm.settings.move_down', 'Move down')} disabled={i === list.length - 1} onClick={() => change(moveItem(list, i, 1))} />
                        <IconButton icon={Trash2} danger label={t('crm.settings.canned.remove', 'Remove {{name}}', { name: reply.label || t('crm.settings.canned.this', 'this reply') })} onClick={() => change(removeAt(list, i))} />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-a-text">{reply.label}</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-a-text-2">{reply.text}</p>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ol>
        )}
        {canManage && <SaveBar dirty={dirty} valid={cannedValid(list)} busy={save.isPending} onSave={() => save.mutate()} onDiscard={() => setDraft(null)} />}
      </div>
    </QueryState>
  )
}
