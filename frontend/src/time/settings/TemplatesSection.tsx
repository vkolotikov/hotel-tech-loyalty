import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { useBoot } from '../TimeProvider'
import { errorText } from '../lib/errors'
import { duration } from '../lib/format'
import { useRefresh, useTemplates } from '../lib/queries'
import { PRIORITIES, plannerApi, priorityOf, type Priority } from '../lib/tasks'
import type { Template } from '../lib/types'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { Select, TextArea, TextInput } from '../ui/inputs'
import { QueryState } from '../ui/QueryState'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { LookTile } from './parts'
import {
  categoriesOf, channelOf, channelsFor, lookOf, templateFormOf, templateGroups, templatePayload, templateProblem, withType,
  type TemplateForm, type TemplateProblem,
} from './settingsLogic'

/**
 * Templates (`planner/templates`, the full admin's "Task templates"): ready-made tasks anyone starts from in the task
 * form, by category. Everyone's, as in the full admin (`manage_templates`); added and changed in a side panel, deleted
 * after a Confirm, all through the full admin's own endpoints.
 */
export function TemplatesSection({ can }: { can: boolean }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const templates = useTemplates()
  const [editing, setEditing] = useState<Template | 'new' | null>(null)
  const [removing, setRemoving] = useState<Template | null>(null)
  const units = { h: t('time.common.h', 'h'), min: t('time.common.min', 'min') }
  const priorityLabel: Record<Priority, string> = {
    High: t('time.priority.high', 'High'), Normal: t('time.priority.normal', 'Normal'), Low: t('time.priority.low', 'Low'),
  }
  const list = templates.data ?? []
  const groups = templateGroups(list)

  const remove = useMutation({
    mutationFn: (tpl: Template) => plannerApi.removeTemplate(tpl.id),
    onSuccess: () => { setRemoving(null); refresh(); toast(t('time.settings.templates.deleted', 'Template deleted')) },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const add = can
    ? <Button size="sm" onClick={() => setEditing('new')}><Plus size={14} aria-hidden />{t('time.settings.templates.new', 'New template')}</Button>
    : undefined

  return (
    <Card title={t('time.settings.templates.title', 'Templates')} icon={ClipboardList} action={list.length > 0 ? add : undefined}
      description={t('time.settings.templates.line', 'Ready-made tasks to start from.')}>
      <QueryState loading={templates.isLoading} error={templates.error} onRetry={() => void templates.refetch()} rows={3}>
        {list.length === 0 ? (
          <EmptyState icon={ClipboardList} title={t('time.settings.templates.none', 'No templates yet')}
            line={t('time.settings.templates.none_line', 'Save the tasks you plan again and again: a morning briefing, a room check, a weekly order.')} action={add} />
        ) : (
          <div className="space-y-5">
            {groups.map(group => (
              <section key={group.category} aria-label={group.category}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-a-text-2">{group.category}</h3>
                <ul className="grid gap-2 md:grid-cols-2">
                  {group.items.map(tpl => {
                    const look = lookOf(tpl.task_group, boot.settings.groups)
                    const task = channelOf(tpl.task_category, boot.settings.channels)?.label ?? tpl.task_category
                    const priority = priorityOf(tpl.priority)
                    const facts = [tpl.task_group, task, tpl.duration_minutes ? duration(tpl.duration_minutes, units) : null, priority !== 'Normal' ? priorityLabel[priority] : null]
                      .filter((x): x is string => !!x)
                    return (
                      <li key={tpl.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-a-border bg-a-surface p-2.5">
                        <LookTile icon={tpl.task_group ? look.icon : 'clipboard-list'} color={tpl.task_group ? look.color : '#94a3b8'} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-a-text">{tpl.name}</p>
                          <p className="truncate text-xs text-a-text-2">{facts.length > 0 ? facts.join(' · ') : tpl.title}</p>
                        </div>
                        {can && (
                          <div className="flex shrink-0">
                            <button type="button" onClick={() => setEditing(tpl)} aria-label={t('time.settings.templates.edit_named', 'Edit: {{name}}', { name: tpl.name })}
                              className="grid h-9 w-9 place-items-center rounded-lg text-a-text-2 hover:bg-a-surface-2 hover:text-a-text"><Pencil size={15} aria-hidden /></button>
                            <button type="button" onClick={() => setRemoving(tpl)} aria-label={t('time.settings.templates.delete_named', 'Delete: {{name}}', { name: tpl.name })}
                              className="grid h-9 w-9 place-items-center rounded-lg text-a-text-2 hover:bg-a-surface-2 hover:text-a-danger"><Trash2 size={15} aria-hidden /></button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </QueryState>

      {editing && <TemplatePanel template={editing === 'new' ? null : editing} categories={categoriesOf(list)} onClose={() => setEditing(null)} />}
      {removing && (
        <Confirm title={t('time.settings.templates.delete_title', 'Delete “{{name}}”?', { name: removing.name })} confirm={t('time.common.delete', 'Delete')}
          busy={remove.isPending} onClose={() => setRemoving(null)} onConfirm={() => remove.mutate(removing)}>
          {t('time.settings.templates.delete_line', 'Tasks made from it stay as they are. The full admin’s planner loses it too.')}
        </Confirm>
      )}
    </Card>
  )
}

/** A template's form in a side panel: its name, the task it makes, its category, type, task, priority, length and words. */
function TemplatePanel({ template, categories, onClose }: { template: Template | null; categories: string[]; onClose: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const refresh = useRefresh()
  const channels = boot.settings.channels
  const [form, setForm] = useState<TemplateForm>(() => templateFormOf(template, channels))
  const [tried, setTried] = useState(false)
  const problem = templateProblem(form)
  const offered = channelsFor(form.task_group, channels)
  const set = <K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) => setForm(f => ({ ...f, [key]: value }))
  const priorityLabel: Record<Priority, string> = {
    High: t('time.priority.high', 'High'), Normal: t('time.priority.normal', 'Normal'), Low: t('time.priority.low', 'Low'),
  }
  const problemText: Record<TemplateProblem, string> = {
    name: t('time.settings.templates.problem_name', 'Give the template a name.'),
    title: t('time.settings.templates.problem_title', 'Give the task it makes a title.'),
    duration: t('time.settings.templates.problem_duration', 'The length is a whole number of minutes, from 1.'),
  }

  const save = useMutation({
    mutationFn: () => {
      const body = templatePayload(form)
      return template ? plannerApi.updateTemplate(template.id, body) : plannerApi.createTemplate(body)
    },
    onSuccess: () => { refresh(); toast(t('time.common.saved', 'Saved')); onClose() },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const submit = () => {
    setTried(true)
    if (!problem) save.mutate()
  }

  return (
    <SidePanel title={template ? t('time.settings.templates.edit', 'Edit template') : t('time.settings.templates.new', 'New template')} onClose={onClose}
      footer={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          {tried && problem && <p className="mr-auto text-sm text-a-danger">{problemText[problem]}</p>}
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('time.common.cancel', 'Cancel')}</Button>
          <Button onClick={submit} loading={save.isPending}>{t('time.common.save', 'Save')}</Button>
        </div>
      )}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit() }}>
        <Field label={t('time.settings.templates.name', 'Template name')}>
          <TextInput value={form.name} maxLength={120} required aria-invalid={tried && problem === 'name' ? true : undefined}
            placeholder={t('time.settings.templates.name_hint', 'Morning briefing')} onChange={e => set('name', e.target.value)} />
        </Field>
        <Field label={t('time.settings.templates.task_title', 'Task title')} hint={t('time.settings.templates.task_title_hint', 'What the task is called when someone starts from this template.')}>
          <TextInput value={form.title} maxLength={200} required aria-invalid={tried && problem === 'title' ? true : undefined}
            onChange={e => set('title', e.target.value)} />
        </Field>
        <Field label={t('time.settings.templates.category', 'Category')} hint={t('time.settings.templates.category_hint', 'Templates are listed by category.')}>
          <TextInput value={form.category} maxLength={80} list="time-template-categories" onChange={e => set('category', e.target.value)} />
          <datalist id="time-template-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('time.settings.templates.type', 'Type')}>
            <Select value={form.task_group} onChange={e => setForm(f => withType(f, e.target.value, channels))}>
              <option value="">{t('time.settings.templates.no_type', 'No type')}</option>
              {boot.settings.groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
              {form.task_group && !boot.settings.groups.some(g => g.name === form.task_group) && <option value={form.task_group}>{form.task_group}</option>}
            </Select>
          </Field>
          <Field label={t('time.settings.templates.task', 'Task')}>
            <Select value={form.task_category} onChange={e => set('task_category', e.target.value)}>
              <option value="">{t('time.settings.templates.no_task', 'No task')}</option>
              {offered.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              {form.task_category && !offered.some(c => c.key === form.task_category) && <option value={form.task_category}>{channelOf(form.task_category, channels)?.label ?? form.task_category}</option>}
            </Select>
          </Field>
          <Field label={t('time.settings.templates.priority', 'Priority')}>
            <Select value={form.priority} onChange={e => set('priority', priorityOf(e.target.value))}>
              {PRIORITIES.map(p => <option key={p} value={p}>{priorityLabel[p]}</option>)}
            </Select>
          </Field>
          <Field label={t('time.settings.templates.duration', 'Length in minutes')}>
            <TextInput type="number" inputMode="numeric" min={1} step={5} value={form.duration} placeholder="30"
              aria-invalid={tried && problem === 'duration' ? true : undefined} onChange={e => set('duration', e.target.value)} />
          </Field>
        </div>
        <Field label={t('time.settings.templates.description', 'Description')}>
          <TextArea rows={3} value={form.description} onChange={e => set('description', e.target.value)}
            placeholder={t('time.settings.templates.description_hint', 'What the task involves (optional)')} />
        </Field>
        <button type="submit" className="sr-only">{t('time.common.save', 'Save')}</button>
      </form>
    </SidePanel>
  )
}
