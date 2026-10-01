import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppointments } from '../AppointmentsProvider'
import { appointmentsApi, failureOf, type ApiFailure } from '../lib/api'
import { previewThenSave } from '../lib/preview'
import type { SetupTeamMember } from '../lib/types'
import { useConflictConfirm } from './ConflictDialog'
import { FailureNotice } from './FailureNotice'
import { TimeOffEditor } from './TimeOffEditor'

/** A person's time off with its saves: adding previews the appointments it would strand first. */
export function MemberTimeOff({ member, canEdit, onChanged }: { member: SetupTeamMember; canEdit: boolean; onChanged: (member: SetupTeamMember) => void }) {
  const { i18n } = useTranslation()
  const { data: boot } = useAppointments()
  const locale = i18n.language || 'en'
  const { dialog, confirm } = useConflictConfirm(locale)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<ApiFailure | null>(null)

  const run = async (work: () => Promise<{ team_member?: SetupTeamMember } | null>) => {
    setSaving(true)
    setFailure(null)
    try {
      const result = await work()
      if (result?.team_member) onChanged(result.team_member)
    } catch (error) {
      setFailure(failureOf(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <TimeOffEditor entries={member.time_off} canEdit={canEdit} locale={locale} today={boot?.venue.today ?? ''} saving={saving}
        onAdd={(body) => { void run(() => previewThenSave(dryRun => appointmentsApi.addTimeOff(member.id, body, dryRun), confirm)) }}
        onRemove={(entryId) => { void run(() => appointmentsApi.removeTimeOff(member.id, entryId)) }} />
      <FailureNotice failure={failure} />
      {dialog}
    </>
  )
}
