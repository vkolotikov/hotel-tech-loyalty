import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { portalApi, apiMessage } from '../../lib/portalApi'
import { logoutAndRedirect } from '../../../lib/logout'
import { Sheet } from '../../ui/Sheet'
import { Button } from '../../ui/Button'
import { Field, INPUT_CLASS } from '../../ui/Field'
import { Notice } from '../../ui/Notice'

export function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const remove = useMutation({
    mutationFn: portalApi.deleteAccount,
    onSuccess: () => { void logoutAndRedirect('/login') },
    onError: e => setError(apiMessage(e, t('portal.profile.delete_failed', 'Could not delete the account'))),
  })

  return (
    <Sheet open={open} onClose={onClose} title={t('portal.profile.delete_title', 'Delete account')}>
      <form
        className="space-y-3"
        onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          // MemberController::deleteAccount() validates `password` and `confirmation` (in:DELETE).
          remove.mutate({ password: String(fd.get('password') ?? ''), confirmation: String(fd.get('confirmation') ?? '') })
        }}
      >
        <Notice tone="danger">{t('portal.profile.delete_body', 'This removes your membership and points at this venue. It cannot be undone.')}</Notice>
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label={t('portal.profile.delete_password', 'Your password')}><input name="password" type="password" required autoComplete="current-password" className={INPUT_CLASS} /></Field>
        <Field label={t('portal.profile.delete_confirm_label', 'Type DELETE to confirm')}><input name="confirmation" required pattern="DELETE" autoComplete="off" className={INPUT_CLASS} /></Field>
        <Button type="submit" variant="danger" full loading={remove.isPending}>{t('portal.profile.delete_button', 'Delete my account')}</Button>
      </form>
    </Sheet>
  )
}
