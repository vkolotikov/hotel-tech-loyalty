import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, MessageSquareReply, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { TextArea, TextInput } from '../ui/inputs'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { CANNED_LIMITS, canAddReply, cannedList, cannedPayload, cannedProblems, cannedValid, sameCanned, type CannedReply } from './canned'
import { moveItem, removeAt } from './lists'
import { IconButton, ListHead, Problem, ReadOnlyNote, SaveBar, SectionIntro } from './parts'

const KEY = ['crm', 'settings', 'canned'] as const
const COLS = 'md:grid-cols-[2rem_14rem_minmax(0,1fr)_7.5rem]'
const READ_COLS = 'md:grid-cols-[2rem_14rem_minmax(0,1fr)]'

/**
 * Canned replies (chat-inbox-canned): short answers anyone in the inbox inserts with one tap. Edited as one list in
 * one card — add, change, move up or down, remove — and saved together from the save bar. A manager's to change
 * (`staff.can.manage_canned`); staff read them.
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
  const addButton = (variant: 'primary' | 'ghost') => (
    <Button variant={variant} size={variant === 'ghost' ? 'sm' : 'md'} onClick={add} disabled={!canAddReply(list)}>
      <Plus size={variant === 'ghost' ? 14 : 15} aria-hidden />{t('crm.settings.canned.add', 'Add a reply')}
    </Button>
  )

  return (
    <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }}>
      <div className="space-y-4">
        <SectionIntro line={t('crm.settings.canned.line', 'Short answers your team inserts in the inbox with one tap. Up to {{max}}.', { max: CANNED_LIMITS.count })}
          action={canManage && list.length > 0 ? addButton('primary') : undefined} />
        {!canManage && <ReadOnlyNote />}
        <Card padded={false} title={t('crm.settings.tab.canned', 'Canned replies')} icon={MessageSquareReply} tone="accent"
          description={list.length > 0 ? t('crm.settings.canned.count', '{{count}} of {{max}}', { count: list.length, max: CANNED_LIMITS.count }) : undefined}>
          {list.length === 0 ? (
            <EmptyState icon={MessageSquareReply} title={t('crm.settings.canned.empty', 'No canned replies yet')}
              line={t('crm.settings.canned.empty_line', 'e.g. "Opening hours", "Directions", "We will call you back".')}
              action={canManage ? addButton('primary') : undefined} />
          ) : (
            <div role="table" aria-label={t('crm.settings.tab.canned', 'Canned replies')}>
              <ListHead cols={canManage ? COLS : READ_COLS} columns={[
                { label: '#' },
                { label: t('crm.settings.canned.label', 'Name') },
                { label: t('crm.settings.canned.text', 'Text') },
                ...(canManage ? [{ label: t('crm.settings.actions', 'Actions'), srOnly: true }] : []),
              ]} />
              <ol role="rowgroup" className="divide-y divide-a-border">
                {list.map((reply, i) => (
                  <li key={i} role="row" className={`flex flex-col gap-3 px-4 py-3 md:grid md:items-start md:gap-4 ${canManage ? COLS : READ_COLS}`}>
                    <span role="cell" aria-hidden className="hidden h-6 w-6 place-items-center rounded-full bg-a-surface-2 text-xs font-semibold text-a-text-2 md:mt-2 md:grid">{i + 1}</span>
                    {canManage ? (
                      <>
                        <div role="cell" className="min-w-0">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-a-text-2 md:sr-only">{t('crm.settings.canned.label', 'Name')}</span>
                            <TextInput value={reply.label} maxLength={CANNED_LIMITS.label} placeholder={t('crm.settings.canned.label_placeholder', 'e.g. Opening hours')}
                              onChange={e => change(list.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))} />
                          </label>
                          {dirty && problem(i, 'label') && <Problem>{t('crm.settings.canned.label_required', 'Give the reply a short name.')}</Problem>}
                        </div>
                        <div role="cell" className="min-w-0">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-a-text-2 md:sr-only">{t('crm.settings.canned.text', 'Text')}</span>
                            <TextArea rows={2} value={reply.text} maxLength={CANNED_LIMITS.text}
                              onChange={e => change(list.map((r, j) => (j === i ? { ...r, text: e.target.value } : r)))} />
                          </label>
                          {dirty && problem(i, 'text') && <Problem>{t('crm.settings.canned.text_required', 'Write the reply.')}</Problem>}
                        </div>
                        <div role="cell" className="flex justify-end gap-0.5 md:pt-0.5">
                          <IconButton icon={ArrowUp} label={t('crm.settings.canned.up', 'Move {{name}} up', { name: reply.label || t('crm.settings.canned.this', 'this reply') })} disabled={i === 0} onClick={() => change(moveItem(list, i, -1))} />
                          <IconButton icon={ArrowDown} label={t('crm.settings.canned.down', 'Move {{name}} down', { name: reply.label || t('crm.settings.canned.this', 'this reply') })} disabled={i === list.length - 1} onClick={() => change(moveItem(list, i, 1))} />
                          <IconButton icon={Trash2} danger label={t('crm.settings.canned.remove', 'Remove {{name}}', { name: reply.label || t('crm.settings.canned.this', 'this reply') })} onClick={() => change(removeAt(list, i))} />
                        </div>
                      </>
                    ) : (
                      <>
                        <p role="cell" className="min-w-0 text-sm font-medium text-a-text md:pt-2">{reply.label}</p>
                        <p role="cell" className="min-w-0 whitespace-pre-line text-sm text-a-text-2 md:pt-2">{reply.text}</p>
                      </>
                    )}
                  </li>
                ))}
              </ol>
              {canManage && canAddReply(list) && (
                <div className="border-t border-a-border px-4 py-2.5">{addButton('ghost')}</div>
              )}
            </div>
          )}
        </Card>
        {canManage && <SaveBar dirty={dirty} valid={cannedValid(list)} busy={save.isPending} onSave={() => save.mutate()} onDiscard={() => setDraft(null)} />}
      </div>
    </QueryState>
  )
}
