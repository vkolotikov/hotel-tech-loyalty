import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { serverProblems } from '../lib/forms'
import { memberPath } from '../lib/links'
import type { MemberRow } from '../lib/types'
import { useFirstFocus } from '../lib/useFirstFocus'
import { Check, FormField, FormFoot } from '../ui/formParts'
import { afterMemberChange, membershipApi } from './api'
import { ERRORS } from './errors'
import { ENROL_FIELDS, MAX_NAME, MAX_PHONE, NEW_MEMBER, enrolBody, enrolProblems, type EnrolForm } from './membershipMath'
import { validityActions } from './validityMath'
import { ENROL_PROBLEM_WORDS } from './words'
import { AssignmentFields } from './AssignmentFields'
import { assignmentFormOf, assignmentProblems, assignmentValues, type AssignmentForm } from './assignmentMath'
import { DesignDialog } from '../redesign/DesignUI'
import { usePhone } from '../overview/useOverview'
import { useMobileWords } from '../mobile/words'
import { physicalCardsApi } from '../physical-cards/api'
import { CardTagInput } from '../physical-cards/CardTagInput'
import { physicalCardError, usePhysicalCardWords } from '../physical-cards/words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'
type CardForEnrolment = { id: number; number: string; uid: string | null; capturedUid?: string }
type ExistingMember = Pick<MemberRow, 'id' | 'name' | 'member_number' | 'is_active'>

/**
 * Add a member (spec 2026-10-21 release 2 §4.1): name, email, phone and whether the welcome email goes out. The member
 * starts on the default tier or a manager's assigned membership. Level and dates are part of the same enrolment,
 * before the welcome bonus; a failed assignment never leaves an undated, partially configured member.
 */
