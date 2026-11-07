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
  ENTITIES, FIELD_LIMITS, FIELD_TYPES, countsByEntity, createPayload, fieldForm, fieldProblems, fieldsOf, hasOptions, updatePayload,
  type CustomField, type CustomFieldType, type Entity, type FieldForm,
} from './customFields'
import { reorderIds } from './lists'
import { IconButton, ListHead, Problem, ReadOnlyNote, SectionIntro } from './parts'

const KEY = ['crm', 'settings', 'custom-fields'] as const
const FIELD_COLS = 'md:grid-cols-[minmax(0,1fr)_9rem_12rem_9.5rem]'

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

  const entityNames: Record<Entity, string> = {
    inquiry: t('crm.settings.fields.inquiry', 'Leads'),
    guest: t('crm.settings.fields.guest', 'Contacts'),
    corporate_account: t('crm.settings.fields.company', 'Companies'),
    task: t('crm.settings.fields.task', 'Tasks'),
  }
  const cardTitles: Record<Entity, string> = {
    inquiry: t('crm.settings.fields.card_inquiry', 'Fields on leads'),
    guest: t('crm.settings.fields.card_guest', 'Fields on contacts'),
    corporate_account: t('crm.settings.fields.card_company', 'Fields on companies'),
    task: t('crm.settings.fields.card_task', 'Fields on tasks'),
  }
  const addButton = (primary: boolean) => (
    <Button variant={primary ? 'primary' : 'ghost'} size={primary ? 'md' : 'sm'} onClick={() => setEditing('new')}>
      <Plus size={primary ? 15 : 14} aria-hidden />{t('crm.settings.fields.add', 'Add a field')}
    </Button>
  )

  return (
    <div className="space-y-4">
      <SectionIntro line={t('crm.settings.fields.line', 'Your own fields on leads, contacts, companies and tasks, e.g. "Allergies" or "Budget".')}
        action={canManage && fields.length > 0 ? addButton(true) : undefined} />
      {!canManage && <ReadOnlyNote />}
      <Tabs label={t('crm.settings.fields.on', 'Fields on')} value={entity} onChange={setEntity} items={ENTITIES.map(key => ({ key, label: entityNames[key], count: counts[key] }))} />
      <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }}>
        <Card padded={false} title={cardTitles[entity]} icon={SlidersHorizontal} tone="pending"
          description={t('crm.settings.fields.card_line', 'In this order on the add form and the record\'s page.')}>
          {fields.length === 0 ? (
            <EmptyState icon={SlidersHorizontal} title={t('crm.settings.fields.empty', 'No fields of your own here yet')}
              line={t('crm.settings.fields.empty_line', 'They show on the add form and the record\'s page.')}
              action={canManage ? addButton(true) : undefined} />
          ) : (
            <div role="table" aria-label={t('crm.settings.tab.fields', 'Custom fields')}>
              <ListHead cols={FIELD_COLS} columns={[
                { label: t('crm.settings.fields.label', 'Name') },
                { label: t('crm.settings.fields.type', 'Kind of answer') },
                { label: t('crm.settings.fields.col_rules', 'Rules') },
                { label: t('crm.settings.actions', 'Actions'), srOnly: true },
              ]} />
              <ol role="rowgroup" className="divide-y divide-a-border">
                {fields.map((field, i) => (
                  <li key={field.id} role="row" className={`group flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-a-surface-2/60 md:grid md:gap-4 ${FIELD_COLS}`}>
                    <span role="cell" className="min-w-0 flex-1 basis-full md:basis-auto">
                      {canManage
                        ? <button type="button" onClick={() => setEditing(field)} className="block max-w-full truncate rounded-sm text-left text-sm font-medium text-a-text hover:text-a-accent-text focus-visible:outline-2 focus-visible:outline-a-accent">{field.label}</button>
                        : <span className="block truncate text-sm font-medium text-a-text">{field.label}</span>}
                      {field.help_text && <span className="block truncate text-xs text-a-text-2">{field.help_text}</span>}
                    </span>
                    <span role="cell" className="text-xs text-a-text-2 md:text-sm">{typeNames[field.type] ?? field.type}</span>
                    <span role="cell" className="flex flex-wrap gap-1">
                      {field.required && <Pill tone="pending">{t('crm.settings.fields.required', 'Required')}</Pill>}
                      {field.show_in_list && <Pill>{t('crm.settings.fields.in_list', 'In lists')}</Pill>}
                      {!field.is_active && <Pill tone="danger">{t('crm.settings.fields.off', 'Off')}</Pill>}
                    </span>
                    <span role="cell" className="ml-auto flex shrink-0 items-center justify-end">
                      {canManage && (
                        <>
                          <IconButton icon={ArrowUp} label={t('crm.settings.fields.up', 'Move {{name}} up', { name: field.label })} disabled={i === 0 || reorder.isPending} onClick={() => reorder.mutate(reorderIds(fields, i, -1))} />
                          <IconButton icon={ArrowDown} label={t('crm.settings.fields.down', 'Move {{name}} down', { name: field.label })} disabled={i === fields.length - 1 || reorder.isPending} onClick={() => reorder.mutate(reorderIds(fields, i, 1))} />
                          <IconButton icon={Pencil} label={t('crm.settings.fields.edit', 'Edit {{name}}', { name: field.label })} onClick={() => setEditing(field)} />
                          <IconButton icon={Trash2} danger label={t('crm.settings.fields.delete', 'Delete {{name}}', { name: field.label })} onClick={() => setDeleting(field)} />
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              {canManage && <div className="border-t border-a-border px-4 py-2.5">{addButton(false)}</div>}
            </div>
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
