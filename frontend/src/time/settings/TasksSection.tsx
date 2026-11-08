import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ListChecks, Plus } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../TimeProvider'
import { errorText } from '../lib/errors'
import { useRefresh } from '../lib/queries'
import { plannerApi } from '../lib/tasks'
import type { ChannelDef } from '../lib/types'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { TextInput } from '../ui/inputs'
import { Pill } from '../ui/Pill'
import { useToast } from '../ui/Toast'
import { Hint, LookPicker, LookTile, RowButtons, SaveBar } from './parts'
import {
  addChannel, channelsPayload, moved, nameProblems, newNameProblem, replaced, sameChannels, toggleType, typeChips, without, type NameProblem,
} from './settingsLogic'
import { useDraft } from './useDraft'

/**
 * Tasks (`planner_channels`, the full admin's "Tasks"): what each type of work consists of — a label, an icon, a colour
 * and the types it belongs to (none = every type). A task's key is made from its first label and kept when it is
 * renamed, so the tasks and templates that name it still match. Edited as a draft, saved as the whole list.
 */
export function TasksSection({ can }: { can: boolean }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const saved = boot.settings.channels
  const types = useMemo(() => boot.settings.groups.map(g => g.name), [boot.settings.groups])
  const draft = useDraft(saved, sameChannels)
  const list = draft.value
  const problems = nameProblems(list.map(c => c.label))
  const [adding, setAdding] = useState('')
  const [picker, setPicker] = useState<number | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const addProblem = adding.trim() ? newNameProblem(adding, list.map(c => c.label)) : null

  const save = useMutation({
    mutationFn: (sent: ChannelDef[]) => plannerApi.saveSetting('planner_channels', channelsPayload(sent)),
    onSuccess: (_, sent) => { draft.sent(sent); refresh(); toast(t('time.common.saved', 'Saved')) },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const off = !can || save.isPending
  const change = (next: ChannelDef[]) => draft.set(next)
  const problemText: Record<NameProblem, string> = {
    empty: t('time.settings.tasks.problem_empty', 'Give the task a name.'),
    duplicate: t('time.settings.tasks.problem_duplicate', 'Another task already has this name.'),
  }

  return (
    <div className="space-y-4">
      <Card title={t('time.settings.tasks.title', 'Tasks')} icon={ListChecks}
        description={t('time.settings.tasks.line', 'What each type of work consists of.')}>
        <div className="space-y-3">
          {list.length === 0 && <p className="py-4 text-center text-sm text-a-text-2">{t('time.settings.tasks.none', 'No tasks yet. Add the first one below, then tag it with the types it belongs to.')}</p>}
          <ul className="space-y-2">
            {list.map((c, i) => {
              const label = c.label.trim() || t('time.settings.tasks.unnamed', 'Unnamed task')
              const problem = problems[i]
              const chips = typeChips(c, types)
              return (
                <li key={i} className="rounded-xl border border-a-border bg-a-surface">
                  <div className="flex items-center gap-1.5 p-2 sm:gap-2">
                    <LookTile icon={c.icon} color={c.color} disabled={off} expanded={picker === i}
                      label={t('time.settings.change_look', 'Icon and colour: {{name}}', { name: label })}
                      onClick={() => setPicker(picker === i ? null : i)} />
                    <TextInput value={c.label} disabled={off} maxLength={120} aria-label={t('time.settings.tasks.name', 'Task name')}
                      aria-invalid={problem ? true : undefined} className="min-w-0 flex-1"
                      onChange={e => change(replaced(list, i, { ...c, label: e.target.value }))} />
                    <span title={t('time.settings.tasks.key_hint', 'Its key: kept when you rename it, so tasks that name it still match')}
                      className="hidden max-w-32 truncate rounded-md bg-a-surface-2 px-1.5 py-0.5 font-mono text-xs text-a-text-2 sm:inline">{c.key}</span>
                    {can && (
                      <RowButtons name={label} first={i === 0} last={i === list.length - 1} disabled={off}
                        onUp={() => { setPicker(null); change(moved(list, i, -1)) }}
                        onDown={() => { setPicker(null); change(moved(list, i, 1)) }}
                        onRemove={() => setRemoving(i)} />
                    )}
                  </div>
                  {problem && <p className="px-3 pb-2 text-xs font-medium text-a-danger">{problemText[problem]}</p>}
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-a-border px-3 py-2">
                    <span className="mr-1 text-xs text-a-text-2">{t('time.settings.tasks.for_types', 'For')}</span>
                    {chips.length === 0 && <span className="text-xs text-a-text-2">{t('time.settings.tasks.no_types', 'Add task types first to tag tasks with them.')}</span>}
                    {chips.map(type => {
                      const on = c.groups.includes(type)
                      return (
                        <button key={type} type="button" aria-pressed={on} disabled={off} onClick={() => change(replaced(list, i, toggleType(c, type)))}
                          className={`inline-flex min-h-8 items-center rounded-full border px-2.5 text-xs font-medium transition-colors disabled:opacity-60 ${on ? 'border-a-accent bg-a-accent/12 text-a-accent-text' : 'border-a-border text-a-text-2 hover:text-a-text'} ${types.includes(type) ? '' : 'line-through'}`}>
                          {type}
                        </button>
                      )
                    })}
                    {c.groups.length === 0 && chips.length > 0 && <Pill tone="accent">{t('time.settings.tasks.every_type', 'Every type')}</Pill>}
                  </div>
                  {can && picker === i && (
                    <LookPicker icon={c.icon} color={c.color} onClose={() => setPicker(null)}
                      onIcon={icon => change(replaced(list, i, { ...c, icon }))}
                      onColor={color => change(replaced(list, i, { ...c, color }))} />
                  )}
                </li>
              )
            })}
          </ul>

          {can && (
            <form className="flex items-start gap-2" onSubmit={e => {
              e.preventDefault()
              if (!adding.trim() || addProblem) return
              change(addChannel(list, adding))
              setAdding('')
            }}>
              <div className="min-w-0 flex-1">
                <TextInput value={adding} onChange={e => setAdding(e.target.value)} maxLength={120} disabled={off}
                  aria-label={t('time.settings.tasks.add_label', 'A new task')} placeholder={t('time.settings.tasks.add_hint', 'A new task, such as Room check or Site visit')} />
                {addProblem === 'duplicate' && <p className="mt-1 text-xs font-medium text-a-danger">{problemText.duplicate}</p>}
              </div>
              <Button type="submit" variant="secondary" disabled={off || !adding.trim() || addProblem !== null}><Plus size={15} aria-hidden />{t('time.common.add', 'Add')}</Button>
            </form>
          )}
          <Hint>{t('time.settings.tasks.types_hint', 'Tag a task with the types it belongs to; a task with no type is offered for every type.')}</Hint>
        </div>
      </Card>

      {can && draft.dirty && (
        <SaveBar busy={save.isPending} onDiscard={() => { setPicker(null); draft.reset() }} onSave={() => save.mutate(list)}
          problem={problems.some(p => p !== null) ? t('time.settings.fix_names', 'Fix the names marked above before saving.') : null} />
      )}

      {removing !== null && list[removing] && (
        <Confirm title={t('time.settings.tasks.remove_title', 'Remove “{{name}}”?', { name: list[removing].label.trim() || t('time.settings.tasks.unnamed', 'Unnamed task') })}
          confirm={t('time.settings.remove', 'Remove')}
          onClose={() => setRemoving(null)}
          onConfirm={() => { setPicker(null); change(without(list, removing)); setRemoving(null) }}>
          {t('time.settings.tasks.remove_line', 'Planner tasks that already name it keep it; it is no longer offered in the task form once you save.')}
        </Confirm>
      )}
    </div>
  )
}
