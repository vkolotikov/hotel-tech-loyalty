import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { serverProblems } from '../lib/forms'
import { useFirstFocus } from '../lib/useFirstFocus'
import { Check, FormField, FormFoot } from '../ui/formParts'
import { afterMemberChange, membershipApi } from './api'
import { ERRORS } from './errors'
import {
  DETAILS_FIELDS, MAX_NAME, MAX_NATIONALITY, MAX_PHONE, detailsBody, detailsFormOf, detailsProblems, languageChoices, languageName, type DetailsForm,
} from './membershipMath'
import type { MemberProfile } from './types'
import { DETAILS_PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Edit a member's details (spec 2026-10-21 release 2 §4.1), for every staff member: name, email, phone, language,
 * nationality, date of birth and marketing consent. The languages are the server's, named in the reader's language;
 * a date of birth cannot be after the venue's today. Only what changed is written and audited (the server compares).
 */
export function EditDetailsDialog({ member, languages, onClose }: { member: MemberProfile; languages: string[]; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const today = boot.venue.today
  const client = useQueryClient()
  const first = useFirstFocus<HTMLInputElement>()
  const [form, setForm] = useState<DetailsForm>(() => detailsFormOf(member))
  const [tried, setTried] = useState(false)

  const save = useMutation({
    mutationFn: () => membershipApi.update(member.id, detailsBody(form)),
    onSuccess: () => { afterMemberChange(client, member.id); onClose() },
  })
  const update = (patch: Partial<DetailsForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...(tried ? detailsProblems(form, today) : {}), ...serverProblems(failure?.fields, DETAILS_FIELDS) }
  const problem = (field: string): string | null => {
    const code = problems[field]
    return code ? t(`loyalty.membership.details.problem.${code}`, DETAILS_PROBLEM_WORDS[code] ?? DETAILS_PROBLEM_WORDS.name) : null
  }

  return (
    <Dialog title={t('loyalty.membership.details.title', 'Edit the details of {{name}}', { name: member.name })} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.keys(detailsProblems(form, today)).length === 0) save.mutate()
      }}>
        <FormField label={t('loyalty.membership.details.name', 'Name')} problem={problem('name')}>
          <input ref={first} type="text" value={form.name} maxLength={MAX_NAME} onChange={(e) => update({ name: e.target.value })} className={INPUT} />
        </FormField>
        <FormField label={t('loyalty.membership.details.email', 'Email')} problem={problem('email')}
          hint={t('loyalty.membership.details.email_hint', 'The member signs in with it; a change applies from their next sign-in.')}>
          <input type="email" inputMode="email" value={form.email} maxLength={255} onChange={(e) => update({ email: e.target.value })} className={INPUT} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('loyalty.membership.details.phone', 'Phone')} problem={problem('phone')}>
            <input type="tel" inputMode="tel" value={form.phone} maxLength={MAX_PHONE} onChange={(e) => update({ phone: e.target.value })} className={INPUT} />
          </FormField>
          <FormField label={t('loyalty.membership.details.language', 'Language')} problem={problem('language')}>
            <select value={form.language} onChange={(e) => update({ language: e.target.value })} className={INPUT}>
              <option value="">{t('loyalty.membership.details.language_none', 'Not set')}</option>
              {languageChoices(languages, member.language).map(code => <option key={code} value={code}>{languageName(code, locale)}</option>)}
            </select>
          </FormField>
          <FormField label={t('loyalty.membership.details.nationality', 'Nationality')} problem={problem('nationality')}>
            <input type="text" value={form.nationality} maxLength={MAX_NATIONALITY} onChange={(e) => update({ nationality: e.target.value })} className={INPUT} />
          </FormField>
          <FormField label={t('loyalty.membership.details.date_of_birth', 'Date of birth')} problem={problem('date_of_birth')}>
            <input type="date" value={form.date_of_birth} max={today} onChange={(e) => update({ date_of_birth: e.target.value })} className={INPUT} />
          </FormField>
        </div>
        <Check label={t('loyalty.membership.details.marketing_consent', 'Agrees to marketing emails')} checked={form.marketing_consent}
          onChange={(on) => update({ marketing_consent: on })}
          hint={t('loyalty.membership.details.marketing_consent_hint', 'Only with the member’s own agreement. Campaigns reach only those who agreed.')} />

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'details', failure))}</Notice>}

        <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={save.isPending} onCancel={onClose} save={t('loyalty.membership.details.save', 'Save details')} />
      </form>
    </Dialog>
  )
}
