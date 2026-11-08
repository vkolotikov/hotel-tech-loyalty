import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Shapes } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../TimeProvider'
import { errorText } from '../lib/errors'
import { useRefresh } from '../lib/queries'
import { plannerApi } from '../lib/tasks'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { TextInput } from '../ui/inputs'
import { useToast } from '../ui/Toast'
import { Hint, LookPicker, LookTile, RowButtons, SaveBar } from './parts'
import {
  addGroup, groupEntries, groupsPayload, moved, nameProblems, newNameProblem, replaced, sameGroups, without, type GroupEntry, type NameProblem,
} from './settingsLogic'
import { useDraft } from './useDraft'

/**
 * Task types (`planner_groups`, the full admin's "Task groups"): the kinds of work, in their order, each with its icon
 * and colour. Edited as a draft and saved as the whole list `[{name, icon, color}]`; names are unique without regard to
 * case (PlannerCatalogue keeps the first). Removing a type leaves the tasks that have it as they are.
 */
export function TypesSection({ can }: { can: boolean }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const saved = useMemo(() => groupEntries(boot.settings.groups), [boot.settings.groups])
  const draft = useDraft(saved, sameGroups)
  const list = draft.value
  const problems = nameProblems(list.map(g => g.name))
  const [adding, setAdding] = useState('')
  const [picker, setPicker] = useState<number | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const addProblem = adding.trim() ? newNameProblem(adding, list.map(g => g.name)) : null

  const save = useMutation({
    mutationFn: (sent: GroupEntry[]) => plannerApi.saveSetting('planner_groups', groupsPayload(sent)),
    onSuccess: (_, sent) => { draft.sent(sent); refresh(); toast(t('time.common.saved', 'Saved')) },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const off = !can || save.isPending
  const change = (next: GroupEntry[]) => draft.set(next)
  const problemText: Record<NameProblem, string> = {
    empty: t('time.settings.types.problem_empty', 'Give the type a name.'),
    duplicate: t('time.settings.types.problem_duplicate', 'Another type already has this name.'),
  }

  return (
    <div className="space-y-4">
      <Card title={t('time.settings.types.title', 'Task types')} icon={Shapes}
        description={t('time.settings.types.line', 'Your kinds of work, in the planner’s order.')}>
        <div className="space-y-3">
          {list.length === 0 && <p className="py-4 text-center text-sm text-a-text-2">{t('time.settings.types.none', 'No task types yet. Add the first one below.')}</p>}
          <ul className="space-y-2">
            {list.map((g, i) => {
              const label = g.name.trim() || t('time.settings.types.unnamed', 'Unnamed type')
              const problem = problems[i]
              return (
                <li key={i} className="rounded-xl border border-a-border bg-a-surface">
                  <div className="flex items-center gap-1.5 p-2 sm:gap-2">
                    <LookTile icon={g.icon} color={g.color} disabled={off} expanded={picker === i}
                      label={t('time.settings.change_look', 'Icon and colour: {{name}}', { name: label })}
                      onClick={() => setPicker(picker === i ? null : i)} />
                    <TextInput value={g.name} disabled={off} maxLength={80} aria-label={t('time.settings.types.name', 'Type name')}
                      aria-invalid={problem ? true : undefined} className="min-w-0 flex-1"
                      onChange={e => change(replaced(list, i, { ...g, name: e.target.value }))} />
                    {can && (
                      <RowButtons name={label} first={i === 0} last={i === list.length - 1} disabled={off}
                        onUp={() => { setPicker(null); change(moved(list, i, -1)) }}
                        onDown={() => { setPicker(null); change(moved(list, i, 1)) }}
                        onRemove={() => setRemoving(i)} />
                    )}
                  </div>
                  {problem && <p className="px-3 pb-2 text-xs font-medium text-a-danger">{problemText[problem]}</p>}
                  {can && picker === i && (
                    <LookPicker icon={g.icon} color={g.color} onClose={() => setPicker(null)}
                      onIcon={icon => change(replaced(list, i, { ...g, icon }))}
                      onColor={color => change(replaced(list, i, { ...g, color }))} />
                  )}
                </li>
              )
            })}
          </ul>

          {can && (
            <form className="flex items-start gap-2" onSubmit={e => {
              e.preventDefault()
              if (!adding.trim() || addProblem) return
              change(addGroup(list, adding))
              setAdding('')
            }}>
              <div className="min-w-0 flex-1">
                <TextInput value={adding} onChange={e => setAdding(e.target.value)} maxLength={80} disabled={off}
                  aria-label={t('time.settings.types.add_label', 'A new type')} placeholder={t('time.settings.types.add_hint', 'A new type, such as Concierge')} />
                {addProblem === 'duplicate' && <p className="mt-1 text-xs font-medium text-a-danger">{problemText.duplicate}</p>}
              </div>
              <Button type="submit" variant="secondary" disabled={off || !adding.trim() || addProblem !== null}><Plus size={15} aria-hidden />{t('time.common.add', 'Add')}</Button>
            </form>
          )}
          <Hint>{t('time.settings.types.rename_hint', 'Renaming or removing a type leaves the tasks that already have it as they are.')}</Hint>
        </div>
      </Card>

      {can && draft.dirty && (
        <SaveBar busy={save.isPending} onDiscard={() => { setPicker(null); draft.reset() }} onSave={() => save.mutate(list)}
          problem={problems.some(p => p !== null) ? t('time.settings.fix_names', 'Fix the names marked above before saving.') : null} />
      )}

      {removing !== null && list[removing] && (
        <Confirm title={t('time.settings.types.remove_title', 'Remove “{{name}}”?', { name: list[removing].name.trim() || t('time.settings.types.unnamed', 'Unnamed type') })}
          confirm={t('time.settings.remove', 'Remove')}
          onClose={() => setRemoving(null)}
          onConfirm={() => { setPicker(null); change(without(list, removing)); setRemoving(null) }}>
          {t('time.settings.types.remove_line', 'Tasks that already have this type keep it as their text; it is no longer offered for new work once you save.')}
        </Confirm>
      )}
    </div>
  )
}
