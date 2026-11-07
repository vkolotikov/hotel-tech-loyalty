import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Copy, ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { useBoot } from '../CrmProvider'
import { get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dateTime } from '../lib/format'
import { leadPath } from '../lib/links'
import { Confirm } from '../ui/Confirm'
import { Select, TextArea, TextInput, Toggle } from '../ui/inputs'
import { QueryState } from '../ui/QueryState'
import { SidePanel } from '../ui/SidePanel'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import {
  CUSTOM_TYPES, FORM_LIMITS, addCustomField, formDraft, formPatch, formProblems, formUrl, iframeSnippet, isCustom,
  optionsFromText, setField, submitter, type FieldType, type FormDesign, type FormDraft, type LeadForm, type Submission,
} from './leadForms'
import { moveItem, removeAt } from './lists'
import { IconButton, Problem } from './parts'

type Section = 'fields' | 'design' | 'embed'

/**
 * One lead form, edited in a side panel (lead-forms/{id}): its fields, its words and look, and how to put it on a
 * website with the latest submissions. Changes are kept as a draft and saved together (only what changed is sent).
 */
export function LeadFormEditor({ formId, listKey, onClose }: { formId: number; listKey: readonly unknown[]; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const say = useToast()
  const key = ['crm', 'settings', 'lead-form', formId] as const
  const query = useQuery({ queryKey: key, queryFn: () => get<LeadForm>(`lead-forms/${formId}`), retry: false })
  const [section, setSection] = useState<Section>('fields')
  const [draft, setDraft] = useState<FormDraft | null>(null)
  const saved = query.data ? formDraft(query.data) : null
  const current = draft ?? saved
  const patch = saved && current ? formPatch(saved, current) : {}
  const dirty = Object.keys(patch).length > 0
  const problems = current ? formProblems(current) : []
  const edit = (change: Partial<FormDraft>) => setDraft(prev => {
    const base = prev ?? saved
    return base ? { ...base, ...change } : prev
  })

  const save = useMutation({
    mutationFn: () => send<LeadForm>('put', `lead-forms/${formId}`, patch),
    onSuccess: data => {
      qc.setQueryData(key, data)
      setDraft(null)
      void qc.invalidateQueries({ queryKey: listKey })
      say(t('crm.common.saved', 'Saved'))
    },
    onError: error => say(errorText(t, error), 'danger'),
  })

  return (
    <SidePanel title={query.data?.name ?? t('crm.settings.forms.editor', 'Lead form')} onClose={onClose}
      footer={current ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {problems.length > 0 && <span className="min-w-0 flex-1 text-xs text-a-danger">{t('crm.settings.fix_first', 'Some fields need another look before saving.')}</span>}
          <Button variant="secondary" onClick={() => setDraft(null)} disabled={!dirty || save.isPending}>{t('crm.settings.discard', 'Discard')}</Button>
          <Button onClick={() => save.mutate()} disabled={!dirty || problems.length > 0} loading={save.isPending}>{t('crm.common.save', 'Save')}</Button>
        </div>
      ) : undefined}>
      <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }}>
        {query.data && current && (
          <div className="space-y-4">
            <Tabs label={t('crm.settings.forms.sections', 'Form sections')} value={section} onChange={setSection} items={[
              { key: 'fields', label: t('crm.settings.forms.fields', 'Fields') },
              { key: 'design', label: t('crm.settings.forms.design', 'Words and look') },
              { key: 'embed', label: t('crm.settings.forms.embed', 'On your website') },
            ]} />
            {section === 'fields' && <FieldsSection draft={current} edit={edit} problems={problems} />}
            {section === 'design' && <DesignSection draft={current} edit={edit} problems={problems} />}
            {section === 'embed' && <EmbedSection form={query.data} formKey={key} listKey={listKey} />}
          </div>
        )}
      </QueryState>
    </SidePanel>
  )
}

