import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, newPressKey } from '../lib/api'
import { FormFoot } from '../ui/formParts'
import type { MemberRow } from '../lib/types'
import { afterMemberChange, membershipApi } from './api'
import { AssignmentFields } from './AssignmentFields'
import { useAssignmentWords } from './assignmentWords'
import { assignmentFormOf, assignmentProblems, assignmentValues, type AssignmentForm } from './assignmentMath'

export function AssignmentDialog({ member, onClose }: { member: MemberRow; onClose: () => void }) {
  const boot = useBoot(), client = useQueryClient(), { t } = useTranslation(), say = useAssignmentWords()
  const [form, setForm] = useState(() => assignmentFormOf(member))
  const [key, setKey] = useState(newPressKey)
  const [tried, setTried] = useState(false)
  const replacesActive = member.is_active && !['scheduled', 'expired', 'off'].includes(member.membership_state ?? '')
  const save = useMutation({
    mutationFn: () => membershipApi.assign(member.id, { ...assignmentValues(form), confirm_replace: form.confirm_replace, idempotency_key: key }),
    onSuccess: () => { afterMemberChange(client, member.id); onClose() },
  })
  const update = (patch: Partial<AssignmentForm>) => { setForm(value => ({ ...value, ...patch })); setKey(newPressKey()); save.reset() }
  const failure = save.isError ? failureOf(save.error) : null
  return <Dialog title={say('title')} onClose={onClose} busy={save.isPending}>
    <form className="space-y-5" noValidate onSubmit={event => { event.preventDefault(); setTried(true); if (!Object.keys(assignmentProblems(form, boot.programme.tiers, boot.venue.today, replacesActive)).length) save.mutate() }}>
      <p className="text-sm text-a-text-2">{member.name}</p>
      <AssignmentFields form={form} onChange={update} tried={tried} serverFields={failure?.fields} replacesActive={replacesActive} disabled={save.isPending} showLegend={false} />
      {failure && <Notice tone="danger">{say('failed')}</Notice>}
      <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={save.isPending} onCancel={onClose} save={say('save')} />
    </form>
  </Dialog>
}
