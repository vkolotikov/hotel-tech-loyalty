import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { afterMemberChange, membershipApi } from './api'
import { ERRORS } from './errors'
import type { MemberProfile } from './types'

/**
 * A manager switches a member's account off or on again (spec 2026-10-21 release 2 §4.1). Off, the member keeps their
 * points and history, but the app, the portal and the desk's Scan refuse them until it is on again. Each step is
 * idempotent on the server: a second press changes nothing.
 */
export function StatusDialog({ member, mode, onClose }: { member: MemberProfile; mode: 'deactivate' | 'reactivate'; onClose: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const change = useMutation({
    mutationFn: () => (mode === 'deactivate' ? membershipApi.deactivate(member.id) : membershipApi.reactivate(member.id)),
    onSuccess: () => { afterMemberChange(client, member.id); onClose() },
  })
  const failure = change.isError ? failureOf(change.error) : null
  const off = mode === 'deactivate'

  return (
    <Dialog title={off ? t('loyalty.membership.status.off_title', 'Deactivate {{name}}', { name: member.name }) : t('loyalty.membership.status.on_title', 'Reactivate {{name}}', { name: member.name })}
      onClose={onClose} busy={change.isPending}>
      <div className="space-y-4">
        <p className="text-sm text-a-text">
          {off
            ? t('loyalty.membership.status.off_effect', 'The member keeps their points and history, but cannot use the app, the portal or their card until the account is reactivated.')
            : t('loyalty.membership.status.on_effect', 'The member can use the app, the portal and their card again, with the points they had.')}
        </p>
        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'status', failure))}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={change.isPending}>{t('loyalty.common.cancel', 'Cancel')}</Button>
          <Button type="button" variant={off ? 'danger' : 'primary'} loading={change.isPending} onClick={() => change.mutate()}>
            {off ? t('loyalty.membership.status.off', 'Deactivate') : t('loyalty.membership.status.on', 'Reactivate')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
