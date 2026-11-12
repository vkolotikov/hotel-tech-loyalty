import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { failureOf, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { Select, TextArea, TextInput } from '../ui/inputs'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { COMPANY_STATUSES, EMPTY_COMPANY, companyBody, companyErrors, companyFormOf, companyStatusKey, optionsWith, type CompanyForm } from './contactsLogic'
import { useFormErrorText } from './formWords'
import { CustomFieldInputs } from './CustomFieldsCard'
import { FieldWithError } from './parts'
import { CONTACTS, useContactLists, useCustomFields } from './queries'
import { customDraft, customErrorKeys, customPayload, missingRequired, type CustomValues } from './recordLogic'
import type { Company } from './types'

const STATUS_FALLBACK: Record<string, string> = { Active: 'Active', Pending: 'Pending', Expired: 'Expired', Suspended: 'Suspended' }

/**
 * Add a company (POST corporate-accounts) or change one (PUT corporate-accounts/{id}): the full admin's fields — a
 * hotel's negotiated rate, rate type and room nights only for a hotel — and the organisation's own fields.
 */
export function CompanyFormPanel({ company, onClose, onSaved }: { company?: Company; onClose: () => void; onSaved: (saved: Company) => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const errorOf = useFormErrorText()
  const boot = useBoot()
  const lists = useContactLists()
  const hotel = boot.organization.industry === 'hotel'
  const custom = useCustomFields('corporate_account')
  const fields = custom.data ?? []
  const mode = company ? 'edit' : 'create'
  const [form, setForm] = useState<CompanyForm>(company ? companyFormOf(company) : EMPTY_COMPANY)
  const [extra, setExtra] = useState<CustomValues | null>(null)
  const values = extra ?? customDraft(fields, company?.custom_data)
  const [tried, setTried] = useState(false)
  const errors = companyErrors(form)
  const shown = tried ? errors : {}
  const missing = missingRequired(fields, values)
  const body = (): Record<string, unknown> => {
    const out: Record<string, unknown> = companyBody(form, mode)
    if (fields.length > 0) out.custom_data = customPayload(fields, values)
    return out
  }

  const save = useMutation({
    mutationFn: () => company
      ? send<Company>('put', `corporate-accounts/${company.id}`, body())
      : send<Company>('post', 'corporate-accounts', body()),
    onSuccess: saved => {
      void qc.invalidateQueries({ queryKey: [...CONTACTS, 'companies'] })
      void qc.invalidateQueries({ queryKey: [...CONTACTS, 'company'] })
      toast(company ? t('crm.common.saved', 'Saved') : t('crm.contacts.company_added', 'Company added'))
      onSaved(saved)
    },
  })

  const set = (key: keyof CompanyForm) => (value: string) => setForm(prev => ({ ...prev, [key]: value }))
  const submit = () => {
    setTried(true)
    if (Object.keys(errors).length === 0 && missing.length === 0) save.mutate()
  }
  const text = (key: keyof CompanyForm, label: string, type = 'text', list?: string) => (
    <FieldWithError label={label} error={errorOf(shown[key])}>
      <TextInput type={type} value={form[key]} onChange={e => set(key)(e.target.value)} autoComplete="off" aria-invalid={!!shown[key]} list={list}
        inputMode={type === 'number' ? 'decimal' : undefined} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} />
    </FieldWithError>
  )

  return (
    <SidePanel title={mode === 'edit' ? t('crm.contacts.company_edit', 'Change company') : t('crm.contacts.company_new', 'Add a company')} onClose={onClose}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{t('crm.common.cancel', 'Cancel')}</Button>
          <Button onClick={submit} loading={save.isPending}>{mode === 'edit' ? t('crm.common.save', 'Save') : t('crm.contacts.company_add', 'Add company')}</Button>
        </div>
      )}>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); submit() }}>
        {save.isError && <Notice tone="danger">{errorText(t, save.error)}</Notice>}
        {text('company_name', t('crm.contacts.company.company_name', 'Company name'))}
        <datalist id="crm-company-industries">{lists.industries.map(v => <option key={v} value={v} />)}</datalist>
        <datalist id="crm-company-managers">{lists.managers.map(v => <option key={v} value={v} />)}</datalist>
        <div className="grid gap-3 sm:grid-cols-2">
          {text('industry', t('crm.contacts.company.industry', 'Industry'), 'text', 'crm-company-industries')}
          {mode === 'edit' && (
            <Field label={t('crm.contacts.company.status', 'Status')}>
              <Select value={form.status} onChange={e => set('status')(e.target.value)}>
                {optionsWith([...COMPANY_STATUSES], form.status).map(v => {
                  const key = companyStatusKey(v)
                  return <option key={v} value={v}>{key ? t(`crm.contacts.${key}`, STATUS_FALLBACK[v] ?? v) : v}</option>
                })}
              </Select>
            </Field>
          )}
          {text('contact_person', t('crm.contacts.company.contact_person', 'Main contact'))}
          {text('contact_email', t('crm.contacts.company.contact_email', 'Contact email'), 'email')}
          {text('contact_phone', t('crm.contacts.company.contact_phone', 'Contact phone'), 'tel')}
          {text('account_manager', t('crm.contacts.company.account_manager', 'Account manager'), 'text', 'crm-company-managers')}
          {text('billing_email', t('crm.contacts.company.billing_email', 'Billing email'), 'email')}
          {text('tax_id', t('crm.contacts.company.tax_id', 'Tax ID'))}
          {text('payment_terms', t('crm.contacts.company.payment_terms', 'Payment terms'))}
          {text('credit_limit', t('crm.contacts.company.credit_limit', 'Credit limit'), 'number')}
          {text('discount_percentage', t('crm.contacts.company.discount_percentage', 'Discount %'), 'number')}
          {hotel && text('negotiated_rate', t('crm.contacts.company.negotiated_rate', 'Negotiated rate'), 'number')}
          {hotel && (
            <Field label={t('crm.contacts.company.rate_type', 'Rate type')}>
              <Select value={form.rate_type} onChange={e => set('rate_type')(e.target.value)}>
                <option value="">{t('crm.contacts.bulk_pick', 'Choose…')}</option>
                {optionsWith(lists.rateTypes, form.rate_type).map(v => <option key={v} value={v}>{v}</option>)}
              </Select>
            </Field>
          )}
          {hotel && text('annual_room_nights_target', t('crm.contacts.company.annual_room_nights_target', 'Room nights a year'), 'number')}
          {text('contract_start', t('crm.contacts.company.contract_start', 'Contract from'), 'date')}
          {text('contract_end', t('crm.contacts.company.contract_end', 'Contract until'), 'date')}
        </div>
        <Field label={t('crm.contacts.company.billing_address', 'Billing address')}>
          <TextArea rows={2} value={form.billing_address} onChange={e => set('billing_address')(e.target.value)} />
        </Field>
        <Field label={t('crm.contacts.field.notes', 'Notes')}>
          <TextArea rows={3} value={form.notes} onChange={e => set('notes')(e.target.value)} />
        </Field>
        {fields.length > 0 && (
          <div className="space-y-2 border-t border-a-border pt-3">
            {tried && missing.length > 0 && <Notice tone="warning">{t('crm.contacts.custom.missing', 'Fill in the fields marked as needed.')}</Notice>}
            <CustomFieldInputs idPrefix="crm-company-form-custom" fields={fields} values={values} onChange={setExtra}
              invalid={[...(tried ? missing : []), ...customErrorKeys(failureOf(save.error).fields)]} />
          </div>
        )}
        <button type="submit" className="sr-only" tabIndex={-1}>{t('crm.common.save', 'Save')}</button>
      </form>
    </SidePanel>
  )
}
