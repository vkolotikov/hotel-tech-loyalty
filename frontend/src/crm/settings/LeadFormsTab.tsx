import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { timeAgo } from '../lib/format'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { TextArea, TextInput } from '../ui/inputs'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { LeadFormEditor } from './LeadFormEditor'
import { FORM_LIMITS, type LeadForm, type LeadFormSummary } from './leadForms'
import { IconButton, ListHead, SectionIntro } from './parts'

const KEY = ['crm', 'settings', 'lead-forms'] as const
const FORM_COLS = 'md:grid-cols-[minmax(0,1fr)_5.5rem_4rem_7.5rem_5.5rem]'

/**
 * Lead forms (lead-forms): forms for the venue's website that create a contact and a lead from each submission. The
 * list, a new form, the editor (fields, words and look, embed and the latest submissions) and delete. Everyone may
 * work them, as in the full admin.
 */
export function LeadFormsTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const forms = useQuery({ queryKey: KEY, queryFn: () => get<LeadFormSummary[]>('lead-forms') })
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<LeadFormSummary | null>(null)
  const remove = useMutation({
    mutationFn: (form: LeadFormSummary) => send('delete', `lead-forms/${form.id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: KEY }); setDeleting(null); say(t('crm.settings.deleted', 'Deleted')) },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const list = forms.data ?? []

  const newButton = <Button onClick={() => setCreating(true)}><Plus size={15} aria-hidden />{t('crm.settings.forms.add', 'New form')}</Button>

  return (
    <div className="space-y-4">
      <SectionIntro line={t('crm.settings.forms.line', 'Forms for your website. Each one that is sent becomes a contact and a new lead.')}
        action={list.length > 0 ? newButton : undefined} />
      <QueryState loading={forms.isLoading} error={forms.error} onRetry={() => { void forms.refetch() }}>
        <Card padded={false} title={t('crm.settings.tab.forms', 'Lead forms')} icon={ClipboardList} tone="success"
          description={list.length > 0 ? t('crm.settings.forms.count', '{{live}} of {{total}} live', { live: list.filter(f => f.is_active).length, total: list.length }) : undefined}>
          {list.length === 0 ? (
            <EmptyState icon={ClipboardList} title={t('crm.settings.forms.empty', 'No lead forms yet')}
              line={t('crm.settings.forms.empty_line', 'A contact or enquiry form for your website, sending leads straight here.')}
              action={newButton} />
          ) : (
            <div role="table" aria-label={t('crm.settings.tab.forms', 'Lead forms')}>
              <ListHead cols={FORM_COLS} columns={[
                { label: t('crm.settings.forms.col_form', 'Form') },
                { label: t('crm.settings.forms.col_status', 'Status') },
                { label: t('crm.settings.forms.col_sent', 'Sent'), align: 'right' },
                { label: t('crm.settings.forms.col_last', 'Last sent') },
                { label: t('crm.settings.actions', 'Actions'), srOnly: true },
              ]} />
              <ul role="rowgroup" className="divide-y divide-a-border">
                {list.map(form => (
                  <li key={form.id} role="row" className={`group flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-a-surface-2/60 md:grid md:gap-4 ${FORM_COLS}`}>
                    <span role="cell" className="min-w-0 flex-1 basis-full md:basis-auto">
                      <button type="button" onClick={() => setEditing(form.id)} className="block max-w-full truncate rounded-sm text-left text-sm font-medium text-a-text hover:text-a-accent-text focus-visible:outline-2 focus-visible:outline-a-accent">
                        {form.name}
                      </button>
                      {form.description && <span className="mt-0.5 block truncate text-xs text-a-text-2">{form.description}</span>}
                    </span>
                    <span role="cell"><Pill tone={form.is_active ? 'success' : 'neutral'}>{form.is_active ? t('crm.settings.forms.on', 'Live') : t('crm.settings.forms.off', 'Off')}</Pill></span>
                    <span role="cell" className="text-xs tabular-nums text-a-text-2 md:text-right md:text-sm md:text-a-text">
                      <span className="md:hidden">{t('crm.settings.forms.sent', '{{count}} sent', { count: form.submission_count })}</span>
                      <span className="hidden md:inline">{form.submission_count}</span>
                    </span>
                    <span role="cell" className="text-xs text-a-text-2">
                      {form.last_submitted_at ? (
                        <>
                          <span className="md:hidden">{t('crm.settings.forms.last', 'last {{when}}', { when: timeAgo(form.last_submitted_at, i18n.language) })}</span>
                          <span className="hidden md:inline">{timeAgo(form.last_submitted_at, i18n.language)}</span>
                        </>
                      ) : <span className="hidden md:inline">{t('crm.settings.forms.never', 'Not yet')}</span>}
                    </span>
                    <span role="cell" className="ml-auto flex shrink-0 items-center justify-end">
                      <IconButton icon={Pencil} label={t('crm.settings.forms.edit', 'Edit {{name}}', { name: form.name })} onClick={() => setEditing(form.id)} />
                      <IconButton icon={Trash2} danger label={t('crm.settings.forms.delete', 'Delete {{name}}', { name: form.name })} onClick={() => setDeleting(form)} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </QueryState>
      {creating && <NewFormDialog onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setEditing(id) }} />}
      {editing !== null && <LeadFormEditor formId={editing} listKey={KEY} onClose={() => setEditing(null)} />}
      {deleting && (
        <Confirm title={t('crm.settings.forms.delete_title', 'Delete the form {{name}}?', { name: deleting.name })} confirm={t('crm.common.delete', 'Delete')}
          busy={remove.isPending} onConfirm={() => remove.mutate(deleting)} onClose={() => setDeleting(null)}>
          {t('crm.settings.forms.delete_line', 'Websites that show it stop showing the form. The {{count}} leads it already made stay.', { count: deleting.submission_count })}
        </Confirm>
      )}
    </div>
  )
}

function NewFormDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const valid = name.trim().length > 0 && name.trim().length <= FORM_LIMITS.name && description.length <= FORM_LIMITS.description
  const create = useMutation({
    mutationFn: () => send<LeadForm>('post', 'lead-forms', { name: name.trim(), description: description.trim() || null }),
    onSuccess: form => { void qc.invalidateQueries({ queryKey: KEY }); onCreated(form.id) },
    onError: error => say(errorText(t, error), 'danger'),
  })
  return (
    <Dialog title={t('crm.settings.forms.new_title', 'New lead form')} onClose={onClose} busy={create.isPending}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (valid) create.mutate() }}>
        <Field label={t('crm.settings.forms.name', 'Name (for you)')}>
          <TextInput value={name} maxLength={FORM_LIMITS.name} placeholder={t('crm.settings.forms.name_placeholder', 'e.g. Wedding enquiries')} onChange={e => setName(e.target.value)} />
        </Field>
        <Field label={t('crm.settings.forms.description', 'Description (for you)')}>
          <TextArea rows={2} value={description} maxLength={FORM_LIMITS.description} onChange={e => setDescription(e.target.value)} />
        </Field>
        <p className="text-sm text-a-text-2">{t('crm.settings.forms.new_line', 'It starts with name, email, phone and a message; change it after.')}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button type="submit" disabled={!valid} loading={create.isPending}>{t('crm.settings.forms.create', 'Create')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
