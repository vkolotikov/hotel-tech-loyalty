import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { portalApi, apiMessage } from '../../lib/portalApi'
import { Sheet } from '../../ui/Sheet'
import { Button } from '../../ui/Button'
import { Field, INPUT_CLASS } from '../../ui/Field'
import { Notice } from '../../ui/Notice'

export function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const change = useMutation({
    mutationFn: portalApi.changePassword,
    onSuccess: () => { setError(null); setDone(true) },
    onError: e => setError(apiMessage(e, t('portal.profile.password_failed', 'Could not change the password'))),
  })

  return (
    <Sheet open={open} onClose={() => { setDone(false); setError(null); onClose() }} title={t('portal.profile.password_change', 'Change password')}>
      {done ? (
        <Notice tone="success">{t('portal.profile.password_changed', 'Password changed. Other devices have been signed out.')}</Notice>
      ) : (
        <form
          className="space-y-3"
          onSubmit={e => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const password = String(fd.get('password') ?? '')
            const confirmation = String(fd.get('password_confirmation') ?? '')
            if (password !== confirmation) { setError(t('portal.profile.password_mismatch', "Those two passwords don't match.")); return }
            change.mutate({ current_password: String(fd.get('current_password') ?? ''), password, password_confirmation: confirmation })
          }}
        >
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label={t('portal.profile.password_current', 'Current password')}><input name="current_password" type="password" required autoComplete="current-password" className={INPUT_CLASS} /></Field>
          <Field label={t('portal.profile.password_new', 'New password')} hint={t('portal.profile.password_hint', 'At least 8 characters')}><input name="password" type="password" required minLength={8} autoComplete="new-password" className={INPUT_CLASS} /></Field>
          <Field label={t('portal.profile.password_confirm', 'Confirm new password')}><input name="password_confirmation" type="password" required minLength={8} autoComplete="new-password" className={INPUT_CLASS} /></Field>
          <Button type="submit" full loading={change.isPending}>{t('portal.profile.password_change', 'Change password')}</Button>
        </form>
      )}
    </Sheet>
  )
}
