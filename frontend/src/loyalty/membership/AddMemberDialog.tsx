import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, newPressKey } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { serverProblems } from '../lib/forms'
import { memberPath } from '../lib/links'
import { useFirstFocus } from '../lib/useFirstFocus'
import { Check, FormField, FormFoot } from '../ui/formParts'
import { afterMemberChange, membershipApi } from './api'
import { ERRORS } from './errors'
import { ENROL_FIELDS, MAX_NAME, MAX_PHONE, NEW_MEMBER, enrolBody, enrolProblems, type EnrolForm } from './membershipMath'
import type { EnrolAnswer } from './types'
import { dateProblem, firstEndDay, setBody, validityActions } from './validityMath'
import { ENROL_PROBLEM_WORDS, VALIDITY_PROBLEM_WORDS } from './words'
import { DesignDialog } from '../redesign/DesignUI'
import { usePhone } from '../overview/useOverview'
import { useMobileWords } from '../mobile/words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Add a member (spec 2026-10-21 release 2 §4.1): name, email, phone and whether the welcome email goes out. The member
 * starts on the programme's default tier with the welcome bonus, as in the full admin; there is no tier to choose (the
 * bonus's tier review would undo one). On success the new member's page opens.
 *
 * Release 8 (spec 2026-10-25 §3): a manager may give the membership an end date ("Valid until", optional), saved through
 * the end date's own call once the member is added. Should that call fail, the member stays added and the dialog says
 * so, with the way to their page, where the date can be set.
 */
export function AddMemberDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const phone = usePhone()
  const mobile = useMobileWords()
  const Surface = phone ? DesignDialog : Dialog
  const navigate = useNavigate()
  const client = useQueryClient()
  const boot = useBoot()
  const today = boot.venue.today
  const dated = validityActions(boot.staff.can, {}).change
  const first = useFirstFocus<HTMLInputElement>()
  const [form, setForm] = useState<EnrolForm>(NEW_MEMBER)
  const [validUntil, setValidUntil] = useState('')
  const [tried, setTried] = useState(false)
  const [undated, setUndated] = useState<EnrolAnswer | null>(null)

  const save = useMutation({
    mutationFn: async (): Promise<{ answer: EnrolAnswer; dateSaved: boolean }> => {
      const answer = await membershipApi.enrol(enrolBody(form))
      if (!dated || validUntil.trim() === '') return { answer, dateSaved: true }
      try {
        await membershipApi.validity(answer.member.id, setBody(validUntil, newPressKey()))
        return { answer, dateSaved: true }
      } catch {
        return { answer, dateSaved: false }
      }
    },
    onSuccess: ({ answer, dateSaved }) => {
      afterMemberChange(client, null)
      if (!dateSaved) {
        setUndated(answer)
        return
      }
      onClose()
      navigate(memberPath(answer.member.id))
    },
  })
  const update = (patch: Partial<EnrolForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const dateCode = dated && validUntil.trim() !== '' ? dateProblem(validUntil, today) : null
  const problems = { ...(tried ? enrolProblems(form) : {}), ...serverProblems(failure?.fields, ENROL_FIELDS) }
  const problem = (field: string): string | null => {
    const code = problems[field]
    return code ? t(`loyalty.membership.add.problem.${code}`, ENROL_PROBLEM_WORDS[code] ?? ENROL_PROBLEM_WORDS.name) : null
  }

  if (undated) {
    return (
      <Dialog title={t('loyalty.membership.add.title', 'Add a member')} onClose={onClose}>
        <div className="space-y-4">
          <Notice tone="warning">{t('loyalty.membership.add.undated', '{{name}} was added, but the end date was not saved. Set it on their page under Membership.', { name: undated.member.name })}</Notice>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>{t('loyalty.membership.add.close', 'Close')}</Button>
            <Button onClick={() => { onClose(); navigate(memberPath(undated.member.id)) }}>{t('loyalty.membership.add.open_member', 'Open their page')}</Button>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Surface title={t('loyalty.membership.add.title', 'Add a member')} onClose={onClose} busy={save.isPending} {...(phone ? { className: 'l-mw-full-form l-mw-add' } : {})}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!save.isPending && Object.keys(enrolProblems(form)).length === 0 && dateCode === null) save.mutate()
      }}>
        <div className={phone ? 'l-mw-panel l-mw-add-fields' : 'l-mw-add-desktop-fields'}>
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
        <details className={phone ? 'l-mw-add-extra' : 'l-mw-desktop-details'} open={!phone || undefined}><summary>{mobile('additional')}</summary>{dated && (
          <FormField label={t('loyalty.membership.add.valid_until', 'Valid until (optional)')}
            hint={t('loyalty.membership.add.valid_until_hint', 'The last day of a membership bought for a time. Leave it empty for one that never ends.')}
            problem={tried && dateCode ? t(`loyalty.membership.validity.problem.${dateCode}`, VALIDITY_PROBLEM_WORDS[dateCode]) : null}>
            <input type="date" value={validUntil} min={firstEndDay(today)} onChange={(e) => setValidUntil(e.target.value)} className={INPUT} />
          </FormField>
        )}</details></div>
        <div className={phone ? 'l-mw-panel' : undefined}>
        {phone && <><h2>{mobile('welcome')}</h2><p>{t('loyalty.membership.page.marketing_no', 'Not agreed')} · {t('loyalty.membership.page.marketing', 'Marketing emails')}</p><p>{t('loyalty.sms.member.label', 'Offers by SMS')}: {t('loyalty.sms.member.off', 'Off')}</p></>}
        <Check label={t('loyalty.membership.add.send_welcome', 'Send the welcome email')} checked={form.send_welcome} onChange={(on) => update({ send_welcome: on })}
          hint={t('loyalty.membership.add.send_welcome_hint', 'With a code to set a password; it is good for 48 hours.')} />
        <p className="text-sm text-a-text-2">{t('loyalty.membership.add.start', 'The member starts on the programme’s first tier, with the welcome bonus.')}</p>
        </div>

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'add', failure))}</Notice>}

        <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={save.isPending} onCancel={onClose} save={t('loyalty.membership.add.save', 'Add member')} />
      </form>
    </Surface>
  )
}