export function AddMemberDialog({ onClose, physicalCard, onCreated, onChooseMember }: {
  onClose: () => void
  physicalCard?: CardForEnrolment
  onCreated?: (memberId: number) => void
  onChooseMember?: (uid: string) => void
}) {
  const { t } = useTranslation()
  const physicalWords = usePhysicalCardWords()
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
  const [assignment, setAssignment] = useState(assignmentFormOf)
  const [tried, setTried] = useState(false)
  const [physicalUid, setPhysicalUid] = useState(physicalCard?.capturedUid ?? '')
  const enteredNumber = physicalCard?.number.replace(/\s/g, '').toUpperCase() === physicalUid.replace(/\s/g, '').toUpperCase()
  const chooseMember = onChooseMember ? () => onChooseMember(enteredNumber ? '' : physicalUid.trim()) : undefined

  const complete = (memberId: number) => {
    onClose()
    if (onCreated) onCreated(memberId)
    else navigate(memberPath(memberId))
  }

  const save = useMutation({
    mutationFn: () => membershipApi.enrol({
      ...enrolBody(form),
      ...(dated ? assignmentValues(assignment) : {}),
      ...(physicalCard ? { physical_card_id: physicalCard.id } : {}),
      ...(physicalCard && physicalUid.trim() ? {
        physical_card_uid: physicalUid.trim(), physical_card_expected_uid: physicalCard.uid,
      } : {}),
    }),
    onSuccess: (answer) => {
      afterMemberChange(client, null)
      complete(answer.member.id)
    },
  })
  const assign = useMutation({
    mutationFn: ({ card, memberId }: { card: CardForEnrolment; memberId: number }) => physicalCardsApi.assign(card, memberId, physicalUid.trim()),
    onSuccess: (_answer, { memberId }) => complete(memberId),
  })
  const busy = save.isPending || assign.isPending
  const update = (patch: Partial<EnrolForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
    if (assign.isError) assign.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const existing = physicalCard && failure?.code === 'member_email_exists' ? failure.extra.member as ExistingMember : null
  const emailUnavailable = failure?.code === 'member_email_unavailable'
  const cardFailure = assign.isError ? physicalCardError(assign.error)
    : physicalCard && failure && ['bad_uid', 'card_changed', 'card_elsewhere', 'card_in_use'].includes(failure.code)
      ? physicalCardError(save.error) : null
  const assignmentErrors = dated ? assignmentProblems(assignment, boot.programme.tiers, today) : {}
  const updateAssignment = (patch: Partial<AssignmentForm>) => { setAssignment(value => ({ ...value, ...patch })); save.reset() }
  const updateUid = (value: string) => {
    if (value === physicalUid) return
    setPhysicalUid(value)
    if (save.isError && !failure?.fields?.email) save.reset()
    if (assign.isError) assign.reset()
  }
  const problems = { ...(tried ? enrolProblems(form) : {}), ...serverProblems(failure?.fields, ENROL_FIELDS) }
  const problem = (field: string): string | null => {
    if (field === 'email' && existing) return physicalWords('emailMatchesMember')
    if (field === 'email' && emailUnavailable && physicalCard) return physicalWords('emailUnavailable')
    const code = problems[field]
    return code ? t(`loyalty.membership.add.problem.${code}`, ENROL_PROBLEM_WORDS[code] ?? ENROL_PROBLEM_WORDS.name) : null
  }

  return (
    <Surface title={t('loyalty.membership.add.title', 'Add a member')} onClose={phone ? chooseMember ?? onClose : onClose} busy={busy}
      {...(phone ? { className: 'l-mw-full-form l-mw-add' } : {})}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!busy && !enteredNumber && !existing && !emailUnavailable && Object.keys(enrolProblems(form)).length === 0 && Object.keys(assignmentErrors).length === 0) save.mutate()
      }}>
        {physicalCard && <p className="text-sm text-a-text-2">{t('loyalty.physicalcards.newMemberFor', { number: physicalCard.number })}</p>}
        {physicalCard && <CardTagInput value={physicalUid} onChange={updateUid} currentUid={physicalCard.uid} disabled={busy} optional
          problem={enteredNumber ? physicalWords('useChipId') : undefined} />}
        <div className={phone ? 'l-mw-panel l-mw-add-fields' : 'l-mw-add-desktop-fields'}>
        <FormField label={t('loyalty.membership.add.name', 'Name')} problem={problem('name')}>
          <input ref={first} type="text" value={form.name} maxLength={MAX_NAME} disabled={busy} autoComplete="off" onChange={(e) => update({ name: e.target.value })} className={INPUT} />
        </FormField>
        <FormField label={t('loyalty.membership.add.email', 'Email')} problem={problem('email')}
          hint={t('loyalty.membership.add.email_hint', 'The member signs in to the app and the portal with it.')}>
          <input type="email" inputMode="email" value={form.email} maxLength={255} disabled={busy} autoComplete="off" onChange={(e) => update({ email: e.target.value })} className={INPUT} />
        </FormField>
        {existing && physicalCard && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-a-border bg-a-surface p-3" role="group" aria-label={physicalWords('findMember')}>
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-a-text">{existing.name}</p>
            <p className="text-xs text-a-text-2">{existing.member_number}{!existing.is_active && ` · ${physicalWords('inactiveMember')}`}</p>
          </div>
          {existing.is_active
            ? <Button type="button" size="sm" loading={assign.isPending} disabled={busy || enteredNumber}
              onClick={() => assign.mutate({ card: physicalCard, memberId: existing.id })}>{physicalWords('assignExisting')}</Button>
            : <Button type="button" size="sm" variant="secondary" onClick={() => { onClose(); navigate(memberPath(existing.id)) }}>{physicalWords('openMember')}</Button>}
          {cardFailure && <div className="w-full"><Notice tone="danger">{physicalWords(cardFailure.key, { number: cardFailure.number, company: cardFailure.company })}</Notice></div>}
        </div>}
        <FormField label={t('loyalty.membership.add.phone', 'Phone (optional)')} problem={problem('phone')}>
          <input type="tel" inputMode="tel" value={form.phone} maxLength={MAX_PHONE} disabled={busy} autoComplete="off" onChange={(e) => update({ phone: e.target.value })} className={INPUT} />
        </FormField>
        {dated && <AssignmentFields form={assignment} onChange={updateAssignment} tried={tried} serverFields={failure?.fields} disabled={busy} />}</div>
        <div className={phone ? 'l-mw-panel' : undefined}>
        {phone && <><h2>{mobile('welcome')}</h2><p>{t('loyalty.membership.page.marketing_no', 'Not agreed')} · {t('loyalty.membership.page.marketing', 'Marketing emails')}</p><p>{t('loyalty.sms.member.label', 'Offers by SMS')}: {t('loyalty.sms.member.off', 'Off')}</p></>}
        <Check label={t('loyalty.membership.add.send_welcome', 'Send the welcome email')} checked={form.send_welcome} onChange={(on) => update({ send_welcome: on })}
          hint={t('loyalty.membership.add.send_welcome_hint', 'With a code to set a password; it is good for 48 hours.')} />
        {assignment.membership_mode === 'earned' && <p className="text-sm text-a-text-2">{t('loyalty.membership.add.start', 'The member starts on the programme’s first tier, with the welcome bonus.')}</p>}
        </div>

        {failure && !existing && !emailUnavailable && <Notice tone="danger">{cardFailure
          ? physicalWords(cardFailure.key, { number: cardFailure.number, company: cardFailure.company })
          : t(...refusalKey('loyalty.membership', ERRORS, 'add', failure))}</Notice>}

        <FormFoot cancel={onChooseMember ? physicalWords('findMember') : t('loyalty.common.cancel', 'Cancel')}
          busy={busy} disabled={enteredNumber || !!existing || emailUnavailable}
          onCancel={chooseMember ?? onClose}
          save={t('loyalty.membership.add.save', 'Add member')} />
      </form>
    </Surface>
  )
}
