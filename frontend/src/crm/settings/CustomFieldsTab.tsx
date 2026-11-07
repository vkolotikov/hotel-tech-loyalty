import { useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { Select, TextArea, TextInput, Toggle } from '../ui/inputs'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import {
  FIELD_LIMITS, FIELD_TYPES, countsByEntity, createPayload, fieldForm, fieldProblems, fieldsOf, hasOptions, updatePayload,
  type CustomField, type CustomFieldType, type Entity, type FieldForm,
} from './customFields'
import { reorderIds } from './lists'
import { IconButton, Problem, ReadOnlyNote } from './parts'

const KEY = ['crm', 'settings', 'custom-fields'] as const

function fieldsChanged(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: KEY })
  void qc.invalidateQueries({ queryKey: ['crm', 'leads'] })
  void qc.invalidateQueries({ queryKey: ['crm', 'contacts'] })
}

/**
 * Custom fields (custom-fields): the venue's own fields on leads, contacts, companies and tasks — add, rename, reorder,
 * mark required or shown in lists, switch off, delete. A field's kind is fixed once made. A manager's to change.
 */
export function CustomFieldsTab({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [entity, setEntity] = useState<Entity>('inquiry')
  const [editing, setEditing] = useState<CustomField | 'new' | null>(null)
  const [deleting, setDeleting] = useState<CustomField | null>(null)
  const query = useQuery({ queryKey: KEY, queryFn: () => get<CustomField[]>('custom-fields') })
  const all = query.data ?? []
  const fields = fieldsOf(all, entity)
  const counts = countsByEntity(all)
  const typeNames = useTypeNames()

  const reorder = useMutation({
    mutationFn: (order: number[]) => send('post', 'custom-fields/reorder', { entity, order }),
    onMutate: order => {
      qc.setQueryData<CustomField[]>(KEY, list => list?.map(f => (f.entity === entity && order.includes(f.id) ? { ...f, sort_order: order.indexOf(f.id) } : f)))
    },
    onError: error => say(errorText(t, error), 'danger'),
    onSettled: () => fieldsChanged(qc),
  })
  const remove = useMutation({
    mutationFn: (field: CustomField) => send('delete', `custom-fields/${field.id}`),
    onSuccess: () => { fieldsChanged(qc); setDeleting(null); say(t('crm.settings.deleted', 'Deleted')) },
    onError: error => say(errorText(t, error), 'danger'),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-a-text-2">{t('crm.settings.fields.line', 'Your own fields on leads, contacts, companies and tasks, e.g. "Allergies" or "Budget".')}</p>
        {canManage && fields.length > 0 && <Button variant="secondary" onClick={() => setEditing('new')}><Plus size={15} aria-hidden />{t('crm.settings.fields.add', 'Add a field')}</Button>}
      </div>
      {!canManage && <ReadOnlyNote />}
      <Tabs label={t('crm.settings.fields.on', 'Fields on')} value={entity} onChange={setEntity} items={[
        { key: 'inquiry', label: t('crm.settings.fields.inquiry', 'Leads'), count: counts.inquiry },
        { key: 'guest', label: t('crm.settings.fields.guest', 'Contacts'), count: counts.guest },
        { key: 'corporate_account', label: t('crm.settings.fields.company', 'Companies'), count: counts.corporate_account },
        { key: 'task', label: t('crm.settings.fields.task', 'Tasks'), count: counts.task },
      ]} />
      <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }}>
        <Card padded={false}>
          {fields.length === 0 ? (
            <EmptyState icon={SlidersHorizontal} title={t('crm.settings.fields.empty', 'No fields of your own here yet')}
              line={t('crm.settings.fields.empty_line', 'They show on the add form and the record\'s page.')}
              action={canManage ? <Button onClick={() => setEditing('new')}><Plus size={15} aria-hidden />{t('crm.settings.fields.add', 'Add a field')}</Button> : undefined} />
          ) : (
            <ol className="divide-y divide-a-border">
              {fields.map((field, i) => (
                <li key={field.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-a-text">{field.label}</span>
                    <span className="block truncate text-xs text-a-text-2">{typeNames[field.type] ?? field.type}{field.help_text ? ` · ${field.help_text}` : ''}</span>
                  </span>
                  {field.required && <Pill tone="pending">{t('crm.settings.fields.required', 'Required')}</Pill>}
                  {field.show_in_list && <Pill>{t('crm.settings.fields.in_list', 'In lists')}</Pill>}
                  {!field.is_active && <Pill tone="danger">{t('crm.settings.fields.off', 'Off')}</Pill>}
                  {canManage && (
                    <span className="flex shrink-0 items-center">
                      <IconButton icon={ArrowUp} label={t('crm.settings.fields.up', 'Move {{name}} up', { name: field.label })} disabled={i === 0 || reorder.isPending} onClick={() => reorder.mutate(reorderIds(fields, i, -1))} />
                      <IconButton icon={ArrowDown} label={t('crm.settings.fields.down', 'Move {{name}} down', { name: field.label })} disabled={i === fields.length - 1 || reorder.isPending} onClick={() => reorder.mutate(reorderIds(fields, i, 1))} />
                      <IconButton icon={Pencil} label={t('crm.settings.fields.edit', 'Edit {{name}}', { name: field.label })} onClick={() => setEditing(field)} />
                      <IconButton icon={Trash2} danger label={t('crm.settings.fields.delete', 'Delete {{name}}', { name: field.label })} onClick={() => setDeleting(field)} />
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </QueryState>
      {editing && <FieldDialog field={editing === 'new' ? null : editing} entity={entity} onClose={() => setEditing(null)} />}
      {deleting && (
        <Confirm title={t('crm.settings.fields.delete_title', 'Delete the field {{name}}?', { name: deleting.label })} confirm={t('crm.common.delete', 'Delete')}
          busy={remove.isPending} onConfirm={() => remove.mutate(deleting)} onClose={() => setDeleting(null)}>
          {t('crm.settings.fields.delete_line', 'It disappears from forms and pages. What was filled in is kept, and comes back if you make a field with the same name again.')}
        </Confirm>
      )}
    </div>
  )
}

function useTypeNames(): Record<CustomFieldType, string> {
  const { t } = useTranslation()
  return {
    text: t('crm.settings.types.text', 'One line'),
    textarea: t('crm.settings.types.textarea', 'Several lines'),
    number: t('crm.settings.types.number', 'Number'),
    date: t('crm.settings.types.date', 'Date'),
    select: t('crm.settings.types.select', 'Pick one'),
    multiselect: t('crm.settings.types.multiselect', 'Pick several'),
    checkbox: t('crm.settings.types.checkbox', 'Yes or no'),
    email: t('crm.settings.types.email', 'Email'),
    phone: t('crm.settings.types.phone', 'Phone'),
    url: t('crm.settings.types.url', 'Web address'),
  }
}

function FieldDialog({ field, entity, onClose }: { field: CustomField | null; entity: Entity; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const typeNames = useTypeNames()
  const [form, setForm] = useState<FieldForm>(() => fieldForm(field))
  const [tried, setTried] = useState(false)
  const problems = fieldProblems(form)
  const set = <K extends keyof FieldForm>(key: K, value: FieldForm[K]) => setForm(f => ({ ...f, [key]: value }))
  const save = useMutation({
    mutationFn: () => field ? send('put', `custom-fields/${field.id}`, updatePayload(form)) : send('post', 'custom-fields', createPayload(form, entity)),
    onSuccess: () => { fieldsChanged(qc); say(t('crm.common.saved', 'Saved')); onClose() },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const submit = () => { setTried(true); if (problems.length === 0) save.mutate() }

  return (
    <Dialog title={field ? t('crm.settings.fields.edit_title', 'Edit the field') : t('crm.settings.fields.new_title', 'New field')} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit() }}>
        <div>
          <Field label={t('crm.settings.fields.label', 'Name')}>
            <TextInput value={form.label} maxLength={FIELD_LIMITS.label} placeholder={t('crm.settings.fields.label_placeholder', 'e.g. Allergies')} onChange={e => set('label', e.target.value)} />
          </Field>
          {tried && problems.includes('label') && <Problem>{t('crm.settings.fields.label_required', 'Give the field a name.')}</Problem>}
        </div>
        <Field label={t('crm.settings.fields.type', 'Kind of answer')} hint={field ? t('crm.settings.fields.type_fixed', 'Fixed once the field is made.') : undefined}>
          <Select value={form.type} disabled={!!field} onChange={e => set('type', e.target.value as CustomFieldType)}>
            {FIELD_TYPES.map(type => <option key={type} value={type}>{typeNames[type]}</option>)}
          </Select>
        </Field>
        {hasOptions(form.type) && (
          <div>
            <Field label={t('crm.settings.fields.options', 'Choices, one per line')}>
              <TextArea rows={4} value={form.options} onChange={e => set('options', e.target.value)} />
            </Field>
            {tried && problems.includes('options') && <Problem>{t('crm.settings.fields.options_required', 'Add at least one choice.')}</Problem>}
          </div>
        )}
        <Field label={t('crm.settings.fields.help', 'Help under the field')}>
          <TextInput value={form.help_text} maxLength={FIELD_LIMITS.help} onChange={e => set('help_text', e.target.value)} />
        </Field>
        <div className="space-y-3">
          <Toggle label={t('crm.settings.fields.required_toggle', 'Must be filled in')} checked={form.required} onChange={on => set('required', on)} />
          <Toggle label={t('crm.settings.fields.list_toggle', 'Show as a column in lists')} checked={form.show_in_list} onChange={on => set('show_in_list', on)} />
          <Toggle label={t('crm.settings.fields.active_toggle', 'In use')} checked={form.is_active} onChange={on => set('is_active', on)} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" loading={save.isPending}>{t('crm.common.save', 'Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
