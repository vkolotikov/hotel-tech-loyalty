import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Select, TextArea, TextInput } from '../ui/inputs'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { EMPTY_CONTACT, newContactBody, newContactErrors, optionsWith, type NewContactForm } from './contactsLogic'
import { CustomFieldInputs } from './CustomFieldsCard'
import { refreshAfterContactChange, useContactLists, useCustomFields, useFacets } from './queries'
import { customDraft, customErrorKeys, customPayload, missingRequired, type CustomValues } from './recordLogic'
import type { Guest } from './types'
import { FieldWithError } from './parts'
import { useFormErrorText } from './formWords'

/**
 * Add a contact by hand (POST guests): the name, how to reach them, where they stand, and the organisation's own fields
 * (a required one must be filled, as the server's CustomFieldService::validate asks).
 */
export function NewContactPanel({ onClose, onCreated }: { onClose: () => void; onCreated: (guest: Guest) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const lists = useContactLists()
  const facets = useFacets()
  const errorOf = useFormErrorText()
  const custom = useCustomFields('guest')
  const fields = custom.data ?? []
  const [form, setForm] = useState<NewContactForm>(EMPTY_CONTACT)
  const [extra, setExtra] = useState<CustomValues | null>(null)
  const values = extra ?? customDraft(fields, null)
  const [tried, setTried] = useState(false)
  const errors = newContactErrors(form)
  const shown = tried ? errors : {}
  const missing = missingRequired(fields, values)

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => send<Guest>('post', 'guests', body),
    onSuccess: guest => {
      refreshAfterContactChange(qc)
      toast(t('crm.contacts.added', 'Contact added'))
      onCreated(guest)
    },
  })

  const set = (key: keyof NewContactForm) => (value: string) => setForm(prev => ({ ...prev, [key]: value }))
  const submit = () => {
    setTried(true)
    if (Object.keys(errors).length > 0 || missing.length > 0) return
    const body: Record<string, unknown> = newContactBody(form)
    if (fields.length > 0) body.custom_data = customPayload(fields, values)
    create.mutate(body)
  }

  return (
    <SidePanel title={t('crm.contacts.new_title', 'Add a contact')} onClose={onClose}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button onClick={submit} loading={create.isPending}>{t('crm.contacts.add', 'Add contact')}</Button>
        </div>
      )}>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); submit() }}>
        {create.isError && <Notice tone="danger">{errorText(t, create.error)}</Notice>}
        <FieldWithError label={t('crm.contacts.field.full_name', 'Name')} error={errorOf(shown.full_name)}>
          <TextInput value={form.full_name} onChange={e => set('full_name')(e.target.value)} autoComplete="off" required aria-invalid={!!shown.full_name} />
        </FieldWithError>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldWithError label={t('crm.contacts.field.email', 'Email')} error={errorOf(shown.email)}>
            <TextInput type="email" value={form.email} onChange={e => set('email')(e.target.value)} autoComplete="off" aria-invalid={!!shown.email} />
          </FieldWithError>
          <FieldWithError label={t('crm.contacts.field.phone', 'Phone')} error={errorOf(shown.phone)}>
            <TextInput type="tel" value={form.phone} onChange={e => set('phone')(e.target.value)} autoComplete="off" />
          </FieldWithError>
          <FieldWithError label={t('crm.contacts.field.company', 'Company')} error={errorOf(shown.company)}>
            <TextInput value={form.company} onChange={e => set('company')(e.target.value)} autoComplete="off" />
          </FieldWithError>
          <FieldWithError label={t('crm.contacts.field.position_title', 'Job title')} error={errorOf(shown.position_title)}>
            <TextInput value={form.position_title} onChange={e => set('position_title')(e.target.value)} autoComplete="off" />
          </FieldWithError>
          <Field label={t('crm.contacts.field.lifecycle_status', 'Lifecycle')}>
            <Select value={form.lifecycle_status} onChange={e => set('lifecycle_status')(e.target.value)}>
              <option value="">{t('crm.contacts.form.default', 'The usual default')}</option>
              {lists.lifecycle.map(v => <option key={v} value={v}>{v}</option>)}
            </Select>
          </Field>
          <Field label={t('crm.contacts.field.importance', 'Importance')}>
            <Select value={form.importance} onChange={e => set('importance')(e.target.value)}>
              <option value="">{t('crm.contacts.form.default', 'The usual default')}</option>
              {lists.importance.map(v => <option key={v} value={v}>{v}</option>)}
            </Select>
          </Field>
        </div>
        <FieldWithError label={t('crm.contacts.field.lead_source', 'Source')} error={errorOf(shown.lead_source)}>
          <TextInput value={form.lead_source} onChange={e => set('lead_source')(e.target.value)} list="crm-contact-sources" autoComplete="off" />
          <datalist id="crm-contact-sources">
            {optionsWith(facets.data?.lead_source ?? []).map(v => <option key={v} value={v} />)}
          </datalist>
        </FieldWithError>
        <Field label={t('crm.contacts.field.notes', 'Notes')}>
          <TextArea rows={3} value={form.notes} onChange={e => set('notes')(e.target.value)} />
        </Field>
        {fields.length > 0 && (
          <div className="space-y-2 border-t border-a-border pt-3">
            {tried && missing.length > 0 && <Notice tone="warning">{t('crm.contacts.custom.missing', 'Fill in the fields marked as needed.')}</Notice>}
            <CustomFieldInputs idPrefix="crm-new-contact-custom" fields={fields} values={values} onChange={setExtra}
              invalid={[...(tried ? missing : []), ...customErrorKeys(failureOf(create.error).fields)]} />
          </div>
        )}
        <button type="submit" className="sr-only" tabIndex={-1}>{t('crm.contacts.add', 'Add contact')}</button>
      </form>
    </SidePanel>
  )
}
