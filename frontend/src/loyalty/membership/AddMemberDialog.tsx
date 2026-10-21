import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { serverProblems } from '../lib/forms'
import { memberPath } from '../lib/links'
import { useFirstFocus } from '../lib/useFirstFocus'
import { Check, FormField, FormFoot } from '../ui/formParts'
import { afterMemberChange, membershipApi } from './api'
import { ERRORS } from './errors'
import { ENROL_FIELDS, MAX_NAME, MAX_PHONE, NEW_MEMBER, enrolBody, enrolProblems, type EnrolForm } from './membershipMath'
import { ENROL_PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Add a member (spec 2026-10-21 release 2 §4.1): name, email, phone and whether the welcome email goes out. The member
 * starts on the programme's default tier with the welcome bonus, as in the full admin; there is no tier to choose (the
 * bonus's tier review would undo one). On success the new member's page opens.
 */
export function AddMemberDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const first = useFirstFocus<HTMLInputElement>()
  const [form, setForm] = useState<EnrolForm>(NEW_MEMBER)
  const [tried, setTried] = useState(false)

  const save = useMutation({
    mutationFn: () => membershipApi.enrol(enrolBody(form)),
    onSuccess: (answer) => {
      afterMemberChange(client, null)
      onClose()
      navigate(memberPath(answer.member.id))
    },
  })
  const update = (patch: Partial<EnrolForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...(tried ? enrolProblems(form) : {}), ...serverProblems(failure?.fields, ENROL_FIELDS) }
  const problem = (field: string): string | null => {
    const code = problems[field]
    return code ? t(`loyalty.membership.add.problem.${code}`, ENROL_PROBLEM_WORDS[code] ?? ENROL_PROBLEM_WORDS.name) : null
  }

  return (
    <Dialog title={t('loyalty.membership.add.title', 'Add a member')} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.keys(enrolProblems(form)).length === 0) save.mutate()
      }}>
        <FormField label={t('loyalty.membership.add.name', 'Name')} problem={problem('name')}>
          <input ref={first} type="text" value={form.name} maxLength={MAX_NAME} autoComplete="off" onChange={(e) => update({ name: e.target.value })} className={INPUT} />
        </FormField>
        <FormField label={t('loyalty.membership.add.email', 'Email')} problem={problem('email')}
          hint={t('loyalty.membership.add.email_hint', 'The member signs in to the app and the portal with it.')}>
          <input type="email" inputMode="email" value={form.email} maxLength={255} autoComplete="off" onChange={(e) => update({ email: e.target.value })} className={INPUT} />
        </FormField>
        <FormField label={t('loyalty.membership.add.phone', 'Phone (optional)')} problem={problem('phone')}>
          <input type="tel" inputMode="tel" value={form.phone} maxLength={MAX_PHONE} autoComplete="off" onChange={(e) => update({ phone: e.target.value })} className={INPUT} />
        </FormField>
        <Check label={t('loyalty.membership.add.send_welcome', 'Send the welcome email')} checked={form.send_welcome} onChange={(on) => update({ send_welcome: on })}
          hint={t('loyalty.membership.add.send_welcome_hint', 'With a code to set a password; it is good for 48 hours.')} />
        <p className="text-sm text-a-text-2">{t('loyalty.membership.add.start', 'The member starts on the programme’s first tier, with the welcome bonus.')}</p>

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'add', failure))}</Notice>}

        <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={save.isPending} onCancel={onClose} save={t('loyalty.membership.add.save', 'Add member')} />
      </form>
    </Dialog>
  )
}