function FieldsSection({ draft, edit, problems }: { draft: FormDraft; edit: (c: Partial<FormDraft>) => void; problems: string[] }) {
  const { t } = useTranslation()
  const fields = draft.fields
  const typeNames: Record<FieldType, string> = {
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
  return (
    <div className="space-y-3">
      <p className="text-sm text-a-text-2">{t('crm.settings.forms.fields_line', 'Switch fields on or off, mark them required, and change what they say. Your own fields go at the end.')}</p>
      <ol className="space-y-2">
        {fields.map((field, i) => (
          <li key={`${field.key}-${i}`} className={`rounded-xl border p-3 ${field.enabled ? 'border-a-border bg-a-surface' : 'border-a-border bg-a-surface-2'}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Toggle label={field.label || t('crm.settings.forms.untitled', 'Untitled field')} checked={field.enabled} hint={typeNames[field.type] ?? field.type}
                  onChange={on => edit({ fields: setField(fields, i, { enabled: on }) })} />
              </div>
              <IconButton icon={ArrowUp} label={t('crm.settings.move_up', 'Move up')} disabled={i === 0} onClick={() => edit({ fields: moveItem(fields, i, -1) })} />
              <IconButton icon={ArrowDown} label={t('crm.settings.move_down', 'Move down')} disabled={i === fields.length - 1} onClick={() => edit({ fields: moveItem(fields, i, 1) })} />
              {isCustom(field) && <IconButton icon={Trash2} danger label={t('crm.settings.forms.remove_field', 'Remove {{name}}', { name: field.label })} onClick={() => edit({ fields: removeAt(fields, i) })} />}
            </div>
            {field.enabled && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label={t('crm.settings.forms.label', 'Label')}>
                  <TextInput value={field.label} maxLength={120} onChange={e => edit({ fields: setField(fields, i, { label: e.target.value }) })} />
                </Field>
                <Field label={t('crm.settings.forms.placeholder', 'Example inside the box')}>
                  <TextInput value={field.placeholder ?? ''} maxLength={120} onChange={e => edit({ fields: setField(fields, i, { placeholder: e.target.value }) })} />
                </Field>
                {isCustom(field) && (
                  <Field label={t('crm.settings.forms.type', 'Kind of answer')}>
                    <Select value={field.type} onChange={e => edit({ fields: setField(fields, i, { type: e.target.value as FieldType }) })}>
                      {CUSTOM_TYPES.map(type => <option key={type} value={type}>{typeNames[type]}</option>)}
                    </Select>
                  </Field>
                )}
                {isCustom(field) && (field.type === 'select' || field.type === 'multiselect') && (
                  <Field label={t('crm.settings.forms.options', 'Choices, one per line')}>
                    <TextArea rows={3} value={(field.options ?? []).join('\n')} onChange={e => edit({ fields: setField(fields, i, { options: optionsFromText(e.target.value) }) })} />
                  </Field>
                )}
                <label className="flex cursor-pointer items-center gap-2 text-sm text-a-text sm:col-span-2">
                  <input type="checkbox" className="h-4 w-4 accent-a-accent-text" checked={field.required} onChange={e => edit({ fields: setField(fields, i, { required: e.target.checked }) })} />
                  {t('crm.settings.forms.required', 'Must be filled in')}
                </label>
              </div>
            )}
          </li>
        ))}
      </ol>
      {problems.includes('field_label') && <Problem>{t('crm.settings.forms.label_required', 'Every field that is on needs a label.')}</Problem>}
      <Button variant="secondary" size="sm" onClick={() => edit({ fields: addCustomField(fields, Math.random().toString(36).slice(2, 8), t('crm.settings.forms.new_field', 'New field')) })}>
        <Plus size={14} aria-hidden />{t('crm.settings.forms.add_field', 'Add a field of your own')}
      </Button>
    </div>
  )
}

function DesignSection({ draft, edit, problems }: { draft: FormDraft; edit: (c: Partial<FormDraft>) => void; problems: string[] }) {
  const { t } = useTranslation()
  const design = draft.design
  const setDesign = (change: Partial<FormDesign>) => edit({ design: { ...design, ...change } })
  const colour = /^#[0-9a-f]{6}$/i.test(design.primary_color ?? '') ? design.primary_color : '#22d3ee'
  return (
    <div className="space-y-4">
      <Toggle label={t('crm.settings.forms.active', 'The form accepts submissions')} checked={draft.is_active} onChange={on => edit({ is_active: on })} />
      <div>
        <Field label={t('crm.settings.forms.name', 'Name (for you)')}>
          <TextInput value={draft.name} maxLength={FORM_LIMITS.name} onChange={e => edit({ name: e.target.value })} />
        </Field>
        {problems.includes('name') && <Problem>{t('crm.settings.forms.name_required', 'Give the form a name.')}</Problem>}
      </div>
      <Field label={t('crm.settings.forms.description', 'Description (for you)')}>
        <TextArea rows={2} value={draft.description ?? ''} maxLength={FORM_LIMITS.description} onChange={e => edit({ description: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('crm.settings.forms.title', 'Heading')}>
          <TextInput value={design.title ?? ''} onChange={e => setDesign({ title: e.target.value })} />
        </Field>
        <Field label={t('crm.settings.forms.submit', 'Button')}>
          <TextInput value={design.submit_text ?? ''} onChange={e => setDesign({ submit_text: e.target.value })} />
        </Field>
      </div>
      <Field label={t('crm.settings.forms.intro', 'Text above the fields')}>
        <TextArea rows={2} value={design.intro ?? ''} onChange={e => setDesign({ intro: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('crm.settings.forms.success_title', 'After sending: heading')}>
          <TextInput value={design.success_title ?? ''} onChange={e => setDesign({ success_title: e.target.value })} />
        </Field>
        <Field label={t('crm.settings.forms.success_message', 'After sending: text')}>
          <TextInput value={design.success_message ?? ''} onChange={e => setDesign({ success_message: e.target.value })} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <span className="mb-1 block text-xs font-medium text-a-text-2">{t('crm.settings.forms.colour', 'Colour')}</span>
          <div className="flex items-center gap-2">
            <label className="shrink-0">
              <span className="sr-only">{t('crm.settings.forms.colour', 'Colour')}</span>
              <input type="color" value={colour} onChange={e => setDesign({ primary_color: e.target.value })} className="h-9 w-11 cursor-pointer rounded-lg border border-a-border bg-a-surface p-0.5" />
            </label>
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t('crm.settings.forms.colour', 'Colour')}</span>
              <TextInput value={design.primary_color ?? ''} maxLength={7} className="font-a-mono" onChange={e => setDesign({ primary_color: e.target.value })} />
            </label>
          </div>
        </div>
        <Field label={t('crm.settings.forms.theme', 'Background')}>
          <Select value={design.theme ?? 'light'} onChange={e => setDesign({ theme: e.target.value as FormDesign['theme'] })}>
            <option value="light">{t('crm.settings.forms.light', 'Light')}</option>
            <option value="dark">{t('crm.settings.forms.dark', 'Dark')}</option>
          </Select>
        </Field>
        <Field label={t('crm.settings.forms.corners', 'Corners')}>
          <Select value={design.corners ?? 'rounded'} onChange={e => setDesign({ corners: e.target.value as FormDesign['corners'] })}>
            <option value="rounded">{t('crm.settings.forms.rounded', 'Rounded')}</option>
            <option value="sharp">{t('crm.settings.forms.sharp', 'Square')}</option>
          </Select>
        </Field>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-a-text">
        <input type="checkbox" className="h-4 w-4 accent-a-accent-text" checked={!!design.show_privacy_link} onChange={e => setDesign({ show_privacy_link: e.target.checked })} />
        {t('crm.settings.forms.privacy', 'Say under the button that sending it agrees to be contacted')}
      </label>
      <div className="grid gap-4 border-t border-a-border pt-4 sm:grid-cols-2">
        <Field label={t('crm.settings.forms.source', 'Source on the lead')} hint={t('crm.settings.forms.source_hint', 'Empty: "website_form".')}>
          <TextInput value={draft.default_source ?? ''} maxLength={FORM_LIMITS.source} placeholder="website_form" onChange={e => edit({ default_source: e.target.value })} />
        </Field>
        <Field label={t('crm.settings.forms.inquiry_type', 'Type of lead')} hint={t('crm.settings.forms.inquiry_type_hint', 'Optional, e.g. Wedding.')}>
          <TextInput value={draft.default_inquiry_type ?? ''} maxLength={FORM_LIMITS.inquiry_type} onChange={e => edit({ default_inquiry_type: e.target.value })} />
        </Field>
      </div>
      {problems.includes('too_long') && <Problem>{t('crm.settings.forms.too_long', 'A text is longer than allowed.')}</Problem>}
    </div>
  )
}

function EmbedSection({ form, formKey, listKey }: { form: LeadForm; formKey: readonly unknown[]; listKey: readonly unknown[] }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const qc = useQueryClient()
  const say = useToast()
  const [confirming, setConfirming] = useState(false)
  const url = formUrl(window.location.origin, form.embed_key)
  const snippet = iframeSnippet(url)
  const submissions = useQuery({
    queryKey: ['crm', 'settings', 'lead-form', form.id, 'submissions'],
    queryFn: () => get<{ data: Submission[]; total: number }>(`lead-forms/${form.id}/submissions`),
  })
  const regenerate = useMutation({
    mutationFn: () => send<{ embed_key: string }>('post', `lead-forms/${form.id}/regenerate-key`),
    onSuccess: ({ embed_key }) => {
      qc.setQueryData<LeadForm>(formKey, old => (old ? { ...old, embed_key } : old))
      void qc.invalidateQueries({ queryKey: listKey })
      setConfirming(false)
      say(t('crm.settings.forms.new_key_done', 'New address made. Update the code on your website.'))
    },
    onError: error => say(errorText(t, error), 'danger'),
  })
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => say(t('crm.common.copied', 'Copied')),
      () => say(t('crm.settings.forms.copy_failed', 'The browser did not allow copying. Select the text and copy it by hand.'), 'danger'),
    )
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-a-text">{t('crm.settings.forms.link_title', 'A link to the form')}</h3>
        <p className="text-sm text-a-text-2">{t('crm.settings.forms.link_line', 'For emails, social posts or a button on your site.')}</p>
        <div className="flex flex-wrap gap-2">
          <label className="min-w-0 flex-1 basis-60">
            <span className="sr-only">{t('crm.settings.forms.link_title', 'A link to the form')}</span>
            <TextInput readOnly value={url} className="font-a-mono" onFocus={e => e.target.select()} />
          </label>
          <Button variant="secondary" size="sm" onClick={() => copy(url)}><Copy size={14} aria-hidden />{t('crm.common.copy', 'Copy')}</Button>
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-a-border bg-a-surface px-3 py-1.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">
            <ExternalLink size={14} aria-hidden />{t('crm.settings.forms.open', 'Open')}
          </a>
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-a-text">{t('crm.settings.forms.embed_title', 'On a page of your website')}</h3>
        <p className="text-sm text-a-text-2">{t('crm.settings.forms.embed_line', 'Paste this code where the form should show.')}</p>
        <pre className="overflow-auto whitespace-pre-wrap break-all rounded-xl bg-a-surface-2 p-3 font-a-mono text-xs text-a-text">{snippet}</pre>
        <Button size="sm" onClick={() => copy(snippet)}><Copy size={14} aria-hidden />{t('crm.settings.forms.copy_code', 'Copy the code')}</Button>
      </section>
      <section className="space-y-2 border-t border-a-border pt-4">
        <h3 className="text-sm font-semibold text-a-text">{t('crm.settings.forms.key_title', 'Getting spam?')}</h3>
        <p className="text-sm text-a-text-2">{t('crm.settings.forms.key_line', 'Give the form a new address. The old link and code stop working until you replace them.')}</p>
        <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}><RefreshCw size={14} aria-hidden />{t('crm.settings.forms.new_key', 'Make a new address')}</Button>
      </section>
      <section className="space-y-2 border-t border-a-border pt-4">
        <h3 className="text-sm font-semibold text-a-text">{t('crm.settings.forms.latest', 'Latest submissions ({{count}} in all)', { count: form.submission_count })}</h3>
        <QueryState loading={submissions.isLoading} error={submissions.error} onRetry={() => { void submissions.refetch() }} rows={2}>
          {(submissions.data?.data ?? []).length === 0 ? (
            <p className="text-sm text-a-text-2">{t('crm.settings.forms.none_yet', 'Nothing sent yet.')}</p>
          ) : (
            <ul className="divide-y divide-a-border rounded-xl border border-a-border">
              {(submissions.data?.data ?? []).slice(0, 10).map(sub => {
                const who = submitter(sub)
                return (
                  <li key={sub.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-a-text">{who.name ?? t('crm.common.no_name', 'No name')}</span>
                      <span className="block truncate text-xs text-a-text-2">{[who.email, dateTime(sub.created_at, i18n.language, boot.venue.timezone)].filter(Boolean).join(' · ')}</span>
                    </span>
                    {sub.inquiry_id && <Link to={leadPath(sub.inquiry_id)} className="shrink-0 text-sm font-medium text-a-accent-text hover:underline">{t('crm.settings.forms.open_lead', 'Open the lead')}</Link>}
                  </li>
                )
              })}
            </ul>
          )}
        </QueryState>
      </section>
      {confirming && (
        <Confirm title={t('crm.settings.forms.new_key_title', 'Give the form a new address?')} confirm={t('crm.settings.forms.new_key', 'Make a new address')}
          busy={regenerate.isPending} onConfirm={() => regenerate.mutate()} onClose={() => setConfirming(false)}>
          {t('crm.settings.forms.new_key_confirm', 'The link and code on your website stop working at once. Copy the new code there afterwards.')}
        </Confirm>
      )}
    </div>
  )
}
