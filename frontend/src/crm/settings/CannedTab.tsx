import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Check, MessageSquareReply, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { IconButton } from '../ui/IconButton'
import { TextArea, TextInput } from '../ui/inputs'
import { ActionMenu } from '../ui/Menu'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { CANNED_LIMITS, canAddReply, cannedList, cannedPayload, cannedProblems, cannedValid, editingAfterRemove, sameCanned, type CannedReply } from './canned'
import { moveItem, removeAt } from './lists'
import { Problem, ReadOnlyNote, SaveBar } from './parts'

const KEY = ['crm', 'settings', 'canned'] as const

/**
 * Canned replies (chat-inbox-canned): short answers anyone in the inbox inserts with one tap. Round 5 (owner 2026-11-12,
 * "minimize copy"): a compact list — each reply's name and its first line — edited in place one at a time; the order
 * and removal in each row's menu; the whole list saved together from the save bar (PUT replaces it). A manager's to
 * change (`staff.can.manage_canned`); staff read them.
 */
export function CannedTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const query = useQuery({ queryKey: KEY, queryFn: () => get<{ canned_responses: CannedReply[] }>('chat-inbox-canned') })
  const saved = useMemo(() => cannedList(query.data), [query.data])
  const [draft, setDraft] = useState<CannedReply[] | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const list = draft ?? saved
  const dirty = draft !== null && !sameCanned(draft, saved)
  const problems = cannedProblems(list)
  const problem = (index: number, field: 'label' | 'text') => problems.find(p => p.index === index && p.field === field)
  const change = (next: CannedReply[]) => setDraft(next)
  const nameOf = (reply: CannedReply) => reply.label || t('crm.settings.canned.this', 'this reply')

  const save = useMutation({
    mutationFn: () => send<{ canned_responses: CannedReply[] }>('put', 'chat-inbox-canned', cannedPayload(list)),
    onSuccess: data => {
      qc.setQueryData(KEY, data)
      void qc.invalidateQueries({ queryKey: ['crm', 'inbox'] })
      setDraft(null)
      setEditing(null)
      say(t('crm.settings.canned.saved', 'Saved. The inbox offers these replies now.'))
    },
    onError: error => say(errorText(t, error), 'danger'),
  })

  const add = () => { change([...list, { label: '', text: '' }]); setEditing(list.length) }
  const remove = (i: number) => { change(removeAt(list, i)); setEditing(e => editingAfterRemove(e, i)) }
  const move = (i: number, dir: -1 | 1) => { change(moveItem(list, i, dir)); setEditing(e => (e === i ? i + dir : e === i + dir ? i : e)) }
  const addButton = (variant: 'primary' | 'secondary') => (
    <Button variant={variant} size="sm" onClick={add} disabled={!canAddReply(list)}>
      <Plus size={14} aria-hidden />{t('crm.common.add', 'Add')}
    </Button>
  )

  return (
    <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }}>
      <div className="space-y-4">
        {!canManage && <ReadOnlyNote />}
        <Card padded={false} title={t('crm.settings.tab.canned', 'Canned replies')} icon={MessageSquareReply} tone="accent"
          description={t('crm.settings.canned.line', 'Short answers your team inserts in the inbox with one tap. Up to {{max}}.', { max: CANNED_LIMITS.count })}
          hint={list.length > 0 ? t('crm.settings.canned.count', '{{count}} of {{max}}', { count: list.length, max: CANNED_LIMITS.count }) : undefined}
          action={canManage && list.length > 0 ? addButton('secondary') : undefined}>
          {list.length === 0 ? (
            <EmptyState icon={MessageSquareReply} title={t('crm.settings.canned.empty', 'No canned replies yet')}
              line={t('crm.settings.canned.empty_line', 'e.g. "Opening hours", "Directions", "We will call you back".')}
              action={canManage ? addButton('primary') : undefined} />
          ) : (
            <ol className="divide-y divide-a-border" aria-label={t('crm.settings.tab.canned', 'Canned replies')}>
              {list.map((reply, i) => {
                const open = canManage && editing === i
                const broken = !!problem(i, 'label') || !!problem(i, 'text')
                if (open) {
                  return (
                    <li key={i} className="space-y-3 bg-a-surface-2/40 px-4 py-3">
                      <div className="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)]">
                        <div className="min-w-0">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-a-text-2">{t('crm.settings.canned.label', 'Name')}</span>
                            <TextInput autoFocus value={reply.label} maxLength={CANNED_LIMITS.label} placeholder={t('crm.settings.canned.label_placeholder', 'e.g. Opening hours')}
                              onChange={e => change(list.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))} />
                          </label>
                          {problem(i, 'label') && <Problem>{t('crm.settings.canned.label_required', 'Give the reply a short name.')}</Problem>}
                        </div>
                        <div className="min-w-0">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-a-text-2">{t('crm.settings.canned.text', 'Text')}</span>
                            <TextArea rows={3} value={reply.text} maxLength={CANNED_LIMITS.text}
                              onChange={e => change(list.map((r, j) => (j === i ? { ...r, text: e.target.value } : r)))} />
                          </label>
                          {problem(i, 'text') && <Problem>{t('crm.settings.canned.text_required', 'Write the reply.')}</Problem>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <IconButton icon={Trash2} tone="danger" size="sm" label={t('crm.settings.canned.remove', 'Remove {{name}}', { name: nameOf(reply) })} onClick={() => remove(i)} />
                        <Button variant="secondary" size="sm" onClick={() => setEditing(null)}><Check size={14} aria-hidden />{t('crm.settings.canned.done', 'Done')}</Button>
                      </div>
                    </li>
                  )
                }
                return (
                  <li key={i} className="group flex min-h-12 items-center gap-3 px-4 py-2 transition-colors hover:bg-a-surface-2/60">
                    <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-a-surface-2 text-xs font-semibold text-a-text-2">{i + 1}</span>
                    {canManage ? (
                      <button type="button" onClick={() => setEditing(i)} aria-label={t('crm.settings.canned.edit', 'Edit {{name}}', { name: nameOf(reply) })}
                        className="flex min-w-0 flex-1 flex-col rounded-sm text-left focus-visible:outline-2 focus-visible:outline-a-accent sm:flex-row sm:items-baseline sm:gap-3">
                        <span className="shrink-0 truncate text-sm font-medium text-a-text sm:w-48">{reply.label || <span className="text-a-text-2">{t('crm.settings.canned.untitled', 'No name')}</span>}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-a-text-2">{reply.text}</span>
                      </button>
                    ) : (
                      <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
                        <span className="shrink-0 truncate text-sm font-medium text-a-text sm:w-48">{reply.label}</span>
                        <span className="min-w-0 flex-1 whitespace-pre-line text-sm text-a-text-2 line-clamp-2">{reply.text}</span>
                      </div>
                    )}
                    {broken && (
                      <span className="shrink-0" title={t('crm.settings.form.flagged', 'needs a fix')}>
                        <span aria-hidden className="block h-2 w-2 rounded-full bg-a-danger" />
                        <span className="sr-only">{t('crm.settings.form.flagged', 'needs a fix')}</span>
                      </span>
                    )}
                    {canManage && (
                      <span className="flex shrink-0 items-center">
                        <IconButton icon={Pencil} size="sm" label={t('crm.settings.canned.edit', 'Edit {{name}}', { name: nameOf(reply) })} onClick={() => setEditing(i)} />
                        <ActionMenu label={t('crm.settings.canned.menu', 'More for {{name}}', { name: nameOf(reply) })} items={[
                          { key: 'up', label: t('crm.settings.canned.move_up', 'Move up'), icon: ArrowUp, disabled: i === 0, onSelect: () => move(i, -1) },
                          { key: 'down', label: t('crm.settings.canned.move_down', 'Move down'), icon: ArrowDown, disabled: i === list.length - 1, onSelect: () => move(i, 1) },
                          'divider',
                          { key: 'remove', label: t('crm.settings.canned.remove_short', 'Remove'), icon: Trash2, danger: true, onSelect: () => remove(i) },
                        ]} />
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </Card>
        {canManage && <SaveBar dirty={dirty} valid={cannedValid(list)} busy={save.isPending} onSave={() => save.mutate()} onDiscard={() => { setDraft(null); setEditing(null) }} />}
      </div>
    </QueryState>
  )
}
