import { useTranslation } from 'react-i18next'
import type { FormError } from './contactsLogic'

/** The sentence for a form field's problem (the contact and company forms share them). */
export function useFormErrorText(): (error: FormError | undefined) => string | undefined {
  const { t } = useTranslation()
  return error => error === 'required' ? t('crm.contacts.form.required', 'Fill this in.')
    : error === 'bad_email' ? t('crm.contacts.form.bad_email', 'This does not look like an email address.')
    : error === 'too_long' ? t('crm.contacts.form.too_long', 'This is too long.')
    : error === 'bad_number' ? t('crm.contacts.form.bad_number', 'Write a number of 0 or more.')
    : undefined
}
