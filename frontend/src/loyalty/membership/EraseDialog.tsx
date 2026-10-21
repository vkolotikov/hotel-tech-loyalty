import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { useFirstFocus } from '../lib/useFirstFocus'
import { FormField } from '../ui/formParts'
import { afterMemberChange, membershipApi } from './api'
import { ERRORS } from './errors'
import { ERASE_GOES, ERASE_STAYS, eraseReady } from './membershipMath'
import type { MemberProfile } from './types'
import { ERASE_GOES_WORDS, ERASE_STAYS_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * A manager deletes a member (spec 2026-10-21 release 2 §4.1, R2-4): the dialog says what goes — the person's name,
 * email, phone, date of birth, push token, cards and sign-in — and what stays — the member number and the points
 * history —, and asks for the member's name before Delete can be pressed. It cannot be undone.
 */
export function EraseDialog({ member, onClose }: { member: MemberProfile; onClose: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const first = useFirstFocus<HTMLInputElement>()
  const [typed, setTyped] = useState('')

  const erase = useMutation({
    mutationFn: () => membershipApi.erase(member.id, typed.trim()),
    onSuccess: () => { afterMemberChange(client, member.id); onClose() },
  })
  const ready = eraseReady(typed, member.name)
  const failure = erase.isError ? failureOf(erase.error) : null

  return (
    <Dialog title={t('loyalty.membership.erase.title', 'Delete {{name}}', { name: member.name })} onClose={onClose} busy={erase.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        if (ready) erase.mutate()
      }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-a-text-2">{t('loyalty.membership.erase.goes_title', 'What goes')}</p>
            <ul data-erase="goes" className="list-disc space-y-1 pl-5 text-sm text-a-text">
              {ERASE_GOES.map(item => <li key={item}>{t(`loyalty.membership.erase.goes.${item}`, ERASE_GOES_WORDS[item])}</li>)}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-a-text-2">{t('loyalty.membership.erase.stays_title', 'What stays')}</p>
            <ul data-erase="stays" className="list-disc space-y-1 pl-5 text-sm text-a-text">
              {ERASE_STAYS.map(item => <li key={item}>{t(`loyalty.membership.erase.stays.${item}`, ERASE_STAYS_WORDS[item])}</li>)}
            </ul>
          </div>
        </div>
        <Notice tone="warning">{t('loyalty.membership.erase.final', 'This cannot be undone. The member will have to join again to use the programme.')}</Notice>
        <FormField label={t('loyalty.membership.erase.confirm', 'Type “{{name}}” to confirm', { name: member.name })}>
          <input ref={first} type="text" value={typed} autoComplete="off" spellCheck={false} onChange={(e) => { setTyped(e.target.value); if (erase.isError) erase.reset() }} className={INPUT} />
        </FormField>
        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'erase', failure))}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={erase.isPending}>{t('loyalty.membership.erase.keep', 'Keep the member')}</Button>
          <Button type="submit" variant="danger" disabled={!ready} loading={erase.isPending}>{t('loyalty.membership.erase.delete', 'Delete member')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
